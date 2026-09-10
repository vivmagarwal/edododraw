/**
 * Style presets — named, whole-diagram visual identities (palette, fill
 * treatment, stroke, typography, background) reverse-engineered from the
 * designer reference set in visualization_demo-lab. A preset restyles BOTH
 * classic diagrams (nodes/edges) and the viz templates through one code path:
 *
 *   meta { style: vibrant-strokes }
 *
 * Application happens in the compiler (dsl/compile.ts): the preset provides
 * base node/edge defaults below the user's `defaults`/classes/inline attrs in
 * the cascade, an ordered categorical palette (`roleStyle`) for series/items,
 * and the scene theme (background/mode/ink).
 *
 * Two palette architectures (from the reference set):
 *  - multi-hue wheel: series pick consecutive hues (fillMode solid/soft/…)
 *  - single-accent ramp: ONE color whose fill-opacity steps encode the series
 *    (fillMode "ramp") — the i-th of n series gets an evenly spaced opacity
 *    ending at 1.0 for the last.
 *
 * "Seam" strokes: several styles outline shapes in the CANVAS BACKGROUND color
 * so adjacent solids read as flat cut-outs separated by gaps (strokeMode
 * "seam"). Recomputed automatically if the background changes.
 */

import type { EdgeStyle, FillStyle, FontKind, NodeStyle, RoughTuning, SceneRough, Theme } from "../scene/types.js";
import { contrastInk, darken, lighten, luma, mix, withAlpha } from "./color.js";

export interface PresetFonts {
  /** CSS stack (or a FontKind name like "hand") for body/labels. */
  body: string;
  /** CSS stack for section headings / emphasized labels. */
  heading: string;
  /** CSS stack for the diagram title (defaults to heading). */
  title?: string;
  /** Weight for body text (some styles set everything bold). */
  bodyWeight?: number;
  headingWeight?: number;
}

export interface StylePreset extends RoughTuning {
  /** kebab-case id used in `meta { style: <name> }`. */
  name: string;
  /** Former ids that still resolve to this preset (backwards-compatible renames). */
  aliases?: string[];
  label: string;
  description: string;
  mode: "light" | "dark";
  background: string;
  /** Ordered categorical palette. Ramp presets hold their single accent here. */
  palette: string[];
  /** The universal "other/inactive" series color. */
  neutral: string;
  /**
   * How a palette color becomes a shape's fill:
   *  - solid: flat fill in the palette color
   *  - soft: pastel fill (lightened toward white)
   *  - outline: no fill (line art)
   *  - translucent: palette color at fillOpacity
   *  - gradient: vertical linear-gradient derived from the palette color
   *  - ramp: single accent at an opacity step determined by series index/count
   */
  fillMode: "solid" | "soft" | "outline" | "translucent" | "gradient" | "ramp";
  /** rough.js fill technique (solid for clean styles, hachure for sketchy). */
  fillStyle: FillStyle;
  /** Stroke derivation: darken/same hue, neutral ink, canvas seam, or none. */
  strokeMode: "darken" | "same" | "ink" | "seam" | "none";
  strokeWidth: number;
  /**
   * Hand-drawn intensity (0..3). The inherited RoughTuning fields (`bowing`,
   * `maxRandomnessOffset`, `preserveVertices`, `disableMultiStroke`) tune the
   * SHAPE of that wobble; leaving them unset keeps rough.js's defaults, which
   * is what every preset written before video mattered does.
   */
  roughness: number;
  fonts: PresetFonts;
  /** Primary text/ink on the canvas. */
  ink: string;
  /** Secondary/muted text. */
  mutedInk: string;
  /** Connector/edge stroke. */
  edge: string;
  /** Cycle palette colors onto plain nodes that declare no color of their own. */
  autoColorNodes: boolean;
  cornerRadius: number | null;
  /** translucent fillMode: 0..1. */
  fillOpacity?: number;
  /** soft fillMode: how far toward white the fill is pushed. */
  softAmount?: number;
  /** gradient fillMode tuning. */
  gradient?: { to: "lighter" | "darker"; amount: number };
  /** Spot accent for the focal element (e.g. silver-beam's terracotta). */
  emphasis?: string;
}

