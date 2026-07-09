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

import type { EdgeStyle, FillStyle, FontKind, NodeStyle, Theme } from "../scene/types.js";
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

export interface StylePreset {
  /** kebab-case id used in `meta { style: <name> }`. */
  name: string;
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
export interface RoleStyle {
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

/** Scene theme derived from a preset. */
export function presetTheme(preset: StylePreset): Theme {
  return {
    name: `preset-${preset.name}${preset.mode === "dark" ? "-dark" : ""}`,
    background: preset.background,
    defaultStroke: preset.ink,
    defaultText: preset.ink,
    gridColor: preset.mode === "dark" ? withAlpha("#ffffff", 0.09) : withAlpha("#000000", 0.1),
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
    fontFamily: preset.fonts.body as FontKind,
    textColor: preset.ink,
    labelBg: preset.background,
  };
}

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

const presets = new Map<string, StylePreset>();

export function registerStylePreset(p: StylePreset): void {
  presets.set(p.name, p);
}

export function getStylePreset(name: string | undefined): StylePreset | undefined {
  if (!name) return undefined;
  return presets.get(name);
}

export function listStylePresets(): StylePreset[] {
  return [...presets.values()];
}

// ----------------------------------------------------------------------------
// Built-in presets
// ----------------------------------------------------------------------------

/** Shared 10-hue wheel used by vibrant-strokes and glowful-breeze. */
const WHEEL10 = ["#4e88e7", "#e55753", "#3cc583", "#de8431", "#ba5de5", "#1eabda", "#de58a9", "#92bd39", "#7f64ea", "#e0cb15"];

const SANS = '"Roboto", "Nunito", system-ui, -apple-system, sans-serif';
const SLAB = '"Roboto Slab", "Rockwell", Georgia, serif';
const SERIF = '"Libre Baskerville", Georgia, "Times New Roman", serif';
const STIX = '"STIX Two Text", Georgia, serif';
const SHANTELL = '"Shantell Sans", "Excalifont", "Segoe Print", cursive';
const MONTSERRAT = '"Montserrat", "Futura", system-ui, sans-serif';
const FREDOKA = '"Fredoka", "Nunito", system-ui, sans-serif';
const FUNNEL = '"Funnel Display", "Archivo", system-ui, sans-serif';
const ABORETO = '"Aboreto", "Optima", Georgia, serif';
const NOTOSERIF = '"Noto Serif JP", Georgia, serif';
const SOURCECODE = '"Source Code Pro", ui-monospace, Menlo, monospace';

/**
 * The engine's classic look as a preset — used when no `meta { style }` is set
 * so the viz templates always have a coherent identity to draw from.
 */
export const CLASSIC_PRESET: StylePreset = {
  name: "classic",
  label: "Classic EDodoDraw",
  description: "The default Excalidraw-style hand-drawn look: soft pastel fills, matching outlines, Excalifont.",
  mode: "light",
  background: "#ffffff",
  palette: ["#1971c2", "#e8590c", "#2f9e44", "#9c36b5", "#f08c00", "#0c8599", "#e03131", "#66a80f"],
  neutral: "#868e96",
  fillMode: "soft",
  fillStyle: "solid",
  strokeMode: "same",
  strokeWidth: 1.6,
  roughness: 1.1,
  fonts: { body: "hand", heading: "hand" },
  ink: "#1e1e1e",
  mutedInk: "#495057",
  edge: "#1e1e1e",
  autoColorNodes: false,
  cornerRadius: null,
  softAmount: 0.75,
};

export const CLASSIC_DARK_PRESET: StylePreset = {
  ...CLASSIC_PRESET,
  name: "classic-dark",
  label: "Classic EDodoDraw (dark)",
  mode: "dark",
  background: "#121212",
  ink: "#e3e3e3",
  mutedInk: "#9aa0a8",
  edge: "#e3e3e3",
  fillMode: "translucent",
  fillOpacity: 0.3,
};

const BUILTIN_PRESETS: StylePreset[] = [
  CLASSIC_PRESET,
  CLASSIC_DARK_PRESET,
  {
    name: "vibrant-strokes",
    label: "Vibrant Strokes",
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
    name: "colorful-lines",
    label: "Colorful Lines",
    description: "Clean line-art where each item's outline takes its palette color (the reference default).",
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
    name: "glowful-breeze",
    label: "Glowful Breeze",
    description: "Airy 20%-tint shapes with crisp same-hue colored outlines and colored labels.",
    mode: "light",
    background: "#ffffff",
    palette: WHEEL10,
    neutral: "#a3a3a3",
    fillMode: "translucent",
    fillOpacity: 0.2,
    fillStyle: "solid",
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
    name: "bold-canvas",
    label: "Bold Canvas",
    description: "Neon color blocks on deep navy with hairline seams and friendly Fredoka headings.",
    mode: "dark",
    background: "#121d46",
    palette: ["#4edaed", "#e3ef3a", "#f56099", "#80e876", "#ae89f8", "#fdb461", "#50eebf", "#da67f1", "#b6e233", "#76b7f5"],
    neutral: "#f0faff",
    fillMode: "solid",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 1,
    roughness: 0,
    fonts: { body: SANS, heading: FREDOKA, headingWeight: 700 },
    ink: "#f0faff",
    mutedInk: "#aebadd",
    edge: "#f0faff",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "radiant-blocks",
    label: "Radiant Blocks",
    description: "Warm gold-to-plum solid serif-labeled blocks glowing against charcoal.",
    mode: "dark",
    background: "#2f333a",
    palette: ["#e3c451", "#e98a54", "#d85582", "#9856b3", "#e66b68", "#bc529a", "#ceb567", "#8864ba", "#957aa9", "#b09989"],
    neutral: "#a3a3a3",
    fillMode: "solid",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SERIF, heading: SERIF, headingWeight: 700 },
    ink: "#ffffff",
    mutedInk: "#c9cbd1",
    edge: "#ffffff",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "pragmatic-shades",
    label: "Pragmatic Shades",
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
    name: "carefree-mist",
    label: "Carefree Mist",
    description: "Sun-faded coral-to-seafoam pastels on cream with plum handwriting headings.",
    mode: "light",
    background: "#eeead7",
    palette: ["#f97b4f", "#fcbc66", "#9ccbb5", "#e08666", "#beca9b", "#8dc6bf", "#ff964e", "#e3c47c", "#9bb6ae", "#bc9d8b"],
    neutral: "#a3a3a3",
    fillMode: "solid",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: SHANTELL, headingWeight: 700 },
    ink: "#584053",
    mutedInk: "#7c6a77",
    edge: "#584053",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "lively-layers",
    label: "Lively Layers",
    description: "Earthy terracotta-to-teal layers with fat paper-colored gaps and geometric Montserrat.",
    mode: "light",
    background: "#fdfbf7",
    palette: ["#e16338", "#db9941", "#71af96", "#cc6b49", "#96aa79", "#61aca2", "#bfa258", "#ab7b64", "#6da198", "#898f81"],
    neutral: "#898f81",
    fillMode: "solid",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 4,
    roughness: 0,
    fonts: { body: MONTSERRAT, heading: MONTSERRAT, headingWeight: 700 },
    ink: "#584053",
    mutedInk: "#7c6a77",
    edge: "#584053",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "artistic-flair",
    label: "Artistic Flair",
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
    name: "sketch-notes",
    label: "Sketch Notes",
    description: "White-chalk sketches and handwriting on a blue chalkboard.",
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
  {
    name: "elegant-outline",
    label: "Elegant Outline",
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
    name: "subtle-accent",
    label: "Subtle Accent",
    description: "Quiet single-accent document style — eucalyptus chips, pine ink, all-bold slab headings.",
    mode: "light",
    background: "#f3f7f5",
    palette: ["#c1d8d4"],
    neutral: "#a3a3a3",
    fillMode: "solid",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 1,
    roughness: 0,
    fonts: { body: SANS, heading: SLAB, bodyWeight: 700, headingWeight: 700 },
    ink: "#22403b",
    mutedInk: "#5b736e",
    edge: "#22403b",
    autoColorNodes: true,
    cornerRadius: null,
    emphasis: "#22403b",
  },
  {
    name: "monochrome-pro",
    label: "Monochrome Pro",
    description: "Two-tone editorial — cream serif plates floating on muted plum.",
    mode: "dark",
    background: "#564f64",
    palette: ["#f1e9e9"],
    neutral: "#a3a3a3",
    fillMode: "ramp",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 1,
    roughness: 0,
    fonts: { body: NOTOSERIF, heading: ABORETO, headingWeight: 700 },
    ink: "#f1e9e9",
    mutedInk: "#cfc7d1",
    edge: "#f1e9e9",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "corporate-clean",
    label: "Corporate Clean",
    description: "Flat business gray with one mustard-gold accent stepped by opacity; typewriter titles.",
    mode: "light",
    background: "#e7e8e6",
    palette: ["#debe64"],
    neutral: "#a3a3a3",
    fillMode: "ramp",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: SANS, heading: SLAB, title: SOURCECODE },
    ink: "#494b45",
    mutedInk: "#75776f",
    edge: "#494b45",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "minimal-contrast",
    label: "Minimal Contrast",
    description: "One electric-violet ramp on near-black, thin geometric display type.",
    mode: "dark",
    background: "#1a1536",
    palette: ["#7e56ff"],
    neutral: "#4b4470",
    fillMode: "ramp",
    fillStyle: "solid",
    strokeMode: "seam",
    strokeWidth: 2,
    roughness: 0,
    fonts: { body: FUNNEL, heading: FUNNEL, headingWeight: 700 },
    ink: "#ffffff",
    mutedInk: "#b9b3d6",
    edge: "#ffffff",
    autoColorNodes: true,
    cornerRadius: null,
  },
  {
    name: "silver-beam",
    label: "Silver Beam",
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
];

for (const p of BUILTIN_PRESETS) registerStylePreset(p);

/** The 15 reference styles (excludes the classic pair). */
export function listReferencePresets(): StylePreset[] {
  return listStylePresets().filter((p) => !p.name.startsWith("classic"));
}

/** Resolve the effective preset for a scene: explicit name, else classic. */
export function effectivePreset(name: string | undefined, mode: "light" | "dark"): StylePreset {
  const found = getStylePreset(name);
  if (found) return found;
  return mode === "dark" ? CLASSIC_DARK_PRESET : CLASSIC_PRESET;
}
