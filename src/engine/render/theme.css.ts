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

/**
 * The exact `font-family` NAME of the embedded hand-drawn face — what you pass
 * to `document.fonts.load()` / `document.fonts.check()`. `FONT_FAMILY.hand` is
 * the full CSS stack (with fallbacks); this is the one family that must
 * actually be decoded before a headless frame is captured, or text is measured
 * and laid out with fallback metrics and every label shifts.
 */
export const EXCALIFONT_FAMILY = "Excalifont";

/** The embedded font itself, as a `data:` URI — no network fetch, ever. */
export { HAND_FONT_WOFF2_DATA_URI } from "./fontData.js";

export const FONT_FAMILY = {
  hand: '"Excalifont", "Virgil", "Segoe Print", "Comic Sans MS", cursive',
  normal: '"Nunito", "Assistant", system-ui, -apple-system, sans-serif',
  code: '"Cascadia Code", "Cascadia", ui-monospace, "SF Mono", Menlo, monospace',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
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
/* "normal" and "code" diagram fonts fall back to the host's system sans/mono
   (no external files) — the engine embeds only the hand-drawn font it needs. */

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

/* ---- static (deterministic) mode --------------------------------------
   SvgRenderer { static: true }: no wall-clock CSS at all, so frame-screenshot
   consumers (Remotion, Puppeteer, export) never catch a transition or
   animation mid-flight. Motion is host-driven (setRevealProgress, camera). */
.edd-static, .edd-static * { transition: none !important; animation: none !important; }
`;

// Keyed on the DOCUMENT, not the module: one page can own several documents
// (iframes, a Remotion preview inside a Studio shell, jsdom fixtures per test).
// A module-level boolean would report "already injected" for a document that
// has no <style> yet and silently render an unstyled, unfonted diagram.
const styledDocs = new WeakSet<Document>();

export function ensureEngineStyles(doc: Document = document): void {
  if (styledDocs.has(doc) && doc.getElementById("edd-engine-styles")) return;
  if (!doc.getElementById("edd-engine-styles")) {
    const style = doc.createElement("style");
    style.id = "edd-engine-styles";
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  styledDocs.add(doc);
}

/**
 * Resolve once the embedded hand-drawn font is actually DECODED and usable.
 *
 * `ensureEngineStyles` injects the `@font-face` fire-and-forget, so a headless
 * or frame-driven renderer can screenshot before the face is ready and get
 * fallback metrics — every label shifts, and the frame is silently wrong. Wire
 * this into whatever your host uses to hold a frame:
 *
 *   const handle = delayRender("edododraw fonts");
 *   whenFontsReady().then(() => continueRender(handle), cancelRender);
 *
 * Injects the styles first (so there is something to load), never rejects, and
 * resolves immediately in environments with no FontFaceSet (jsdom, older
 * browsers) — callers must not block forever on a missing API.
 */
export function whenFontsReady(doc: Document = document): Promise<void> {
  ensureEngineStyles(doc);
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return Promise.resolve();
  const sizes = [`16px "${EXCALIFONT_FAMILY}"`, `32px "${EXCALIFONT_FAMILY}"`];
  const loads = typeof fonts.load === "function" ? sizes.map((s) => fonts.load(s)) : [];
  return Promise.all([...loads, fonts.ready])
    .then(() => undefined)
    .catch(() => undefined);
}
