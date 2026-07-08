/**
 * Engine-owned CSS: @font-face for the hand-drawn fonts and the keyframes that
 * power animated arrows and annotation reveals. Injected once per document by
 * ensureEngineStyles(). Kept as a TS string so the engine is self-contained and
 * has no build-time CSS dependency.
 *
 * Fonts are the OFL-licensed Excalifont + Virgil copied from the Excalidraw
 * project into /public/fonts.
 */

import { HAND_FONT_WOFF2_DATA_URI } from "./fontData.js";

export const FONT_FAMILY = {
  hand: '"Excalifont", "Virgil", "Segoe Print", "Comic Sans MS", cursive',
  normal: '"Nunito", "Assistant", system-ui, -apple-system, sans-serif',
  code: '"Cascadia Code", "Cascadia", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

const CSS = `
/* Hand-drawn font is embedded (base64) so it works with zero external files —
   in the app, in exported SVGs, and in any host app using the npm package. */
@font-face {
  font-family: "Excalifont";
  src: url("${HAND_FONT_WOFF2_DATA_URI}") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Virgil";
  src: url("${HAND_FONT_WOFF2_DATA_URI}") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
/* UI/code fonts are best-effort from /fonts (app only) with system fallbacks. */
@font-face {
  font-family: "Nunito";
  src: url("/fonts/Nunito-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Cascadia Code";
  src: url("/fonts/CascadiaCode-Regular.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

/* ---- animated arrows -------------------------------------------------- */
.edd-anim { pointer-events: none; }

@keyframes edd-march {
  to { stroke-dashoffset: -18; }
}
.edd-anim-flow,
.edd-anim-dash-march {
  animation-name: edd-march;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes edd-electric {
  to { stroke-dashoffset: -9; }
}
.edd-anim-electric {
  animation-name: edd-electric;
  animation-timing-function: steps(3);
  animation-iteration-count: infinite;
}
@keyframes edd-draw-on {
  from { stroke-dashoffset: var(--edd-dashoffset, 1000); }
  to { stroke-dashoffset: 0; }
}
.edd-anim-draw-on {
  animation-name: edd-draw-on;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}
@keyframes edd-comet {
  from { stroke-dashoffset: calc(var(--edd-len) * 1px); }
  to { stroke-dashoffset: calc(var(--edd-len) * -0.14px); }
}
.edd-anim-comet {
  animation-name: edd-comet;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes edd-pulse {
  0%, 100% { opacity: 0.15; stroke-width: inherit; }
  50% { opacity: 0.85; }
}
.edd-anim-pulse {
  animation-name: edd-pulse;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
@keyframes edd-gradient-flow {
  to { stroke-dashoffset: -30; }
}
.edd-anim-gradient-flow {
  stroke-dasharray: 16 10;
  animation-name: edd-gradient-flow;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

/* ---- timeline visibility --------------------------------------------- */
.edd-node, .edd-edge { transition: opacity 0.45s ease; }
.edd-hidden { opacity: 0 !important; pointer-events: none; }

/* ---- annotation reveals ---------------------------------------------- */
@keyframes edd-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes edd-marker-sweep {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
@keyframes edd-pop-in {
  0% { transform: scale(0.6); opacity: 0; }
  70% { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.edd-reveal-fade { animation: edd-fade-in 0.4s ease both; }
.edd-reveal-sweep { animation: edd-marker-sweep 0.5s ease-out both; }
.edd-reveal-pop { animation: edd-pop-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both; transform-box: fill-box; transform-origin: center; }

@media (prefers-reduced-motion: reduce) {
  .edd-anim, .edd-reveal-fade, .edd-reveal-sweep, .edd-reveal-pop { animation: none !important; }
}
`;

let injected = false;
export function ensureEngineStyles(doc: Document = document): void {
  if (injected && doc.getElementById("edd-engine-styles")) return;
  const style = doc.createElement("style");
  style.id = "edd-engine-styles";
  style.textContent = CSS;
  doc.head.appendChild(style);
  injected = true;
}
