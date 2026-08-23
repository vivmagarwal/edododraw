/**
 * Standalone `icon` nodes — one line-glyph from the icon library with a
 * caption under it, as an ordinary Scene IR node:
 *
 *   icon ramp "Scaffold" { icon: scaffold, size: 72 }
 *   icon wheelchair "Wheelchair"          // icon name defaults to the id
 *
 * `{ shape: "icon", data: { icon: IconNodeSpec } }` with a real bbox (glyph
 * square + label row), so it lays out, connects, focuses, reveals, annotates
 * and draws on like any node. The classic sketchnote "icon + word" unit.
 */

import type { NodeStyle, SceneNode } from "../scene/types.js";
import { iconEntry } from "./icons.js";
import { measureBlock } from "./text.js";

/** Glyph size (scene units) when `size:` is omitted. */
export const ICON_NODE_DEFAULT_SIZE = 64;
export const ICON_NODE_MIN_SIZE = 12;
/** Gap between the glyph and its caption. */
export const ICON_LABEL_GAP = 8;

export interface IconNodeSpec {
  /** Registered icon name (or alias). Unknown → nothing drawn, label kept. */
  name: string;
  /** Glyph square size in scene units. */
  size: number;
}

/** Read the spec off a node (null when it isn't an icon node). */
export function iconNodeSpec(node: SceneNode): IconNodeSpec | null {
  if (node.shape !== "icon") return null;
  const raw = (node.data as { icon?: Partial<IconNodeSpec> } | undefined)?.icon;
  const size = Math.max(ICON_NODE_MIN_SIZE, Number(raw?.size) || ICON_NODE_DEFAULT_SIZE);
  return { name: raw?.name ?? node.id, size };
}

export interface IconNodeBox {
  w: number;
  h: number;
  labelH: number;
}

/** Size the node box: glyph square ∪ label width, plus the label row. */
export function iconNodeBox(spec: IconNodeSpec, label: string, style: NodeStyle): IconNodeBox {
  let labelW = 0;
  let labelH = 0;
  if (label) {
    const m = measureBlock(label, style.fontSize, style.fontFamily);
    labelW = m.w + 8;
    labelH = m.h;
  }
  return { w: Math.max(spec.size, labelW), h: spec.size + (label ? ICON_LABEL_GAP + labelH : 0), labelH };
}

/**
 * Where the glyph sits inside the node box (centred in the area above the
 * label row, scaled down if the box was shrunk) + the path to draw. `null`
 * path when the icon name is unknown.
 */
export function iconNodeGlyph(node: SceneNode): { x: number; y: number; size: number; d: string | null; viewBox: number; labelH: number } {
  const spec = iconNodeSpec(node) ?? { name: node.id, size: ICON_NODE_DEFAULT_SIZE };
  const labelH = node.label ? measureBlock(node.label, node.style.fontSize, node.style.fontFamily).h : 0;
  const availH = Math.max(1, node.h - (node.label ? ICON_LABEL_GAP + labelH : 0));
  const size = Math.max(1, Math.min(spec.size, node.w, availH));
  const entry = iconEntry(spec.name);
  return {
    x: node.x + (node.w - size) / 2,
    y: node.y + (availH - size) / 2,
    size,
    d: entry?.d ?? null,
    viewBox: entry?.viewBox ?? 24,
    labelH,
  };
}
