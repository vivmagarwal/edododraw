/**
 * VizContext — the toolkit a viz generator draws with. Wraps the Scene IR
 * factories with viz-friendly helpers (role colors from the active style
 * preset, measured/wrapped text blocks, primitive shapes, arrows) and collects
 * the emitted elements. Coordinates are generator-local; the compiler offsets
 * the finished block into place.
 */

import { makeEdge, makeNode } from "../scene/defaults.js";
import type { Annotation, EdgeStyle, FontKind, NodeStyle, SceneEdge, SceneNode, ShapeKind, TextAlign } from "../scene/types.js";
import type { DiagnosticBag } from "../dsl/diagnostics.js";
import { roleStyle, type RoleOptions, type RoleStyle, type StylePreset } from "../style/presets.js";
import { measureBlock, measureText, wrapText } from "./text.js";
import { iconPath, ICON_VIEWBOX } from "./icons.js";
import type { VizBounds, VizItem, VizResult } from "./types.js";

export interface LabelOptions {
  size?: number;
  color?: string;
  align?: TextAlign;
  /** Vertical anchor of the block relative to y: "middle" (default) | "top". */
  vAnchor?: "middle" | "top";
  weight?: number;
  /** "body" | "heading" | "title" (preset fonts) or a raw FontKind/CSS stack. */
  font?: string;
  /** Wrap to this pixel width. */
  maxW?: number;
  maxLines?: number;
  id?: string;
  z?: number;
  opacity?: number;
  /** Semantic tag ("label" | "value" | "detail" | …) — see VizContext.item(). */
  role?: string;
}

export interface ShapeOptions {
  id?: string;
  label?: string;
  z?: number;
  data?: Record<string, unknown>;
  style?: Partial<NodeStyle>;
  /** Semantic tag ("shape" | "icon" | …) — see VizContext.item(). */
  role?: string;
}

export interface LineOptions {
  id?: string;
  color?: string;
  width?: number;
  dash?: boolean;
  dotted?: boolean;
  z?: number;
  /** Draw an arrowhead at the end (as part of the polyline node group). */
  arrow?: boolean;
}

export class VizContext {
  readonly nodes: SceneNode[] = [];
  readonly edges: SceneEdge[] = [];
  readonly annotations: Annotation[] = [];
  /** Set by generators that place the title themselves (e.g. below the chart). */
  titleHandled = false;

  private seq = 0;
  private usedIds = new Set<string>();
  private currentItem: string | null = null;

  constructor(
    readonly vizId: string,
    readonly preset: StylePreset,
    readonly mode: "light" | "dark",
    readonly diags: DiagnosticBag,
    /** From the block's `showValues:` option — generators consult showValue(). */
    readonly showValues: boolean = true,
  ) {}

  // ---- data-item scoping -----------------------------------------------------

  /**
   * Run `fn` with every emitted element tagged as belonging to data item
   * `itemId`: members carry `data.vizItem = "<vizId>.<itemId>"` (plus a
   * `data.vizRole` semantic tag) and surface in the DOM as
   * `data-viz-item`/`data-viz-role` attributes, so hosts can select or
   * choreograph one item's elements as a unit. Query members with
   * vizItemMembers(); `<vizId>.<itemId>` also works as an annotation/camera/
   * reveal target.
   */
  item<T>(itemId: string, fn: () => T): T {
    const prev = this.currentItem;
    this.currentItem = itemId;
    try {
      return fn();
    } finally {
      this.currentItem = prev;
    }
  }

  /** The `data` payload for an element emitted under the current item scope. */
  private tagged(data: Record<string, unknown> | undefined, role: string): Record<string, unknown> | undefined {
    if (!this.currentItem) return data;
    return { ...data, vizItem: `${this.vizId}.${this.currentItem}`, vizRole: role };
  }

  /** Should this item's numeric value be printed? (block `showValues:` +
   *  per-item `showValue:` — values still drive geometry either way). */
  showValue(item: VizItem): boolean {
    return this.showValues && item.opts.showValue !== false;
  }

  // ---- style ---------------------------------------------------------------

  get ink(): string {
    return this.preset.ink;
  }

