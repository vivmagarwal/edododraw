I have a complete picture of the existing engine. The Scene IR already declares `Annotation`, `AnnotationTarget`, `AnnotationKind`, `Step`, and `CameraDirective`; the `SvgRenderer` already has an `annotations` world layer plus a screen-space `screenLayer`, `worldToScreen`/`screenToWorld`, and reveal keyframes; `anchors.ts` resolves rich connection points; `edges.ts` + `theme.css.ts` already implement an animated-arrow overlay. My design doc extends these consistently rather than reinventing them.

Here is the design doc.

---

# EDodoDraw — Design Doc: Annotation & Real-Time Editing Layer

Status: proposed (M4). Author-facing (DSL) + interactive (live) unified under one model.
Grounded against the current engine: `src/engine/scene/types.ts` (IR), `render/svgRenderer.ts` (layer stack, camera, `worldToScreen`/`screenToWorld`), `scene/anchors.ts` (`resolveAnchor`), `scene/query.ts` (`elementBBox`), `render/edges.ts` + `render/theme.css.ts` (animated overlay).

## 0. Scope

In scope: the annotation primitives (highlight, underline, point-at, spotlight/dim, box-around, circle-around, strike, connector, ink, sticky-note), their data model / anchoring / reveal / DSL round-trip; the real-time editing UX (toolbar, targeting, drag-to-place, spring appearance, edit/delete, undo/redo, commit-to-code); and the animated-arrow catalog. Camera/magic-move (M3) and the DSL parser (M2) are consumed here, not designed here — but this doc pins the exact surfaces it needs from them.

## 1. Design principles

1. **One model, two origins.** A scripted annotation (compiled from DSL) and a live annotation (drawn by the user) are the *same* `Annotation` record. The only difference is `origin: "script" | "live"` and who owns its lifetime. Everything downstream — anchoring, rendering, reveal, hit-test, serialization — is origin-agnostic. This is the single most important decision: it makes "commit live → code" a pure serialization, and "edit script annotation live" a pure mutation.
2. **World-anchored by default; screen-anchored only when it must be.** Because the `annotations` layer lives *inside* the camera-transformed `world` group, a world-anchored annotation tracks camera pan/zoom for free (the CSS transform does it). Only annotations whose *purpose* is screen-relative (spotlight/dim mask, optionally billboarded labels) live in `screenLayer` and are recomputed per camera frame.
3. **Anchor, don't bake.** An annotation never stores resolved pixels. It stores a *target descriptor* (`AnnotationTarget`) that is re-resolved against the live scene every paint. So when layout/dagre or a live drag moves a node, its highlight/underline/box follow with zero extra bookkeeping.
4. **Hand-drawn is the default aesthetic.** Every primitive is drawn with rough.js (marker rects, squiggle underlines, wobbly circles) using the same deterministic-seed discipline as nodes (`seed = hash(annotation.id)`) so re-paints never re-jitter.
5. **Reveal is declarative and reduced-motion-safe.** Each annotation carries a `reveal` spec; the layer plays it via the existing CSS reveal classes or a JS spring. `prefers-reduced-motion` short-circuits to an instant show (already wired in `theme.css.ts`).
6. **LLM-terse DSL.** One annotation = one line. Targets are `id` or `id.part` (`db.label`); free placement is `at=x,y`. Round-trip is lossless for everything except freehand point precision (documented).

## 2. Architecture & layer placement

```
SvgRenderer
 ├─ svg
 │   ├─ defs            (gradients, filters, + per-annotation masks/markers)
 │   ├─ bg              (screen rect)
 │   ├─ world  (camera transform: translate·scale·translate)
 │   │   ├─ grid
 │   │   ├─ groups
 │   │   ├─ edges
 │   │   ├─ nodes
 │   │   └─ annotations   ◄── AnnotationLayer.worldRoot  (tracks camera for free)
 │   └─ screenLayer    (NO transform)
 │       ├─ spotlight    ◄── AnnotationLayer.screenRoot (recomputed per camera frame)
 │       └─ (billboard labels, optional)
 └─ overlayDom (HTML, absolutely positioned over svg)
     ├─ FloatingToolbar
     ├─ target highlight ring / selection handles
     └─ inline text editor (contenteditable) for note/callout editing
```

The interactive chrome (toolbar, handles, text editor) is **HTML over the SVG**, not SVG — it needs native focus, caret, and CSS. It is positioned using `worldToScreen`. Only the *committed* annotation art is SVG in the `annotations` layer.

Small additions required of `SvgRenderer` (all trivial, some already exist):

```ts
// already: getLayer("annotations"), screenLayer, worldToScreen, screenToWorld, getCamera
getNodeTextEl(id: string): SVGTextElement | null;   // NEW: for text metrics (underline/strike)
onCameraChange(cb: (c: CameraTransform) => void): () => void;  // NEW: fired by CameraController each frame
getDefs(): SVGDefsElement;                            // NEW: per-annotation mask/marker defs
```

## 3. Coordinate & anchoring model (the tracking engine)

Everything hinges on one pure function that turns a stored `AnnotationTarget` into live geometry:

```ts
import type { Point, Rect } from "../geometry.js";
import { resolveAnchor, nodeRect } from "../scene/anchors.js";
import { elementBBox, getNode } from "../scene/query.js";

export interface ResolvedGeometry {
  /** Tight world box of what we resolved to (element / label / point / region). */
  worldRect: Rect;
  /** Primary attach point in world space (border-aware for connectors/point-at). */
  anchorPoint: Point;
  /** Orientation hint in radians (text baseline direction, or side normal). */
  angle: number;
  /** Present iff we resolved to text (used by underline / strike). */
  textBox?: Rect;
  kindHint: "node" | "edge" | "group" | "text" | "point" | "region";
}

export interface TextMetricsProvider {
  /** Live glyph box for a node/edge label in WORLD units. Prefers getBBox on the
   *  rendered <text>; falls back to fontSize×charLen×0.55 estimate when detached. */
  labelBox(scene: Scene, ref: string, part: "label"): Rect | null;
}

export function resolveGeometry(
  scene: Scene,
  metrics: TextMetricsProvider,
  target: AnnotationTarget,
  toward?: Point,             // opposite endpoint for border-aware anchoring
): ResolvedGeometry;
```

