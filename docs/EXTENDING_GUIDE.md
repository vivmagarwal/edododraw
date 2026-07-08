# Extending EDodoDraw

How to add new capabilities to the engine: custom **shapes**, **animated arrows**,
**annotation kinds**, **layouts**, and **DSL constructs**. This guide is for people
working _inside_ the repository (or forking it) — every example is copy-paste
accurate against the current source.

> New to the codebase? Read [ARCHITECTURE.md](ARCHITECTURE.md) first, then
> [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md). To _embed_ EDodoDraw in an
> app (rather than extend it), see [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md).

---

## 1. The extension philosophy

EDodoDraw is designed to be extended without rewriting the core. Two ideas make
that possible:

- **The Scene IR is the contract.** Every producer (the DSL compiler, the Mermaid
  importer, a programmatic caller) emits a `Scene`; the renderer and controllers
  only consume a `Scene`. See `src/engine/scene/types.ts`. If your extension can be
  expressed as data on the `Scene`, everything downstream already works.
- **Open unions + registries.** The presentation-level enums are _open_ string
  unions: `ShapeKind`, `ArrowheadKind`, `ArrowAnimationKind`, `AnnotationKind`,
  and `LayoutKind` all end in `| (string & {})` (except `LayoutKind`, whose
  dispatch has a grid fallback). That means the parser and compiler already accept
  names they've never seen — an unknown value flows through the pipeline untouched
  and is _resolved at the last moment_ by a renderer switch or a registry lookup.

The practical consequence: **most extensions need no grammar change.** You add a
name and teach one switch (or one registry) how to draw it.

There are two flavours of extension:

| Flavour | Mechanism | Needs a repo edit? | Example |
|---|---|---|---|
| **Registry** (runtime) | `registerShape(name, fn)` | No — callable from any app | Custom shapes |
| **Switch** (compile-time) | add a `case` to a `switch` | Yes — you edit engine source | Animations, annotations, layouts |

Shapes are the only fully-runtime seam today; the rest are small, well-isolated
`switch` additions.

---

## 2. Add a custom shape

Shapes resolve through a **plugin registry** (`src/engine/plugins/registry.ts`).
You register a function under a name; the renderer calls it whenever a node's
`shape` matches. No grammar change is needed — `mapShape()` in
`src/engine/dsl/lower.ts` returns any unknown shape name as-is, and
`renderShapeBody()` (`src/engine/render/shapes.ts`) falls back to the registry in
its `default:` case:

```ts
// src/engine/render/shapes.ts (default branch of renderShapeBody)
default: {
  const plugin = getShapePlugin(shape);
  if (plugin) return plugin(rc, rect, style);
  // unknown shape -> rounded rectangle so nothing silently disappears
}
```

### The plugin contract

```ts
export type ShapePluginFn = (rc: RoughSVG, rect: ShapeRect, style: NodeStyle) => SVGGElement;
```

- **`rc`** — a rough.js SVG generator (`ReturnType<typeof rough.svg>`). Use
  `rc.polygon`, `rc.path`, `rc.ellipse`, `rc.rectangle`, `rc.circle`, `rc.line`,
  `rc.linearPath`, `rc.curve` — each returns an `SVGGElement` (or `SVGPathElement`)
  you append.
- **`rect`** — the node box as **top-left `x`/`y` plus `w`/`h`** (`ShapeRect`), in
  world coordinates. There is no separate transform: draw directly at these
  absolute coordinates. The centre is `(rect.x + rect.w/2, rect.y + rect.h/2)`.
- **`style`** — the node's resolved `NodeStyle` (stroke, fill, `fillStyle`,
  `strokeWidth`, `roughness`, `seed`, `fontSize`, …).
- **Return** a single `<g>` (`SVGGElement`). **Do not draw the label** — the
  renderer overlays text itself after calling you.