  get mutedInk(): string {
    return this.preset.mutedInk;
  }

  /** Role style for series/item i under the active preset. */
  role(i: number, opts: RoleOptions = {}): RoleStyle {
    return roleStyle(this.preset, i, opts);
  }

  /** Resolve a font slot name to a FontKind/CSS stack. */
  font(slot: string | undefined): FontKind {
    const fonts = this.preset.fonts;
    if (!slot || slot === "body") return fonts.body as FontKind;
    if (slot === "heading") return fonts.heading as FontKind;
    if (slot === "title") return (fonts.title ?? fonts.heading) as FontKind;
    return slot as FontKind;
  }

  // ---- ids -----------------------------------------------------------------

  uid(hint?: string): string {
    const base = `${this.vizId}.${hint ?? `e${this.seq++}`}`;
    let id = base;
    let n = 2;
    while (this.usedIds.has(id)) id = `${base}_${n++}`;
    this.usedIds.add(id);
    return id;
  }

  // ---- shapes ----------------------------------------------------------------

  /** Emit a shape node styled by a RoleStyle (or raw style overrides). */
  shape(shape: ShapeKind, x: number, y: number, w: number, h: number, role: RoleStyle | Partial<NodeStyle>, opts: ShapeOptions = {}): SceneNode {
    const style: Partial<NodeStyle> = isRole(role)
      ? {
          stroke: role.stroke,
          fill: role.fill,
          fillStyle: role.fillStyle,
          strokeWidth: role.strokeWidth,
          roughness: role.roughness,
          textColor: role.textColor,
          fontFamily: role.fontFamily,
          roundness: role.roundness,
        }
      : role;
    const node = makeNode({
      id: opts.id ?? this.uid(shape),
      shape,
      label: opts.label ?? "",
      x,
      y,
      w,
      h,
      style: { ...style, ...opts.style },
      z: opts.z ?? 0,
      pinned: true,
      data: this.tagged(opts.data, opts.role ?? "shape"),
      mode: this.mode,
    });
    this.nodes.push(node);
    return node;
  }

  /** Polygon from absolute local points (auto-normalized into a node box). */
  poly(points: Array<[number, number]>, role: RoleStyle | Partial<NodeStyle>, opts: ShapeOptions = {}): SceneNode {
    const { x, y, w, h, norm } = normalizePoints(points);
    return this.shape("polygon", x, y, w, h, role, { ...opts, data: { ...opts.data, points: norm } });
  }

  /** Open polyline from absolute local points (stroke only). */
  line(points: Array<[number, number]>, opts: LineOptions = {}): SceneNode {
    const { x, y, w, h, norm } = normalizePoints(points);
    const color = opts.color ?? this.preset.edge;
    const node = this.shape(
      "polyline",
      x,
      y,
      Math.max(w, 0.01),
      Math.max(h, 0.01),
      {
        stroke: color,
        fill: null,
        fillStyle: "none",
        strokeWidth: opts.width ?? Math.min(2, this.preset.strokeWidth),
        roughness: this.preset.roughness,
        strokeStyle: opts.dash ? "dashed" : opts.dotted ? "dotted" : "solid",
      },
      { id: opts.id, z: opts.z, data: { points: norm }, role: "line" },
    );
    if (opts.arrow && points.length >= 2) {
      const [x2, y2] = points[points.length - 1];
      const [x1, y1] = points[points.length - 2];
      this.arrowhead(x1, y1, x2, y2, color, opts.width ?? 2, opts.z);
    }
    return node;
  }

  /** Chevron arrowhead at (x2,y2) aimed from (x1,y1). */
  arrowhead(x1: number, y1: number, x2: number, y2: number, color: string, width = 2, z?: number): SceneNode {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = 7 + width * 2;
    const p = (da: number): [number, number] => [x2 - Math.cos(a + da) * s, y2 - Math.sin(a + da) * s];
    const { x, y, w, h, norm } = normalizePoints([p(-0.45), [x2, y2], p(0.45)]);
    return this.shape(
      "polyline",
      x,
      y,
      Math.max(w, 0.01),
      Math.max(h, 0.01),
      { stroke: color, fill: null, fillStyle: "none", strokeWidth: width, roughness: this.preset.roughness },
      { z, data: { points: norm }, role: "line" },
    );
  }

