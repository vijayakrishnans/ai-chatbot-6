import { getCloudflareContext } from "@opennextjs/cloudflare";
import { generateText } from "ai";
import { z } from "zod";
import { getTitleModel } from "@/lib/ai/providers";
import type { ComicPanel } from "@/lib/db/schema";
import { parseComicScript } from "./script";
import { COMIC_STYLES, type ComicStyle } from "./styles";

// A comic from one idea, on Workers AI alone, so it costs nothing inside the
// free 10,000 neurons a day: GLM 4.7 Flash writes the script (a title, the
// cast, and per panel a scene, a caption and a line of dialogue), then
// FLUX.1 [schnell] draws each panel — about 43 neurons a 512px image at four
// steps, a couple of hundred panels a day for free. The panels go into the
// R2 bucket and are served by app/(chat)/api/files/[...key]/route.ts.

export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMAGE_STEPS = 4;

export const comicRequestSchema = z.object({
  idea: z.string().trim().min(3).max(1000),
  panels: z.union([z.literal(4), z.literal(6)]),
  style: z.enum(Object.keys(COMIC_STYLES) as [ComicStyle, ...ComicStyle[]]),
});

export type ComicRequest = z.infer<typeof comicRequestSchema>;

const scriptInstructions = (panels: number) => `\
You write short comic strips. Given an idea, write a ${panels}-panel comic with a beginning, a middle and a punchline or ending.

Reply with ONLY a JSON object, no prose and no code fence:
{
  "title": "a short title",
  "cast": "one sentence describing how each recurring character looks (age, hair, clothes, colours), reused in every panel so they look the same",
  "panels": [
    { "scene": "what the panel shows, visually: setting, characters, action, camera angle", "caption": "narration box text, or empty", "dialogue": "Name: the line spoken, or empty" }
  ]
}

Exactly ${panels} panels. Keep captions and dialogue under 20 words each. Scenes describe only what is seen, never text or speech bubbles.`;

// GLM now and then writes JSON that does not parse; a second try almost
// always does.
const SCRIPT_ATTEMPTS = 3;

export async function writeComicScript({ idea, panels }: ComicRequest) {
  let lastError: unknown;
  for (let attempt = 0; attempt < SCRIPT_ATTEMPTS; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a retry waits on the try before it
    const { text } = await generateText({
      instructions: scriptInstructions(panels),
      model: getTitleModel(),
      prompt: idea,
      // The script is a short JSON object: no thinking, as for chat titles.
      providerOptions: {
        "workers-ai": { chat_template_kwargs: { enable_thinking: false } },
      },
    });
    try {
      return parseComicScript(text, panels);
    } catch (error) {
      console.error("Comic script did not parse:", text.slice(0, 500));
      lastError = error;
    }
  }
  throw lastError;
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

const PANEL_RULES =
  "Single comic panel, all-ages and family-friendly, everyone fully clothed, no text, no speech bubbles, no lettering.";

// FLUX's safety filter refuses harmless prompts now and then ("8007: Input
// prompt contains NSFW content" for "a woman who draws a hill"), most often
// over the words describing people. A refused panel is asked again with less:
// first without the cast, then the setting alone with no one in it.
export function panelPrompts({
  cast,
  scene,
  style,
}: {
  cast: string;
  scene: string;
  style: ComicStyle;
}): string[] {
  const look = COMIC_STYLES[style].prompt;
  return [
    `${look}. ${scene}. Characters: ${cast}. ${PANEL_RULES}`,
    `${look}. ${scene}. ${PANEL_RULES}`,
    `${look}. The setting of this scene, with no people in it: ${scene}. ${PANEL_RULES}`,
  ];
}

export function isSafetyRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b3030\b|\b8007\b|nsfw/i.test(message);
}

async function runImageModel(prompt: string): Promise<Uint8Array> {
  const { env } = getCloudflareContext();
  const result = (await env.AI.run(IMAGE_MODEL, {
    prompt,
    steps: IMAGE_STEPS,
  })) as { image?: string };
  if (!result?.image) {
    throw new Error("The image model returned no image");
  }
  return decodeBase64(result.image);
}

// Draws the panel into the bucket under `key`; false when the safety filter
// refused every wording, and the panel is shown as text alone.
export async function drawPanel({
  key,
  prompts,
}: {
  key: string;
  prompts: string[];
}): Promise<boolean> {
  for (const prompt of prompts) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each wording is tried only if the one before was refused
      const image = await runImageModel(prompt);
      const { env } = getCloudflareContext();
      await env.BLOB.put(key, image, {
        httpMetadata: { contentType: "image/jpeg" },
      });
      return true;
    } catch (error) {
      if (!isSafetyRefusal(error)) {
        throw error;
      }
    }
  }
  return false;
}

export async function generateComic({
  comicId,
  request,
}: {
  comicId: string;
  request: ComicRequest;
}): Promise<{ title: string; panels: ComicPanel[] }> {
  const script = await writeComicScript(request);
  const panels: ComicPanel[] = script.panels.map((panel, index) => ({
    caption: panel.caption,
    dialogue: panel.dialogue,
    imageKey: `comics/${comicId}/${index + 1}.jpg`,
    scene: panel.scene,
  }));
  const drawn = await Promise.all(
    panels.map((panel) =>
      drawPanel({
        key: panel.imageKey,
        prompts: panelPrompts({
          cast: script.cast,
          scene: panel.scene,
          style: request.style,
        }),
      })
    )
  );
  if (!drawn.some(Boolean)) {
    throw new Error(
      "The image model's safety filter refused every panel. Try wording the idea differently."
    );
  }
  return {
    // A panel the filter would not draw keeps its caption and dialogue, with
    // no image (an empty key).
    panels: panels.map((panel, index) =>
      drawn[index] ? panel : { ...panel, imageKey: "" }
    ),
    title: script.title,
  };
}