`nodeRoughOptions(style, filled)` (exported from `src/engine/render/shapes.ts`)
maps a `NodeStyle` onto rough.js `Options` (stroke/fill/roughness/seed, dashes,
hachure gap). Pass `filled = true` for closed bodies so the node's fill and
`fillStyle` are honoured; `false` for stroke-only accents. Using it keeps the
deterministic `seed` (so re-renders don't re-jitter) and the hand-drawn look
consistent with the built-ins.

### Worked example — a "gauge" shape (add to the builtins)

The canonical place to register in-repo shapes is
`src/engine/plugins/builtins.ts` (the `star` example already lives there). It is a
side-effect import from the engine barrel, so registering there means the shape is
always available. Add:

```ts
// src/engine/plugins/builtins.ts
import { nodeRoughOptions } from "../render/shapes.js";
import { registerShape } from "./registry.js";

// A half-circle gauge with a needle — great for "health"/"load" nodes.
registerShape("gauge", (rc, rect, style) => {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h * 0.72;           // dial sits low in the box
  const r = Math.min(rect.w, rect.h * 1.4) / 2;

  // The dial arc (semicircle), stroke-only.
  const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  g.appendChild(rc.path(arc, nodeRoughOptions(style, false)));

  // Filled body under the arc so fill/fillStyle read through.
  const body = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} Z`;
  g.appendChild(rc.path(body, nodeRoughOptions(style, true)));

  // The needle, pointing ~70% of the way across the dial.
  const angle = Math.PI - Math.PI * 0.7;
  g.appendChild(rc.line(cx, cy, cx + Math.cos(angle) * r * 0.9, cy - Math.sin(angle) * r * 0.9, {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth + 0.6,
    roughness: Math.min(style.roughness, 1),
    seed: style.seed,
  }));
  return g;
});
```

### Using it from the DSL

No grammar change — three equivalent ways to reach a registered shape:

```edd
scene {
  g1[CPU] { shape: gauge }     // via the `shape:` attribute
  node g2 "Memory" as gauge    // via the explicit `as <name>` form
}
```

Both compile to a node whose `shape` is `"gauge"`, which the renderer resolves via
`getShapePlugin("gauge")`. (Verified: `g[Gauge] { shape: gauge }` compiles to a
node with `shape === "gauge"`, and `node x as gauge` likewise.)

To also expose a **short keyword** (so `gauge g1 "CPU"` works as a shape-led node),
add the word to two internal tables:

1. `SHAPE_KEYWORDS` in `src/engine/dsl/tokens.ts` — so the parser treats
   `gauge <id>` as a keyword-led node (see `parseKeywordNode` in `parser.ts`).
2. `SHAPE_MAP` in `src/engine/dsl/lower.ts` — map `gauge: "gauge"` (only needed if
   the surface word differs from the registered name; identical names pass through
   `mapShape` unchanged).

### Registering from _outside_ the repo (runtime)

`registerShape` is part of the public package export, so an embedding app can add a
shape at runtime with no fork:

```ts
import { registerShape, EdodoDraw } from "edododraw";

// nodeRoughOptions is engine-internal (not re-exported), so build rough options
// inline from the NodeStyle you're handed:
registerShape("gauge", (rc, rect, style) => {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const opts = {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    roughness: style.roughness,
    seed: style.seed,
    fill: style.fill ?? undefined,
    fillStyle: style.fillStyle,
  };
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, r = Math.min(rect.w, rect.h) / 2;
  g.appendChild(rc.circle(cx, cy, r * 2, opts));
  return g;
});