  /** Straight arrow drawn as polyline + head (all local coords). */
  arrow(x1: number, y1: number, x2: number, y2: number, opts: LineOptions = {}): void {
    this.line(
      [
        [x1, y1],
        [x2, y2],
      ],
      { ...opts, arrow: true },
    );
  }

  /** A path shape designed at (vw × vh), placed in box x/y/w/h. */
  path(d: string, vw: number, vh: number, x: number, y: number, w: number, h: number, role: RoleStyle | Partial<NodeStyle>, opts: ShapeOptions = {}): SceneNode {
    return this.shape("path", x, y, w, h, role, { ...opts, data: { ...opts.data, d, vw, vh } });
  }

  /** A known line-icon glyph, centered at (cx, cy). Unknown names no-op. */
  icon(name: string | undefined, cx: number, cy: number, size: number, color: string, z?: number): SceneNode | null {
    const d = iconPath(name);
    if (!d) return null;
    // The path shape scales its group by size/ICON_VIEWBOX, which multiplies the
    // stroke too — so specify the stroke in DESIGN units such that the on-screen
    // width lands at ~2px (slightly heavier for very large icons).
    const visual = Math.min(3, Math.max(1.8, size / 18));
    const strokeWidth = visual * (ICON_VIEWBOX / size);
    return this.shape(
      "path",
      cx - size / 2,
      cy - size / 2,
      size,
      size,
      { stroke: color, fill: null, fillStyle: "none", strokeWidth, roughness: Math.min(0.8, this.preset.roughness) },
      { z: z ?? 3, data: { d, vw: ICON_VIEWBOX, vh: ICON_VIEWBOX }, role: "icon" },
    );
  }

  // ---- edges ----------------------------------------------------------------

  /** Scene edge between two emitted nodes (or free points via `at`). */
  edge(from: string | { x: number; y: number }, to: string | { x: number; y: number }, opts: { id?: string; label?: string; style?: Partial<EdgeStyle>; routing?: SceneEdge["routing"]; fromAnchor?: string; toAnchor?: string } = {}): SceneEdge {
    const edge = makeEdge({
      id: opts.id ?? this.uid("edge"),
      from: typeof from === "string" ? from : "",
      to: typeof to === "string" ? to : "",
      fromAnchor: opts.fromAnchor,
      toAnchor: opts.toAnchor,
      label: opts.label,
      style: { stroke: this.preset.edge, strokeWidth: Math.min(2, this.preset.strokeWidth), roughness: this.preset.roughness, ...opts.style },
      routing: opts.routing,
      data: this.tagged(undefined, "edge"),
      mode: this.mode,
    });
    if (typeof from !== "string") edge.from = { node: null, point: from };
    if (typeof to !== "string") edge.to = { node: null, point: to };
    this.edges.push(edge);
    return edge;
  }

  // ---- text -------------------------------------------------------------------

  measure(text: string, size: number, font?: string): number {
    return measureText(text, size, this.font(font));
  }

  wrap(text: string, maxWidth: number, size: number, font?: string, maxLines?: number): string {
    return wrapText(text, maxWidth, size, this.font(font), maxLines);
  }

  /**
   * Emit a text node. `x` is the anchor per `align` (center by default);
   * `y` is the vertical center of the block ("top" anchors the first line).
   */
  label(text: string, x: number, y: number, opts: LabelOptions = {}): SceneNode {
    const size = opts.size ?? 20;
    const font = this.font(opts.font);
    const wrapped = opts.maxW ? wrapText(text, opts.maxW, size, font, opts.maxLines) : text;
    const m = measureBlock(wrapped, size, font);
    const w = Math.max(m.w, 4);
    const h = Math.max(m.h, size * 1.25);
    const align = opts.align ?? "center";
    const nx = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    const ny = (opts.vAnchor ?? "middle") === "top" ? y : y - h / 2;
    const node = makeNode({
      id: opts.id ?? this.uid("t"),
      shape: "text",
      label: wrapped,
      x: nx,
      y: ny,
      w,
      h,
      style: {
        textColor: opts.color ?? this.ink,
        fontSize: size,
        fontFamily: font,
        textAlign: align,
        fontWeight: opts.weight,
        opacity: opts.opacity ?? 100,
        stroke: "transparent",
        fill: null,
        fillStyle: "none",
      },
      z: opts.z ?? 2,
      pinned: true,
      data: this.tagged(undefined, opts.role ?? "label"),
      mode: this.mode,
    });
    this.nodes.push(node);
    return node;
  }