/** The style a viz generator applies to the i-th series/item shape. */
export interface RoleStyle extends RoughTuning {
  stroke: string;
  fill: string | null;
  fillStyle: FillStyle;
  strokeWidth: number;
  roughness: number;
  /** Ink that reads on top of this fill (labels inside the shape). */
  textColor: string;
  fontFamily: FontKind;
  roundness: number | null;
  /** The raw palette color this role is based on (for labels/icons/accents). */
  color: string;
  /** A pale companion tint of the color (containers, zone washes). */
  softFill: string;
}

export interface RoleOptions {
  /** Total series count (needed by opacity-ramp presets). */
  n?: number;
  /** Explicit color override (user set `color:` on the item). */
  color?: string;
  /** Use the preset's emphasis/spot accent. */
  emphasis?: boolean;
  /** Use the preset's neutral "other" color. */
  neutral?: boolean;
}

/** Palette color for series i (wraps around, then lightens on later cycles). */
export function paletteColor(preset: StylePreset, i: number): string {
  const n = preset.palette.length;
  if (n === 0) return preset.ink;
  const base = preset.palette[((i % n) + n) % n];
  const cycle = Math.floor(i / n);
  return cycle === 0 ? base : lighten(base, Math.min(0.5, cycle * 0.22));
}

/** Opacity for the i-th of n series in a ramp preset (ends at 1.0). */
export function rampOpacity(i: number, n: number): number {
  const total = Math.max(1, n);
  return Math.min(1, (i + 1.9) / (total + 0.9));
}

/** Derive the full shape style for series/item i under this preset. */
export function roleStyle(preset: StylePreset, i: number, opts: RoleOptions = {}): RoleStyle {
  const isRamp = preset.fillMode === "ramp";
  const color = opts.color ?? (opts.emphasis && preset.emphasis ? preset.emphasis : opts.neutral ? preset.neutral : paletteColor(preset, isRamp ? 0 : i));
  let fill: string | null;
  /** The flat color the fill visually reads as (for contrast picking). */
  let effective = color;
  switch (preset.fillMode) {
    case "solid":
      fill = color;
      break;
    case "soft":
      fill = lighten(color, preset.softAmount ?? 0.8);
      effective = fill;
      break;
    case "outline":
      fill = null;
      effective = preset.background;
      break;
    case "translucent": {
      const op = preset.fillOpacity ?? 0.35;
      fill = withAlpha(color, op);
      effective = mix(preset.background, color, op);
      break;
    }
    case "gradient": {
      const g = preset.gradient ?? { to: "darker", amount: 0.2 };
      const to = g.to === "lighter" ? lighten(color, g.amount) : darken(color, g.amount);
      fill = `linear-gradient(${color},${to})`;
      effective = mix(color, to, 0.5);
      break;
    }
    case "ramp": {
      const op = opts.emphasis || opts.color ? 1 : rampOpacity(i, opts.n ?? preset.palette.length);
      fill = withAlpha(color, op);
      effective = mix(preset.background, color, op);
      break;
    }
  }
  let stroke: string;
  switch (preset.strokeMode) {
    case "darken":
      stroke = darken(color, 0.28);
      break;
    case "same":
      stroke = color;
      break;
    case "ink":
      stroke = preset.ink;
      break;
    case "seam":
      stroke = preset.background;
      break;
    case "none":
      stroke = "transparent";
      break;
  }
  const textColor = fill === null ? preset.ink : contrastInk(effective, inkFor(preset, "dark"), inkFor(preset, "light"));
  return {
    stroke,
    fill,
    fillStyle: fill === null ? "none" : preset.fillStyle,
    strokeWidth: preset.strokeWidth,
    roughness: preset.roughness,
    ...roughTuning(preset),
    textColor,
    fontFamily: preset.fonts.body as FontKind,
    roundness: preset.cornerRadius,
    // The role's headline color must READ on the canvas — muted/pastel palettes
    // (e.g. pragmatic-shades) are pulled toward the ink until they contrast.
    color: readableOn(color, preset.background, preset.ink),
    softFill: lighten(color, 0.82),
  };
}

