# Annotations Guide

Annotations are the layer of **highlights, underlines, arrows, callouts, spotlights** on top of a diagram — authored in code **or** drawn live, unified under one model (`Annotation` in `src/engine/scene/types.ts`).

## One model, two sources

- **Scripted** — from a top-level `annotate { … }` block (always-on) or inside a timeline `beat` (beat-scoped). Compiled into `scene.annotations` / `step.annotations`.
- **Live** — drawn interactively by the user. Kept by `LiveAnnotationController` in a separate `live` layer.

Both are the same `Annotation` record and both render through `AnnotationLayer` (`src/engine/annotate/layer.ts`), which draws hand-drawn (rough.js) marks in **world space** so they track the camera and their anchored element.

### Anchoring

`Annotation.target` is a ref to a node/edge/group id (tracks that element), a set (`options.members`), or an absolute world point. When the camera moves or layout changes, the annotation follows because it lives in the transformed world layer and re-resolves its target bbox on render.

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
