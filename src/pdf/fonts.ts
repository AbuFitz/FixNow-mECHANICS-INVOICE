import { Font } from "@react-pdf/renderer";

export interface FontUrls {
  outfit: Record<400 | 500 | 600 | 700, string>;
  grotesk: Record<400 | 500 | 600 | 700, string>;
  mono: Record<400 | 500 | 600, string>;
}

let registered = false;

/**
 * Registers the brand fonts with react-pdf. The URL map is supplied by the
 * caller so the same engine runs in the browser (Vite asset URLs) and in Node
 * (file paths, for the sample renderer and tests).
 */
export function registerFonts(urls: FontUrls): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Outfit",
    fonts: ([400, 500, 600, 700] as const).map((w) => ({ src: urls.outfit[w], fontWeight: w })),
  });
  Font.register({
    family: "Grotesk",
    fonts: ([400, 500, 600, 700] as const).map((w) => ({ src: urls.grotesk[w], fontWeight: w })),
  });
  Font.register({
    family: "Plex",
    fonts: ([400, 500, 600] as const).map((w) => ({ src: urls.mono[w], fontWeight: w })),
  });
  Font.registerHyphenationCallback((word) => [word]);
}
