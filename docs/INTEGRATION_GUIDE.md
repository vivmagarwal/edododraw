# Integrating EDodoDraw

How to embed the `edododraw` engine in your own app — vanilla JS, any framework,
React, or a server. Everything here is checked against the published API in
`src/lib/` and `src/engine/`.

> Want to _extend_ the engine (new shapes, animations, layouts)? See
> [EXTENDING_GUIDE.md](EXTENDING_GUIDE.md). For the diagram source language, see
> [DSL_LANGUAGE_GUIDE.md](DSL_LANGUAGE_GUIDE.md).

---

## 1. Install

```bash
npm i edododraw
```

- **Runtime dependencies install automatically:** `roughjs` (hand-drawn strokes)
  and `@dagrejs/dagre` (auto-layout).
- **Mermaid import** (`@excalidraw/mermaid-to-excalidraw`) ships as an
  _optionalDependency_: it's installed by default, but install won't fail if it's
  unavailable, and it's **lazy-loaded** only when a `mermaid` block is actually
  rendered. See [§6](#6-mermaid-note).
- **React is optional.** It's a _peer_ dependency needed only for the
  `edododraw/react` entry. For the core `edododraw` entry you don't need React at
  all.

The package is **ESM-only** (`"type": "module"`, `exports` expose `import` only)
and targets **Node ≥ 18**. Two entry points:

| Import | What you get |
|---|---|
| `edododraw` | The core: `EdodoDraw` facade + the whole engine (`compileEdd`, `SvgRenderer`, `registerShape`, Scene IR types, …). |
| `edododraw/react` | `EdodoDrawView` React component (thin wrapper over the facade). |

---

## 2. Quick start (vanilla / any framework)

Give the engine a sized container element and hand it EDodoDraw source. The
`EdodoDraw` facade mounts an `<svg>`, compiles + renders, and exposes camera,
timeline, live annotations, and export behind one object.

```html
<!doctype html>
<div id="diagram" style="width: 100%; height: 500px;"></div>
<script type="module">
  import { EdodoDraw } from "edododraw";

  const el = document.getElementById("diagram");
  const edd = new EdodoDraw(el, { interactive: true });

  await edd.render(`
    scene {
      a[Client] --> b[API] --> c[(Database)]
    }
    timeline {
      beat intro "Overview" { camera fit-all, reveal { show a } }
      beat call  "Trace the call" { camera focus b zoom 1.4, reveal { show b, c } }
    }
  `);

  edd.play();   // drives the timeline (magic-move). No-op if the source has no timeline.
</script>
```

The **container must have a height** — the facade sets `position` and
`overflow: hidden` for you but never a size, and `autoFit` needs a measurable
viewport. A `0px`-tall div renders nothing.

`render()` is async (a `mermaid` block may need the lazy runtime) and safe to call
on every keystroke — stale runs are discarded. It resolves to
`{ scene, diagnostics }`.

---

## 3. `EdodoDraw` API reference

```ts
import { EdodoDraw } from "edododraw";
new EdodoDraw(container: HTMLElement, options?: EdodoDrawOptions)
```

### Options (`EdodoDrawOptions`)

| Option | Type | Default | Effect |
|---|---|---|---|
| `interactive` | `boolean` | `true` | Enable pan (drag), zoom (wheel), and live-annotation pointer/keyboard handling. Set `false` for a static embed. |
| `grid` | `boolean` | `true` | Draw a dotted grid that pans/zooms with the camera (a CSS background on the container). |
| `autoFit` | `boolean` | `true` | Fit the whole diagram into view after each `render()`. |
| `padding` | `number` | `80` | Screen-px padding used when fitting. |

### Render / scene

| Method | Signature | Notes |
|---|---|---|
| `render` | `(source: string) => Promise<RenderResult>` | Compile + render. `RenderResult = { scene: Scene; diagnostics: Diagnostic[] }`. |
| `getScene` | `() => Scene` | The current rendered scene (Scene IR). |
| `getSource` | `() => string` | The last source string passed to `render`. |

### Camera

| Method | Signature | Notes |
|---|---|---|
| `fit` | `(animate?: boolean) => void` | Fit the whole diagram (default `animate = true`). |
| `focus` | `(ids: string[], opts?: { zoom?: number; padding?: number }) => Promise<void>` | Animate to frame the given node/group/edge ids. |
| `zoomBy` | `(factor: number) => void` | Multiply zoom around the viewport centre (e.g. `1.2` in, `0.8` out). |
| `reset` | `() => void` | Animate back to fit-all. |
| `camera` | `get camera(): CameraController` | The underlying controller for advanced moves (`animateTo`, `panByScreen`, …). |

### Timeline (magic-move presentation)

Only meaningful when the source contains a `timeline { … }` — otherwise these
no-op. State changes emit via `on("state", …)`.

| Method | Signature | Notes |
|---|---|---|
| `play` | `() => void` | Auto-advance through beats. No-op if the scene has no steps. |
| `pause` | `() => void` | Stop auto-advance. |
| `next` / `prev` | `() => void` | Step forward / back one beat. |
| `goto` | `(i: number) => void` | Jump to beat index `i` (0-based). |
| `restart` | `() => void` | Go to the first beat. |
| `timeline` | `get timeline(): TimelinePlayer` | The underlying player (`hasTimeline`, current index, …). |

### Live annotations

| Method | Signature | Notes |
|---|---|---|
| `setTool` | `(tool: Tool) => void` | `Tool = "select" \| "highlight" \| "underline" \| "box" \| "circle" \| "arrow" \| "text"`. Requires `interactive: true`. |
| `undo` / `redo` | `() => void` | Undo/redo live annotation edits. |
| `clearAnnotations` | `() => void` | Remove all live annotations. |
| `annotationsToCode` | `() => string` | Serialize live annotations back to an `annotate { … }` DSL block. |
| `annotator` | `get annotator(): LiveAnnotationController` | The underlying controller. |

### Export

| Method | Signature | Notes |
|---|---|---|
| `toSVG` | `() => Promise<string>` | Standalone SVG string with the hand-drawn font **embedded** (renders offline). |
| `toPNG` | `() => Promise<Blob>` | Rasterised PNG (2× by default). |
| `toJSON` | `() => Scene` | The Scene IR (the same object `getScene` returns). |
| `downloadSVG` / `downloadPNG` | `() => Promise<void>` | Trigger a browser download. |
| `downloadJSON` | `() => void` | Download the Scene IR as JSON. |

### Lifecycle

| Method | Signature | Notes |
|---|---|---|
| `resize` | `() => void` | Re-measure the container and re-apply the camera. Called automatically on container resize when `interactive: true` (via `ResizeObserver`); call it yourself otherwise. |
| `destroy` | `() => void` | Remove listeners, the SVG, and the timeline; clears event subscribers. Always call on teardown. |

### Events — `on(event, cb): () => void`

`on` returns an **unsubscribe** function. Four events:

| Event | Payload | Fires when |
|---|---|---|
| `"render"` | `RenderResult` `{ scene, diagnostics }` | After each successful `render()`. |
| `"diagnostics"` | `Diagnostic[]` | After each `render()`, with compile diagnostics. |
| `"state"` | `PlayerState` `{ index, total, caption, playing, stepName }` | Timeline position/playing changes. |
| `"live"` | `LiveState` `{ tool, count, canUndo, canRedo, selected }` | Live-annotation tool/selection/undo state changes. |

A `Diagnostic` has `{ severity: "error"|"warning"|"info", code, message, line, col,
start, end, expected?, found?, hint? }` (see `src/engine/dsl/diagnostics.ts`).

```ts
const off = edd.on("diagnostics", (diags) => {
  const errors = diags.filter((d) => d.severity === "error");
  if (errors.length) console.warn(errors.map((d) => `${d.code}: ${d.message}`).join("\n"));
});
// later: off();  // unsubscribe
edd.on("state", (s) => console.log(`beat ${s.index + 1}/${s.total} — ${s.stepName}`));
```

---

## 4. React

`edododraw/react` exports `EdodoDrawView`, a thin wrapper that owns an `EdodoDraw`
instance for the lifetime of the component.

```tsx
import { EdodoDrawView } from "edododraw/react";
import type { EdodoDraw } from "edododraw/react";

export function Diagram() {
  return (
    <div style={{ height: 500 }}>
      <EdodoDrawView
        source={`scene { a[Hello] --> b[World] }`}
        interactive
        grid={false}
        style={{ borderRadius: 8 }}
        onReady={(edd: EdodoDraw) => edd.on("state", (s) => console.log(s.stepName))}
        onDiagnostics={(diags) => console.log(diags)}
        onState={(state) => console.log(state.index)}
      />
    </div>
  );
}
```

### Props (`EdodoDrawViewProps`)

`EdodoDrawViewProps` extends `EdodoDrawOptions` (so `interactive`, `grid`,
`autoFit`, `padding` are all valid props), plus:

| Prop | Type | Notes |
|---|---|---|
| `source` | `string` (required) | EDodoDraw source. Re-renders whenever it changes. |
| `className` | `string` | On the host `<div>`. |
| `style` | `CSSProperties` | Merged onto the host (which defaults to `width/height: 100%`). |
| `onReady` | `(edd: EdodoDraw) => void` | Called **once** after mount with the imperative instance — use it to subscribe to events or grab a ref for camera/export. |
| `onDiagnostics` | `(diags: Diagnostic[]) => void` | Wired to the `"diagnostics"` event. |
| `onState` | `(state: PlayerState) => void` | Wired to the `"state"` event. |

The host `<div>` fills its parent (`width/height: 100%`), so wrap it in a **sized**
element. Note the `EdodoDrawOptions` props (`interactive`, `grid`, …) are read
**once at mount**; only `source` is reactive. To change options at runtime, remount
(e.g. via a React `key`).

---

## 5. Low-level engine usage (SSR / Node-safe)

The DSL compiler is **synchronous and DOM-free**, so you can compile and validate a
diagram anywhere — Node, an edge function, a build step — without a browser:

```ts
import { compileEdd } from "edododraw";

const { scene, diagnostics, report } = compileEdd(`scene { a -> b -> c }`);
// scene       : the Scene IR (nodes/edges/steps/…), JSON-serializable
// diagnostics : a DiagnosticBag — diagnostics.items is Diagnostic[], .hasErrors, .errors
// report      : string[] — human-readable, source-annotated diagnostic blocks

if (diagnostics.hasErrors) throw new Error(report.join("\n\n"));
```

> `compileEdd` returns `diagnostics` as a **`DiagnosticBag`** (use `.items`,
> `.hasErrors`, `.errors`). This differs from the facade's `render()`, whose
> `diagnostics` is already a flat `Diagnostic[]`.

The full engine is re-exported from `edododraw` for building your own rendering
pipeline instead of using the `EdodoDraw` facade:

```ts
import {
  compileEdd, applyLayout,
  SvgRenderer, CameraController, TimelinePlayer,
  AnnotationLayer, LiveAnnotationController,
  cameraForBBox, sceneBBox,
  exportSVGString, exportPNGBlob,
  registerShape, ensureEngineStyles,
} from "edododraw";
```

For example, a minimal custom composition (browser): compile → new `SvgRenderer`
→ `renderer.render(scene)` → drive a `CameraController` yourself. The `EdodoDraw`
facade in `src/lib/EdodoDraw.ts` is the reference for how these compose.

---

## 6. Mermaid note

You can embed raw Mermaid inside EDodoDraw source:

```edd
scene {
  mermaid """
  flowchart LR
    A[Start] --> B{Choice}
    B -->|yes| C[Do it]
  """
}
```

- The Mermaid engine (`@excalidraw/mermaid-to-excalidraw`) is an **optional
  dependency, lazy-loaded** via dynamic `import()` on the **first** `mermaid` block
  rendered — so apps that never use Mermaid don't pay for it (it's heavy).
