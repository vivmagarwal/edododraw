/**
 * `edododraw` — public npm entry point.
 *
 * Two levels of API:
 *   - High-level facade: `new EdodoDraw(el).render(source)` — mount a diagram
 *     with camera, timeline, live annotations, and export in one object.
 *   - Low-level engine: `compileEdd`, `SvgRenderer`, `CameraController`,
 *     `registerShape`, the Scene IR types, etc. — compose your own.
 *
 * A React wrapper is available at `edododraw/react`.
 */

export { EdodoDraw } from "./EdodoDraw.js";
export type { EdodoDrawOptions, RenderResult, EdodoEvent } from "./EdodoDraw.js";

// Re-export the full engine (Scene IR, compiler, renderer, camera, plugins…).
export * from "../engine/index.js";

// Optional Mermaid import helpers (mermaid itself is lazy-loaded on first use).
export { convertMermaid, extractMermaidBlocks, injectMermaid } from "../engine/import/mermaid.js";
export type { MermaidFragment } from "../engine/import/mermaid.js";
