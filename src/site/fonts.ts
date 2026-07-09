/**
 * Site-only UI fonts (Nunito for chrome, Cascadia for code). Loaded with a
 * base-path-aware URL so they resolve both locally and on GitHub Pages under
 * /edododraw/. These are for the website chrome — the diagram engine embeds its
 * own hand-drawn font and needs nothing from here.
 */

const base = import.meta.env.BASE_URL; // "/" in dev, "./" in build

const css = `
@font-face {
  font-family: "Nunito";
  src: url("${base}fonts/Nunito-Regular.woff2") format("woff2");
  font-weight: 400 800;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Cascadia Code";
  src: url("${base}fonts/CascadiaCode-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}`;

/**
 * Webfonts used by the style presets (Roboto for the reference styles,
 * Fredoka/Montserrat/Shantell Sans/… for their headings). Loaded from Google
 * Fonts on the site only — every preset declares system fallbacks, so diagrams
 * still render fine offline or in exported SVGs without these.
 */
const PRESET_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Roboto:wght@400;700",
    "family=Roboto+Slab:wght@400;700",
    "family=Fredoka:wght@400;500;700",
    "family=Montserrat:wght@400;700",
    "family=Shantell+Sans:wght@400;700",
    "family=Libre+Baskerville:wght@400;700",
    "family=STIX+Two+Text:wght@400;700",
    "family=Aboreto",
    "family=Noto+Serif+JP:wght@400;700",
    "family=Funnel+Display:wght@300;400;600",
    "family=Source+Code+Pro:wght@400;700",
  ].join("&") +
  "&display=swap";

export function ensureSiteFonts(): void {
  if (document.getElementById("edd-site-fonts")) return;
  const style = document.createElement("style");
  style.id = "edd-site-fonts";
  style.textContent = css;
  document.head.appendChild(style);

  const link = document.createElement("link");
  link.id = "edd-preset-fonts";
  link.rel = "stylesheet";
  link.href = PRESET_FONTS_URL;
  document.head.appendChild(link);
}
