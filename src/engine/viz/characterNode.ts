/**
 * Standalone `character` nodes — a sketchnote figure that stands next to a
 * diagram as ONE ordinary Scene IR node:
 *
 *   character brad "Brad" { pose: thinking, emotion: curious, hair: short,
 *                           shirt: hoodie, accessory: glasses, fx: question,
 *                           prop: bulb, height: 240, flip: true }
 *
 * The node is `{ shape: "character", data: { character: CharacterNodeSpec } }`
 * with a real bbox (the figure's drawn extents at `height`, plus the label
 * under the feet), so layouts, edge anchors, camera focus, reveal, annotate
 * and setRevealProgress all treat it like any other node. This module is the
 * bridge between that node and the parametric character library
 * (viz/characters): the compiler uses `characterNodeBox()` to size the node
 * (pure, DOM-free) and the renderer uses `emitCharacterNode()` to get the
 * figure's strokes as sub-elements to paint inside the node's <g>.
 *
 * Deterministic: the figure is emitted through a VizContext keyed by the node
 * id, so every stroke's rough seed derives from `<nodeId>.<part>` — identical
 * across compile-time measuring, re-renders, and render workers.
 */

import { DiagnosticBag } from "../dsl/diagnostics.js";
import type { NodeStyle, SceneNode } from "../scene/types.js";
import type { StylePreset } from "../style/presets.js";
import { VizContext } from "./context.js";
import { drawCharacter, type CharacterOptions } from "./characters.js";
import { measureBlock } from "./text.js";
import type { VizBounds } from "./types.js";

/** Figure height (feet → top of head, scene units) when `height:` is omitted. */
export const CHARACTER_NODE_DEFAULT_HEIGHT = 200;
/** Smallest figure we will draw (smaller just turns to mush). */
export const CHARACTER_NODE_MIN_HEIGHT = 24;
/** Gap between the feet/ground line and the label block under it. */
export const CHARACTER_LABEL_GAP = 10;

/** What `node.data.character` carries. Every axis name is a registry key. */
export interface CharacterNodeSpec {
  pose: string;
  emotion?: string;
  shirt?: string;
  hair?: string;
  accessory?: string;
  fx?: string;
  /** Any icon name, held at the pose's prop anchor. */
  prop?: string;
  /** Figure height in scene units (feet → top of head). */
  height: number;
  /** Mirror left↔right. */
  flip?: boolean;
  shirtColor?: string;
  hairColor?: string;
  accessoryColor?: string;
  fxColor?: string;
  propColor?: string;
  /**
   * Figure extents relative to the ground point (cx = 0, groundY = 0) at
   * `height`, as measured by the compiler. Informational for hosts (where the
   * feet are inside the node box); the renderer re-measures, so it may be
   * omitted on programmatic scenes.
   */
  figure?: VizBounds;
}

/** Read the spec off a node (null when the node isn't a character node). */
export function characterNodeSpec(node: SceneNode): CharacterNodeSpec | null {
  if (node.shape !== "character") return null;
  const raw = (node.data as { character?: Partial<CharacterNodeSpec> } | undefined)?.character;
  const height = Math.max(CHARACTER_NODE_MIN_HEIGHT, Number(raw?.height) || CHARACTER_NODE_DEFAULT_HEIGHT);
  return { ...raw, pose: raw?.pose || "standing", height };
}

/** Translate the spec + the node's resolved style into drawCharacter options.
 *  Ink = the node's stroke (preset ink / auto-color role / author `stroke:`);
 *  the shirt accent falls back to the node's fill so a filled preset dresses
 *  the figure in the same pastel the other shapes wear. Never hardcoded. */
export function characterDrawOptions(spec: CharacterNodeSpec, style: NodeStyle): CharacterOptions {
  const fill = style.fill && style.fillStyle !== "none" ? style.fill : undefined;
  const opts: CharacterOptions = {
    pose: spec.pose,
    color: style.stroke,
    emotion: spec.emotion,
    shirt: spec.shirt,
    hair: spec.hair,
    accessory: spec.accessory,
    fx: spec.fx,
    prop: spec.prop,
    flip: spec.flip,
    shirtColor: spec.shirtColor ?? fill,
    hairColor: spec.hairColor,
    accessoryColor: spec.accessoryColor,
    fxColor: spec.fxColor,
    propColor: spec.propColor,
  };
  // drop undefined keys so drawCharacter's own defaults apply
  for (const k of Object.keys(opts) as (keyof CharacterOptions)[]) if (opts[k] === undefined) delete opts[k];
  return opts;
}

