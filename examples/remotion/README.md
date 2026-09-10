# EDodoDraw × Remotion — minimal example

A complete, runnable [Remotion](https://remotion.dev) project that renders one EDodoDraw
diagram as a 16-second 1080p video: the diagram draws itself on beat by beat while a
magic-move camera pushes into each part.

Everything here is copy-pasteable into a real project. The full explanation of *why* it is
shaped this way is in [`docs/REMOTION_RECIPE.md`](../../docs/REMOTION_RECIPE.md).

```
examples/remotion/
├── package.json          deps + the render commands
├── tsconfig.json
├── remotion.config.ts    entry point + the `.edd` → string import rule
└── src/
    ├── index.ts          registerRoot()
    ├── Root.tsx          the <Composition> and its beat timings
    ├── EdodoDiagram.tsx  the component — this is the part worth reading
    ├── pipeline.edd      the diagram + its timeline
    └── edd.d.ts          types for `import source from './pipeline.edd'`
```

## Run it

```bash
# from a copy of this directory (it has no node_modules of its own)
npm install

npm run studio                 # open the Remotion Studio and scrub the timeline
npm run render                 # -> out/diagram.mp4  (480 frames @ 30fps = 16s)
npm run still                  # -> out/frame.png    (a single frame, for a quick look)
npm run typecheck
```

Raw equivalents, if you prefer not to go through the scripts:

```bash
npx remotion studio
npx remotion render EdodoDiagram out/diagram.mp4
npx remotion still  EdodoDiagram out/frame.png --frame=200
```

### Installing edododraw

```bash
npm i edododraw
```

From **0.15.0** `@excalidraw/mermaid-to-excalidraw` is an *optional peer* dependency, so a
plain install is **8 packages / 4.4 MB**. On 0.14.0 and earlier it was an `optionalDependency`,
which npm installs by default — pass `--omit=optional` there to skip mermaid → d3 → cytoscape
→ katex (122 packages / 68 MB). Mermaid import is browser-only and asynchronous and has no
place in a frame-driven render either way: pre-convert `mermaid """ … """` to `.edd` at build
time.

## The five rules this example follows

1. **Compile once.** `compileEdd(source)` runs in a `useMemo` keyed on the source. It is
   synchronous, DOM-free, and deterministic (rough.js seeds are hashed from element ids), so
   every render worker gets the identical `Scene`.
2. **Render once.** `new SvgRenderer(host, {static: true})` → `mount()` → `render(scene)`
   happens in a `useLayoutEffect` that does **not** depend on `frame`. A full `render()` costs
   8–30 ms and regenerates every stroke; a 30 fps frame budget is 33 ms.
3. **Per frame, only instant total functions.** `applyVisibility` (0.21 ms), `applyCamera`
   (0.003 ms), `setRevealProgressAll` (0.27 ms), `AnnotationLayer.render`. Each one computes
   the complete state for that frame from the frame number alone — Remotion seeks out of
   order, so nothing may accumulate. **Order matters:** `setRoughnessScale` repaints when its
   value changes, which rebuilds the node/edge layers — so camera + roughness scale come
   first, then visibility, annotations and draw-on.
4. **Fonts gate the frame.** `whenFontsReady()` is wired to `delayRender`/`continueRender`.
   Without it a headless render can screenshot before the embedded hand-drawn face decodes,
   and every label is laid out with fallback metrics.
5. **No wall clock.** `{static: true}` disables every CSS transition, reveal animation and
   animated-arrow keyframe. `CameraController`, `TimelinePlayer`, `edd.play()` and
   `edd.focus()` are all rAF + `performance.now()` and must not be used here.

## Changing the diagram

Edit `src/pipeline.edd`. Two conventions in it matter for video:

- `meta { style: hand-clean }` — the low-jitter hand-drawn preset. rough.js perturbs geometry
  in world units and the camera is a `scale(zoom)`, so `classic` (roughness 1.15) is 4.84 px
  off its ideal corners at a 4× punch-in. `hand-clean` pins corners exactly. See
  [`docs/STYLES_GUIDE.md` §5](../../docs/STYLES_GUIDE.md).
- `beat zero { reveal { hide all } }` — start from an empty canvas. Without an explicit
  `hide all`, `stepStateAt().hidden` is `[]` and frame 0 shows the finished diagram.

If you add or remove beats, update `BEAT_FRAMES` in `src/Root.tsx` to match — one entry per
beat, in beat order. `durationInFrames` is their sum.

To read the timings out of the `.edd` instead of hard-coding them, every beat's `hold:` lands
on `step.autoAdvanceMs`:

```ts
const {scene} = compileEdd(source);
const beatFrames = (scene.steps ?? []).map((s) => Math.round(((s.autoAdvanceMs ?? 3200) / 1000) * fps));
```

## Flowing arrows

`a ~> b` (and `animate: flow`) render as CSS keyframes, which `{static: true}` deliberately
does not emit — a frame screenshot would catch them at an arbitrary phase. Rebuild them as
pure functions of the frame instead; the geometry and the CSS constants are both exported:

```tsx
import {arrowFrameStyle, edgeCenterlines} from 'edododraw';

const lines = useMemo(() => edgeCenterlines(scene), [scene]); // pure, no DOM
// …inside an <svg> overlaid on the diagram, sharing the same viewBox:
{lines.map((cl) => {
  const s = arrowFrameStyle(cl, frame / fps);
  return s ? <path key={cl.id} d={cl.d} fill="none" {...s} /> : null;
})}
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Labels shift between the Studio and the render | `whenFontsReady()` not wired to `delayRender` |
| An element is stuck half-drawn | use `setRevealProgressAll`, never bare `setRevealProgress` |
| Whole diagram visible on frame 0 | add `beat zero { reveal { hide all } }` |
| Correct while scrubbing forward, wrong after a seek | `setRoughnessScale` ran after the visibility/reveal writes and discarded them |
| Frames take >1 s each | `render(scene)` leaked into the per-frame effect |
| Diagram sits in the top-left corner / `fit-all` does not fit | use `renderer.setViewport({w, h})` from `useVideoConfig()`, not `renderer.measure()` — Remotion's container is 0x0 at layout-effect time |
| Strokes look scratchy on a punch-in | `meta { style: hand-clean }` + `nonScalingStroke` + `setRoughnessScale` |
