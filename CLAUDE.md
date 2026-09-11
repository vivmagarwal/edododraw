# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

**EDodoDraw** — a 100% code-to-diagram engine with the Excalidraw hand-drawn look, a magic-move camera, scriptable + real-time annotations, animated arrows, and a **frame-driven mode for video** (Remotion and other capture pipelines). Built ground-up (no Excalidraw runtime); reuses rough.js (strokes), dagre (layout), the OFL Virgil/Excalifont font, and — as an *optional peer* dependency — @excalidraw/mermaid-to-excalidraw (import).

## Golden rules

- **The Scene IR is the contract** (`src/engine/scene/types.ts`). DSL, Mermaid import, and any producer emit a `Scene`; the renderer and controllers consume one. Don't bypass it.
- **Engine is React-free.** `src/engine/**` is pure TS. React lives only in `src/app/**`. Import engine code from `@engine/*` with `.js` extensions.
- **The DSL compiler is synchronous and DOM-free** (so it's unit-testable in Node). Mermaid import is async + browser-side, handled in the app, then injected.
- **Deterministic hand-drawn strokes** via id-hash rough.js seeds — preserve when adding element kinds.
- **Frame-driven paths stay pure.** Anything a video host calls per frame must be a *total* function of its inputs — no `performance.now()`, no rAF, no accumulation — because Remotion renders frames out of order. `stepStateAt`, `resolveCameraDirective`, `mixCameras`, `edgeCenterline`, `arrowFrameStyle` are all in that contract; `CameraController` and `TimelinePlayer` are the wall-clock side and must never be reached from it.
- **Rough tuning is opt-in per field.** `bowing` / `maxRandomnessOffset` / `preserveVertices` / `disableMultiStroke` are optional everywhere (`RoughTuning` in `scene/types.ts`); **unset must always mean "rough.js default"** at the field level — never substitute a house value in a resolver. What changed in 0.15 is which preset declares them, not the fallback: `classic`, `classic-color` and `classic-dark` now ship `roughness 0.45, bowing 0.4, maxRandomnessOffset 1, preserveVertices true, disableMultiStroke true`, so the **default look is smooth** and `scene.meta.rough` is defined for a diagram that declares nothing. `classic-rough` is pre-0.15 `classic`, byte for byte. Line-art presets still declare none and still leave `scene.meta.rough` undefined; `presetDeclaresRoughTuning()` / `roughTuning()` are the checks, not `=== undefined`.
- **Two-stage testing:** `npm test` + `npm run typecheck`, then drive the running app with `playwright-cli` and read the screenshots. Note: this repo's `playwright-cli` does not expose `page` in `run-code`; click by selector (`playwright-cli click '[data-node="id"]'`).
- Run `npm run typecheck` after edits; keep it at zero errors.

## Fast orientation

- Language surface: `docs/DSL_LANGUAGE_GUIDE.md`. Grammar/impl: `src/engine/dsl/`.
- Rendering: `src/engine/render/svgRenderer.ts` (+ `shapes.ts`, `edges.ts`).
- Viz templates (87 built-in `viz` types): `src/engine/viz/` (registry, context, `generators/*`); demo catalog `src/site/vizDemos.ts`.
- Style presets: `src/engine/style/presets.ts` — 11 style choices. The `classic` family is smooth by default and `classic-rough` is the pre-0.15 escape hatch; `hand-clean` / `hand-clean-dark` are the designed low-jitter pair built for video (see STYLES_GUIDE §5). Any golden/screenshot fixture taken before 0.15 will differ. **Never hardcode colors in generators** — always derive via `ctx.role`/`ctx.ink`/`ctx.preset` so every preset works.
- Camera/timeline: `src/engine/camera/`, `src/engine/timeline/`. Frame-driven twins: `timeline/stepState.ts` (pure step math) and `render/frameArrows.ts` (the CSS arrow animations as pure functions).
- Annotations (scripted + live): `src/engine/annotate/`.
- Visual QA harness: `scripts/qa/render-viz.mts` (+ `render-styles.mts`, `render-variations.mts`) renders every viz demo headlessly (jsdom) to SVG. `scripts/qa/audit-collisions.mts` compiles every demo + content variation × every preset and flags text-overlap collisions (run after generator changes); `scripts/qa/audit-docs.mts` gates catalog/demo/variation/metadata completeness for all templates; `scripts/qa/audit-faces.mts` renders every character emotion and reports any two that draw the SAME face (plus any pose defaulting to `determined`) — run it after touching `viz/characters/faces.ts` or `poses.ts`.
- Historical design explorations (superseded, more ambitious than what shipped — NOT docs): `design-notes/` (incl. `viz-import/` — the reverse-engineered style tokens + layout recipes behind the viz templates).

## Documentation Pointers

**Single source of truth:** the guides in `docs/*.md`, published at https://vivmagarwal.github.io/edododraw/ (the site renders these files verbatim via `src/site/docs.ts`). Update `docs/*.md` in the same change as the code. A release is `npm run release` (`scripts/release.sh`, local, no CI): verify → tag → push → npm publish → registry check → deploy the site — see DEVELOPMENT_STANDARDS § Releasing. `scripts/deploy-pages.sh` redeploys the site by hand between releases. README and this file only *point* here.


- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system overview, pipeline, module table, key decisions.
- [docs/DEVELOPMENT_STANDARDS.md](docs/DEVELOPMENT_STANDARDS.md) — setup, structure, how to add shapes/arrows/annotations/DSL.
- [docs/DSL_LANGUAGE_GUIDE.md](docs/DSL_LANGUAGE_GUIDE.md) — the `.edd` language reference (LLM + human friendly).
- [docs/VISUALIZATIONS_GUIDE.md](docs/VISUALIZATIONS_GUIDE.md) — the 87 `viz` templates: catalog, data model, options, icons, extending.
- [docs/STYLES_GUIDE.md](docs/STYLES_GUIDE.md) — style presets: applying, the built-in looks, what a preset controls, extending.
- [docs/INTEGRATION_GUIDE.md](docs/INTEGRATION_GUIDE.md) — embed EDodoDraw via npm (`EdodoDraw` facade + React + low-level `compileEdd`).
- [docs/EXTENDING_GUIDE.md](docs/EXTENDING_GUIDE.md) — add shapes / arrows / annotations / layouts / DSL constructs + plugins.
- [docs/CAMERA_AND_TIMELINE_GUIDE.md](docs/CAMERA_AND_TIMELINE_GUIDE.md) — magic-move camera + beat player.
- [docs/ANNOTATIONS_GUIDE.md](docs/ANNOTATIONS_GUIDE.md) — annotation model, real-time editor, commit-to-code, animated arrows.
- [docs/REMOTION_RECIPE.md](docs/REMOTION_RECIPE.md) — driving a diagram frame by frame from Remotion: the working component, what is forbidden (rAF, CSS keyframes, accumulation) and its replacement, and the stroke settings for a camera punch-in. Runnable skeleton in `examples/remotion/`.
- [docs/IMPORT_AND_EXPORT_GUIDE.md](docs/IMPORT_AND_EXPORT_GUIDE.md) — Mermaid import; SVG/PNG/JSON export.
