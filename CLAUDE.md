# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

**EDodoDraw** — a 100% code-to-diagram engine with the Excalidraw hand-drawn look, a magic-move camera, scriptable + real-time annotations, and animated arrows. Built ground-up (no Excalidraw runtime); reuses rough.js (strokes), dagre (layout), @excalidraw/mermaid-to-excalidraw (import), and the OFL Virgil/Excalifont font.

## Golden rules

- **The Scene IR is the contract** (`src/engine/scene/types.ts`). DSL, Mermaid import, and any producer emit a `Scene`; the renderer and controllers consume one. Don't bypass it.
- **Engine is React-free.** `src/engine/**` is pure TS. React lives only in `src/app/**`. Import engine code from `@engine/*` with `.js` extensions.
- **The DSL compiler is synchronous and DOM-free** (so it's unit-testable in Node). Mermaid import is async + browser-side, handled in the app, then injected.
- **Deterministic hand-drawn strokes** via id-hash rough.js seeds — preserve when adding element kinds.
- **Two-stage testing:** `npm test` + `npm run typecheck`, then drive the running app with `playwright-cli` and read the screenshots. Note: this repo's `playwright-cli` does not expose `page` in `run-code`; click by selector (`playwright-cli click '[data-node="id"]'`).
- Run `npm run typecheck` after edits; keep it at zero errors.

## Fast orientation

- Language surface: `docs/DSL_LANGUAGE_GUIDE.md`. Grammar/impl: `src/engine/dsl/`.
- Rendering: `src/engine/render/svgRenderer.ts` (+ `shapes.ts`, `edges.ts`).
- Viz templates (81 built-in `viz` types): `src/engine/viz/` (registry, context, `generators/*`); demo catalog `src/site/vizDemos.ts`.
- Style presets (18 named looks incl. the 16 reference styles): `src/engine/style/presets.ts`. **Never hardcode colors in generators** — always derive via `ctx.role`/`ctx.ink`/`ctx.preset` so every preset works.
- Camera/timeline: `src/engine/camera/`, `src/engine/timeline/`.
- Annotations (scripted + live): `src/engine/annotate/`.
- Visual QA harness: `scripts/qa/render-viz.mts` (+ `render-styles.mts`) renders every viz demo headlessly (jsdom) to SVG for reference comparison.
- Historical design explorations (superseded, more ambitious than what shipped — NOT docs): `design-notes/` (incl. `viz-import/` — the reverse-engineered style tokens + layout recipes behind the viz templates).

## Documentation Pointers

**Single source of truth:** the guides in `docs/*.md`, published at https://vivmagarwal.github.io/edododraw/ (the site renders these files verbatim via `src/site/docs.ts`). Update `docs/*.md` in the same change as the code, then redeploy with `scripts/deploy-pages.sh`. README and this file only *point* here.


- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, pipeline, module table, key decisions.
- [docs/DEVELOPMENT_STANDARDS.md](docs/DEVELOPMENT_STANDARDS.md) — setup, structure, how to add shapes/arrows/annotations/DSL.
- [docs/DSL_LANGUAGE_GUIDE.md](docs/DSL_LANGUAGE_GUIDE.md) — the `.edd` language reference (LLM + human friendly).
- [docs/VISUALIZATIONS_GUIDE.md](docs/VISUALIZATIONS_GUIDE.md) — the 81 `viz` templates: catalog, data model, options, icons, extending.
- [docs/STYLES_GUIDE.md](docs/STYLES_GUIDE.md) — style presets: applying, the built-in looks, what a preset controls, extending.
- [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) — embed EDodoDraw via npm (`EdodoDraw` facade + React + low-level `compileEdd`).
- [docs/EXTENDING_GUIDE.md](docs/EXTENDING_GUIDE.md) — add shapes / arrows / annotations / layouts / DSL constructs + plugins.
- [docs/CAMERA_AND_TIMELINE_GUIDE.md](docs/CAMERA_AND_TIMELINE_GUIDE.md) — magic-move camera + beat player.
- [docs/ANNOTATIONS_GUIDE.md](docs/ANNOTATIONS_GUIDE.md) — annotation model, real-time editor, commit-to-code, animated arrows.
- [docs/IMPORT_AND_EXPORT_GUIDE.md](docs/IMPORT_AND_EXPORT_GUIDE.md) — Mermaid import; SVG/PNG/JSON export.