const edd = new EdodoDraw(document.getElementById("app")!);
await edd.render(`scene { s[Sensor] { shape: gauge } }`);
```

Register **before** you call `render()` so the plugin is present when the scene
paints.

---

## 3. Add an animated arrow

An edge draws a hand-drawn base stroke, arrowheads, and (optionally) a clean
**overlay `<path>`** that carries a CSS animation along the exact same centerline.
Adding a new animation kind is **exactly three edits** plus (optionally) widening
the type union. We'll add a kind called `surge` (a fast, short dash sweep).

**Edit 1 — the overlay case** in `animationOverlay()`
(`src/engine/render/edges.ts`). This configures the SVG path for the new kind; the
element already has class `edd-anim edd-anim-surge`, and `--edd-len` / `--edd-speed`
CSS variables are set for you:

```ts
// src/engine/render/edges.ts — inside animationOverlay's switch (kind)
case "surge": {
  p.setAttribute("stroke", stroke);
  p.setAttribute("stroke-width", String(sw * 1.5));
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-dasharray", "4 14");
  style.animationDuration = `${0.7 / speed}s`;
  break;
}
```

**Edit 2 — the keyframe + class** in `src/engine/render/theme.css.ts` (the `CSS`
string). The class name must be `edd-anim-<kind>` to match the attribute the
overlay sets:

```css
@keyframes edd-surge {
  to { stroke-dashoffset: -18; }
}
.edd-anim-surge {
  animation-name: edd-surge;
  animation-timing-function: ease-in;
  animation-iteration-count: infinite;
}
```

`.edd-anim-surge` is already covered by the blanket `.edd-anim` selector in the
`prefers-reduced-motion` block at the end of the CSS, so motion-sensitive users
are handled automatically — no extra edit needed there.

**Edit 3 — accept the name in the compiler.** In `mapAnimation()`
(`src/engine/dsl/lower.ts`), add `surge` to the `known` set so the DSL keeps it
instead of falling back to `flow`:

```ts
const known = new Set([
  "none", "flow", "dash-march", "draw-on", "pulse", "comet",
  "gradient-flow", "electric", "glow", "caravan", "wiggle",
  "surge",  // <-- new
]);
```

**Optional — widen the type.** Add `| "surge"` to the `ArrowAnimationKind` union in
`src/engine/scene/types.ts`. The union is open (`| (string & {})`), so this is only
for editor autocomplete and exhaustiveness, not correctness.

### Using it

```edd
scene {
  a[Client] ~> b[Server] { animate: surge }
  a -> b { animation: surge { speed: 1.6 } }
}
```

Both `animate:` and `animation:` are accepted (see `buildEdgeStyle` in
`compile.ts`); the `{ speed: N }` styled form sets `animationSpeed`, which your
`animationDuration` divides by. The `~>` glyph is a convenient default that already
sets `animation: flow` + curved routing — override with the trailing block.

---

## 4. Add an annotation kind

Annotations (scripted _and_ live) are `Annotation` records rendered by
`AnnotationLayer.draw()` (`src/engine/annotate/layer.ts`). The `kind` field is an
open union, so adding one is a single `case` plus a private draw method. We'll add
`cross` (a big hand-drawn X over an element — distinct from `strike`, which is one
horizontal line).

**Edit 1 — the `draw` switch** in `AnnotationLayer` (`layer.ts`). `box` is the
target's world bounding box (already resolved for you from `an.target`):

```ts
// src/engine/annotate/layer.ts — inside draw()'s switch (an.kind)
case "cross":
  if (box) this.drawCross(g, box, an);
  break;