- The facade's `render()` extracts `mermaid """ … """` blocks, converts each, and
  injects the resulting nodes/edges into the scene.
- **If the package isn't installed**, the lazy import fails; the facade catches it
  and reports a diagnostic (code `M-PARSE`) for that block. The rest of the diagram
  still renders — `import { EdodoDraw } from "edododraw"` stays fully functional.
  Install it explicitly if you need Mermaid: `npm i @excalidraw/mermaid-to-excalidraw`.
- Mermaid conversion runs in the **browser only** (it renders to a hidden SVG). The
  pure `compileEdd` path stays synchronous and ignores Mermaid runtime.

Helpers `convertMermaid`, `extractMermaidBlocks`, and `injectMermaid` are also
exported from `edododraw` if you want to drive the import yourself. See
[IMPORT_AND_EXPORT_GUIDE.md](IMPORT_AND_EXPORT_GUIDE.md).

---

## 7. SSR / bundler notes

- **The facade needs a DOM.** `new EdodoDraw(el)` and its methods use browser globals
  — `document`, `window`, `getComputedStyle`, `ResizeObserver`, `requestAnimationFrame`
  / `cancelAnimationFrame` (camera animation), and `XMLSerializer` (SVG export).
  Construct and use it in the browser only. In React, create it inside `useEffect`
  (which is exactly what `EdodoDrawView` does), never during render or on the server.
