# Changelog

All notable changes to **edododraw**. Versions follow [semver](https://semver.org/).

> **Note on the registry.** `0.13.0`, `0.13.1` and `0.14.0` were built and tagged but never
> published — npm's `latest` went straight from **0.12.1** to **0.15.0**. Everything in those
> three releases is therefore new to anyone upgrading from 0.12.1, and is documented in full
> below.

---

## 0.16.2

**179 template fixes from the same frame-by-frame review.** 0.16.1 carried the engine half of the
87-card review; this is the per-template half. Every fix answers a defect a reviewer found at
1920x1080 and a second pass confirmed by cropping the frame and reading the generator. Tests, the
collision audit (0 overlaps across 87 templates × 13 presets) and the docs audit are all clean.

### ⚠️ VISUAL CHANGE — most templates redraw

Highlights, by the defect they answer:

- **Layouts that fought the frame.** Tall, narrow layouts were why type ended up small, because a
  16:9 fit is height-bound. `swot` tiles 2×2, `quadrant` is a wide plot, `root-causes`, `converge`,
  `lens` and the mindmaps are re-proportioned (root-causes' fit goes from 0.99x to 1.44x, converge's
  from 1.40x to 1.89x), and `flowchart` goes horizontal by default for short chains.
- **Lines that did not meet.** Mindmap connectors stopped 2 units short of every box; they now tuck
  under the node fill, one true cubic each (no polyline knees), with spread exits instead of a dark
  wedge where they all left one point. `decision` branches end in arrowheads, `lens`/`converge`/`prism`
  beams actually converge on a focus, the fishbone's spine meets its tail, and `diverge` radiates from
  a hub.
- **Metaphors that did not read.** The fishbone tail read as a second arrowhead; `root-causes` read as a
  mushroom cloud; `domino` tiles read as planks; `challenges` drew a bridge instead of hurdles; `porters`
  had nothing in the centre. All redrawn.
- **Hierarchy.** Mindmap roots were the faintest node on the card; roots, branches and children now
  read as three levels. `mindmap-vertical` draws the cards its recipe always described.
- **Data marks.** Bars, gauges and progress fills were pale tints that barely read as data; they carry
  their hue now. `stacked-bar` stacks square segments instead of a pile of pills, `waterfall`'s
  connector steps between bar ends instead of slicing through them, and `heatmap` values hold contrast on
  every cell.

### Added

- `pillar`: `mission:` — what the pillars hold up, lettered on the new architrave.
- `hole`: `pit:` and `ladder:` — the pit and the way out, labelled.
- `porters`: `center` / `rivalry` entry kinds — the force the others act on, in the centre (a 5-force
  list promotes its first item).
- `bullet-chart`: a per-row `max:`; without one each row scales to max(actual, target) × 1.15.
- `flowchart`: an unset `direction` is horizontal for up to 5 steps with short details, else vertical.
- Demos: `challenges`, `hole` and `pillar` show their new content.

---

## 0.16.1

**A polish pass driven by looking at 87 rendered cards.** Every template was rendered at 1920x1080
through the Remotion library's gallery host and reviewed frame by frame; this release is the part of
what came back that belongs in the engine rather than in one template. The reviewer's summary of the
old output was "outlines not perfect, lines look broken, and they could be a bit thicker".

### ⚠️ VISUAL CHANGE — circles, line ends, icon line weight, label colours, and four templates

- **A pinned ellipse now closes on itself.** rough.js starts an ellipse near 12 o'clock and trails
  its end past the start and inward (to 0.98r, then 0.9r) — the overlapping pen of a sketch. Under
  `preserveVertices`, the tuning the smooth presets declare precisely so outlines meet, that trail
  read as a notch at the top of every circle, and a camera fit magnified it with everything else.
  Pinned ellipses are now drawn as a closed spline with a periodic wobble, handed to rough.js at
  roughness 0 so fill, stroke and dash still come from the same options. `classic-rough` is
  untouched: its ellipses still carry the trail, byte for byte.
- **Icon strokes no longer invert with size.** A path shape is scaled into place, so `ctx.icon`
  authors its stroke in design units and lets the transform bring it back — but `nonScalingStroke`
  cancels that transform, so the compensation became the whole effect: a 24-unit glyph drawn at 18
  came out at 3.6px and the same glyph drawn at 65 came out at 1.7px. The renderer now undoes the
  design-unit division when it stamps non-scaling strokes, and a glyph's weight grows gently with
  its size (`1.6 + size/100`, capped at 2.6) instead of inversely.
- **A role's label colour holds 4.5:1 on the canvas.** `readableOn` tested a BT.601 luma difference
  of 80, which is not a contrast measure: hand-clean's amber (#b8862c) passed it at 2.97:1 on its own
  paper — under the 3:1 floor even for large type. It now nudges toward the ink in small steps until
  the WCAG ratio reaches 4.5, so pale palettes darken only as far as they must.
- **Every stroke ends round.** rough.js draws a shape as separate subpaths (each side of a box,
  each curve of an outline), and the default butt cap left a square end on every one of them:
  corners looked bitten and an elbow lost ~1.5px where its two lines met. Every stroked element now
  gets `stroke-linecap` / `stroke-linejoin: round`, in every style, `classic-rough` included (its
  geometry is unchanged; only the ends are rounded).
- **A full-circle sector is a disc, not a sector.** A sector that sweeps 360° closed itself with a
  radial edge from centre to rim, which read as a clock hand laid across every ring of a bullseye.
- **Four glyphs redrawn** because they did not survive the ~27px a template actually draws them at:
  `gear` was a circle with straight rays (a sun) and is now a cog with teeth; `users` was two
  same-size circles side by side (goggles) and is now a person with a smaller one behind; `key` was a
  ring with a horizontal bar (it read as "On") and is now a diagonal key; `handshake` was an
  unreadable tangle of forearms and is now two interlocking rings — the partnership it always meant.
  New aliases: `partnership`, `alliance`.
- **`swot` tiles its four panels 2×2.** A single column of four panels is tall and narrow, so a
  camera fit shrank it below reading size; the 2×2 grid is close to a frame's own shape and roughly
  doubles the type. New option **`layout: grid|stack`**; `stack` keeps the old single column.
- **`quadrant` is a plot, not four floating captions.** Each quadrant sits on a soft region panel
  in a wide (≈2:1) plot area, with the axis captions at full size at the ends of the axes. The
  earlier square matrix fitted height-bound and shrank every glyph.
- **`funnel` carries its numbers.** Each stage's value is printed large inside its band and the
  stage name alone sits on the side. The slopes are straight (every band edge takes its width from
  its own y, so the gap between bands no longer steps the outline in). The title now centres on
  the funnel's axis rather than on the whole block, which the side labels pulled to the right.
- **`key-ideas` draws a lightbulb.** It was a plain circle over two floating lines, which read as a
  balloon or an M in a bubble. The globe is now an exact arc pinched into a neck by two G1-continuous
  S-curves, over a threaded base with a contact tip.

### Added

- `FitOptions.padX` / `padY` on `cameraForBBox` — padding per axis, defaulting to `padding`. A 16:9
  frame is far wider than most diagrams are, so a host that pads both axes equally spends its scarce
  height on margin: a square diagram in a 1728x704 band fits at 0.99x with 96 all round, and at 1.14x
  with 96 across and 44 down. 15% more type, for margin nobody sees.
- `contrastRatio()` and `relativeLuminance()` in the colour helpers — WCAG 2, exported.
- `swot` option `layout: grid|stack`.
- `vizRole` is now tagged on EVERY element a viz template emits, not only those inside an item
  scope. The block title was indistinguishable from any other text, so a frame-driven host could not
  draw it first (it is emitted last, and drew last).

### Demos

Several catalog demos were rewritten so their cards show the template at its best. `flowchart` runs
horizontally with a description per step. `porters`, `impact` and `hex-cluster` gained icons.
`race` gained values. `fishbone` has two causes on every bone, and `decision-tree` has a title.
These are sample sources only, not engine behaviour.

---

## 0.16.0

**Three templates redrawn, plus engine work that had been sitting in a downstream copy.** An
app that vendors the engine had fixed these in its own tree, and none of it had come back to the
library. It has now, along with a reveal fix and a line-weight knob for video hosts. Additive
throughout: no DSL change, no registry name removed, and every other template renders
byte-for-byte as in 0.15.0.

### ⚠️ VISUAL CHANGE — `balance`, `head-thoughts` and `root-causes` are redrawn

Only these three templates change; the other 84 draw the same bytes as 0.15.0.

- **`balance`** is a real balance. Before, the arms were two free curves that ran through the
  item labels, and the pans floated under nothing. Now a post stands on a stepped plinth, with a
  straight beam pivoting on top that turns with `tilt`. Each pan hangs plumb from its beam end on
  two strings. The items sit on an opaque card inside the pan, and the side's name is on a pill
  beneath. Both pans share one size, fitted to the wider card, and up to 5 items per side fit.
- **`head-thoughts`** is one smooth profile, drawn through points on its outline and filled
  with a faint wash so it reads as a head rather than a wire. It has a proper brow, nose, lips and
  chin, and a neck cut flat. Thoughts are spread in rows over the cranium, clear of the face, at
  any count from 1 to 6. New option: **`facing: left|right`** (default `right`).
- **`root-causes`** has a leafy three-lobe crown, a waisted trunk that flares at the ground, and
  **one tapered root per cause (1–7)**, each with rootlets and its label straight under the root
  tip. Roots are opaque and layered, so where they cross they overlap like real roots instead of
  darkening. Filler roots keep the root ball full with 1 or 2 causes.

New shared helpers in `viz/generators/util.ts`, which the new silhouettes are drawn with:
`smoothPath` (anchors → one cubic path; `"corner"` anchors keep a crease; `mirrorX`),
`smoothShape`, `taperedOutline` and `cubicPoints`.

### Added

- **`viz … { at: (x, y) }`** pins a block's top-left instead of stacking it below the scene, so a
  template can stand beside a character or a hand-placed node. A later unpinned block stacks below
  whichever is lower. A malformed value warns `W-VIZ-AT` and falls back to stacking.
- **`setNodeAttrs(source, id, attrs)`** in the source-patch API is the general form of
  `styleNode`. It upserts any attribute into a node's `{ … }` block, creating the block if needed.
  Numbers and booleans are written verbatim, bare words stay words, and anything else is quoted.
  It's the deterministic write path for an inspector panel.
- **`strokeScale` / `setStrokeScale(k)` / `getStrokeScale()`** on `SvgRenderer` multiply every drawn
  stroke width: outlines, edges, arrowheads, hachure, icons, group frames and annotation marks.
  Under `nonScalingStroke`, a preset's 1.8px line is 1.8 screen px, which is thin on a 1080p
  frame, so a video host can set weight from its own theme. It is idempotent (never compounds),
  `1` restores the authored widths exactly, and it repaints only when the value changes.
- **`registerMermaidParser(fn)`** lets a host supply the Mermaid parser instead of relying on
  the lazy `import()` of the optional peer. Useful for bundlers that can't follow the dynamic
  import, hosts that load mermaid themselves, and test doubles. A registered parser always wins.

### Fixed

- **Draw-on reveals under a zoom with `nonScalingStroke`.** `setRevealProgress` sized each
  stroke's dash by `getTotalLength()`, which is in user units, but a non-scaling stroke dashes in
  screen pixels. With a camera above 1× the dash pattern repeated mid-reveal (dash, gap, dash) and
  a circle closed only 1/zoom of the way round. The sweep now scales those elements' length by the
  CTM. The finished frame (`p >= 1`) was already correct.
- **Server-side rendering never touches the global `document`.** Node shapes, edges, arrowheads,
  built-in plugin shapes, the annotation layer and `renderSceneToSVGString` now create every
  element from the container's own document, and serialize with that document's
  `XMLSerializer`. A jsdom render in a Node or Next.js server works without setting
  `document`/`window` globals, which matters because React SSR decides client vs server by
  checking for a global `document`.

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