```

**Edit 2 — the draw method** (same file), using rough.js with a stable `seed` so it
doesn't re-jitter:

```ts
private drawCross(g: SVGGElement, box: BBox, an: Annotation): void {
  const color = an.color || "#e03131";
  const opts = { stroke: color, strokeWidth: 3, roughness: 1.6, seed: 33 };
  g.appendChild(this.rc.line(box.minX, box.minY, box.maxX, box.maxY, opts));
  g.appendChild(this.rc.line(box.minX, box.maxY, box.maxX, box.minY, opts));
  if (an.text) this.label(g, an.text, { x: box.minX, y: box.minY - 8 }, color, "start");
}
```

That's enough to use it from a scripted `annotate { … }` block — `parseAnnotationCmd`
reads any leading ident as the `kind`, so no parser change is required:

```edd
scene { a[Deprecated] }
annotate {
  cross a { color: red }
}
```

> Note: to use a **bare** annotation command inside a `timeline` beat or a
> `stagger { … }` block (e.g. `beat { cross a }`), also add `"cross"` to the
> `ANNOT_KINDS` set at the bottom of `src/engine/dsl/parser.ts` — that set gates
> which idents are recognised as annotation verbs in beat context. Top-level
> `annotate { … }` blocks don't consult it.

### Optional — a live tool

To let users draw it interactively, teach `LiveAnnotationController`
(`src/engine/annotate/interact.ts`):

1. **Widen the `Tool` union:** `export type Tool = "select" | … | "cross";`
2. **Add a default** to the `DEFAULTS` map — the element-anchored tool path in
   `pointerDown()` reads it (click an element → annotation created):
   ```ts
   const DEFAULTS = {
     // …existing…
     cross: { kind: "cross", color: "#e03131", options: {} },
   };
   ```
3. **(Optional) commit-to-code:** add a `case "cross"` to `serialize()` so
   `annotationsToCode()` round-trips it back to DSL.
4. **Add a toolbar button** in the playground: `src/app/App.tsx`, the `TOOLS`
   array — `{ tool: "cross", icon: "✕", label: "Cross out element" }`.

The live layer already handles selection, undo/redo, and camera tracking generically,
so those come for free.

---

## 5. Add a layout

Auto-layout assigns world positions to non-pinned nodes based on
`scene.meta.layout` (a `LayoutKind`). See `src/engine/layout/index.ts`. Adding a
mode is three edits; we'll add `column` (a single vertical stack).

**Edit 1 — the algorithm.** New file `src/engine/layout/column.ts`, mutating each
node's top-left `x`/`y` in place (mirror the shape of `grid.ts`/`radial.ts`):

```ts
// src/engine/layout/column.ts
import type { SceneNode } from "../scene/types.js";