- **`compileEdd` is DOM-free.** Use it for server-side validation, computing a scene
  ahead of time, or CI checks — no browser or jsdom required.
- **Fonts are self-contained.** The hand-drawn font (Excalifont/Virgil) is embedded
  as a base64 `@font-face` in the engine's injected CSS and in every exported SVG —
  **no external font file or CDN is needed**. The live canvas injects this CSS once
  per document via `ensureEngineStyles()` (the facade calls it automatically on
  mount). The UI/code fonts (Nunito, Cascadia) are best-effort from `/fonts` with
  system fallbacks and only matter inside the playground app.
- **ESM only.** There is no CommonJS build; use `import` (or dynamic `import()`),
  not `require`. Any modern bundler (Vite, webpack 5, esbuild, Rollup, Next.js)
  resolves the `edododraw` / `edododraw/react` subpath exports directly.
- **Tree-shaking + built-in shapes.** Built-in plugin shapes (e.g. `star`) are
  registered from the renderer on `mount()` (via `registerBuiltinShapes()`), so they
  survive a tree-shaking library build and are always available once you render.
  `package.json` also lists the `builtins` files under `sideEffects` for the eager
  registration path. Your own `registerShape(...)` calls run whenever their module is
  imported — import that module before you render.

---

## 8. Troubleshooting

