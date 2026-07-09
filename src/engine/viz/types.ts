/**
 * Viz templates — the data model. A `viz <type> { … }` block in the DSL lowers
 * to a VizSpec (pure data, no AST types); the registered generator for the
 * type turns it into ordinary Scene IR nodes/edges with pinned coordinates.
 * Because the output is plain Scene IR, everything downstream — camera,
 * timeline, annotations, direct editing, export — works on visualizations
 * exactly as it does on hand-authored diagrams.
 */

import type { Annotation, SceneEdge, SceneNode } from "../scene/types.js";
import type { VizContext } from "./context.js";

/** One data entry (an `item`, `flow`, `row`, … line) in normalized form. */
export interface VizItem {
  /** The entry keyword it was written with (item, flow, row, series, …). */
  kind: string;
  /** Stable id: explicit ident, else derived from the label, else positional. */
  id: string;
  label: string;
  /** Secondary text (from `detail:`/`note:`/`desc:` or a 2nd string value). */
  detail?: string;
  /** First numeric value (the common single-value case). */
  value?: number;
  /** All numeric values in order (series rows, ranges, …). */
  values: number[];
  /** All string values in order (row cells, …) — excludes the label. */
  strings: string[];
  /** Arrow target for connection entries (`flow a -> b`). */
  to?: string;
  /** Resolved color override (item-level `color:` / `fill:`). */
  color?: string;
  /** Icon name hint (`icon: rocket`) — rendered as a glyph if known. */
  icon?: string;
  /** Remaining entry attributes, plain-valued. */
  opts: Record<string, unknown>;
  children: VizItem[];
}

export interface VizSpec {
  type: string;
  /** Unique per-document id (explicit or derived); prefixes element ids. */
  id: string;
  title?: string;
  /** Block-level options (`orientation: horizontal`, …), plain-valued. */
  options: Record<string, unknown>;
  items: VizItem[];
}

export interface VizBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VizResult {
  nodes: SceneNode[];
  edges: SceneEdge[];
  annotations: Annotation[];
  bounds: VizBounds;
}

export type VizGenerate = (spec: VizSpec, ctx: VizContext) => void;

export interface VizDef {
  name: string;
  aliases?: string[];
  category: string;
  summary: string;
  generate: VizGenerate;
}

// ---- option readers (shared by generators) ---------------------------------

export function optStr(opts: Record<string, unknown>, key: string): string | undefined {
  const v = opts[key];
  return typeof v === "string" ? v : undefined;
}

export function optNum(opts: Record<string, unknown>, key: string): number | undefined {
  const v = opts[key];
  return typeof v === "number" ? v : undefined;
}

export function optBool(opts: Record<string, unknown>, key: string): boolean | undefined {
  const v = opts[key];
  return typeof v === "boolean" ? v : undefined;
}

/** Items of the given kinds (defaults to the generic `item`). */
export function itemsOf(spec: VizSpec, ...kinds: string[]): VizItem[] {
  const want = kinds.length ? new Set(kinds) : new Set(["item"]);
  return spec.items.filter((i) => want.has(i.kind));
}
