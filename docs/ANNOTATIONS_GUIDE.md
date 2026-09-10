# Annotations Guide

Annotations are the layer of **highlights, underlines, arrows, callouts, spotlights** on top of a diagram — authored in code **or** drawn live, unified under one model (`Annotation` in `src/engine/scene/types.ts`).

## One model, two sources

- **Scripted** — from a top-level `annotate { … }` block (always-on) or inside a timeline `beat` (beat-scoped). Compiled into `scene.annotations` / `step.annotations`.
- **Live** — drawn interactively by the user. Kept by `LiveAnnotationController` in a separate `live` layer.

Both are the same `Annotation` record and both render through `AnnotationLayer` (`src/engine/annotate/layer.ts`), which draws hand-drawn (rough.js) marks in **world space** so they track the camera and their anchored element.

### Marks follow the diagram's roughness

Every mark is drawn with rough.js, and each kind has its own hand-tuned constants (a highlight
is deliberately looser than a callout leader). Those constants are now **relative**: they are
scaled by whatever hand-drawn intensity the diagram declared, so a clean diagram gets clean
marks and a scratchy one gets scratchy marks.

```edd
defaults { node { roughness: clean, pinCorners: true } }   // or: meta { style: hand-clean }
annotate { highlight db }                                   // as clean as the diagram
```

The declaration is `scene.meta.rough`, set by the `defaults { node { … } }` block or by a preset
that carries rough tuning of its own (today the `hand-clean` family) — see
[STYLES_GUIDE §5](STYLES_GUIDE.md). It also reaches group frames and `viz` templates, so one
line governs the whole picture. A diagram that declares nothing leaves it undefined and every
mark renders **exactly** as it always did: the ratio is 1, so each constant lands back on its
literal value.

Two more things follow the renderer rather than the scene: `SvgRenderer`'s
`nonScalingStroke` policy is applied to the mark layer after each render, and
`setRoughnessScale(k)` (the zoom compensation a video host uses) scales marks along with the
diagram — so an annotation stays as crisp as the boxes it points at through a punch-in.

### Anchoring

`Annotation.target` is a ref to a node/edge/group id (tracks that element), a set (`options.members`), or an absolute world point. When the camera moves or layout changes, the annotation follows because it lives in the transformed world layer and re-resolves its target bbox on render.

**Dotted ids & viz items.** Viz element/item ids contain dots (`sales.won`), which the target syntax parses as id + anchor part. The compiler resolves this after viz generation: when the bare ref matches nothing but the joined id does, the dotted id wins — so `strike sales.won` just works (legitimate parts like `underline a.label` are untouched). An explicit form is also available: `strike { target: "sales.won" }`. A viz **item** key anchors to the union bbox of all the item's elements. Targets that resolve to nothing emit a **`W-ANNOT-TARGET`** diagnostic instead of silently not drawing (timeline reveal/camera targets likewise emit `W-STEP-TARGET`).

## Kinds

`highlight` (marker) · `underline` (solid/double/wavy) · `strike` · `box` (over a set, labelled) · `circle-mark` · `point-at` (hand-drawn pointer + label) · `callout` (leader + bubble) · `spotlight` (dims everything but the target via an SVG mask) · `note-marker` · `connector` (free arrow) · `sticky` (note). See the table in [DSL_LANGUAGE_GUIDE §9](DSL_LANGUAGE_GUIDE.md).

## Real-time editing

The floating toolbar (left of the canvas) selects a tool; `LiveAnnotationController` (`src/engine/annotate/interact.ts`) handles pointer events:

| Tool | Gesture | Result |
|---|---|---|
| Select | click a mark → select; drag a **point-anchored** mark (sticky note / free arrow) → move; Delete → remove | edit existing |
| Highlight / Underline / Box / Circle | click an element | anchored annotation (tracks its element; can't be dragged) |
| Arrow | drag; endpoints snap to elements | `point-at` / free connector |
| Text | click | sticky note (inline text input) |

Undo/redo (`⌘Z` / `⇧⌘Z`) is a snapshot stack. All interaction is smooth and reversible; nothing mutates the source until you commit.

## Round-trip: commit to code

The **⤓ code** button serializes live annotations back into an `annotate "live" { … }` block and appends it to the editor, then clears the live layer — so what you drew becomes part of the program and re-renders as scripted:

```edd
annotate "live" {
  highlight idea { color: yellow }
  underline vibe { color: #1971c2 }
  circle-mark edit { color: #e8590c }
  point-at hello { from: s, color: #1971c2 }
}
```

Element-anchored annotations serialize exactly; free-form marks (a floating arrow with no element under either end) are emitted as a comment noting they aren't representable by id. See `LiveAnnotationController.commitToCode` and `tests/annotations.test.ts` for the round-trip contract.

## Animated arrows

The connector animations (`flow`, `dash-march`, `draw-on`, `comet`, `gradient-flow`, `electric`, `pulse`) are a CSS overlay path over the hand-drawn stroke — see `animationOverlay` in `src/engine/render/edges.ts` and the keyframes in `src/engine/render/theme.css.ts`. Set on any edge with `animate:` or the `~>` glyph.

Those keyframes are **wall-clock** motion, so `SvgRenderer { static: true }` emits no overlay at
all and a frame-driven host must rebuild them. `src/engine/render/frameArrows.ts` exports the
same motion as pure functions — `edgeCenterline(scene, id)` for the geometry and
`arrowFrameStyle(centerline, timeSec)` for one instant of the animation, plus the raw constants
(`ARROW_ANIMATIONS`, `DASH_MARCH_CYCLE_PX`, `COMET_HEAD_FRACTION`, `FLOW_GRADIENT_URL`). See
[REMOTION_RECIPE §4](REMOTION_RECIPE.md).

## Annotations in a frame-driven host

`stepStateAt(scene, i).annotations` already merges always-on + beat-scoped marks in render
order, and `AnnotationLayer.render(scene, annotations, false)` replaces the layer wholesale with
no reveal animation — so one call per frame is both correct and total. Beat-scoped marks appear
instantly; they have no progress knob. For a mark that *draws itself* on cue, overlay
`@remotion/rough-notation` positioned from `elementBBox(scene, id)` — see
[REMOTION_RECIPE §9](REMOTION_RECIPE.md).
