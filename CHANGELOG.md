# Changelog

All notable changes to **edododraw**. Versions follow [semver](https://semver.org/).

> **Note on the registry.** `0.13.0`, `0.13.1` and `0.14.0` were built and tagged but never
> published — npm's `latest` went straight from **0.12.1** to **0.15.0**. Everything in those
> three releases is therefore new to anyone upgrading from 0.12.1, and is documented in full
> below.

---

## 0.15.0

**The video release.** A diagram can now be driven frame by frame — deterministically, with no
wall clock anywhere — and it stays crisp when a camera pushes into it. Plus a new default look,
and one deliberate breaking change to the install footprint.

### ⚠️ VISUAL CHANGE — the default stroke is smoother

**Every diagram that does not name a `style:` looks different in 0.15.0.** No API changed and no
source needs editing, but the pixels moved, so screenshots and goldens will differ.

`classic`, `classic-color` and the automatic `classic-dark` variant now **declare** the smooth
rough tuning instead of leaving it at rough.js's defaults.

| | `classic` before | `classic` in 0.15.0 | `classic-color` before | `classic-color` in 0.15.0 |
|---|---|---|---|---|
| `roughness` | `1.15` | **`0.45`** | `1.1` | **`0.45`** |
| `bowing` | *(unset → 1)* | **`0.4`** | *(unset → 1)* | **`0.4`** |
| `maxRandomnessOffset` | *(unset → 2)* | **`1`** | *(unset → 2)* | **`1`** |
| `preserveVertices` | *(unset → false)* | **`true`** | *(unset → false)* | **`true`** |
| `disableMultiStroke` | *(unset → false)* | **`true`** | *(unset → false)* | **`true`** |

**Why.** rough.js perturbs geometry in **world units**, and the camera is a `scale(zoom)` on the
world `<g>`. So on-screen jitter is `zoom × world jitter` — *and* SVG scales stroke width with the
CTM, so on-screen stroke width is `zoom × strokeWidth` at the same time. Both magnify together.
Measured corner error on a 320×140 rectangle under the old `classic`: **1.71 px at 1×, 4.84 px at
4×**. Two rough edges meeting at a free-floating corner overshoot and gap, and the two overlapping
passes double-darken every outline unevenly. It read as charming on a web page and as jagged
anywhere a camera moved.

`preserveVertices: true` pins every corner to its exact input coordinate (corner error **1.71 px →
0.00 px**), `disableMultiStroke: true` draws one confident pass instead of two (path data 1236 →
363 bytes on that rectangle), and the lower `roughness` / `bowing` / `maxRandomnessOffset` keep the
human wobble without the scratch. It still reads as drawn by a person; it no longer reads as drawn
twice.

**The one line back.** The pre-0.15 geometry is preserved as a new registered preset:

```edd
meta { style: classic-rough }
```

`classic-rough` is `classic` exactly as it shipped through 0.14.0 — `roughness: 1.15`, `bowing: 1`,
`maxRandomnessOffset: 2`, `preserveVertices: false`, `disableMultiStroke: false`, same single ink,
same no-fill outline treatment, same hand lettering. Do not reach for it if the camera is going to
move. There is no `classic-color-rough`; to get the old *colored* geometry, name the style and
restore the five values in a `defaults` block:

```edd
meta { style: classic-color }
defaults {
  node { roughness: 1.1, bowing: normal, jitter: 2, pinCorners: false, singleStroke: false }
  edge { roughness: 1.1, bowing: normal, jitter: 2, pinCorners: false, singleStroke: false }
}
```

**One knock-on effect worth knowing.** Because the active preset's tuning now feeds
`scene.meta.rough`, a diagram that declares nothing has a **defined** `scene.meta.rough` (it was
`undefined` in 0.14.0). That is what makes annotations, group frames and `viz` templates follow the
default look instead of the old hardcoded constants — but a host that branched on
`scene.meta.rough === undefined` to mean "the user declared no tuning" should switch to
`presetDeclaresRoughTuning(preset)` / compare against the preset's own values.

The 11th style choice is a consequence of all this: `listStyleChoices()` returns **11** presets
(was 10), with `classic-rough` fourth.

### ⚠️ BREAKING — Mermaid is no longer installed for you

`@excalidraw/mermaid-to-excalidraw` moved from `optionalDependencies` (which npm installs by
default) to an **optional `peerDependency`**. It drags in mermaid → d3 → cytoscape → katex:
**122 packages / 68 MB**, against **8 packages / 4.4 MB** without it — a lot to pay for a
feature most diagrams never touch.

**Migration — one line, only if you use `mermaid """ … """` blocks:**

```bash
npm i @excalidraw/mermaid-to-excalidraw
```

Nothing else changed about the feature. Without the package, a `mermaid` block reports an
`M-PARSE` diagnostic whose message and `hint` name that exact command (instead of leaking a
module-resolution error), and **the rest of the diagram still renders**. New
`isMermaidAvailable(): Promise<boolean>` lets a host check up front without throwing;
`MERMAID_INSTALL_HINT` is the exported message text.

### Added — frame-driven rendering

- **`SvgRenderer.setRevealProgressAll(map)`** — the batch form of `setRevealProgress`, and the
  only safe one when frames are produced out of order. Every drawable the map does *not*
  mention is restored to fully drawn, so the DOM is a total function of the map. Also on the
  facade as `edd.setRevealProgressAll(map)`.
- **`whenFontsReady(doc?)`** — resolves once the embedded hand-drawn face is actually decoded.
  Wire it to `delayRender`/`continueRender` or a headless capture screenshots with fallback
  metrics and every label shifts. Never rejects; resolves immediately where there is no
  `FontFaceSet` (jsdom). Also `edd.whenFontsReady()`. New exports `EXCALIFONT_FAMILY` and
  `HAND_FONT_WOFF2_DATA_URI`.
- **`src/engine/render/frameArrows.ts`** — the CSS-keyframe arrow animations as pure functions.
  `edgeCenterline(scene, id)` / `edgeCenterlines(scene)` rebuild an edge's routed centerline
  (dagre waypoints, curve smoothing, style) with **no DOM**; `arrowFrameStyle(centerline,
  timeSec, opts?)` evaluates `flow` · `dash-march` · `draw-on` · `comet` · `gradient-flow` ·
  `electric` · `pulse` at one instant and returns SVG presentation attributes. Constants
  exported too: `ARROW_ANIMATIONS`, `DASH_MARCH_CYCLE_PX`, `COMET_HEAD_FRACTION`,
  `COMET_HEAD_MIN_PX`, `FLOW_GRADIENT_URL`.
- **Edge geometry exports** — `resolveEndpoints`, `routePoints`, `centerlinePath`, `smoothPath`,
  `pathLength`, `edgeRoughOptions` are now in the public barrel, so a host can rebuild an edge
  without scraping `[data-edge] path` out of the document.
- **`renderSceneToSVGString(renderer, scene, opts?)`** — the synchronous twin of
  `exportSVGString` (nothing in that path awaits; the font is embedded, not fetched), so it is
  safe inside a React `useMemo`. `exportSVGString` is kept as the async wrapper.
  `edd.toSVGSync(opts?)` on the facade.
- **`draw-on` is its own reveal effect.** `revealFx[id]` is now
  `"fade" | "pop" | "sweep" | "draw-on"`; `with draw-on` used to fold into `"sweep"` (a
  clip-path wipe) and lose the distinction. A frame-driven host reads the value and plays the
  real stroke-by-stroke drawing; the interactive player still falls back to the sweep wipe,
  because it has no wall-clock stroke animation.
- **`edd.view`** — the underlying `SvgRenderer`, for engine-level calls the facade doesn't wrap.
- **New export types:** `SvgRendererOptions` gains `nonScalingStroke` and `roughnessScale`;
  `ExportOptions`, `RenderedEdge`, `EdgeCenterline`, `ArrowAnimationSpec`, `ArrowFrameStyle`,
  `ArrowFrameOptions`, `AnimatedArrowKind` are all exported.

### Added — stroke quality at zoom

rough.js perturbs geometry in **world units** and the camera is a `scale(zoom)` on the world
group, so on-screen jitter is `zoom × world jitter`. Measured corner error on a 320×140
rectangle: `classic` (roughness 1.15) **1.71 px at 1× / 4.84 px at 4×**; `crayon` (2.2)
**3.27 / 9.24 px**.

- **`hand-clean` and `hand-clean-dark` presets** — the hand-drawn look built for video:
  `roughness: 0.35`, `bowing: 0.35`, `maxRandomnessOffset: 1`, `preserveVertices: true`,
  `disableMultiStroke: true`. Corner error **0.00 px at 1× / 0.76 px at 4×**, and path data
  halves (1236 → 363 bytes on that rectangle). `hand-clean-dark` is designed dark, not inverted.
- **Four new rough options everywhere** — `bowing`, `maxRandomnessOffset`, `preserveVertices`,
  `disableMultiStroke` (the shared `RoughTuning` interface) on `StylePreset`, `NodeStyle`,
  `EdgeStyle` and `RoleStyle`. **Every one is optional and unset means "rough.js default"**, so
  a diagram that declares none of them renders byte-identically to 0.14.0.
- **As DSL attributes** on any node or edge, with friendly aliases:
  `roughness: architect | clean | artist | cartoonist`,
  `bowing: none | slight | normal | loose | wild`,
  `jitter:` (= `maxRandomnessOffset:`), `pinCorners:` (= `preserveVertices:`),
  `singleStroke:` (= `disableMultiStroke:`).
- **One declaration governs the whole picture.** A `defaults { node { … } }` block (or a preset
  that carries rough tuning) now sets `scene.meta.rough`, which the **annotation layer**, **group
  frames** and every **`viz` template** follow — all three previously used hardcoded constants
  and ignored the diagram's style entirely. Undefined when nothing was declared, so existing
  diagrams are untouched.
- **`SvgRendererOptions.nonScalingStroke`** — stamps `vector-effect="non-scaling-stroke"` on
  every generated drawable, so a 2 px line stays 2 px at 4× instead of becoming 8 px. Applied to
  the annotation layer too, via the new `SvgRenderer.applyStrokePolicy(root)`.
- **`SvgRenderer.setRoughnessScale(k)`** / `getRoughnessScale()` — multiplies every `roughness`
  and `maxRandomnessOffset` by `k` and repaints, so a host that passes `k = 1/zoom` keeps
  *screen-space* jitter constant through a punch-in. Seeds are untouched (strokes stay
  deterministic) and a repeated value is a no-op, so quantised callers can call it every frame.

### Fixed

- **Compiler hang (heap OOM) on a bare `reveal`.** `reveal a with draw-on` followed by any
  `key: value` beat item (`narrate:`, `hold:`, `caption:`) sent `parseReveal` into an infinite
  loop that allocated an object per iteration until the process died — reachable from a plausible
  authoring mistake, and it took the whole machine with it. `parseReveal`/`parseStagger` now
  carry a progress guard, and the **bare form is a real form**: `reveal <targets> [with
  <effect>]` is shorthand for a single implicit `show` (it previously parsed and silently
  compiled to nothing). `reveal all`, `reveal [a, b] with pop` and `reveal hide legacy` all work.
- **`ensureEngineStyles` guard is keyed on the document, not the module.** A module-level boolean
  reported "already injected" for a second document (an iframe, a preview shell, a jsdom fixture
  per test) that had no `<style>` yet, and that document rendered unstyled and unfonted.
- **Annotations and group frames ignored the diagram's style.** Highlights were hardcoded to
  `roughness: 1.8, bowing: 3` and group frames to `roughness: 0.8, seed: 42`, so a clean diagram
  still got a scratchy highlight. Both now scale from `scene.meta.rough` and the renderer's
  roughness scale; with nothing declared the ratio is 1 and every constant lands back on its
  literal value.

### Docs

- **New: [`docs/REMOTION_RECIPE.md`](docs/REMOTION_RECIPE.md)** — a complete, copy-pasteable
  Remotion component; the cost budget for every per-frame call; what is forbidden (rAF,
  CSS keyframes, accumulating state) and its frame-driven replacement; the pure-React `viewBox`
  alternative; the stroke settings for a punch-in; and a table of every export with its purity.
- **New: [`examples/remotion/`](examples/remotion/)** — a runnable project skeleton (`Root.tsx`,
  `EdodoDiagram.tsx`, `pipeline.edd`, `remotion.config.ts`, README with the exact commands).
- `STYLES_GUIDE` §5 documents the rough options with the measured numbers; `CAMERA_AND_TIMELINE`
  now agrees with `DSL_LANGUAGE_GUIDE` on both reveal forms; `ANNOTATIONS_GUIDE` covers the
  roughness inheritance; `INTEGRATION_GUIDE` §6 points at the recipe; the Remotion recipe is
  folded into `llms.txt` / `llms-full.txt`.

---

## 0.14.0 — *(built, never published)*

**Character figure grammar v2 — a drawn person, not an assembled diagram.** The v1 figure was a
21%-of-height head on a rounded-*rectangle* torso with tick feet and a flat dash for `neutral`.
It read as a small head on a fridge, scowling, and was rejected on sight in a real film.

- **Head 21% → 29% of height, and no neck** — the chin lands on the body, and the head is painted
  over it.
- **The body is an ellipse (a bean), not a rectangle** — widest a little above the middle, tucked
  at both ends. Garments are authored against `f.B(k, y)` (a fraction of the body's half-width at
  that height), so clothes follow the shape.
- **Hands and feet are loops** — a small open circle at a limb's tip, a shoe on the ground — plus
  a soft preset-derived ground shadow.
- **`neutral` is a faint smile, never a level dash.** It is the face a figure wears when the
  author named no mood, so it is on screen more than any other. The mouth is 40 % wider
  throughout; eyes sit wider and higher.
- **The brow rule:** no hair stroke may dip into the band above the eyes. `bob`, `afro`,
  `ponytail` and `side-part` redrawn.
- **Three renderer-enforced invariants** so poses never hand-place around geometry: arms root on
  the body outline (`freeArms` opts out), hands are pushed out of the head (`contact` opts out),
  and legs are remapped from the authored hip onto `HIP_Y` — so the figure can be re-proportioned
  in one line instead of fifty pose edits.
- **New axes:** `fidelity: minimal | plain | detailed` (detail is attention — minimal bystanders,
  detailed protagonist), `shadow:`, and body shapes `line`, `triangle`, `star`, `none`.

---

## 0.13.1 — *(built, never published)*

Five defects found by using the library to make a real video.

- **Duplicate emotions.** `determined` was byte-identical to `angry`, `excited` to `happy`,
  `confused` to `sad` — asking for "quiet resolve" shipped a scowl. Each now has its own drawing
  (new primitives: `levelBrows`/`raisedBrows`/`skewBrows`, `firm`/`bigSmile`/`wavy`). The whole
  set was audited by comparing emitted geometry, not source; all 26 differ.
- **Poses defaulting to a scowl.** 11 poses declared `emotion: "determined"` and 8 declared
  nothing. Every pose now declares its face explicitly, and none defaults to
  `determined`/`angry`.
- **`mono-accent` rendered characters invisible** — its seam stroke mode resolves a node stroke to
  the canvas background, which is right for a filled block and fatal for line art. Figure ink now
  goes through `characterInk(want, preset)`; a `linear-gradient(…)` node fill is flattened to its
  first stop before becoming a shirt color.
- **`fx` did not mirror with `flip`.** An emanata's *position* now mirrors with the figure while
  its *glyph* never does — a "?" is never drawn backwards. 11 of 14 were wrong; all 14 mirror.
- **`SvgRenderer.render()` silently dropped always-on annotations.** It now paints
  `scene.annotations` itself; `renderSceneWithAnnotations()` is the one-call form for a specific
  set, and `new SvgRenderer(el, { annotations: false })` opts out for hosts that own the layer.

---

## 0.13.0 — *(built, never published)*

**Standalone `character` and `icon` nodes.** A sketchnote figure is a first-class node, not just
something a `personas`/`quote` template can draw:

```edd
scene {
  character brad "Brad" { pose: thinking, emotion: curious, hair: short,
                          shirt: hoodie, accessory: glasses, fx: question,
                          prop: bulb, height: 240, flip: true }
  icon scaffold "Scaffolding" { size: 100 }
  brad --> scaffold "leans on"
}
```

- `character` lowers every axis against the live registries and sizes its box from the figure's
  **real drawn extents** plus the caption row — so dag/grid/manual layouts, edge anchors,
  `camera focus`, `reveal`, `annotate` and `setRevealProgress(id, p)` all treat the person as one
  unit. `flip` mirrors it so two figures can face each other; `label: false` drops the caption.
- `icon` is the other half of the vocabulary: one glyph + caption, `icon:` defaulting to the node
  id, `size:` in world units.
- Both paint inside their own `<g data-node>`, so a whole figure draws on as one continuous
  hand-drawn sweep.
- Unknown names never blank the diagram: `W-CHARACTER-…` / `W-ICON` warnings carry the valid list
  plus a did-you-mean, and the figure falls back to `standing`/`neutral`.
- **Icons 51 → 58:** `wheelchair`, `ladder`, `scaffold`, `sparkle`, `robot`, `brain`,
  `graduation-cap`, plus the `accessibility` alias.
- New queries `listCharacterNodes()` / `listIconNodes()`, `label: false` on any node, and the
  example `examples/characters-beside-diagram.edd`.

---

## 0.12.1

- **Build fix:** stop tree-shaking the character library out of the npm bundle. Side-effect
  registration modules (`viz/characters/*`) were dropped because the `package.json` `sideEffects`
  allowlist missed them in 0.12.0. `scripts/check-dist.mjs` now imports the **built** package and
  fails the publish if the registries come back empty.
