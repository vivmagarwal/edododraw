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

Unknown names emit a `W-STYLE-PRESET` warning and keep the classic look. A dark preset switches the whole scene to dark mode; an explicit `setColorScheme` still wins.

## 2. The built-in styles

There are **9 curated styles**. `classic` — the black-and-white hand-drawn look — is the **default applied to every diagram** unless you pick another.

| name | canvas | character |
|---|---|---|
| `classic` | white | **Default.** Black-and-white hand-drawn ink: bold wobbly outlines, hand lettering, no fills. |
| `classic-color` | white | The colored hand-drawn look: soft pastel fills, matching outlines, Excalifont. |
| `colorful-lines` | white | Clean line-art; each item's outline takes its palette color. |
| `neutral-lines` | white | Neutral gray line-art; color lives in labels, icons, accents. |
| `earthy-gradient` | pale sage | Muted earthy gradient fills unified by a dark-slate outline. |
| `crayon` | parchment | Crayon-and-ink sketchbook: translucent dabs in heavy wobbly outlines. |
| `chalkboard` | chalkboard blue | White-chalk wobbly outlines and handwriting on blue. |
| `fine-line` | white | Austere 1px black wireframe; hierarchy by weight alone. |
| `mono-accent` | white | Gallery grayscale with one terracotta spotlight and serif headings. |

Renamed styles keep working under their old ids (`vibrant-strokes`→`neutral-lines`, `pragmatic-shades`→`earthy-gradient`, `artistic-flair`→`crayon`, `sketch-notes`→`chalkboard`, `elegant-outline`→`fine-line`, `silver-beam`→`mono-accent`). A hidden `classic-dark` is the automatic black-and-white variant when a diagram is viewed in dark mode.

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
});
```

Then `meta { style: my-brand }` works everywhere. Full field reference: `src/engine/style/presets.ts` (`StylePreset`, `roleStyle`).
