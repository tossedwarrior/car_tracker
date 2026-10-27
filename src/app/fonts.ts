import localFont from "next/font/local";

// The Poster Wall design's two families, served from the app itself.

/** Neue Montreal: everything by default. */
export const sans = localFont({
  src: [
    { path: "../fonts/NeueMontreal-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/NeueMontreal-Medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/NeueMontreal-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

/** PP Editorial New: labels, column headings, year ranges and counts. */
export const serif = localFont({
  src: [
    { path: "../fonts/PPEditorialNew-Ultralight.otf", weight: "200", style: "normal" },
    { path: "../fonts/PPEditorialNew-Regular.otf", weight: "400", style: "normal" },
  ],
  variable: "--font-serif",
  display: "swap",
});