/** Nudge a color toward `ink` until it contrasts with `bg` enough for text. */
function readableOn(color: string, bg: string, ink: string): string {
  let c = color;
  for (let i = 0; i < 5 && Math.abs(luma(c) - luma(bg)) < 80; i++) c = mix(c, ink, 0.35);
  return c;
}

/** Dark/light ink candidates for text sitting on a filled shape. */
function inkFor(preset: StylePreset, want: "dark" | "light"): string {
  if (want === "dark") {
    // dark canvas presets put canvas-colored text inside light shapes
    return preset.mode === "dark" ? preset.background : preset.ink;
  }
  return preset.mode === "dark" ? preset.ink : "#ffffff";
}

/**
 * The preset's rough.js tuning as a spreadable object, with UNSET fields
 * omitted entirely — spreading `{ bowing: undefined }` over a cascade would
 * clobber a value someone else set, and every pre-video preset leaves all four
 * unset.
 */
export function roughTuning(src: RoughTuning): RoughTuning {
  const out: RoughTuning = {};
  if (src.bowing !== undefined) out.bowing = src.bowing;
  if (src.maxRandomnessOffset !== undefined) out.maxRandomnessOffset = src.maxRandomnessOffset;
  if (src.preserveVertices !== undefined) out.preserveVertices = src.preserveVertices;
  if (src.disableMultiStroke !== undefined) out.disableMultiStroke = src.disableMultiStroke;
  return out;
}

/** True when a preset carries rough tuning of its own (i.e. it was authored
 *  with video in mind). Only the `hand-clean` family does today. */
export function presetDeclaresRoughTuning(preset: StylePreset): boolean {
  return Object.keys(roughTuning(preset)).length > 0;
}

/**
 * A copy of `preset` with the diagram's declared roughness folded in, so viz
 * templates and figures — which read `preset.roughness` directly rather than a
 * per-element style — obey `defaults { node { roughness: … } }` like everything
 * else. Returns the preset untouched when nothing was declared.
 */
export function tunePreset(preset: StylePreset, rough: SceneRough | undefined): StylePreset {
  if (!rough || (rough.roughness === undefined && !Object.keys(roughTuning(rough)).length)) return preset;
  return {
    ...preset,
    roughness: rough.roughness ?? preset.roughness,
    ...roughTuning(preset),
    ...roughTuning(rough),
  };
}

/** Scene theme derived from a preset. */
export function presetTheme(preset: StylePreset): Theme {
  return {
    name: `preset-${preset.name}${preset.mode === "dark" ? "-dark" : ""}`,
    background: preset.background,
    defaultStroke: preset.ink,
    defaultText: preset.ink,
    // Match the engine's standard dotted-grid tints so the grid reads the same
    // whether or not a preset is active.
    gridColor: preset.mode === "dark" ? "#2c313a" : "#d5d9e0",
    mode: preset.mode,
  };
}

/** Base node style defaults a preset contributes below the user cascade. */
export function presetNodeDefaults(preset: StylePreset): Partial<NodeStyle> {
  return {
    stroke: preset.ink,
    fillStyle: preset.fillStyle,
    strokeWidth: preset.strokeWidth,
    roughness: preset.roughness,
    ...roughTuning(preset),
    fontFamily: preset.fonts.body as FontKind,
    textColor: preset.ink,
    roundness: preset.cornerRadius,
    fontWeight: preset.fonts.bodyWeight,
  };
}

/** Base edge style defaults a preset contributes below the user cascade. */
export function presetEdgeDefaults(preset: StylePreset): Partial<EdgeStyle> {
  return {
    stroke: preset.edge,
    strokeWidth: Math.min(2.2, Math.max(1.2, preset.strokeWidth)),
    roughness: preset.roughness,
    ...roughTuning(preset),
    fontFamily: preset.fonts.body as FontKind,
    textColor: preset.ink,
    labelBg: preset.background,
  };
}

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