  /** Measure the label+detail block exactly as labelBlock will lay it out. */
  measureLabelBlock(label: string, detail: string | undefined, opts: { maxW?: number; size?: number } = {}): { w: number; h: number } {
    const maxW = opts.maxW ?? 220;
    const size = opts.size ?? 20;
    const labelText = wrapText(label, maxW, size, this.font("heading"), 3);
    const detailText = detail ? wrapText(detail, maxW, 15, this.font("body"), 4) : undefined;
    const lm = measureBlock(labelText, size, this.font("heading"));
    const dm = detailText ? measureBlock(detailText, 15, this.font("body")) : { w: 0, h: 0 };
    return { w: Math.max(lm.w, dm.w), h: lm.h + (detailText ? dm.h + 6 : 0) };
  }

  /** Item label (fs 20, colored) + optional detail (fs 15, ink) block. */
  labelBlock(label: string, detail: string | undefined, x: number, y: number, opts: { color?: string; align?: TextAlign; maxW?: number; vAnchor?: "middle" | "top" | "bottom"; size?: number } = {}): VizBounds {
    const align = opts.align ?? "left";
    const maxW = opts.maxW ?? 220;
    const size = opts.size ?? 20;
    const font = this.font("body");
    const labelText = wrapText(label, maxW, size, this.font("heading"), 3);
    const detailText = detail ? wrapText(detail, maxW, 15, font, 4) : undefined;
    const lm = measureBlock(labelText, size, this.font("heading"));
    const dm = detailText ? measureBlock(detailText, 15, font) : { w: 0, h: 0 };
    const totalH = lm.h + (detailText ? dm.h + 6 : 0);
    const anchor = opts.vAnchor ?? "middle";
    const top = anchor === "top" ? y : anchor === "bottom" ? y - totalH : y - totalH / 2;
    this.label(labelText, x, top + lm.h / 2, { color: opts.color ?? this.ink, align, font: "heading", weight: this.preset.fonts.headingWeight, size });
    if (detailText) this.label(detailText, x, top + lm.h + 6 + dm.h / 2, { color: this.mutedInk, align, size: 15, role: "detail" });
    const w = Math.max(lm.w, dm.w);
    const bx = align === "left" ? x : align === "right" ? x - w : x - w / 2;
    return { x: bx, y: top, w, h: totalH };
  }

  /** Diagram title in the preset's title font. */
  title(text: string, cx: number, y: number, opts: { size?: number; color?: string } = {}): SceneNode {
    this.titleHandled = true;
    return this.label(text, cx, y, {
      size: opts.size ?? 26,
      color: opts.color ?? this.ink,
      font: "title",
      weight: 700,
      z: 3,
      role: "title",
    });
  }

  // ---- result -----------------------------------------------------------------

  bounds(): VizBounds {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  result(): VizResult {
    return { nodes: this.nodes, edges: this.edges, annotations: this.annotations, bounds: this.bounds() };
  }
}

function isRole(r: RoleStyle | Partial<NodeStyle>): r is RoleStyle {
  return (r as RoleStyle).color !== undefined && (r as RoleStyle).softFill !== undefined;
}

function normalizePoints(points: Array<[number, number]>): { x: number; y: number; w: number; h: number; norm: Array<[number, number]> } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [px, py] of points) {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const w = Math.max(maxX - minX, 0.01);
  const h = Math.max(maxY - minY, 0.01);
  const norm = points.map(([px, py]) => [(px - minX) / w, (py - minY) / h] as [number, number]);
  return { x: minX, y: minY, w, h, norm };
}
