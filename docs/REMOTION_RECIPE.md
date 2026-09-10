# Remotion Recipe — driving EDodoDraw frame by frame

How to put an EDodoDraw diagram in a [Remotion](https://remotion.dev) video and get a
**deterministic** result: the same frame number always produces the same pixels, whether it was
reached by scrubbing the Studio timeline, by a parallel render worker starting at frame 900, or
by a re-render six months later.

This is the copy-pasteable companion to [INTEGRATION_GUIDE §6](INTEGRATION_GUIDE.md), which
covers the same API in the context of the whole embedding surface. A runnable project skeleton
is in [`examples/remotion/`](../examples/remotion/).

> **The whole idea in one sentence:** *compile once, render once, and per frame call only total
> functions of `frame`.*

---

## 0. The rule everything else follows from

Remotion does not *play* your composition. It **seeks** it. A render farm splits the frame range
across workers, the Studio jumps wherever you click, and `<Player>` may re-mount. So:

| | |
|---|---|
| ✅ **Total** | `f(frame) → state`. Frame 412 computes its own visibility, camera and draw-on progress from scratch. |
| ❌ **Incremental** | `state = advance(state, dt)`. Anything that reads its own previous value, counts elapsed time, or assumes frame *N-1* already ran. |

Every per-frame call below is total. If you add a channel of your own, make it total too.

## 1. Cost budget (measured, 12-node/13-edge scene, Chrome)

| Operation | Cost | When |
|---|---|---|
| `compileEdd(source)` | **8–18 ms** | once, in `useMemo` — pure, synchronous, DOM-free |
| `renderer.mount()` + `renderer.render(scene)` | **8–30 ms** | once, in `useLayoutEffect` — **never per frame** |
| `renderer.applyCamera(cam)` | **0.003 ms** | every frame |
| `renderer.applyVisibility(set)` | **0.21 ms** | every frame |
| `renderer.setRevealProgressAll(map)` | **0.27 ms** | every frame |
| `renderer.setRoughnessScale(k)` | 8–30 ms (a re-render) | only when the zoom octave changes; a repeat value is a no-op |

A 30 fps composition has 33 ms per frame. `render(scene)` alone eats all of it, and it
regenerates every rough.js stroke — which is exactly why it lives outside the frame path.

---

## 2. The component

```tsx
import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  AnnotationLayer,
  SvgRenderer,
  compileEdd,
  easingByName,
  mixCameras,
  resolveCameraDirective,
  stepStateAt,
  whenFontsReady,
  type Scene,
} from 'edododraw';

export type EdodoDiagramProps = {
  readonly source: string;                    // .edd source text
  readonly beatFrames: readonly number[];     // frames per beat, in beat order
  readonly moveFrames?: number;               // camera travel time between beats
  readonly drawFrames?: number;               // hand-drawing time for `with draw-on`
};

/** Pure: which beat is on screen at `frame`, and how far into it we are. */
function beatAt(frame: number, beatFrames: readonly number[]): {index: number; local: number} {
  if (beatFrames.length === 0) return {index: -1, local: 0};
  let acc = 0;
  for (let i = 0; i < beatFrames.length; i++) {
    const len = Math.max(1, beatFrames[i]);
    if (frame < acc + len) return {index: i, local: frame - acc};
    acc += len;
  }
  const last = beatFrames.length - 1;
  return {index: last, local: Math.max(1, beatFrames[last])}; // past the end: hold, settled
}

export const EdodoDiagram: React.FC<EdodoDiagramProps> = ({
  source,
  beatFrames,
  moveFrames = 24,
  drawFrames = 18,
}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  // ── 1. PURE, ONCE ─────────────────────────────────────────────────────────
  // compileEdd is synchronous and DOM-free, and rough.js seeds are hashed from
  // element ids — identical on every worker and every re-render.
  const scene: Scene = useMemo(() => {
    const {scene: compiled, diagnostics} = compileEdd(source);
    if (diagnostics.hasErrors) {
      throw new Error(diagnostics.errors.map((d) => `${d.code}: ${d.message}`).join('\n'));
    }
    return compiled;
  }, [source]);

  // ── 2. IMPERATIVE, ONCE ───────────────────────────────────────────────────
  const hostRef = useRef<HTMLDivElement>(null);
  const gfx = useRef<{renderer: SvgRenderer; annotations: AnnotationLayer} | null>(null);
  const [fontHandle] = useState(() => delayRender('edododraw: hand-drawn font'));

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new SvgRenderer(host, {
      static: true,           // no wall-clock CSS anywhere — see §4
      nonScalingStroke: true, // 2px stays 2px through a punch-in — see §6
      annotations: false,     // the AnnotationLayer below owns that layer
    });
    renderer.mount();
    // STATE the viewport, do not measure it. Remotion mounts a composition
    // inside a 0x0 off-screen wrapper during the layout pass, so measure()
    // would read 0x0, clamp to 1x1, and every applyCamera below would then
    // translate by half a pixel — the whole diagram in the top-left corner.
    // useVideoConfig() already knows the real size, and it is the same
    // viewport passed to resolveCameraDirective, so the two agree by
    // construction.
    renderer.setViewport({w: width, h: height});
    renderer.render(scene);   // THE ONLY render() call in this component

    const annotations = new AnnotationLayer(renderer);
    gfx.current = {renderer, annotations};

    // The hand-drawn font is injected as a base64 @font-face. Screenshot before
    // it decodes and every label is laid out with fallback metrics.
    whenFontsReady()
      .then(() => continueRender(fontHandle))
      .catch((err) => cancelRender(err));

    return () => {
      renderer.destroy();
      gfx.current = null;
    };
  }, [scene, fontHandle, width, height]);

  // ── 3. PER FRAME ──────────────────────────────────────────────────────────
  // Total functions of `frame` only. No accumulation, no clock, no render().
  useLayoutEffect(() => {
    const g = gfx.current;
    if (!g) return;
    const viewport = {w: width, h: height};

    const {index, local} = beatAt(frame, beatFrames);
    const state = stepStateAt(scene, index);
    const prev = stepStateAt(scene, Math.max(-1, index - 1));

    // (a) camera — resolve both endpoints, then interpolate. mixCameras mixes
    //     zoom in LOG space, exactly like the interactive controller does.
    const to = resolveCameraDirective(scene, state.effectiveCamera, viewport);
    const from = resolveCameraDirective(scene, prev.effectiveCamera, viewport);
    const t = interpolate(local, [0, moveFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const cam = mixCameras(from, to, easingByName(state.camera?.easing ?? 'ease-in-out')(t));

    // (b) keep screen-space jitter constant through a punch-in — see §6.
    //     ORDER MATTERS: this REPAINTS when the value changes, which rebuilds
    //     the node/edge layers — so it must come BEFORE the DOM writes below,
    //     or a repaint silently throws them away. Quantised to octaves and
    //     floored at 1, so a composition that never passes 2x never repaints.
    g.renderer.setRoughnessScale(1 / Math.max(1, Math.pow(2, Math.floor(Math.log2(cam.zoom)))));
    g.renderer.applyCamera(cam);

    // (c) visibility — sticky reveal/hide, resolved from scratch at this beat
    g.renderer.applyVisibility(new Set(state.hidden));

    // (d) annotations — always-on + this beat's, in render order.
    //     `false` suppresses the CSS reveal (static mode ignores it anyway).
    g.annotations.render(scene, state.annotations, false);

    // (e) draw-on — pass ONLY the in-progress ids. setRevealProgressAll restores
    //     every other drawable to 1, which is what makes it safe under seeking.
    const drawing: Record<string, number> = {};
    if (drawFrames > 0) {
      const p = interpolate(local, [0, drawFrames], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      for (const [id, fx] of Object.entries(state.revealFx)) {
        if (fx === 'draw-on') drawing[id] = p;
      }
    }
    g.renderer.setRevealProgressAll(drawing);
  }, [frame, scene, beatFrames, moveFrames, drawFrames, width, height]);

  return (
    <AbsoluteFill style={{backgroundColor: scene.meta.background || scene.theme.background}}>
      <div ref={hostRef} style={{position: 'absolute', left: 0, top: 0, width, height}} />
    </AbsoluteFill>
  );
};
```

### Why `setViewport`, not `measure()`

`measure()` reads `clientWidth`/`clientHeight`. In Remotion that is **0 at the moment a
`useLayoutEffect` runs** — the composition is mounted in a 0x0 wrapper parked at
`y: -999999` and only sized later — so `measure()` clamps the camera viewport to `1x1`.
The diagram still paints (the `<svg>` is `width: 100%`), but `applyCamera`'s
`translate(w/2 h/2)` becomes `translate(0.5 0.5)`, so `fit-all` lands in the top-left corner
and a `focus` beat pushes the subject off-screen entirely. It looks like the camera is broken;
the camera is fine and the viewport is wrong.

`setViewport({w, h})` states the size instead of discovering it, and it is the *same* number
handed to `resolveCameraDirective`, which is what makes the two consistent. Use `measure()`
only in an interactive host, where the container really is laid out.

### The one ordering rule

`setRoughnessScale` regenerates strokes, and regenerating strokes **rebuilds the node and edge
layers** — throwing away the `edd-hidden` classes `applyVisibility` set and the dash attributes
`setRevealProgressAll` wrote. So the frame has two halves, in this order:

1. **camera + roughness scale** — anything that may repaint;
2. **DOM state** — `applyVisibility`, `AnnotationLayer.render`, `setRevealProgressAll`.

Get it backwards and the composition still *looks* right while you scrub forward, then differs
on a seek — the worst kind of bug, because the Studio and the render farm disagree.
`applyCamera` alone never repaints, so it can go on either side.

### Why `useLayoutEffect`, not `useEffect`

`useLayoutEffect` runs **synchronously before paint**, so its mutations are always in the frame
that gets captured. `useEffect` is asynchronous and can land one frame late — which in a seeking
renderer means an arbitrary frame late.

### Where the beat numbers come from

`beatFrames` is yours to choose. If the `.edd` already carries dwell times (`hold: 2s`, or a
`viz` block with `animate:` + `hold:`), read them off the compiled scene — every beat's `hold:`
lands on `step.autoAdvanceMs`:

```ts
const beatFrames = useMemo(
  () => (scene.steps ?? []).map((s) => Math.round(((s.autoAdvanceMs ?? 3200) / 1000) * fps)),
  [scene, fps],
);
```

`stepStateAt(scene, -1)` is the overview: nothing hidden, always-on annotations only,
`effectiveCamera` undefined → `resolveCameraDirective` returns fit-all.

### Captions

`state.caption` is the beat's `narrate:` text. Render it as ordinary React — it is already a
total function of the frame:

```tsx
const caption = stepStateAt(scene, beatAt(frame, beatFrames).index).caption;
```

---

## 3. The pure-React alternative — one `viewBox` attribute

If you would rather not keep an imperative renderer inside a React tree, render **once** into a
detached host, keep the markup, and drive the camera as a React-rendered attribute.

The camera transform is `translate(w/2 h/2) · scale(zoom) · translate(-cx -cy)`, which is exactly
equivalent to the viewBox

```
viewBox = "${cx - w / (2 * zoom)} ${cy - h / (2 * zoom)} ${w / zoom} ${h / zoom}"
```

*(check: `{cx: 400, cy: 300, zoom: 2}` at 1920×1080 → `"-80 30 960 540"`.)*

```tsx
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  SvgRenderer,
  compileEdd,
  easingByName,
  mixCameras,
  resolveCameraDirective,
  stepStateAt,
} from 'edododraw';

export const EdodoViewBox: React.FC<{
  readonly source: string;
  readonly beatFrames: readonly number[];
}> = ({source, beatFrames}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();

  const scene = useMemo(() => compileEdd(source).scene, [source]);

  // Render once into a host that never joins the visible tree, then keep the
  // world group's markup. rough.js seeds are id-hashed, so the string is stable.
  const markup = useMemo(() => {
    const host = document.createElement('div'); // detached; ownerDocument is still `document`
    const r = new SvgRenderer(host, {static: true, nonScalingStroke: true});
    r.mount();
    r.render(scene);
    const html = r.world.innerHTML;
    r.destroy();
    return html;
  }, [scene]);

  const {index, local} = beatAt(frame, beatFrames); // same helper as §2
  const state = stepStateAt(scene, index);
  const prev = stepStateAt(scene, Math.max(-1, index - 1));
  const vp = {w: width, h: height};
  const t = interpolate(local, [0, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const cam = mixCameras(
    resolveCameraDirective(scene, prev.effectiveCamera, vp),
    resolveCameraDirective(scene, state.effectiveCamera, vp),
    easingByName('ease-in-out')(t),
  );

  const viewBox = [
    cam.cx - width / (2 * cam.zoom),
    cam.cy - height / (2 * cam.zoom),
    width / cam.zoom,
    height / cam.zoom,
  ].join(' ');

  // Visibility without applyVisibility(): one generated stylesheet.
  const hideCss = state.hidden
    .map((id) => `[data-node="${id}"],[data-edge="${id}"],[data-viz-item="${id}"]{opacity:0}`)
    .join('');

  return (
    <AbsoluteFill style={{backgroundColor: scene.meta.background || scene.theme.background}}>
      <svg width={width} height={height} viewBox={viewBox}>
        <style>{hideCss}</style>
        <g dangerouslySetInnerHTML={{__html: markup}} />
      </svg>
    </AbsoluteFill>
  );
};
```

The viewBox always has the composition's aspect ratio, so the default
`preserveAspectRatio="xMidYMid meet"` never letterboxes.

Trade-offs: you get idiomatic React and a camera that is pure data, but you lose
`setRevealProgressAll` (it needs the live renderer) and the `AnnotationLayer` — build marks with
`@remotion/rough-notation` positioned from `elementBBox(scene, id)` instead (§9). Use the
imperative component when you want hand-drawing; use this one for pure camera work.

**A whole standalone SVG string**, if that is what you need instead: `renderSceneToSVGString`
(synchronous, safe in a `useMemo`) or `edd.toSVGSync()` on the facade.

---

## 4. Forbidden in Remotion — and what to use instead

Everything in this list is driven by a **wall clock**. Remotion advances `frame`, not the
browser's animation clock, so a screenshot catches these mid-flight at an arbitrary phase —
different on every run, different on every worker.

### ❌ `CameraController`

`src/engine/camera/controller.ts` is a `requestAnimationFrame` loop over `performance.now()`.
`controller.focus(...)` returns a promise that resolves *in wall-clock time*; under a render farm
it resolves during the wrong frame, or never.

✅ **Replacement:** `resolveCameraDirective` + `mixCameras` + `easingByName`, as in §2(d). They
are the same math the controller tweens through — `mixCameras` interpolates zoom in log space
(`a.zoom * (b.zoom / a.zoom) ** t`) precisely so a frame-driven host and the interactive player
agree on every intermediate camera.

Forbidden for the same reason: `TimelinePlayer` and everything on it (`play`/`pause`/`next`/
`goto` run an rAF loop with auto-advance timers), plus the facade wrappers `edd.play()`,
`edd.focus()`, `edd.fit(true)`. `edd.camera.setImmediate(cam)` **is** safe — one `applyCamera`
with no tween.

### ❌ Every CSS-keyframe arrow animation

`flow`, `dash-march`, `draw-on`, `comet`, `gradient-flow`, `electric`, `pulse` — set by
`animate:` or the `~>` glyph — render as an overlay `<path>` carrying `animation-name` +
`animation-duration`. `{static: true}` **does not emit the overlay at all**, which is correct:
the hand-drawn base stroke and arrowheads still draw, the animation does not.

✅ **Replacement:** the same motion as pure functions. `edgeCenterline(scene, id)` rebuilds the
exact geometry the overlay would have followed (dagre waypoints, curve smoothing and all) with
no DOM, and `arrowFrameStyle(centerline, timeSec)` evaluates the CSS animation at one instant:

```tsx
import {arrowFrameStyle, edgeCenterlines} from 'edododraw';

const lines = useMemo(() => edgeCenterlines(scene), [scene]); // pure — safe in useMemo

// inside an <svg> overlaid on the diagram, sharing the camera's viewBox:
{lines.map((cl) => {
  const s = arrowFrameStyle(cl, frame / fps);   // null when the edge has no animation
  return s ? <path key={cl.id} d={cl.d} {...s} /> : null;
})}
```

`arrowFrameStyle` returns `{stroke, strokeWidth, strokeDasharray, strokeDashoffset,
strokeLinecap, fill, opacity, filter?}` — SVG presentation attributes, ready to spread. Pass
`{animation: 'comet'}` to force a kind, `{speed}` to override `animationSpeed`, and `{length}` to
substitute a measured arc length (`getLength(d)` from `@remotion/paths`, which is pure) when a
`draw-on` or `comet` sweep must land exactly on the end of a smoothed curve.

The constants behind it are exported too, if you want to roll your own:
`ARROW_ANIMATIONS` (per-kind dash cycle, dash array, stroke scale, duration, easing),
`DASH_MARCH_CYCLE_PX` (18), `COMET_HEAD_FRACTION` (0.14), `COMET_HEAD_MIN_PX` (24), and
`FLOW_GRADIENT_URL` (the gradient already sitting in the renderer's `<defs>`).

### ❌ Any accumulating state

```tsx
// ❌ frame 412 renders differently depending on whether 411 ran
const angle = useRef(0);
useLayoutEffect(() => {angle.current += 0.02; rotate(angle.current);}, [frame]);

// ✅ total
const angle = frame * 0.02;
```

The same trap applies to `setRevealProgress` used piecemeal: it *mutates*
`stroke-dasharray`/`stroke-dashoffset` and only restores the original attributes at `p >= 1`. If
frame *N* dashes node `a` and frame *N+1* never mentions `a`, `a` keeps the stale dash forever.

`setRevealProgressAll(map)` exists for exactly this: **every drawable the map does not mention is
restored to 1**, so the DOM is a total function of the map. Pass `0` to keep something un-drawn,
omit an id to mean "finished".

### ❌ `startHidden: true` (facade) without a first state

It hides everything at mount; the first `applyStepState()` calls
`applyVisibility(new Set(state.hidden))`, and `state.hidden` is `[]` unless a beat says
`reveal { hide all }` — so the whole diagram pops back on. Author the hide explicitly:

```edd
timeline t {
  beat zero "Start" { reveal { hide all } }
  beat one  "A"     { reveal { show a with draw-on } }
}
```

### ❌ `exportSVGString` inside a `useMemo`

It is declared `async`, so a `useMemo` gets a `Promise<string>`. Use the synchronous
`renderSceneToSVGString(renderer, scene, opts)` (or `edd.toSVGSync()`) — nothing in that path
awaits, because the font is embedded as a data URI rather than fetched.

---

## 5. Determinism checklist

- [ ] `compileEdd` called in `useMemo`, keyed on the source string only.
- [ ] Exactly one `renderer.render(scene)` per mount, in `useLayoutEffect`.
- [ ] No `Math.random()`, `Date.now()`, `performance.now()` anywhere in the component.
- [ ] `whenFontsReady()` wired to `delayRender` / `continueRender`, with `cancelRender` on failure.
- [ ] Every per-frame write derived from `frame` alone.
- [ ] Draw-on driven by `setRevealProgressAll`, never bare `setRevealProgress`.
- [ ] `{static: true}` on the renderer, so no CSS clock can compete.
- [ ] Viewport set with `setViewport({w, h})` from `useVideoConfig()`, never `measure()`.
- [ ] `setRoughnessScale` quantised, and called **before** the visibility/reveal writes.

Verify it: render frames 100 and 300, then render the range 250–350 alone and diff frame 300.
Identical files, or the composition is not deterministic yet.

---

## 6. Stroke quality at zoom — do this before you punch in

rough.js perturbs geometry in **world units**, and the camera is a `scale(zoom)` on the world
group. So screen jitter = `zoom × world jitter`, and because SVG scales stroke width with the
CTM, screen stroke width = `zoom × strokeWidth` too. Both magnify together — which is why a
diagram that looks charming at 1× looks scratchy at 4×, and why two rough edges meeting at a
corner look broken.

Measured corner error on a 320×140 rectangle:

| Preset / options | corner error @1× | deviation @4× |
|---|---|---|
| `classic` (roughness 1.15) | 1.71 px | **4.84 px** |
| `crayon` (roughness 2.2) | 3.27 px | **9.24 px** |
| **`hand-clean`** (roughness 0.35, `preserveVertices`, `maxRandomnessOffset: 1`, `disableMultiStroke`) | **0.00 px** | **0.76 px** |

Three layers — apply all three.

**1. Use the `hand-clean` preset.** Still hand-touched, but with `preserveVertices: true`
(corners meet exactly instead of overshooting — the single biggest win) and
`disableMultiStroke: true` (one confident pass instead of two overlapping ones, so lines don't
double-darken and the path data halves).

```edd
meta { style: hand-clean }        // or hand-clean-dark on a dark stage
```

**2. Turn on `nonScalingStroke`.** A 2 px line stays 2 px on screen at 4× instead of becoming
8 px.

```ts
new SvgRenderer(host, {static: true, nonScalingStroke: true});
```

**3. Compensate the remaining jitter with `setRoughnessScale(1 / zoom)`, quantised.** It
multiplies every `roughness` and `maxRandomnessOffset` by `k` and re-renders, so screen-space
jitter stays constant through a punch-in. Seeds are untouched, so strokes stay deterministic. A
re-render costs 8–30 ms, so **quantise to octaves** — a 900-frame push from 1× to 4× then
regenerates twice, not 900 times, and a repeated value is a no-op:

```ts
// 1 below 2x, 0.5 from 2x, 0.25 from 4x — a composition that never passes 2x never repaints
renderer.setRoughnessScale(1 / Math.max(1, Math.pow(2, Math.floor(Math.log2(cam.zoom)))));
```

Two things to respect. **It repaints**, so call it before `applyVisibility` /
`AnnotationLayer.render` / `setRevealProgressAll` in the frame, or the repaint discards them.
And **floor, don't round**: rounding puts the boundary at 1.41×, which a camera that idles near
that zoom will cross back and forth, repainting every frame.

### From the source instead

Every rough knob is a DSL attribute on nodes and edges, and a `defaults { node { … } }` block
becomes the diagram-wide declaration that **annotations, group frames and `viz` templates**
follow too (they have no per-element style to read):

```edd
defaults {
  node { roughness: clean, pinCorners: true, singleStroke: true, jitter: 1, bowing: slight }
  edge { roughness: clean, pinCorners: true }
}
```

| Attribute | Aliases | Values |
|---|---|---|
| `roughness:` | — | a number, or `architect` (0) · `clean` (0.35) · `artist` (1) · `cartoonist` (2) |
| `bowing:` | — | a number, or `none` (0) · `slight` (0.35) · `normal` (1) · `loose` (2) · `wild` (3) |
| `maxRandomnessOffset:` | `jitter:` | a number (rough.js default 2), in world units |
| `preserveVertices:` | `pinCorners:` | `true`/`false` (also `yes`/`no`/`on`/`off`) |
| `disableMultiStroke:` | `singleStroke:` | `true`/`false` |

All of them are optional; unset means rough.js's own default, so a diagram that names none of
them renders exactly as it always has.

Full detail: [STYLES_GUIDE §5](STYLES_GUIDE.md).

---

## 7. Composition wiring

```tsx
// Root.tsx
import {Composition} from 'remotion';
import {EdodoDiagram} from './EdodoDiagram';
import source from './pipeline.edd';   // see examples/remotion/remotion.config.ts

const BEATS = [60, 105, 105, 120, 90];

export const RemotionRoot: React.FC = () => (
  <Composition
    id="EdodoDiagram"
    component={EdodoDiagram}
    durationInFrames={BEATS.reduce((a, b) => a + b, 0)}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{source, beatFrames: BEATS, moveFrames: 24, drawFrames: 18}}
  />
);
```

`durationInFrames` must be at least `sum(beatFrames)`; anything past the end holds the last beat,
because `beatAt` clamps.

### Importing the `.edd` file

Remotion bundles with webpack, so teach it that a `.edd` file is a string:

```ts
// remotion.config.ts
Config.overrideWebpackConfig((config) => ({
  ...config,
  module: {
    ...config.module,
    rules: [...(config.module?.rules ?? []), {test: /\.edd$/, type: 'asset/source'}],
  },
}));
```

Or skip the bundler config entirely and keep the diagram in a `.ts` file:
``export const SOURCE = `scene { a --> b }`;``

### Install

```bash
npm i edododraw
```

From **0.15.0** `@excalidraw/mermaid-to-excalidraw` is an *optional peer* dependency, so a clean
install is **8 packages / 4.4 MB**. On 0.14.0 and earlier it was an `optionalDependency` — which
npm installs by default — and pulled in mermaid → d3 → cytoscape → katex: **122 packages /
68 MB**. Add `--omit=optional` on those versions.

Mermaid import is browser-only and asynchronous and has no place in a frame-driven render
either way; pre-convert `mermaid """ … """` blocks to `.edd` at build time.

---

## 8. What each export is for

All from the package root: `import {…} from 'edododraw'`.

| Export | Purity | Use |
|---|---|---|
| `compileEdd(source, opts?)` | pure, sync | `.edd` → `{scene, diagnostics, report}`. Safe in `useMemo`, safe in Node. |
| `SvgRenderer` | DOM | `mount()` / `setViewport({w, h})` / `render(scene)` once; `applyCamera`, `applyVisibility`, `setRevealProgressAll`, `setRoughnessScale` per frame. |
| `renderer.setViewport({w, h})` | DOM | State the camera viewport. **Use this, not `measure()`** — Remotion's container is 0x0 at layout-effect time. |
| `SvgRendererOptions` | type | `{static, annotations, nonScalingStroke, roughnessScale}`. |
| `AnnotationLayer` | DOM | `render(scene, annotations, false)` — replaces the layer wholesale. |
| `whenFontsReady(doc?)` | async | Resolves when the embedded hand-drawn face is decoded. Never rejects. |
| `EXCALIFONT_FAMILY` | const | `"Excalifont"` — the family name to pass to `document.fonts`. |
| `stepStateAt(scene, i)` | pure | `{step, hidden, revealFx, annotations, caption, camera, effectiveCamera, autoAdvanceMs}`. |
| `computeHiddenAt(steps, i)` | pure | Just the sticky hidden set. |
| `resolveCameraDirective(scene, directive, viewport, opts?)` | pure | directive → concrete `{cx, cy, zoom}`. |
| `mixCameras(a, b, t)` | pure | Interpolate two cameras. **Zoom mixes in log space.** |
| `easingByName(name)` | pure | `linear · ease · ease-in · ease-out · ease-in-out · back-out · anticipate · spring`. Unknown → `ease-in-out`. |
| `cameraForBBox(bbox, viewport, opts?)` | pure | Build a camera by hand. |
| `edgeCenterline(scene, id)` / `edgeCenterlines(scene)` | pure | An edge's routed `{d, points, length, style, smooth}`, DOM-free. |
| `arrowFrameStyle(centerline, timeSec, opts?)` | pure | One frame of a flowing arrow, as SVG attributes. |
| `ARROW_ANIMATIONS`, `DASH_MARCH_CYCLE_PX`, `COMET_HEAD_FRACTION`, `COMET_HEAD_MIN_PX`, `FLOW_GRADIENT_URL` | const | The CSS animation constants, as data. |
| `elementBBox(scene, id)` / `elementsBBox(scene, ids)` / `sceneBBox(scene)` | pure | World-space boxes — position Remotion overlays from these. |
| `vizItemMembers` / `listVizItems` | pure | `"block.item"` keys inside a `viz` template. |
| `renderSceneToSVGString(renderer, scene, opts?)` | sync | A standalone SVG string, no promise. |
| `listVizTemplates()` | pure | The machine-readable catalog of every built-in `viz` type. |
| `FONT_FAMILY` | const | `FONT_FAMILY.hand` is the full CSS stack, for matching captions. |
| `isMermaidAvailable()` | async | Whether the optional peer dependency is installed. |

**Do not use in Remotion:** `CameraController`, `TimelinePlayer`, `LiveAnnotationController`,
`EditController`, `edd.play()`, `edd.focus()`, `edd.fit(true)`, `downloadSVG` / `downloadPNG`.

---

## 9. Overlays: Remotion-native marks on top of the diagram

Beat-scoped `annotate { … }` marks are drawn by `AnnotationLayer` and appear instantly — they
have no progress knob. For a mark that *draws itself* on cue, overlay
[`@remotion/rough-notation`](https://remotion.dev/docs/rough-notation) (`Highlight`, `Underline`,
`StrikeThrough`, `CrossedOff`, `Box`, `Bracket`, `Circle`) and position it from `elementBBox`:

```tsx
import React from 'react';
import {Circle} from '@remotion/rough-notation';
import {elementBBox, type CameraTransform, type Scene} from 'edododraw';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';

export const CircleTheDatabase: React.FC<{
  readonly scene: Scene;
  /** the camera you applied on THIS frame */
  readonly cam: CameraTransform;
}> = ({scene, cam}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  const box = elementBBox(scene, 'db');   // world space; undefined if the id is unknown
  if (!box) return null;

  // project world -> screen with the same camera
  const x = (box.minX - cam.cx) * cam.zoom + width / 2;
  const y = (box.minY - cam.cy) * cam.zoom + height / 2;
  const progress = spring({frame: frame - 120, fps, config: {damping: 200}});

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: (box.maxX - box.minX) * cam.zoom,
        height: (box.maxY - box.minY) * cam.zoom,
      }}
    >
      <Circle
        progress={progress}
        color="#e03131"
        strokeWidth={3}
        seed={7}                                       // explicit: identical on every worker
        padding={{left: 8, right: 8, top: 8, bottom: 8}}
      >
        <div style={{width: '100%', height: '100%'}} />
      </Circle>
    </div>
  );
};
```

`renderer.worldToScreen(point)` does the same projection if you have the live renderer. Always
pass an explicit `seed` so the mark is identical on every worker.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Labels jump between the Studio and the render | the hand-drawn font decoded after the screenshot | wire `whenFontsReady()` to `delayRender` (§2) |
| An element keeps a stale dash pattern | `setRevealProgress` called for some ids only | use `setRevealProgressAll` (§4) |
| Arrows animate in the Studio but freeze in the render | CSS keyframes | `{static: true}` + `edgeCenterlines` / `arrowFrameStyle` (§4) |
| Everything visible on frame 0 | no beat hides anything | `beat zero { reveal { hide all } }` |
| A frame takes >1 s | `render(scene)` in the frame path | move it into the mount effect |
| Diagram sits in the top-left corner; `fit-all` does not fit; a `focus` beat shows blank paper | `renderer.measure()` read the 0x0 container Remotion mounts during layout and pinned the viewport at 1x1 | `renderer.setViewport({w, h})` from `useVideoConfig()` instead of `measure()` (§2) |
| Strokes look scratchy on the punch-in | roughness scales with zoom | `hand-clean` + `nonScalingStroke` + `setRoughnessScale` (§6) |
| Correct while scrubbing forward, wrong after a seek | `setRoughnessScale` repainted *after* the visibility/reveal writes and discarded them | camera + roughness scale first, DOM state second (§2) |
| `mermaid: … is not installed` | the optional peer dependency is absent | `npm i @excalidraw/mermaid-to-excalidraw`, or pre-convert to `.edd` |
| Compiler hangs / heap OOM on an old version | `reveal a with pop` followed by `narrate:` before 0.15.0 | upgrade, or use `reveal { show a with pop }` |

---

## See also

- [`examples/remotion/`](../examples/remotion/) — a runnable project skeleton.
- [INTEGRATION_GUIDE §6](INTEGRATION_GUIDE.md) — the frame-driven API in the context of the whole
  embedding surface.
- [CAMERA_AND_TIMELINE_GUIDE](CAMERA_AND_TIMELINE_GUIDE.md) — beat semantics, camera numeric
  contracts, auto-choreography.
- [STYLES_GUIDE §5](STYLES_GUIDE.md) — `hand-clean` and the rough-geometry options.