const presets = new Map<string, StylePreset>();
const aliasToName = new Map<string, string>();

export function registerStylePreset(p: StylePreset): void {
  presets.set(p.name, p);
  for (const a of p.aliases ?? []) aliasToName.set(a, p.name);
}

export function getStylePreset(name: string | undefined): StylePreset | undefined {
  if (!name) return undefined;
  return presets.get(name) ?? presets.get(aliasToName.get(name) ?? "");
}

/** Canonical presets only (aliases don't appear as separate entries). */
export function listStylePresets(): StylePreset[] {
  return [...presets.values()];
}

// ----------------------------------------------------------------------------
// Built-in presets
// ----------------------------------------------------------------------------

/** Shared 10-hue wheel used by the line-art styles (colorful-lines, neutral-lines, soft-tint). */
const WHEEL10 = ["#4e88e7", "#e55753", "#3cc583", "#de8431", "#ba5de5", "#1eabda", "#de58a9", "#92bd39", "#7f64ea", "#e0cb15"];

const SANS = '"Roboto", "Nunito", system-ui, -apple-system, sans-serif';
const STIX = '"STIX Two Text", Georgia, serif';
const SHANTELL = '"Shantell Sans", "Excalifont", "Segoe Print", cursive';

/**
 * The archetypal Excalidraw look: black-and-white hand-drawn ink on white
 * paper — thick wobbly outlines, bold hand lettering, no fills. Monochrome even
 * for viz (single-ink palette), so it reads as a clean pen sketch everywhere.
 */
/**
 * The default look: black-and-white hand-drawn ink, hand lettering, no fills.
 *
 * **The strokes are deliberately CLEAN.** Up to 0.14.0 this preset ran at
 * `roughness: 1.15` with rough.js's defaults, which means two overlapping passes
 * per edge, free-floating corners and ±2px of jitter in *world* units. That
 * looks fine on a web page at scale 1 and bad anywhere a camera moves: the
 * camera is a `scale(zoom)` on the world group, so screen jitter is
 * `zoom x world jitter` and stroke width magnifies with it. Measured on a
 * 320x140 rect: 1.71px of corner error at 1x became **4.84px at 4x**, and the
 * doubled pass darkened every outline unevenly.
 *
 * `preserveVertices` pins corners to their exact coordinates (corner error ->
 * 0.00px), `disableMultiStroke` draws one confident pass instead of two, and the
 * lower `roughness`/`bowing`/`maxRandomnessOffset` keep a hand-drawn wobble
 * without the scratch. It still reads as drawn by a person; it no longer reads
 * as drawn twice.
 *
 * The pre-0.15 values live on as `classic-rough` for anyone who wants them.
 */
export const CLASSIC_PRESET: StylePreset = {
  name: "classic",
  label: "Classic",
  description: "Classic Excalidraw-style black-and-white hand-drawn ink: confident single-pass outlines, hand lettering, no fills. The default look everywhere.",
  mode: "light",
  background: "#ffffff",
  palette: ["#1e1e1e"],
  neutral: "#8a8a8a",
  fillMode: "outline",
  // `hachure` so a shape that DECLARES a fill still renders it (sketchy, on-brand);
  // auto-coloured plain shapes and viz series stay outline-only (roleStyle → `none`).
  fillStyle: "hachure",
  strokeMode: "same",
  strokeWidth: 2.2,
  roughness: 0.45,
  bowing: 0.4,
  maxRandomnessOffset: 1,
  preserveVertices: true,
  disableMultiStroke: true,
  fonts: { body: "hand", heading: "hand", bodyWeight: 700, headingWeight: 700 },
  ink: "#1e1e1e",
  mutedInk: "#4a4a4a",
  edge: "#1e1e1e",
  autoColorNodes: false,
  cornerRadius: null,
};

