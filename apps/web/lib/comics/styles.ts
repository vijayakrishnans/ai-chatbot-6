// The looks the Comics tab offers: a label for the picker and the words the
// image model is given for it (lib/comics/generate.ts, panelPrompt).
export const COMIC_STYLES = {
  cartoon: {
    label: "Cartoon",
    prompt:
      "Bright Saturday-morning cartoon style, bold outlines, flat vivid colours",
  },
  manga: {
    label: "Manga",
    prompt:
      "Black and white manga panel, screentone shading, dynamic ink linework",
  },
  noir: {
    label: "Noir",
    prompt:
      "Film noir comic panel, high-contrast black and white, deep shadows, rain-slick streets",
  },
  superhero: {
    label: "Superhero",
    prompt:
      "Classic American superhero comic book art, bold inks, halftone dots, dramatic lighting",
  },
  watercolor: {
    label: "Watercolour",
    prompt:
      "Soft watercolour storybook illustration, gentle washes, pencil outlines",
  },
} as const;

export type ComicStyle = keyof typeof COMIC_STYLES;
