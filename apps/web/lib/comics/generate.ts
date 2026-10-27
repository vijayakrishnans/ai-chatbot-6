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

export async function writeComicScript({ idea, panels }: ComicRequest) {
  const { text } = await generateText({
    instructions: scriptInstructions(panels),
    model: getTitleModel(),
    prompt: idea,
    // The script is a short JSON object: no thinking, as for chat titles.
    providerOptions: {
      "workers-ai": { chat_template_kwargs: { enable_thinking: false } },
    },
  });
  return parseComicScript(text, panels);
}

function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

export function panelPrompt({
  cast,
  scene,
  style,
}: {
  cast: string;
  scene: string;
  style: ComicStyle;
}) {
  return `${COMIC_STYLES[style].prompt}. ${scene}. Characters: ${cast}. Single comic panel, no text, no speech bubbles, no lettering.`;
}

export async function drawPanel({
  key,
  prompt,
}: {
  key: string;
  prompt: string;
}): Promise<void> {
  const { env } = getCloudflareContext();
  const result = (await env.AI.run(IMAGE_MODEL, {
    prompt,
    steps: IMAGE_STEPS,
  })) as { image?: string };
  if (!result?.image) {
    throw new Error("The image model returned no image");
  }
  await env.BLOB.put(key, decodeBase64(result.image), {
    httpMetadata: { contentType: "image/jpeg" },
  });
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
  await Promise.all(
    panels.map((panel) =>
      drawPanel({
        key: panel.imageKey,
        prompt: panelPrompt({
          cast: script.cast,
          scene: panel.scene,
          style: request.style,
        }),
      })
    )
  );
  return { panels, title: script.title };
}