/** Stack nodes in one centred vertical column, top to bottom. */
export function layoutColumn(nodes: SceneNode[], gap: number): void {
  let y = 0;
  for (const n of nodes) {
    n.x = -n.w / 2;   // centre each node on x = 0
    n.y = y;
    y += n.h + gap;
  }
}
```

**Edit 2 — the dispatch** in `runLayout()` (`layout/index.ts`). Any unknown kind
already falls back to grid, so this just makes `column` explicit:

```ts
import { layoutColumn } from "./column.js";
// …
switch (kind) {
  // …existing cases…
  case "column":
    layoutColumn(movable, gridGap(scene));
    return;
}
```

**Edit 3 — the type + DSL mapping.**

- Add `"column"` to the `LayoutKind` union in `src/engine/scene/types.ts`.
- Map the DSL keyword in `resolveLayoutKind()` (`src/engine/dsl/compile.ts`) — this
  is where `layout <word>` is translated to a `LayoutKind`:
  ```ts
  const map: Record<string, LayoutKind> = {
    dag: "dag", tree: "dag", flow: "dag", force: "dag",
    grid: "grid", radial: "radial", free: "manual", manual: "manual",
    column: "column",  // <-- new
  };
  ```

### How a layout is chosen

`resolveLayoutKind()` runs at compile time: an explicit `layout <kind>` maps through
the table above; with no `layout` statement, the compiler defaults to `"dag"` when
any node is unpinned, else `"manual"`. `applyLayout(scene)` then reads
`scene.meta.layout` and dispatches. Cross-cutting rules that come for free:
`pinned` nodes are never moved, the function never throws (falls back to grid), and
the final result is normalised so the bounding box starts near `(40, 40)`.

### Using it

```edd
scene {
  layout column
  a[One] --> b[Two] --> c[Three]
}
```

---

## 6. Add a DSL construct

The DSL is a hand-written recursive-descent parser (`src/engine/dsl/parser.ts`)
lowered to Scene IR by the compiler (`src/engine/dsl/compile.ts`). Grammar changes
touch three files — know where each concern lives:

| File | Responsibility | Where to hook in |
|---|---|---|
| `dsl/ast.ts` | AST node types | Add your statement's interface + to the relevant union (`TopStmt`, `SceneStmt`, `BeatItem`, …). |
| `dsl/parser.ts` | tokens → AST | Add a keyword case to `parseTop()` (top level) or `parseSceneStmt()` (inside `scene { }`); write a `parseX()` that returns your AST node. |
| `dsl/compile.ts` | AST → Scene IR | Handle your node in `compileProgram`'s top-level loop or in `walk()` (scene statements), writing onto the `Scene`. |
| `dsl/lower.ts` | enum/glyph → IR value tables | Add any surface-word → IR-value mapping here (e.g. new shape/animation/routing names). |

Concretely:

- **A new node/edge attribute** (e.g. `blur: 4`) is the smallest change: no parser
  edit at all. Attributes are parsed generically by `parseAttrEntry`, so you only add
  a `case "blur":` to `buildNodeStyle` (or `buildEdgeStyle`) in `compile.ts` and a
  field to `NodeStyle`/`EdgeStyle` in `scene/types.ts` (then honour it in the
  renderer). This is the recommended path for most "new knob" requests.
- **A new top-level keyword** (e.g. `legend { … }`): add `case "legend": return
  this.parseLegend();` to `parseTop()`, define `parseLegend()` (use
  `parseAttrBlock()` / `skipBlock()` helpers), add the AST type, and consume it in
  `compileProgram`'s statement loop. Note `parseTop` already _tolerates_ unknown
  top-level keywords like `plugin`/`define` by skipping their block — a good template
  for "parse but ignore for now."
- **A new scene-level statement** (e.g. `ruler …`): add a `case` to
  `parseSceneStmt()`'s keyword switch and handle it in `walk()`.

Keep the parser **permissive and recoverable**: report problems via
`this.error(code, msg, token, …)` (which pushes a `Diagnostic`) and call
`recoverStmt()` / `skipBlock()` rather than throwing. The compiler accumulates
`Diagnostic`s and always returns a best-effort `Scene` — see
[DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) ("Diagnostics, not
exceptions").

For the full user-facing grammar, see
[DSL_LANGUAGE_GUIDE.md](DSL_LANGUAGE_GUIDE.md).

---

## 7. Testing your extension

Follow the two-stage rule from [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md).

**Stage 1 — code-level (fast, Node/jsdom).** The compiler is synchronous and
DOM-free, so most extensions are unit-testable without a browser. Add a spec under
`tests/` (vitest) and run:

```bash
npm test          # vitest run
npm run typecheck  # tsc -b --noEmit
```

A shape/animation/annotation test typically compiles a snippet and asserts on the
resulting `Scene`:

```ts
import { describe, it, expect } from "vitest";
import { compileEdd } from "../src/engine/dsl/index.js";

describe("gauge shape", () => {
  it("passes an unknown shape name through unchanged", () => {
    const { scene } = compileEdd(`scene { g[CPU] { shape: gauge } }`);
    expect(scene.nodes[0].shape).toBe("gauge");
  });
});

describe("surge animation", () => {
  it("keeps a registered animation kind", () => {
    const { scene } = compileEdd(`scene { a -> b { animate: surge } }`);
    expect(scene.edges[0].style.animation).toBe("surge");
  });
});
```

Existing suites to mirror: `tests/parser.test.ts`, `tests/lowering.test.ts`,
`tests/layout.test.ts`, `tests/annotations.test.ts`.

**Stage 2 — end-user visual check.** A green unit test does not prove the
hand-drawn render is correct. Run the app and drive it with `playwright-cli`, then
**read the screenshots**:

```bash
npm run dev                 # dev server (see DEVELOPMENT_STANDARDS.md)
scripts/qa/smoke.sh         # loads every example, screenshots, fails on console errors
```

Add an example that exercises your extension (an `.edd` file wired into the
playground's example list) so the smoke test covers it, and confirm no
per-element render warnings appear in the console — the renderer wraps each
node/edge so one bad element can't blank the diagram, but it _will_ log a warning
you should catch.
