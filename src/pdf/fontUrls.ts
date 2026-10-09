// Browser-side font URL map (Vite resolves ?url to hashed, same-origin assets).
import o4 from "@fontsource/outfit/files/outfit-latin-400-normal.woff?url";
import o5 from "@fontsource/outfit/files/outfit-latin-500-normal.woff?url";
import o6 from "@fontsource/outfit/files/outfit-latin-600-normal.woff?url";
import o7 from "@fontsource/outfit/files/outfit-latin-700-normal.woff?url";
import g4 from "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?url";
import g5 from "@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff?url";
import g6 from "@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff?url";
import g7 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url";
import m4 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url";
import m5 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url";
import m6 from "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff?url";
import type { FontUrls } from "./fonts";

export const browserFontUrls: FontUrls = {
  outfit: { 400: o4, 500: o5, 600: o6, 700: o7 },
  grotesk: { 400: g4, 500: g5, 600: g6, 700: g7 },
  mono: { 400: m4, 500: m5, 600: m6 },
};