Resolution rules for `target = { ref, part, point, rect }`:

| target shape | resolves to |
|---|---|
| `ref = null`, `point` set | `worldRect` = 1×1 at point; `anchorPoint` = point; `kindHint:"point"` |
| `ref = null`, `rect` set | that rect; `kindHint:"region"` |
| `ref` = node/group/edge, `part` undefined | `elementBBox(scene, ref)`; `anchorPoint` = border toward `toward` via `resolveAnchor` |
| `part = "label"` | `metrics.labelBox(...)`; `kindHint:"text"`; `textBox` set |
| `part = "border"` | element bbox; `anchorPoint` = nearest border point toward `toward` |
| `part` = anchor name (`"n"`,`"se"`,`"top:0.3"`,`"angle:45"`) | `resolveAnchor(node, part, toward)`; tiny rect at that point |

**Why this makes tracking automatic:**

- **Camera moves** → the `annotations` group is a child of `world`, which owns the camera transform. Nothing re-resolves. Screen-anchored spotlight re-runs only `patchCamera` (cheap: recompute one clip rect via `worldToScreen`).
- **Element moves** (dagre relayout, or a live node drag) → the controller marks affected annotation ids dirty and calls `AnnotationLayer.patchTargets`, which re-runs `resolveGeometry` + repaints only those. Because geometry is never baked, the highlight/box/underline snap to the new position. rough seeds are stable, so the stroke shape is identical, only translated.

`toward` (the opposite endpoint) is supplied for connectors/point-at so border anchoring aims at the actual other side, reusing the exact refinement pass `edges.ts` already does in `resolveEndpoints`.

## 4. Core data model

Extends the IR already in `scene/types.ts` (backward compatible — adds `reveal`, `visible`, `locked`; keeps `options` as the per-kind bag).

```ts
export type AnnotationKind =
  | "highlight" | "underline" | "point-at" | "spotlight"
  | "box-around" | "circle-around" | "strike"
  | "connector" | "ink" | "note"
  | (string & {});                       // plugin-registered

export interface AnnotationTarget {
  ref: string | null;                    // node/edge/group id, or null = free
  part?: string;                         // "label" | "border" | anchor name
  point?: Point;                         // free world point (ref null)
  rect?: Rect;                           // free world region (ref null)
  /** For ink/note anchored to an element: offset from element top-left at capture,
   *  so the mark travels with the element. */
  offset?: Point;
}

export type RevealAnim =
  | "none" | "fade" | "sweep"            // marker sweep L→R (clip-path)
  | "draw"                               // stroke-dashoffset draw-on (rough paths)
  | "pop"                                // spring scale-in
  | "spotlight-open";                    // mask hole expands

export interface AnnotationReveal {
  anim: RevealAnim;
  durationMs?: number;                   // default per-kind
  delayMs?: number;
  easing?: EasingName;                   // reuse IR EasingName
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  target: AnnotationTarget;
  target2?: AnnotationTarget;            // "from" side of connector/point-at
  text?: string;
  color: string;                         // palette name or hex
  options: Record<string, unknown>;      // per-kind, validated by the renderer
  reveal?: AnnotationReveal;             // default = kind's default reveal
  z: number;
  origin: "script" | "live";
  visible?: boolean;                     // step visibility toggling (default true)
  locked?: boolean;                      // live-edit lock (script anns default locked)
  seed?: number;                         // rough seed; default hash(id)
}
```

`options` is a loose bag in the IR (JSON-friendly), but each renderer parses it through a typed guard. The per-kind option types:

```ts
interface HighlightOptions { pad?: number; style?: "marker" | "rough-fill"; opacity?: number; }
interface UnderlineOptions  { thickness?: number; squiggle?: number; gap?: number; }
interface PointAtOptions    { curve?: number; label?: string; side?: "auto"|"top"|"left"|...; gap?: number; }
interface SpotlightOptions  { dim?: number; feather?: number; shape?: "rect"|"ellipse"; pad?: number; }
interface BoxOptions        { pad?: number; corner?: number; }        // box-around
interface CircleOptions     { pad?: number; ovality?: number; }       // circle-around
interface StrikeOptions     { thickness?: number; squiggle?: number; }
interface ConnectorOptions  { routing?: EdgeRouting; dashed?: boolean; animation?: ArrowAnimationKind; endArrowhead?: ArrowheadKind; }
interface InkOptions        { points: Point[]; thickness?: number; smoothing?: number; } // points relative to target.offset if anchored
interface NoteOptions       { w?: number; h?: number; fontSize?: number; fill?: string; fold?: boolean; }
```

## 5. Annotation primitives catalog

Each entry: **data model → anchoring → reveal → SVG sketch → DSL round-trip.** All strokes rough.js unless noted; `seed = a.seed ?? hash(a.id)`.

### 5.1 highlight — marker/rough rect behind element