function scratchContext(id: string, preset: StylePreset, mode: "light" | "dark"): VizContext {
  return new VizContext(id, preset, mode, new DiagnosticBag());
}

/**
 * Measure a figure: its drawn extents (limbs, hair, prop, fx marks, motion
 * streaks — everything the library emits) relative to the ground point
 * (cx = 0, groundY = 0) at the spec's height. Pure: runs the character drawer
 * into a scratch context and takes the union bbox of what it emitted.
 */
export function measureCharacterNode(spec: CharacterNodeSpec, style: NodeStyle, preset: StylePreset, mode: "light" | "dark"): VizBounds {
  const ctx = scratchContext("measure", preset, mode);
  const drawn = drawCharacter(ctx, 0, 0, spec.height, characterDrawOptions(spec, style));
  const b = ctx.bounds();
  // union of the library's pose frame and the actual emitted elements
  const minX = Math.min(drawn.x, b.x);
  const minY = Math.min(drawn.y, b.y);
  const maxX = Math.max(drawn.x + drawn.w, b.x + b.w);
  const maxY = Math.max(drawn.y + drawn.h, b.y + b.h, 0);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export interface CharacterNodeBox {
  /** Node box size: figure extents ∪ label block. */
  w: number;
  h: number;
  /** Figure extents relative to the ground point (see measureCharacterNode). */
  figure: VizBounds;
  /** Height reserved for the label block (0 when unlabelled). */
  labelH: number;
}

/** Size the node box for a spec + label: figure extents plus the label row. */
export function characterNodeBox(spec: CharacterNodeSpec, label: string, style: NodeStyle, preset: StylePreset, mode: "light" | "dark"): CharacterNodeBox {
  const figure = measureCharacterNode(spec, style, preset, mode);
  let labelW = 0;
  let labelH = 0;
  if (label) {
    const m = measureBlock(label, style.fontSize, style.fontFamily);
    labelW = m.w + 8;
    labelH = m.h;
  }
  const w = Math.max(figure.w, labelW);
  const h = figure.h + (label ? CHARACTER_LABEL_GAP + labelH : 0);
  return { w, h, figure, labelH };
}

export interface CharacterNodeEmit {
  /** The figure's strokes as pinned sub-nodes in WORLD coordinates. */
  nodes: SceneNode[];
  /** Where the figure landed (world). */
  figure: VizBounds;
  /** Ground/feet line (world y) — the label hangs below this. */
  groundY: number;
  /** Label block height reserved at the bottom of the node box. */
  labelH: number;
}

/**
 * Emit the figure for a character node, placed inside the node's box:
 * horizontally centred, feet on the ground line just above the label row.
 * If the box was resized (override / programmatic w,h) the figure scales to
 * fit; for a compiler-sized box the scale is exactly 1.
 */
export function emitCharacterNode(node: SceneNode, preset: StylePreset, mode: "light" | "dark"): CharacterNodeEmit {
  const spec = characterNodeSpec(node) ?? { pose: "standing", height: CHARACTER_NODE_DEFAULT_HEIGHT };
  const style = node.style;
  const base = measureCharacterNode(spec, style, preset, mode);
  const labelH = node.label ? measureBlock(node.label, style.fontSize, style.fontFamily).h : 0;
  const availH = Math.max(1, node.h - (node.label ? CHARACTER_LABEL_GAP + labelH : 0));
  const scale = Math.min(node.w / Math.max(1, base.w), availH / Math.max(1, base.h));
  // a compiler-sized box gives scale ≈ 1 (float noise) — snap so strokes are byte-identical
  const s = Math.abs(scale - 1) < 1e-6 ? 1 : Math.max(0.01, scale);
  const h = spec.height * s;
  const fig: VizBounds = { x: base.x * s, y: base.y * s, w: base.w * s, h: base.h * s };
  const groundY = node.y + availH; // feet sit at the bottom of the figure area
  const cx = node.x + node.w / 2 - (fig.x + fig.w / 2);
  const ctx = scratchContext(node.id, preset, mode);
  drawCharacter(ctx, cx, groundY, h, { ...characterDrawOptions(spec, style), z: node.z });
  return {
    nodes: ctx.nodes,
    figure: { x: cx + fig.x, y: groundY + fig.y, w: fig.w, h: fig.h },
    groundY,
    labelH,
  };
}
