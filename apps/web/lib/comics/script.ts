import { z } from "zod";

// The comic script the model writes (lib/comics/generate.ts), checked before
// any image is drawn. Models wrap JSON in prose or a code fence now and then,
// so the first `{` to the last `}` is what is parsed.

const scriptSchema = z.object({
  cast: z.string().default(""),
  panels: z
    .array(
      z.object({
        caption: z.string().default(""),
        dialogue: z.string().default(""),
        scene: z.string().min(1),
      })
    )
    .min(1),
  title: z.string().min(1),
});

export type ComicScript = z.infer<typeof scriptSchema>;

export function parseComicScript(text: string, panels: number): ComicScript {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The model did not write a comic script");
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    throw new Error("The model's comic script was not valid JSON", {
      cause: error,
    });
  }
  const parsed = scriptSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("The model's comic script was missing panels");
  }
  // More panels than asked for are cut (each one is an image); fewer are
  // drawn as written.
  return {
    ...parsed.data,
    panels: parsed.data.panels.slice(0, panels),
    title: parsed.data.title.trim().slice(0, 120),
  };
}
