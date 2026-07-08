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

export function ensureSiteFonts(): void {
  if (document.getElementById("edd-site-fonts")) return;
  const style = document.createElement("style");
  style.id = "edd-site-fonts";
  style.textContent = css;
  document.head.appendChild(style);
}