/**
 * `classic` exactly as it was up to 0.14.0 — two passes, free corners, the full
 * ±2px jitter budget. Kept so the old look is one word away, and so a diagram
 * that WANTS to look hastily sketched can still say so.
 *
 * Do not reach for this if the camera is going to move.
 */
export const CLASSIC_ROUGH_PRESET: StylePreset = {
  ...CLASSIC_PRESET,
  name: "classic-rough",
  label: "Classic (rough)",
  description: "Classic before 0.15: two overlapping passes, free-floating corners, the full jitter budget. Sketchier, and it does not survive a zoom.",
  roughness: 1.15,
  bowing: 1,
  maxRandomnessOffset: 2,
  preserveVertices: false,
  disableMultiStroke: false,
};

/** Black-and-white classic on a dark canvas — the default when a diagram is
 *  viewed dark with no explicit style. */
export const CLASSIC_DARK_PRESET: StylePreset = {
  ...CLASSIC_PRESET,
  name: "classic-dark",
  label: "Classic (dark)",
  mode: "dark",
  background: "#121212",
  palette: ["#e3e3e3"],
  neutral: "#8a8a8a",
  ink: "#e3e3e3",
  mutedInk: "#b0b0b0",
  edge: "#e3e3e3",
};

/** The soft-pastel COLORED hand-drawn look — a first-class style choice. */
export const CLASSIC_COLOR_PRESET: StylePreset = {
  name: "classic-color",
  label: "Classic Colored",
  description: "The colored Excalidraw hand-drawn look: soft pastel fills, matching outlines, Excalifont.",
  mode: "light",
  background: "#ffffff",
  palette: ["#1971c2", "#e8590c", "#2f9e44", "#9c36b5", "#f08c00", "#0c8599", "#e03131", "#66a80f"],
  neutral: "#868e96",
  fillMode: "soft",
  fillStyle: "solid",
  strokeMode: "same",
  strokeWidth: 1.6,
  roughness: 0.45,
  bowing: 0.4,
  maxRandomnessOffset: 1,
  preserveVertices: true,
  disableMultiStroke: true,
  fonts: { body: "hand", heading: "hand" },
  ink: "#1e1e1e",
  mutedInk: "#495057",
  edge: "#1e1e1e",
  autoColorNodes: false,
  cornerRadius: null,
  softAmount: 0.75,
};

/**
 * Hand Clean — the hand-drawn look built for VIDEO and for punch-ins.
 *
 * Everything scratchy about a rough.js stroke is a world-space perturbation,
 * so a camera `scale(4)` multiplies it by four: `classic` (roughness 1.15)
 * lands 1.71px off its ideal corners at 1x and 4.84px at 4x, and the two
 * overlapping passes double-darken every edge. This preset keeps the human
 * wobble but takes the noise out of it — `preserveVertices` pins every corner
 * exactly (corner error 1.71px -> 0.00px), `maxRandomnessOffset: 1` halves the
 * jitter budget, `bowing: 0.35` flattens the mid-segment bulge, and
 * `disableMultiStroke` draws one confident pass instead of two (path bytes
 * 1236 -> 363). Measured deviation from the ideal edge: 0.19px.
 *
 * The design: warm paper rather than clinical white, pale tints of each hue
 * under a matching outline, gently rounded corners, and connectors a step
 * softer than the ink so the boxes come forward and the wiring recedes.
 */
export const HAND_CLEAN_PRESET: StylePreset = {
  name: "hand-clean",
  label: "Hand Clean",
  description: "Hand-drawn but crisp: pinned corners, one confident pass, pale tints on warm paper. Built for video punch-ins — stays clean at 4x zoom.",
  mode: "light",
  background: "#fbfaf7",
  palette: ["#2f5eb8", "#c8622f", "#2e7d63", "#7a4fb5", "#b8862c", "#1f7d95", "#b0405c", "#5c7a2e"],
  neutral: "#9aa0a6",
  fillMode: "soft",
  fillStyle: "solid",
  strokeMode: "same",
  strokeWidth: 1.8,
  roughness: 0.35,
  bowing: 0.35,
  maxRandomnessOffset: 1,
  preserveVertices: true,
  disableMultiStroke: true,
  fonts: { body: "hand", heading: "hand", headingWeight: 700 },
  ink: "#1f2124",
  mutedInk: "#6b6f76",
  edge: "#3f434a",
  autoColorNodes: true,
  cornerRadius: 10,
  softAmount: 0.86,
  emphasis: "#c04a26",
};

