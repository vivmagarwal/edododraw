# Styles Guide (style presets)

A **style preset** is a whole-diagram visual identity: an ordered color palette, a fill treatment, stroke behavior, typography, and a canvas. One line restyles everything — classic node/edge scenes and [viz templates](VISUALIZATIONS_GUIDE.md) alike:

```edd
meta { style: chalkboard }
```

The presets were reverse-engineered from a professional reference set, so each one is a coherent designed system, not just a palette swap.

---

## 1. Applying a style

- **In the source:** `meta { style: <name> }`.
- **Per-view (embedders):** `EdodoDraw.setStylePreset("chalkboard")` or `compileEdd(src, { stylePreset })` — overrides the declared style without editing the source (see [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)).
- No `style:` at all → the classic Excalidraw-style hand-drawn look.

> **Changed in 0.15.0.** `classic` (and `classic-color`, and the automatic `classic-dark`) now ship
> the *smooth* rough tuning — pinned corners, one confident pass — so the default look survives a
> camera push-in. The pre-0.15 geometry is one word away: `meta { style: classic-rough }`. See
> [§5](#5-rough-geometry--the-four-options-that-matter-at-zoom).

Unknown names emit a `W-STYLE-PRESET` warning and keep the classic look. A dark preset switches the whole scene to dark mode; an explicit `setColorScheme` still wins.

## 2. The built-in styles

There are **11 curated styles**. `classic` — the black-and-white hand-drawn look — is the **default applied to every diagram** unless you pick another.

| name | canvas | character |
|---|---|---|
| `classic` | white | **Default.** Black-and-white hand-drawn ink: confident single-pass outlines, pinned corners, hand lettering, no fills. Smoother than pre-0.15 — see §5. |
| `classic-color` | white | The colored hand-drawn look: soft pastel fills, matching outlines, Excalifont. Carries the same smooth tuning as `classic` since 0.15. |
| `hand-clean` | warm paper | **Built for video.** Hand-drawn but crisp: pinned corners, one confident pass, pale tints on warm paper. Survives a 4× punch-in — see §5. |
| `classic-rough` | white | `classic` exactly as it shipped through 0.14.0: two overlapping passes, free-floating corners, the full jitter budget. Sketchier, and it does not survive a zoom. |
| `colorful-lines` | white | Clean line-art; each item's outline takes its palette color. |
| `neutral-lines` | white | Neutral gray line-art; color lives in labels, icons, accents. |
| `earthy-gradient` | pale sage | Muted earthy gradient fills unified by a dark-slate outline. |
| `crayon` | parchment | Crayon-and-ink sketchbook: translucent dabs in heavy wobbly outlines. |
| `chalkboard` | chalkboard blue | White-chalk wobbly outlines and handwriting on blue. |
| `fine-line` | white | Austere 1px black wireframe; hierarchy by weight alone. |
| `mono-accent` | white | Gallery grayscale with one terracotta spotlight and serif headings. |

Renamed styles keep working under their old ids (`vibrant-strokes`→`neutral-lines`, `pragmatic-shades`→`earthy-gradient`, `artistic-flair`→`crayon`, `sketch-notes`→`chalkboard`, `elegant-outline`→`fine-line`, `silver-beam`→`mono-accent`). Two hidden presets are automatic dark variants, picked up when a diagram is viewed in dark mode: `classic-dark` (black-and-white — derived from `classic`, so it carries the same smooth tuning) and `hand-clean-dark` (Hand Clean on a charcoal stage — designed dark, not inverted: translucent glass fills, lifted low-chroma hues, warm chalk ink). You can also name `hand-clean-dark` explicitly.

Two palette architectures are modeled:

- **Multi-hue wheel** — items cycle through an ordered 10-hue palette (`colorful-lines`, `neutral-lines`, `classic-color`).
- **Single-accent opacity ramp** — one color whose fill opacity encodes the series (`mono-accent`).

Some styles use **seam strokes** — shapes are outlined in the *canvas* color, so adjacent solids read as flat cut-outs. The engine recomputes seams automatically if the background changes.

## 3. What a preset controls

- **Scene theme** — canvas background, light/dark mode, default ink, grid tint.
- **Plain nodes** — a node that declares **no color of its own** cycles through the preset palette with the preset's fill treatment (`autoColorNodes`); nodes with explicit `fill:`/`stroke:` always keep them. Font, stroke width, roughness, and corner radius defaults also come from the preset.
- **Edges** — connector color, width, roughness, label font, label background.
- **Viz templates** — every item's shape/label/icon color resolves through the preset's role system, including ramp opacities, seam strokes, gradient fills, and per-shape contrast text.
- **Typography** — body/heading/title font stacks (webfont on the site, with system fallbacks everywhere else) and weights (e.g. `classic` sets everything bold).

Label colors are contrast-assured: a pastel palette color is automatically pulled toward the ink until it reads on the canvas.

## 4. Extending

```ts
import { registerStylePreset } from "edododraw";

registerStylePreset({
  name: "my-brand",
  label: "My Brand",
  description: "…",
  mode: "light",
  background: "#ffffff",
  palette: ["#0055ff", "#ff7733", "#11aa66"],
  neutral: "#a3a3a3",
  fillMode: "soft",        // solid | soft | outline | translucent | gradient | ramp
  fillStyle: "solid",      // rough.js fill technique
  strokeMode: "same",      // darken | same | ink | seam | none
  strokeWidth: 2,
  roughness: 0.6,
  fonts: { body: '"Inter", sans-serif', heading: '"Inter", sans-serif', headingWeight: 700 },
  ink: "#1a1a2e",
  mutedInk: "#5a5a6e",
  edge: "#1a1a2e",
  autoColorNodes: true,
  cornerRadius: 10,

  // optional rough-geometry tuning (see §5) — omit to keep rough.js's defaults
  bowing: 0.35,
  maxRandomnessOffset: 1,
  preserveVertices: true,
  disableMultiStroke: true,
});
```

Then `meta { style: my-brand }` works everywhere. Full field reference: `src/engine/style/presets.ts` (`StylePreset`, `roleStyle`).

---

## 5. Rough geometry — the four options that matter at zoom

`roughness` says *how much* a stroke wobbles. Four more fields say *what shape* that wobble
takes, and they are the difference between a diagram that survives a camera punch-in and one
that falls apart.

| Field | rough.js default | What it does |
|---|---|---|
| `bowing` | `1` | Mid-segment bulge multiplier. `0` = dead straight between vertices. |
| `maxRandomnessOffset` | `2` | Per-vertex jitter budget, **in world units**. |
| `preserveVertices` | `false` | Pin the drawn path to the exact input corners. |
| `disableMultiStroke` | `false` | Draw one pass instead of two overlapping ones. |

All four are optional on `StylePreset`, `NodeStyle` and `EdgeStyle` (they share the
`RoughTuning` interface in `src/engine/scene/types.ts`). **Unset means "rough.js default"**, so a
preset that names none of them — every line-art style here — renders byte-identically to 0.14.0.

**The default is not unset any more.** As of 0.15.0 `classic`, `classic-color` and `classic-dark`
*declare* all four:

```ts
roughness: 0.45, bowing: 0.4, maxRandomnessOffset: 1,
preserveVertices: true, disableMultiStroke: true
```

That is the visual change in 0.15.0: a diagram that names no `style:` looks smoother than it did
in 0.14.0. `meta { style: classic-rough }` is the one line back to the old geometry.

### Why zoom is the problem

rough.js perturbs geometry in **world units**, and the camera is a `scale(zoom)` on the world
`<g>`. So on-screen jitter is `zoom × world jitter` — and because SVG scales stroke width with
the CTM, on-screen stroke width is `zoom × strokeWidth` too. Both magnify together. A diagram
that reads as charming at 1× reads as scratchy at 4×, and *two* rough edges meeting at a
corner read as broken.

Measured deviation from the ideal geometry (320×140 rectangle, 400 px line):

| Config | top-edge max dev | corner error | sub-strokes | dev @ zoom 4 |
|---|---|---|---|---|
| `classic-rough` — roughness 1.15 *(= `classic` before 0.15)* | 1.21 px | **1.71 px** | 8 | **4.84 px** |
| `chalkboard` — roughness 1.9 | ~2.0 px | ~2.8 px | 8 | ~8 px |
| `crayon` — roughness 2.2 | 2.31 px | **3.27 px** | 8 | **9.24 px** |
| roughness 0 (`fine-line`, `mono-accent`, …) | 0.00 px | 0.00 px | 8 | 0.00 px |
| roughness 0.35, `bowing: 0.35`, `preserveVertices` | 0.38 px | **0.00 px** | 8 | 1.52 px |
| …+ `maxRandomnessOffset: 1` | 0.19 px | 0.00 px | 8 | 0.76 px |
| …+ `disableMultiStroke` (= **`hand-clean`**) | 0.19 px | 0.00 px | **4** | 0.76 px |
| roughness 0.45 + all four (= **`classic`**, the 0.15 default) | ~0.25 px | **0.00 px** | **4** | ~1.0 px |

`preserveVertices: true` is the single biggest win: corner error **1.71 px → 0.00 px**. Corners
overshooting and gapping is what actually reads as "scratchy" at a punch-in, far more than the
mid-segment wobble. `disableMultiStroke` halves the path data (1236 → 363 bytes on that
rectangle) and stops the two overlapping passes from double-darkening every line.

Note the first and last rows: **that gap is the 0.15.0 default change.** `classic` moved from the
top row to the bottom one, and the top row is now reachable only by asking for it by name.

### `hand-clean`

`hand-clean` is the *designed* video look, not just the smooth geometry — since 0.15 the default
`classic` is already crisp at zoom, so pick `hand-clean` for what it adds on top: warm paper
instead of clinical white, pale tints of each hue under a matching outline, gently rounded
corners, auto-colored plain nodes, and connectors a step softer than the ink. Recommended for
video, screenshots at scale, print, and anything a reader will zoom into:

```edd
meta { style: hand-clean }
```

```ts
roughness: 0.35, bowing: 0.35, maxRandomnessOffset: 1,
preserveVertices: true, disableMultiStroke: true
```

Still visibly hand-drawn — warm paper, pale tints, gently rounded corners, hand lettering — but
the noise is gone.

### Turning it down further at render time

Two knobs live on the **renderer**, not the scene, so the same compiled diagram can be painted
crisp for a punch-in and normal at 1× without recompiling:

```ts
const r = new SvgRenderer(host, { nonScalingStroke: true });
r.setRoughnessScale(1 / zoom);   // multiplies roughness + maxRandomnessOffset, then re-renders
```

- **`nonScalingStroke`** stamps `vector-effect="non-scaling-stroke"` on every generated
  drawable, so a 2 px line stays 2 px at 4× instead of becoming 8 px.
- **`setRoughnessScale(k)`** keeps *screen-space* jitter constant through a zoom. It **re-renders**
  (8–30 ms) whenever the value changes, so a frame-driven host quantises it to octaves and floors
  it at 1: `k = 1 / Math.max(1, 2 ** Math.floor(Math.log2(zoom)))` — a composition that never
  passes 2× then never repaints, and a repeated value is a no-op. Because it repaints, call it
  *before* `applyVisibility` / `setRevealProgressAll` in a frame, or the repaint discards them.
  Seeds are untouched, so strokes stay deterministic.

See [REMOTION_RECIPE.md §6](REMOTION_RECIPE.md) for the frame-driven pattern.

### Doing it from the source

All five knobs are ordinary DSL attributes on nodes and edges, so they cascade like any other
style — inline, on a `style .class`, or in `defaults`:

```edd
defaults {
  node { roughness: clean, pinCorners: true, singleStroke: true, jitter: 1, bowing: slight }
  edge { roughness: clean, pinCorners: true }
}

scene {
  rect a "Crisp"  { roughness: 0.2, bowing: none }
  rect b "Wobbly" { roughness: cartoonist, bowing: loose }
}
```

| Attribute | Aliases | Values |
|---|---|---|
| `roughness:` | — | a number, or `architect` (0) · `clean` (0.35) · `artist` (1) · `cartoonist` (2) |
| `bowing:` | — | a number, or `none` (0) · `slight` (0.35) · `normal` (1) · `loose` (2) · `wild` (3) |
| `maxRandomnessOffset:` | `jitter:` | a number (rough.js default 2), in world units |
| `preserveVertices:` | `pinCorners:` | `true` / `false` (also `yes`/`no`/`on`/`off`) |
| `disableMultiStroke:` | `singleStroke:` | `true` / `false` |

**The `defaults { node { … } }` block is special**: it also becomes the *diagram-wide*
declaration (`scene.meta.rough`) that the parts of the renderer with no per-element style to
read will follow — the **annotation layer**, **group frames**, and every **`viz` template**
(which read `preset.roughness` directly). One declaration governs the whole picture:

```edd
defaults { node { roughness: clean, pinCorners: true } }
annotate { highlight db }              // the highlight is as clean as the diagram
viz bar sales "Sales" { item "A" 3 }   // so are the bars
```

An active preset that carries its own rough tuning sets the same diagram-wide baseline, and an
explicit `defaults` block overrides it field by field (declare `roughness` only, and `bowing` /
`maxRandomnessOffset` / `preserveVertices` / `disableMultiStroke` still come from the preset).
Five presets carry tuning today — `classic`, `classic-color`, `classic-rough`, `hand-clean`,
`hand-clean-dark` — and `presetDeclaresRoughTuning(preset)` / `roughTuning(preset)` report which.

**Since 0.15, `scene.meta.rough` is therefore defined for almost every diagram**, because the
default preset supplies it. A diagram under a line-art preset (`fine-line`, `crayon`, …) that
declares nothing still leaves it undefined. If you had code branching on
`scene.meta.rough === undefined` to mean "the author declared nothing", switch to
`presetDeclaresRoughTuning`.

