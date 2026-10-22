// The editorial display serif, used only on About and Stories; the rest of the site stays in Geist.
// Self-hosted (Latin, light only, SIL OFL): next/font/google under Turbopack fails the Vercel build when
// Google answers with `&`-bearing font URLs (vercel/next.js#99114). Every serif use is font-light.
import localFont from "next/font/local";

// The font family is named after this variable, so it must not be a CSS generic name like "serif".
const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-garamond-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/cormorant-garamond-300-italic.woff2", weight: "300", style: "italic" },
  ],
});

export const serif = cormorant;