/**
 * Hand Clean on a dark stage — designed dark, not inverted. The fills become
 * translucent glass (16% of the hue over charcoal) instead of pastel blobs,
 * the palette lifts to low-chroma tints that glow without vibrating, and the
 * ink is a warm off-white so hand lettering reads as chalk rather than pixels.
 */
export const HAND_CLEAN_DARK_PRESET: StylePreset = {
  ...HAND_CLEAN_PRESET,
  name: "hand-clean-dark",
  label: "Hand Clean (dark)",
  description: "Hand Clean on a charcoal stage: translucent glass fills, lifted low-chroma hues, warm chalk ink. Built for video punch-ins.",
  mode: "dark",
  background: "#16181d",
  palette: ["#7aa5f0", "#f0a06a", "#6fd0a8", "#b79bf0", "#e8cb7a", "#6fc9dd", "#f08fa6", "#b6d47a"],
  neutral: "#6b727c",
  fillMode: "translucent",
  fillOpacity: 0.16,
  ink: "#e9e7e2",
  mutedInk: "#9aa1ab",
  edge: "#868e99",
  emphasis: "#ffb26b",
};

const BUILTIN_PRESETS: StylePreset[] = [
  CLASSIC_PRESET,
  CLASSIC_DARK_PRESET,
  CLASSIC_COLOR_PRESET,
  CLASSIC_ROUGH_PRESET,
  HAND_CLEAN_PRESET,
  HAND_CLEAN_DARK_PRESET,
  {
    name: "colorful-lines",
    label: "Colorful Lines",
    description: "Clean line-art where each item's outline takes its palette color.",
    mode: "light",
    background: "#ffffff",
    palette: WHEEL10,
    neutral: "#a3a3a3",
    fillMode: "outline",
    fillStyle: "none",
    strokeMode: "same",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: SANS },
    ink: "#484848",
    mutedInk: "#7a7a7a",
    edge: "#484848",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "neutral-lines",
    aliases: ["vibrant-strokes"],
    label: "Neutral Lines",
    description: "Neutral gray line-art where color lives in accents and colored labels only.",
    mode: "light",
    background: "#ffffff",
    palette: WHEEL10,
    neutral: "#a3a3a3",
    fillMode: "outline",
    fillStyle: "none",
    strokeMode: "ink", // structural shapes in gray; palette colors live in labels/icons
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: SANS },
    ink: "#484848",
    mutedInk: "#7a7a7a",
    edge: "#484848",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "earthy-gradient",
    aliases: ["pragmatic-shades"],
    label: "Earthy Gradient",
    description: "Muted earthy gradient shades unified by a constant dark-slate ink outline.",
    mode: "light",
    background: "#cfdfcb",
    palette: ["#b0d1a6", "#adcae2", "#e4e495", "#85bfba", "#dfcda5", "#aad5be", "#b6c9d6", "#bfd284", "#d4cab2", "#c8c8c8"],
    neutral: "#c8c8c8",
    fillMode: "gradient",
    gradient: { to: "darker", amount: 0.22 },
    fillStyle: "solid",
    strokeMode: "ink",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: SANS, title: STIX },
    ink: "#2f3c3e",
    mutedInk: "#5a6a6c",
    edge: "#2f3c3e",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "crayon",
    aliases: ["artistic-flair"],
    label: "Crayon",
    description: "Crayon-and-ink sketchbook — painted color dabs inside heavy wobbly brown outlines.",
    mode: "light",
    background: "#f4eee4",
    palette: ["#cd6952", "#db8c4c", "#7ec27c", "#829cbd", "#a3c464", "#7eb7ad", "#cabe51", "#8d7fba", "#ba6b72", "#a1739c"],
    neutral: "#a3a3a3",
    fillMode: "translucent",
    fillOpacity: 0.5,
    fillStyle: "hachure",
    strokeMode: "ink",
    strokeWidth: 3.4,
    roughness: 2.2,
    fonts: { body: SHANTELL, heading: SHANTELL },
    ink: "#402019",
    mutedInk: "#6d4a3c",
    edge: "#402019",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "fine-line",
    aliases: ["elegant-outline"],
    label: "Fine Line",
    description: "Austere 1px black wireframe where hierarchy is carried by weight alone.",
    mode: "light",
    background: "#ffffff",
    palette: ["#000000"],
    neutral: "#a3a3a3",
    fillMode: "outline",
    fillStyle: "none",
    strokeMode: "same",
    strokeWidth: 1,
    roughness: 0,
    fonts: { body: SANS, heading: SANS, headingWeight: 700 },
    ink: "#000000",
    mutedInk: "#a3a3a3",
    edge: "#000000",
    autoColorNodes: true,
    cornerRadius: null,
    emphasis: "#4f92ff",
  },
  {
    name: "mono-accent",
    aliases: ["silver-beam"],
    label: "Mono Accent",
    description: "Gallery grayscale with one terracotta spotlight and bookish serif headings.",
    mode: "light",
    background: "#ffffff",
    palette: ["#2f2f33"],
    neutral: "#d5dcd7",
    fillMode: "ramp",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: STIX, headingWeight: 700 },
    ink: "#2f2f33",
    mutedInk: "#7c7f7d",
    edge: "#2f2f33",
    autoColorNodes: true,
    cornerRadius: null,
    emphasis: "#dd7758",
  },
  {
    name: "chalkboard",
    aliases: ["sketch-notes"],
    label: "Chalkboard",
    description: "White-chalk hand-drawn sketches and handwriting on a blue chalkboard.",
    mode: "dark",
    background: "#195e98",
    palette: ["#dfe7ee"],
    neutral: "#b8c6d4",
    fillMode: "outline",
    fillStyle: "none",
    strokeMode: "same",
    strokeWidth: 2,
    roughness: 1.9,
    fonts: { body: "hand", heading: "hand", headingWeight: 700 },
    ink: "#dfe7ee",
    mutedInk: "#b8c6d4",
    edge: "#dfe7ee",
    autoColorNodes: true,
    cornerRadius: null,
  },
];