- **Data:** `kind:"highlight"`, `HighlightOptions{ pad=6, style:"marker", opacity:0.35 }`, `color`.
- **Anchoring:** `resolveGeometry.worldRect` of the target, expanded by `pad`. Renders in world layer *below* everything else in `annotations` (uses `z` low). Tracks element automatically.
- **Reveal:** default `sweep` — a `clip-path: inset(0 100% 0 0) → inset(0)` L→R wipe (existing `edd-marker-sweep`), reading as a marker stroke being drawn. `marker` style = a soft `rough.rectangle` with `fillStyle:"solid"`, low opacity, slightly larger than text, rounded ends. `rough-fill` style = `fillStyle:"hachure"` translucent.
- **SVG:** `rc.rectangle(x,y,w,h,{ fill: color, fillStyle:"solid", stroke:"none", roughness:1.4, seed })` wrapped in `<g class="edd-reveal-sweep">`.
- **DSL:** `highlight db` · `highlight db.label color=yellow pad=8` · `highlight db style=rough opacity=0.4`.

### 5.2 underline — rough squiggle under text

- **Data:** `kind:"underline"`, `UnderlineOptions{ thickness=2.5, squiggle=1.6, gap=3 }`.
- **Anchoring:** requires a **text** target → resolves to `textBox`. Underline sits at `textBox.y + textBox.h + gap`, spanning `textBox.x → x+w`. If target isn't text, falls back to the element's bottom edge. Because `textBox` comes from live `getBBox`, it re-measures if the label text changes.
- **Reveal:** default `draw` — `stroke-dasharray = len; stroke-dashoffset: len → 0` (reuse `edd-draw-on` mechanics but one-shot `both`, not looping) so the squiggle draws in from the start.
- **SVG:** a single hand-drawn line: `rc.line(x0,y, x1,y, { roughness: squiggle, strokeWidth: thickness, seed, stroke: color })`. rough's bowing gives the squiggle; for a stronger wave, generate a `rc.curve` through `[x0,y],[mid,y+3],[x1,y]`.
- **DSL:** `underline api.label` · `underline api.label color=red thickness=3`.

### 5.3 point-at — hand-drawn arrow + callout label

- **Data:** `kind:"point-at"`, `text`, `PointAtOptions{ curve=0.25, gap=10, side:"auto" }`. `target` = what we point *to*; `target2` = where the arrow starts (an element, or a free `point`/`offset`). If `target2` omitted, the start is auto-placed on the `side` of the target with room, offset outward.
- **Anchoring:** `to = resolveGeometry(target, toward=fromPoint).anchorPoint` (border-aware). `from = resolveGeometry(target2 ?? auto).anchorPoint`. Callout label chip is placed at `from`, biased away from the diagram. Both re-resolve on move.
- **Reveal:** default `draw` for the arrow (dash draw-on) then `pop` (spring scale) for the callout chip, `delayMs` staggered ~180ms.
- **SVG:** reuse the edge pipeline — a rough curved stroke (`routePoints`/`centerlinePath` with `curve`) + `drawArrowhead(rc,"arrow",tip,angle,...)` from `edges.ts`, plus a text chip like `edgeLabel`. This deliberately shares code with connectors and edges.
- **DSL:** `point-at db from=api text="hot path"` · `point-at db text="N+1" curve=0.4 side=top` (auto start).

### 5.4 spotlight / dim — mask everything but target

- **Data:** `kind:"spotlight"`, `SpotlightOptions{ dim=0.6, feather=24, shape:"rect", pad=16 }`. Target may be an id, a group, or **multiple** ids (`target.ref` = first, extra ids in `options.also: string[]`), unioned.
- **Anchoring:** **screen-anchored.** Renders in `screenRoot`: a full-viewport dark `<rect fill=black opacity=dim>` with an SVG `<mask>` (or `clip-path`) punching a hole at the target's **screen** rect (`worldToScreen` of the union bbox, expanded by `pad`, feathered via a blurred mask). Recomputed on every `onCameraChange` and on target move — this is the one primitive that *must* recompute per frame, and it's O(1).
- **Reveal:** `spotlight-open` — hole radius/scale animates from large→tight (or opacity 0→dim) via a JS spring on the mask geometry, so focusing feels like a lens closing. Pairs naturally with a magic-move `focus` in the same step.
- **SVG:**
  ```html
  <mask id="edd-spot-{id}">
    <rect width=100% height=100% fill=white/>
    <rect x y w h rx=feather fill=black filter=url(#eddSoftGlow)/>  <!-- hole -->
  </mask>
  <rect width=100% height=100% fill={dimColor} opacity={dim} mask=url(#edd-spot-{id})/>
  ```
- **DSL:** `spotlight api` · `spotlight [web,api,db] dim=0.7 shape=ellipse pad=24`.

### 5.5 box-around — hand-drawn rectangle around element

- **Data:** `kind:"box-around"`, `BoxOptions{ pad=8, corner=6 }`.
- **Anchoring:** target `worldRect` expanded by `pad`. World layer, above nodes.
- **Reveal:** default `draw` — rough rect drawn as an open path with dash draw-on (perimeter draws in). Optionally a tiny overshoot loop at a corner for the "circled by hand" feel (`ovality`-like jitter).
- **SVG:** `rc.rectangle(...)` with `fill:"none"`, `roughness:1.6`, `strokeWidth:2`, `seed`. Convert to a single path so draw-on works (`rc.path("M… h… v… h… Z")`).
- **DSL:** `box-around web` · `box-around web color=blue pad=12 corner=10`.

### 5.6 circle-around — wobbly hand ellipse/loop

- **Data:** `kind:"circle-around"`, `CircleOptions{ pad=10, ovality=1.15 }`.
- **Anchoring:** `worldRect` expanded; ellipse sized `w×ovality`, `h`. World layer.
- **Reveal:** `draw` with ~1.15 turns (a slightly-overshooting loop, like circling by hand). Implement as a `rc.path` of an ellipse arc that overshoots start by ~30°, then dash draw-on.
- **SVG:** `rc.ellipse(cx,cy,w,h,{ fill:"none", roughness:1.8, seed, stroke:color })`, or the overshoot arc path for extra character.
- **DSL:** `circle-around auth` · `circle-around auth color=red ovality=1.3`.