| Symptom | Likely cause & fix |
|---|---|
| Blank canvas, nothing renders | Container has no height. Give it an explicit size (`height: 500px`); the facade sets position/overflow but never a size. |
| `document is not defined` / crash on the server | The facade needs a DOM. Only construct `EdodoDraw` in the browser; use `compileEdd` for SSR/Node. |
| `edd.play()` does nothing | The source has no `timeline { … }` — the player no-ops without steps. Add beats, or drive the camera directly with `focus`/`fit`. |
| Mermaid block shows an `M-PARSE` diagnostic | `@excalidraw/mermaid-to-excalidraw` isn't installed. Run `npm i @excalidraw/mermaid-to-excalidraw`. |
| Wheel/scroll is hijacked by the diagram | `interactive: true` binds wheel-zoom with `preventDefault`. Use `interactive: false` for a static embed. |
| React: changing `interactive`/`grid` prop has no effect | Options are read once at mount; only `source` is reactive. Remount (e.g. change the component `key`). |
| Live-annotation tools do nothing | Live tools require `interactive: true`. |
| Camera/timeline "jumps" instead of animating | You called an immediate variant (`fit(false)`), or `autoFit` refit after a `render()`. Use `focus(...)`/`fit(true)` for animated moves. |
| Old instance leaks / duplicate SVGs after re-mount | Call `edd.destroy()` on teardown (the React wrapper does this for you). |

---

See also: [ARCHITECTURE.md](ARCHITECTURE.md) ·
[DSL_LANGUAGE_GUIDE.md](DSL_LANGUAGE_GUIDE.md) ·
[CAMERA_AND_TIMELINE_GUIDE.md](CAMERA_AND_TIMELINE_GUIDE.md) ·
[ANNOTATIONS_GUIDE.md](ANNOTATIONS_GUIDE.md) ·
[IMPORT_AND_EXPORT_GUIDE.md](IMPORT_AND_EXPORT_GUIDE.md) ·
[EXTENDING_GUIDE.md](EXTENDING_GUIDE.md)