for (const p of BUILTIN_PRESETS) registerStylePreset(p);

/** The reference styles (excludes the classic family and the dark auto-variants). */
export function listReferencePresets(): StylePreset[] {
  return listStylePresets().filter((p) => !p.name.startsWith("classic") && p.name !== "hand-clean-dark");
}

/**
 * User-facing style choices in display order (Classic B&W first — the default,
 * then Classic Colored, then the reference looks). Excludes the internal
 * `classic-dark` auto-variant.
 */
export function listStyleChoices(): StylePreset[] {
  const order = ["classic", "classic-color", "hand-clean", "classic-rough", "colorful-lines", "neutral-lines", "earthy-gradient", "crayon", "chalkboard", "fine-line", "mono-accent"];
  const seen = new Set(order);
  const ordered = order.map((n) => getStylePreset(n)).filter((p): p is StylePreset => !!p);
  // append any future presets not in the explicit order (except internal darks)
  const internalDarks = new Set(["classic-dark", "hand-clean-dark"]);
  for (const p of listStylePresets()) if (!seen.has(p.name) && !internalDarks.has(p.name)) ordered.push(p);
  return ordered;
}

/** Resolve the effective preset for a scene: explicit name, else the B&W classic. */
export function effectivePreset(name: string | undefined, mode: "light" | "dark"): StylePreset {
  const found = getStylePreset(name);
  if (found) return found;
  return mode === "dark" ? CLASSIC_DARK_PRESET : CLASSIC_PRESET;
}