### 5.7 strike — strike-through text

- **Data:** `kind:"strike"`, `StrikeOptions{ thickness=2.5, squiggle=1.2 }`.
- **Anchoring:** text target → `textBox`; line at vertical center `textBox.y + h/2`, spanning width. Falls back to element mid-line.
- **Reveal:** `draw` (fast, ~250ms) — reads as scribbling it out.
- **SVG:** `rc.line(x0, midY, x1, midY, { roughness: squiggle, strokeWidth: thickness, seed, stroke: color })`.
- **DSL:** `strike oldapi.label` · `strike oldapi.label color=red`.

### 5.8 connector — arrow between two live points

- **Data:** `kind:"connector"`, `target2` = from, `target` = to, `ConnectorOptions{ routing:"curved", dashed:false, animation:"none", endArrowhead:"arrow" }`, optional `text`.
- **Anchoring:** both endpoints via `resolveGeometry` (border-aware, mutual refinement like `resolveEndpoints`). Endpoints may be elements, anchors (`api.se`), or free points (`at=x,y`). Tracks both ends on move. This is a *first-class annotation*, distinct from a `SceneEdge`: it can connect **anything to anything** including free points and labels, and it round-trips into the `annotate` layer, not the graph topology.
- **Reveal:** `draw` (dash draw-on) + optional arrowhead `pop`.
- **SVG:** literally the edge renderer — build a synthetic `SceneEdge`-like from the connector and call `routePoints`/`centerlinePath`/`drawBase`/`drawArrowhead`/`animationOverlay`. This is why connectors get animated-arrow variants for free.
- **DSL:** `connect api -> db` · `connect api.se -> cache.nw color=violet dashed text="async" anim=flow`.

### 5.9 ink — freehand

- **Data:** `kind:"ink"`, `InkOptions{ points:Point[], thickness=2.5, smoothing=0.5 }`. Points are captured in world space; if anchored to an element, stored **relative** to `target.offset` (element top-left at capture) so ink travels with the element.
- **Anchoring:** if `target.ref` set → points rebased to `element.x/y + storedPoint`; else absolute world. Live capture: pointer stream → `screenToWorld` each sample → simplify (Ramer-Douglas-Peucker at tolerance ~`1.5/zoom`) → smooth (Catmull-Rom to Bézier).
- **Reveal:** `draw` — dash draw-on along the smoothed path; length via `pathLength`.
- **SVG:** one `<path>` (perfect-freehand-style variable width optional; v1 = constant width `stroke-linecap:round stroke-linejoin:round`) plus, for texture, a second faint rough offset. Simplest hand feel: `rc.curve(points, { roughness: 0.8, strokeWidth: thickness, seed })`.
- **DSL:** compact — `ink color=blue points="10,10 22,14 40,9 …"`; anchored: `ink of=db points="…"` (points relative). Precision reduced to 1 decimal; this is the **only lossy** round-trip (documented). For large strokes the serializer may emit a base64-packed `points64="…"` form.

### 5.10 note — sticky note / text

