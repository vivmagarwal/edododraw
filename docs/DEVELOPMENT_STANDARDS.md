# Development Standards

## Setup

```bash
npm install
npm run dev        # http://localhost:5273
npm test           # vitest
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc + vite build → dist/
```

Node ≥ 18 (matches `engines`). The `reference/` directory (Excalidraw + mermaid-to-excalidraw clones, studied during design) is gitignored and excluded from Vite (`vite.config.ts → optimizeDeps.entries` + `server.watch.ignored`).

## Project structure

```
src/
  engine/            framework-agnostic engine (no React)
    scene/           Scene IR: types, palette, defaults, anchors, query, overrides
    dsl/             lexer, tokens, ast, parser, lower, compile, patch, diagnostics
    layout/          dagre / grid / radial → node positions
    render/          svgRenderer, shapes, edges, theme.css, fonts
    camera/          fit math, easing, controller
    timeline/        beat player
    edit/            direct-manipulation edit controller (EditController)
    annotate/        layer (render) + interact (live editor)
    import/          mermaid adapter
    plugins/         registry + builtins
    export.ts        SVG / PNG / JSON
    index.ts         public barrel (import from "@engine/…")
  lib/               published npm package: EdodoDraw facade, react.tsx (EdodoDrawView), index.ts (public exports)
  app/               React playground (App, CanvasView, examples)
  site/              marketing + docs site (renders docs/*.md verbatim)
  main.tsx           SPA entry
examples/            *.edd sample programs (imported ?raw)
docs/                this documentation
tests/               vitest suites
scripts/qa/          playwright-cli smoke test
public/fonts/        OFL hand-drawn fonts (Virgil, Excalifont)
```

The engine is pure TypeScript with no React dependency; the app is a thin shell over it. Import engine code via the `@engine/*` alias with `.js` extensions (bundler resolution maps to `.ts`).

## Conventions

- **Scene IR is the contract.** Anything that produces diagrams emits a `Scene`; anything that draws consumes one. Don't reach around it.
- **Deterministic seeds.** Element factories (`makeNode`/`makeEdge`) assign a rough.js seed from the id hash. Preserve that when adding element kinds.
- **Never throw in the lexer/renderer per-element.** The lexer is permissive; the renderer wraps each node/edge so one bad element can't blank the diagram.
- **Diagnostics, not exceptions.** The compiler accumulates `Diagnostic`s and recovers at statement/block boundaries.

## Extending the engine

### Add a shape

Register a renderer — no grammar change needed (the DSL already accepts any shape name):

```ts
import { registerShape } from "@engine/index.js";
import { nodeRoughOptions } from "@engine/render/shapes.js";

registerShape("hexstar", (rc, rect, style) => {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.appendChild(rc.polygon(myPoints(rect), nodeRoughOptions(style, true)));
  return g;
});
```

Then `shape: hexstar` (or a keyword mapped in `src/engine/dsl/lower.ts → SHAPE_MAP`) works. See `src/engine/plugins/builtins.ts` for the built-in `star`.

### Add an animated arrow

Add a `case` in `animationOverlay` (`src/engine/render/edges.ts`) and a keyframe in `src/engine/render/theme.css.ts`, then list it in `mapAnimation` (`src/engine/dsl/lower.ts`).

### Add an annotation kind

Add a `case` in `AnnotationLayer.draw` (`src/engine/annotate/layer.ts`) and, for live editing, a tool in `LiveAnnotationController` (`src/engine/annotate/interact.ts`) + the toolbar in `src/app/App.tsx`.

### Add a DSL construct

Grammar-level changes live in `src/engine/dsl/parser.ts` (recursive descent, keyword-dispatched) and are lowered to Scene IR in `src/engine/dsl/compile.ts`. Add tests in `tests/parser.test.ts`.

## Testing standard

Two stages (mandatory for anything user-facing):

1. **Code-level** — `npm test` (vitest) + `npm run typecheck`.
2. **End-user** — drive the running app with `playwright-cli` (`scripts/qa/smoke.sh`), screenshot every state, and **read every screenshot**. A route returning the right JSON does not prove the hand-drawn render is correct.