- **Data:** `kind:"note"`, `text`, `NoteOptions{ w=180, h=120, fontSize=16, fill:"yellow", fold:true }`.
- **Anchoring:** free `point` (`at=x,y`) or offset from an element (`of=node dx dy`). A small folded-corner rough rect + wrapped hand text. Editing uses the HTML `contenteditable` overlay, positioned by `worldToScreen`.
- **Reveal:** `pop` (spring scale-in with slight rotate, like a sticky slapped down).
- **SVG:** `rc.polygon` for the folded-corner quad + `rc.line` fold + `textBlock` (reuse renderer's wrapped text). Optional drop shadow via `eddSoftGlow`.
- **DSL:** `note at=760,120 text="TODO: cache invalidation" color=yellow` · `note of=db dx=20 dy=-40 text="sharded"`.

Reveal defaults table:

| kind | default reveal | notes |
|---|---|---|
| highlight | sweep | marker wipe L→R |
| underline / strike | draw | fast (~250ms) |
| box-around / circle-around | draw | perimeter draw-in |
| point-at | draw → pop | arrow then callout, staggered |
| connector | draw | + head pop |
| spotlight | spotlight-open | spring hole close |
| ink | draw | along path length |
| note | pop | spring scale + tiny rotate |

## 6. Rendering pipeline — `AnnotationLayer` + renderer registry

Mirrors how edges/nodes render, but with a registry so kinds are pluggable (matches the IR's "open union resolved through registries" intent).

```ts
export interface AnnotationRenderContext {
  rc: RoughSVG;
  doc: Document;
  scene: Scene;
  camera: CameraTransform;
  metrics: TextMetricsProvider;
  worldToScreen: (p: Point) => Point;
  defs: SVGDefsElement;
  resolve: (t: AnnotationTarget, toward?: Point) => ResolvedGeometry;
}

export interface AnnotationRenderer {
  kind: AnnotationKind;
  /** true → renders in screenRoot (spotlight); default false → worldRoot. */
  screenSpace?: boolean;
  /** Build the SVG for one annotation. Returns the root <g> (data-annotation=id). */
  build(a: Annotation, ctx: AnnotationRenderContext): SVGGElement;
  /** Cheap reposition when only the camera changed (screenSpace kinds only). */
  patchCamera?(a: Annotation, el: SVGGElement, ctx: AnnotationRenderContext): void;
  /** Default reveal if annotation.reveal is unset. */
  defaultReveal(a: Annotation): AnnotationReveal;
}

export const annotationRegistry = new Map<string, AnnotationRenderer>();
export function registerAnnotation(r: AnnotationRenderer) { annotationRegistry.set(r.kind, r); }
```

```ts
export class AnnotationLayer {
  private worldRoot: SVGGElement;   // renderer.getLayer("annotations")
  private screenRoot: SVGGElement;  // child of renderer.screenLayer
  private els = new Map<string, { g: SVGGElement; a: Annotation; screen: boolean }>();

  render(list: Annotation[], ctx: AnnotationRenderContext): void {
    // stable diff by id (add / update-in-place / remove); sort by z.
    // For each new/changed annotation: renderer.build → insert → schedule reveal.
  }
  patchCamera(ctx: AnnotationRenderContext): void {
    for (const { a, g, screen } of this.els.values())
      if (screen) annotationRegistry.get(a.kind)?.patchCamera?.(a, g, ctx);
  }
  patchTargets(dirtyIds: Set<string>, ctx: AnnotationRenderContext): void {
    // rebuild only annotations whose target.ref ∈ dirtyIds (or free ones never).
  }
  reveal(id: string): void { /* add reveal class or start JS spring */ }
  remove(id: string): void { /* fade-out then detach */ }
}
```

Wiring:
- After `SvgRenderer.render(scene)`, call `annotationLayer.render(scene.annotations.concat(liveStore.list()), ctx)`.
- `CameraController` (M3) calls `onCameraChange` each frame → `annotationLayer.patchCamera(ctx)` (only spotlight recomputes).
- On live node drag / relayout, dirty ids → `patchTargets`.

## 7. Reveal / spring animation system

Two mechanisms, chosen per reveal:

- **CSS-class reveals** (`fade`, `sweep`, `draw`, `pop`) — reuse the existing `edd-reveal-*` classes in `theme.css.ts`; `draw` reuses the `edd-anim-draw-on` dash math one-shot (`animation-fill-mode: both`, no loop). Set `--edd-len` from `pathLength`, `animation-delay` from `reveal.delayMs`, `animation-duration` from `durationMs`. Zero JS per frame.
- **JS spring reveals** (`pop` scale with overshoot, `spotlight-open` hole geometry, and all drag-follow) — a shared critically-tunable spring:

```ts
export interface Spring { stiffness: number; damping: number; mass?: number; }
export function spring(from: number, to: number, cfg: Spring,
  onFrame: (v: number) => void, onDone?: () => void): () => void; // returns cancel
```

Same `spring` powers: reveal `pop`, drag-to-place follow, toolbar item hover, and (shared with M3) camera magic-move. `prefers-reduced-motion` → springs resolve instantly to `to`; CSS reveals already disabled by the media query in `theme.css.ts`.

## 8. Real-time editing subsystem

### 8.1 Tool interface + registry

```ts
export type Targeting = "element" | "text" | "two-point" | "freehand" | "point";

export interface ToolContext {
  scene: Scene;
  camera: CameraTransform;
  screenToWorld: (p: Point) => Point;
  hitTest: (world: Point) => HitResult | null;   // §8.4
  defaultColor: string;
}
export interface PointerWorld { world: Point; screen: Point; shift: boolean; alt: boolean; }

export interface AnnotationDraft {
  partial: Partial<Annotation> & { kind: AnnotationKind };
  /** transient render hint while dragging (not yet committed). */
  preview: Annotation;
}

export interface Tool {
  id: string;
  kind: AnnotationKind;
  label: string;
  icon: string;                 // inline SVG path
  cursor: string;
  targeting: Targeting;
  defaults(): Partial<Annotation>;
  begin(ctx: ToolContext, ev: PointerWorld): AnnotationDraft;
  update(draft: AnnotationDraft, ctx: ToolContext, ev: PointerWorld): AnnotationDraft;
  /** null = cancel (e.g., a click that hit nothing for an element tool). */
  commit(draft: AnnotationDraft, ctx: ToolContext, ev: PointerWorld): Annotation | null;
}

export const toolRegistry = new Map<string, Tool>();
```

Targeting drives the gesture shape:
- **element** (highlight, box, circle, spotlight): click an element → snap target to its id; drag over several → multi-target.
- **text** (underline, strike): click resolves to nearest label; target `part:"label"`.
- **two-point** (connector, point-at): press on source → drag → release on destination; either end may land on empty canvas (free point) or an element/anchor (snaps, shows the anchor dots from `anchors.ts`).
- **freehand** (ink): pointer stream captured, simplified on `up`.
- **point** (note): click to drop; opens inline editor.

### 8.2 `AnnotationController`

```ts
export type ControllerEvent =
  | { type: "tool-changed"; toolId: string | null }
  | { type: "annotation-added"; a: Annotation }
  | { type: "annotation-updated"; a: Annotation }
  | { type: "annotation-removed"; id: string }
  | { type: "selection-changed"; id: string | null }
  | { type: "dirty"; ids: string[] }              // needs repaint
  | { type: "code-dirty"; edits: CodeEdit[] };    // commit-to-code produced edits

export interface AnnotationController {
  setTool(toolId: string | null): void;
  getActiveTool(): Tool | null;

  // pointer pipeline (screen coords in; controller converts via screenToWorld)
  onPointerDown(ev: PointerEvent): void;
  onPointerMove(ev: PointerEvent): void;
  onPointerUp(ev: PointerEvent): void;
  onKeyDown(ev: KeyboardEvent): void;   // Esc cancel, Delete, Cmd+Z/Shift+Z

  // CRUD (all go through the command stack)
  add(a: Annotation): void;
  update(id: string, patch: Partial<Annotation>): void;
  remove(id: string): void;
  select(id: string | null): void;
  reorder(id: string, z: number): void;

  undo(): void;
  redo(): void;

  /** Serialize live annotations into DSL and return edits to splice into source. */
  commitToCode(scope: "global" | { step: string }): CodeEdit[];

  on(cb: (e: ControllerEvent) => void): () => void;
}
```

The controller owns two stores that render as one list:
- **scriptStore** — annotations compiled from DSL (`origin:"script"`, `locked` by default). Replaced wholesale on each recompile. Selecting one and editing it either (a) "detaches to live" (becomes editable, will be re-serialized on commit, replacing its source line) or (b) is disabled if the user hasn't unlocked it.
- **liveStore** — user-drawn annotations (`origin:"live"`). Persist across recompiles (keyed by stable id) until committed to code.

Merged render list = `scriptStore.list() ∪ liveStore.list()`, sorted by `z`.

### 8.3 Command stack (undo/redo)

```ts
type Command =
  | { t: "add"; a: Annotation }
  | { t: "remove"; a: Annotation }
  | { t: "update"; id: string; before: Partial<Annotation>; after: Partial<Annotation> }
  | { t: "reorder"; id: string; before: number; after: number };
```

`undo` pops and inverts; `redo` re-applies. Coalescing: a continuous drag emits many `update`s that collapse into one command on pointer-up (compare by id + same field-set within a time window). Ink capture is a single `add` on pointer-up. History is per-document; commit-to-code is itself an undoable meta-command (it removes from liveStore and records the produced `CodeEdit`s so undo restores the live annotation and reverts the text splice).

### 8.4 Hit-testing (target selection)

```ts
export interface HitResult { kind: "node" | "edge" | "group" | "label"; id: string; part?: string; }
export function hitTest(scene: Scene, world: Point, metrics: TextMetricsProvider): HitResult | null;
```
Order: labels (tight `textBox` via metrics) → nodes (`pointInRect`, shape-aware for ellipse/diamond) → edges (distance-to-polyline < `6/zoom`) → group frames. On hover, the controller paints a **HTML target ring** (dashed rounded rect over the candidate, positioned via `worldToScreen`) so the user sees exactly what will be annotated before committing. Anchor dots (all of `anchors.ts`' compass + fractional points) light up when a two-point tool hovers a node, so the user can snap `api.se` precisely.

### 8.5 Floating toolbar (UX)

HTML, absolutely positioned, appears at bottom-center (global tools) and as a **context toolbar** near the selection (edit tools).

- **Global tool strip:** cursor/select, highlight, underline, box, circle, point-at, connector, strike, spotlight, ink, note — each a rough-styled icon button. Hover shows a tooltip + the DSL keyword (teaches the syntax). Number keys `1–9` select tools; `V` = select; `Esc` = back to select.
- **Contextual bar (on selection):** color swatch row (palette names), thickness/pad stepper, per-kind toggles (e.g. connector: routing, dashed, arrowhead, animation dropdown), reveal picker, `↑/↓` z-order, duplicate, delete, and **"⤴ Commit to code"**. Positioned above the selection's screen bbox; flips below if clipped.
- **Live preview while dragging:** the draft renders through the same registry with a translucent style and a spring on appearance; on `commit` it "sets" (spring settle + reveal plays).
- **Inline text editing:** double-click a note/point-at/callout → a `contenteditable` div overlays the SVG text (matched font `Excalifont`, size, color from `FONT_FAMILY`), caret-editable; blur/Enter commits `text` via an `update` command.

### 8.6 Gesture flows

- **Element annotate (highlight/box/circle/spotlight):** pick tool → hover shows target ring → click commits `{ target:{ref:id} }`. Shift-click adds more targets (spotlight union / multi-highlight).
- **Text annotate (underline/strike):** hover shows the exact `textBox` ring → click commits `{ target:{ref, part:"label"} }`.
- **Two-point (connector/point-at):** pointer-down on source (snaps to element/anchor/free) → drag draws a live rubber-band arrow through the edge pipeline → pointer-up on destination commits `{ target2: from, target: to }`. Snap radius grows anchor dots.
- **Freehand (ink):** pointer-down..move captures samples → up simplifies+smooths → commit. If the stroke started over an element, it auto-anchors (`target.ref`, points rebased) else free.
- **Point (note):** click drops a default note at `at=worldPoint`, immediately focuses the inline editor.

## 9. Round-trip & commit-to-code

### 9.1 DSL surface

Annotations appear either globally or inside a step (both compile to `Annotation` records; step-scoped ones populate `Step.annotations`, global ones `Scene.annotations`).

```
# global
annotate {
  highlight db color=yellow
  underline api.label color=red thickness=3
  point-at auth from=api text="policy check" curve=0.3
  connect api.se -> cache.nw color=violet dashed anim=flow
  spotlight [web,api,db] dim=0.65
  note at=760,120 text="TODO: shard" color=yellow
}

# step-scoped (magic-move presentation)
step "Hot path" {
  focus api, db pad=80          # camera directive (M3)
  box-around api color=blue
  point-at db from=api text="N+1 here"
}
```

Grammar (EBNF, integrates with M2):

```
annotation   := kind target-spec? from-spec? opt* ;
kind         := "highlight"|"underline"|"point-at"|"spotlight"|"box-around"
              | "circle-around"|"strike"|"connect"|"ink"|"note" | IDENT ;
target-spec  := ref ("." part)? | "[" ref ("," ref)* "]" | "at=" x "," y ;
from-spec     := "from=" (ref ("." part)? | x "," y) ;      # connect uses "a -> b"
connect       := "connect" endpoint "->" endpoint opt* ;
endpoint      := ref ("." anchor)? | "at=" x "," y ;
opt          := key "=" value ;                             # color, pad, thickness, curve, dashed, anim, side, dim, w, h, points…
part         := "label" | "border" | anchor ;
anchor       := "n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw"|"c"|"top"|... | side ":" frac | "angle:" deg ;
```

### 9.2 Serializer (live → code)

```ts
export function annotationToDSL(a: Annotation): string;
```
Deterministic, one line per annotation. Rules:
- `kind` keyword (`connector` → `connect a -> b`).
- target → `ref` or `ref.part`; free → `at=x,y` (rounded to int); union → `[a,b,c]`.
- Only **non-default** options are emitted (compare against the kind's defaults) → minimal, LLM-clean output.
- `color` emitted as palette name if it matches `STROKE_PALETTE`, else hex.
- reveal emitted only if non-default (`reveal=pop`).
- ink points reduced to 1 decimal (`points="…"`); documented as the sole lossy field.

```ts
export interface CodeEdit { range?: {start:number; end:number}; insert: string; anchorHint?: string; }
```

### 9.3 Commit-to-code mechanics + identity model

This is the crux of "round-trippable back to code":

1. **Selection scope.** `commitToCode("global")` targets the `annotate {}` block (created if absent); `commitToCode({step})` targets that step's body.
2. **Serialize** each chosen live annotation via `annotationToDSL`, splice as new lines into the block (formatted with existing indentation). Return `CodeEdit[]` — the app applies them to the DSL source buffer.
3. **Recompile.** The DSL compiler produces `Scene.annotations` including the new lines → they arrive as `origin:"script"` records **with the same `id`** (the serializer emits a stable `#id` comment or the compiler derives ids deterministically from position+kind+target; we keep the live id via an emitted `@id=…` when needed to preserve reveal/animation continuity).
4. **De-dup.** On recompile, the controller removes from `liveStore` any live annotation whose id now appears in `scriptStore` → no double render, no flthan. Because both stores render identically, the swap is visually seamless.
5. **Reverse (script → live editing).** Selecting a script annotation and hitting "unlock/edit" copies it into `liveStore` and marks the source line for replacement on next commit (tracked by id → source range), so editing a scripted highlight and re-committing rewrites *its* line, not a new one.

Undo of a commit: restores the liveStore entries and reverts the `CodeEdit`s (single meta-command).

## 10. End-to-end event flow

```
Live draw:
  pointerdown ─▶ Controller.onPointerDown
     └─ activeTool.begin(ctx, {world}) ─▶ AnnotationDraft(preview)
  pointermove ─▶ activeTool.update(draft) ─▶ Layer renders preview (translucent, spring-in)
  pointerup   ─▶ activeTool.commit(draft) ─▶ Annotation | null
     ├─ null  ─▶ discard preview
     └─ ann   ─▶ Command{add} ▶ history.push ▶ liveStore.add
                 ─▶ emit "annotation-added" + "dirty"
                 ─▶ Layer.render(merged) ─▶ Layer.reveal(id)  (plays default/spec reveal)
                 ─▶ toolbar → context bar on new selection

Camera move (M3 tween each frame):
  CameraController.frame ─▶ renderer.applyCamera ─▶ onCameraChange
     └─ AnnotationLayer.patchCamera  (spotlight recompute only; world anns free)

Element move (drag / relayout):
  drag/layout ─▶ scene mutate ─▶ Controller marks dirty ids
     └─ AnnotationLayer.patchTargets(dirty) ─▶ re-resolveGeometry ─▶ repaint those only

Edit:
  context bar change ─▶ Controller.update(id, patch) ─▶ Command{update}(coalesced)
     ─▶ liveStore/scriptStore mutate ─▶ Layer patch ─▶ emit updated

Commit to code:
  "Commit" ─▶ Controller.commitToCode(scope) ─▶ annotationToDSL ─▶ CodeEdit[]
     ─▶ emit "code-dirty" ─▶ app splices into DSL buffer ─▶ recompile
     ─▶ scriptStore replaced ─▶ de-dup liveStore by id ─▶ Layer.render(merged)
```

## 11. Animated-arrows catalog

Formalizes and extends what already ships in `edges.ts` (`animationOverlay`) + `theme.css.ts`. The **base rough stroke stays static and hand-drawn**; a **clean overlay `<path>` on the exact centerline** carries the motion, so it reads as "energy travelling along the drawn line." Refactor the `switch` into a registry so it's pluggable and shared by edges *and* connector annotations:

```ts
export interface ArrowAnimContext {
  overlay: SVGPathElement;   // path already set to centerline `d`
  stroke: string; strokeWidth: number; length: number; speed: number;
  defs: SVGDefsElement; id: string;
}
export interface ArrowAnimator {
  kind: ArrowAnimationKind;
  apply(ctx: ArrowAnimContext): void;   // set stroke/dasharray/CSS class/vars, add defs
}
export const arrowAnimators = new Map<ArrowAnimationKind, ArrowAnimator>();
```

Catalog (each = a CSS class in `theme.css.ts` + per-instance vars `--edd-len`, `--edd-speed`, `--edd-dashoffset`):

| variant | look | SVG implementation |
|---|---|---|
| **flow** / **dash-march** | dashes crawl toward the head | `stroke-dasharray:"10 8"`, `@keyframes edd-march { to { stroke-dashoffset:-18 } }`, `linear infinite`, duration `0.9s/speed`. Overlay width `1.2×`. |
| **draw-on** | line paints itself end-to-end, loops | `stroke-dasharray:len`, `--edd-dashoffset:len`, `edd-draw-on` offset `len→0`, `ease-in-out alternate`. One-shot variant = reveal `draw`. |
| **pulse** | whole line breathes opacity/width | `edd-pulse` `opacity 0.15↔0.85` (+ optional `stroke-width` throb), `ease-in-out infinite`, `1.3s/speed`. No dashing. |
| **comet** | bright head with fading tail | `stroke-dasharray:"{seg} {len}"` (seg≈`0.14·len`), `edd-comet` offset `len→-0.14·len`, `drop-shadow(0 0 4px currentColor)`, `linear infinite`. |
| **gradient-flow** | colored energy band flowing | `stroke:url(#eddFlowGradient)` (multi-stop linear grad in defs), `stroke-dasharray:"16 10"`, march keyframe, width `2.4×`. For directional hue-shift, animate the gradient's `x1/x2` via a per-instance `<animate>` or a rotating `gradientTransform`. |
| **electric** *(bonus)* | jittery sparks | tight dash `"2 7"`, `edd-electric` `steps(3)` timing, fast `0.5s/speed`, width `1.6×`. |

Directionality follows the path orientation (head = `to` end); reverse by negating the keyframe offset sign (expose `direction: "forward"|"reverse"` → `animation-direction: reverse`). Speed is `EdgeStyle.animationSpeed` (already in IR). All disabled under `prefers-reduced-motion` (already handled). New animators register into `arrowAnimators` + add one keyframe block to the injected CSS — that's the entire extension path. Connector annotations get every variant for free by routing through the same overlay builder.

Two additions worth shipping to round out the catalog: **dual-flow** (two offset comet segments for bidirectional sync) and **glow-pulse** (pulse + `eddSoftGlow` filter) — both are just a class + one keyframe, demonstrating the plugin surface.

## 12. Steps / timeline integration

`Step.annotations` (already in IR) holds the annotations revealed *during* that step; `Step.camera` is the magic-move directive. The presentation runtime:
- Entering step N: play `reveal` for each of `step.annotations` (staggered by `delayMs`), toggle `visible` on `reveal`/`hide` ids, run the camera directive. Spotlight in a step pairs with `focus` so the lens-close and camera zoom share a spring timeline.
- Leaving a step (forward/back): annotations with `origin:"script"` scoped to the step fade out (reverse reveal); baseline `Scene.annotations` persist across steps.
- Live annotations added during authoring can be committed **into a specific step** (`commitToCode({step})`) so a presenter builds the narration interactively then bakes it.

## 13. Accessibility, reduced motion, testing

- **Reduced motion:** CSS reveals + arrow anims already gated by the media query; JS springs resolve instantly; spotlight opens without the spring. All annotations still render — only motion is removed.
- **Contrast:** highlight/marker opacity floors so text stays legible; spotlight `dim` capped ≤0.8.
- **Keyboard:** tools `1–9`/`V`/`Esc`; selected annotation `↑↓←→` nudges (free/offset), `Delete` removes, `Cmd+Z`/`Cmd+Shift+Z` undo/redo, `[`/`]` z-order.
- **Testing hooks:** every annotation `<g data-annotation="{id}" data-kind>`; toolbar buttons `data-tool`; target ring `data-target-ring`. Deterministic seeds make rough output snapshot-stable (matches existing visual-test discipline). `annotationToDSL`/parser round-trip is a pure unit test (`parse(serialize(a)) ≈ a`, ink within tolerance).

## 14. Module layout (slots into M4)

```
src/engine/annotate/
  types.ts            # AnnotationReveal, options unions, ResolvedGeometry, HitResult
  resolve.ts          # resolveGeometry, TextMetricsProvider (getBBox + estimate)
  registry.ts         # annotationRegistry, registerAnnotation
  layer.ts            # AnnotationLayer (world+screen roots, diff, reveal, patch*)
  renderers/          # one file per kind (highlight, underline, pointAt, spotlight,
                      #   boxAround, circleAround, strike, connector, ink, note)
  reveal.ts           # spring(), reveal driver, reduced-motion
  serialize.ts        # annotationToDSL, defaults-diffing, CodeEdit
src/engine/arrows/
  animators.ts        # arrowAnimators registry (refactor of edges.ts switch)
src/app/annotate/
  AnnotationController.ts   # tools, stores, command stack, commitToCode
  tools/                    # one Tool per kind
  hitTest.ts
  FloatingToolbar.tsx       # global strip + context bar (HTML overlay)
  InlineTextEditor.tsx      # contenteditable for note/callout
  TargetRing.tsx
```

Engine additions: `SvgRenderer.getNodeTextEl`, `onCameraChange`, `getDefs`; three lines in `theme.css.ts` (dual-flow/glow-pulse keyframes + one-shot draw class). No IR breaking changes — `Annotation` gains optional `reveal`/`visible`/`locked`/`seed`.

---

**Key files referenced (absolute paths):**
- IR / types: `/Users/vivmagarwal/Work/edodo-draw/src/engine/scene/types.ts`
- Renderer + layer stack + camera transforms: `/Users/vivmagarwal/Work/edodo-draw/src/engine/render/svgRenderer.ts`
- Anchor resolution (reused for point-at/connector endpoints): `/Users/vivmagarwal/Work/edodo-draw/src/engine/scene/anchors.ts`
- Element bbox queries (reused for `resolveGeometry`): `/Users/vivmagarwal/Work/edodo-draw/src/engine/scene/query.ts`
- Existing animated-arrow overlay to refactor into a registry: `/Users/vivmagarwal/Work/edodo-draw/src/engine/render/edges.ts`
- Reveal + arrow keyframes to extend: `/Users/vivmagarwal/Work/edodo-draw/src/engine/render/theme.css.ts`
- Defaults/factories the serializer diffs against: `/Users/vivmagarwal/Work/edodo-draw/src/engine/scene/defaults.ts`
- Palette for color-name serialization: `/Users/vivmagarwal/Work/edodo-draw/src/engine/scene/palette.ts`