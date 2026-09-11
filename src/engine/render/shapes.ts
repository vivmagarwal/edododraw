/**
 * Shape body generation. Each ShapeKind is turned into one or more rough.js
 * drawables and returned as a single <g>. Text is NOT drawn here (the renderer
 * overlays it). Composite shapes (cylinder, cloud, document, note, actor) are
 * built from hand-authored SVG path strings so rough.js can "sketch" them.
 */

import type rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { NodeStyle, RoughTuning, Scene, ShapeKind } from "../scene/types.js";
import { getShapePlugin } from "../plugins/registry.js";
import { docOf } from "./dom.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

const SVG_NS = "http://www.w3.org/2000/svg";

/** rough.js's own default for `maxRandomnessOffset` (generator.js). */
export const DEFAULT_MAX_RANDOMNESS_OFFSET = 2;

/**
 * Render-time knobs that are NOT part of the scene: how much of the authored
 * roughness to actually draw, and whether strokes should resist the camera.
 * Both come from the renderer, so the same Scene can be painted crisp for a
 * 4x punch-in and normal at 1x without recompiling.
 */
export interface RoughRenderTuning {
  /**
   * Multiplier on `roughness` and `maxRandomnessOffset`. rough.js jitters in
   * WORLD units and the camera is `scale(zoom)` on the world group, so a host
   * that passes `1/zoom` keeps SCREEN-space jitter constant through a zoom.
   */
  roughnessScale?: number;
  /** Stamp `vector-effect="non-scaling-stroke"` on every generated drawable. */
  nonScalingStroke?: boolean;
  /**
   * Multiplier on every drawn stroke width — node outlines, edges, arrowheads,
   * hachure, icons, group frames, annotation marks. Default 1. A video host
   * sets line weight from its own theme without restyling the diagram.
   */
  strokeScale?: number;
}

/** Elements rough.js emits that carry a stroke we may want to pin to screen px. */
const STROKED = "path,line,polyline,polygon,circle,ellipse,rect";

/**
 * Apply `vector-effect="non-scaling-stroke"` to every drawable under `root`
 * (inclusive). Under a `scale(4)` camera an SVG stroke normally quadruples
 * with it; this keeps a 2px line 2px at any zoom.
 */
export function applyNonScalingStroke(root: Element): void {
  if ((root as Element).matches?.(STROKED)) root.setAttribute("vector-effect", "non-scaling-stroke");
  root.querySelectorAll(STROKED).forEach((el) => el.setAttribute("vector-effect", "non-scaling-stroke"));
}

/**
 * Multiply the `stroke-width` of every drawable under `root` (inclusive) by
 * `k`. Idempotent: the authored width is kept in `data-edd-sw`, so applying
 * it again (a repaint of a subtree, a second policy pass) never compounds.
 */
export function scaleStrokeWidths(root: Element, k: number): void {
  const scale = (el: Element) => {
    const orig = el.getAttribute("data-edd-sw") ?? el.getAttribute("stroke-width");
    if (orig === null) return;
    const w = Number.parseFloat(orig);
    if (!Number.isFinite(w)) return;
    el.setAttribute("data-edd-sw", orig);
    el.setAttribute("stroke-width", String(Math.round(w * k * 1000) / 1000));
  };
  if ((root as Element).matches?.(STROKED)) scale(root);
  root.querySelectorAll(STROKED).forEach(scale);
}

/** The render-time stroke policy for a freshly drawn subtree: non-scaling + width scale. */
export function applyStrokeTuning(root: Element, tune: RoughRenderTuning): void {
  if (tune.nonScalingStroke) applyNonScalingStroke(root);
  const k = tune.strokeScale ?? 1;
  if (k !== 1) scaleStrokeWidths(root, k);
}

/** Fold a style's rough tuning + the render-time scale into rough.js Options. */
function withTuning(opts: Options, style: RoughTuning, tune: RoughRenderTuning): Options {
  const k = tune.roughnessScale ?? 1;
  if (k !== 1 && opts.roughness !== undefined) opts.roughness = opts.roughness * k;
  opts.bowing = style.bowing ?? opts.bowing ?? 1;
  opts.preserveVertices = style.preserveVertices ?? opts.preserveVertices ?? false;
  opts.disableMultiStroke = style.disableMultiStroke ?? false;
  opts.maxRandomnessOffset = (style.maxRandomnessOffset ?? DEFAULT_MAX_RANDOMNESS_OFFSET) * k;
  return opts;
}

/**
 * rough.js options for a drawable that belongs to the diagram as a whole
 * rather than to one styled element — group frames and annotation marks. Their
 * roughness constants were tuned against `classic` (roughness 1.15), so the
 * diagram's declared roughness is applied as a RATIO of that baseline: a
 * `hand-clean` diagram gets marks a third as wobbly, a `crayon` one gets marks
 * as wobbly as its strokes, and a diagram that declared nothing gets exactly
 * the constants it always got.
 */
export function sceneRoughOptions(
  scene: Scene,
  baseRoughness: number,
  roughnessScale = 1,
  baseBowing = 1,
): {
  roughness: number;
  bowing: number;
  maxRandomnessOffset: number;
  preserveVertices: boolean;
  disableMultiStroke: boolean;
} {
  const r = scene.meta.rough;
  const relative = r?.roughness !== undefined ? r.roughness / CLASSIC_ROUGHNESS : 1;
  return {
    roughness: baseRoughness * relative * roughnessScale,
    bowing: baseBowing * (r?.bowing ?? 1),
    maxRandomnessOffset: (r?.maxRandomnessOffset ?? DEFAULT_MAX_RANDOMNESS_OFFSET) * roughnessScale,
    preserveVertices: r?.preserveVertices ?? false,
    disableMultiStroke: r?.disableMultiStroke ?? false,
  };
}

/** The roughness the annotation/frame constants were authored against. */
const CLASSIC_ROUGHNESS = 1.15;

/** Map a NodeStyle to rough.js Options. */
export function nodeRoughOptions(style: NodeStyle, filled: boolean, tune: RoughRenderTuning = {}): Options {
  const opts: Options = withTuning(
    {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      roughness: style.roughness,
      seed: style.seed,
      bowing: 1,
      preserveVertices: false,
    },
    style,
    tune,
  );
  if (filled && style.fill && style.fillStyle !== "none") {
    opts.fill = style.fill;
    opts.fillStyle = style.fillStyle;
    opts.fillWeight = Math.max(1, style.strokeWidth * 0.9);
    opts.hachureGap = Math.max(6, style.fontSize * 0.4);
    opts.hachureAngle = -41;
  }
  if (style.strokeStyle === "dashed") opts.strokeLineDash = [8, 8];
  else if (style.strokeStyle === "dotted") opts.strokeLineDash = [1.6, 6];
  return opts;
}

// --- composite path builders -------------------------------------------------

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h - rr}`,
    `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `L${x + rr},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - rr}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    "Z",
  ].join(" ");
}

function documentPath(x: number, y: number, w: number, h: number): string {
  const wave = h * 0.14;
  const midY = y + h - wave;
  return [
    `M${x},${y}`,
    `L${x + w},${y}`,
    `L${x + w},${midY}`,
    `C${x + w * 0.75},${midY + wave * 1.5} ${x + w * 0.25},${midY - wave * 1.5} ${x},${midY}`,
    "Z",
  ].join(" ");
}

function notePaths(x: number, y: number, w: number, h: number): { body: string; fold: string } {
  const fold = Math.min(w, h) * 0.24;
  const body = [
    `M${x},${y}`,
    `L${x + w - fold},${y}`,
    `L${x + w},${y + fold}`,
    `L${x + w},${y + h}`,
    `L${x},${y + h}`,
    "Z",
  ].join(" ");
  const foldPath = [
    `M${x + w - fold},${y}`,
    `L${x + w - fold},${y + fold}`,
    `L${x + w},${y + fold}`,
  ].join(" ");
  return { body, fold: foldPath };
}

function cloudPath(x: number, y: number, w: number, h: number): string {
  // A blobby cloud built from cubic bumps around an inset rectangle.
  const cx = x + w / 2;
  const t = y + h * 0.32;
  const b = y + h * 0.82;
  const l = x + w * 0.12;
  const r = x + w * 0.88;
  return [
    `M${l},${b}`,
    `C${x - w * 0.02},${b} ${x - w * 0.02},${t + h * 0.05} ${l + w * 0.06},${t + h * 0.02}`,
    `C${x + w * 0.1},${y + h * 0.02} ${x + w * 0.34},${y - h * 0.04} ${cx - w * 0.04},${t - h * 0.02}`,
    `C${x + w * 0.5},${y - h * 0.02} ${x + w * 0.74},${y + h * 0.0} ${r - w * 0.08},${t + h * 0.02}`,
    `C${x + w * 1.02},${t} ${x + w * 1.02},${b - h * 0.02} ${r},${b}`,
    "Z",
  ].join(" ");
}

function polygonPoints(pts: Array<[number, number]>): Array<[number, number]> {
  return pts;
}

// --- main entry --------------------------------------------------------------

export interface ShapeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Data payload for the data-driven primitive shapes (polygon, polyline, path,
 * sector, ring, arc, block-arrow, chevron). Generators — especially the viz
 * templates — set these on `node.data` to describe parametric geometry that
 * scales with the node box.
 */
export interface ShapeData {
  /** polygon/polyline: points normalized 0..1 within the node box. */
  points?: Array<[number, number]>;
  /** polyline: close the path back to the first point. */
  closed?: boolean;
  /** path: an SVG path in design-space local coordinates… */
  d?: string;
  /** …designed at this size; the renderer scales it to the node box. */
  vw?: number;
  vh?: number;
  /** sector/arc: angles in degrees (0 = east, clockwise). */
  start?: number;
  end?: number;
  /** sector/ring: inner radius as a fraction of the outer (donut hole). */
  inner?: number;
  /** block-arrow/chevron: direction. */
  dir?: "right" | "left" | "up" | "down";
  /** block-arrow: arrowhead length as a fraction of the long axis. */
  headRatio?: number;
  /** block-arrow: shaft thickness as a fraction of the short axis. */
  bodyRatio?: number;
  /** chevron: notch depth as a fraction of the long axis. */
  notch?: number;
}

function polarPoint(cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
}

/** Elliptical annular sector path (pie slice when inner=0, donut segment otherwise). */
function sectorPath(x: number, y: number, w: number, h: number, start: number, end: number, inner: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const irx = rx * inner;
  const iry = ry * inner;
  const sweep = Math.min(359.999, Math.max(0.001, end - start));
  const large = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = polarPoint(cx, cy, rx, ry, start);
  const [ox2, oy2] = polarPoint(cx, cy, rx, ry, start + sweep);
  if (inner <= 0.001) {
    return [`M${cx},${cy}`, `L${ox1},${oy1}`, `A${rx},${ry} 0 ${large} 1 ${ox2},${oy2}`, "Z"].join(" ");
  }
  const [ix1, iy1] = polarPoint(cx, cy, irx, iry, start + sweep);
  const [ix2, iy2] = polarPoint(cx, cy, irx, iry, start);
  return [
    `M${ox1},${oy1}`,
    `A${rx},${ry} 0 ${large} 1 ${ox2},${oy2}`,
    `L${ix1},${iy1}`,
    `A${irx},${iry} 0 ${large} 0 ${ix2},${iy2}`,
    "Z",
  ].join(" ");
}

function blockArrowPoints(x: number, y: number, w: number, h: number, dir: string, headRatio: number, bodyRatio: number): Array<[number, number]> {
  // Build for "right", then transform for the other directions.
  const long = dir === "up" || dir === "down" ? h : w;
  const short = dir === "up" || dir === "down" ? w : h;
  const head = Math.min(long, Math.max(8, long * headRatio));
  const bodyHalf = (short * bodyRatio) / 2;
  const midS = short / 2;
  // local coords: L along the long axis, S across the short axis
  const pts: Array<[number, number]> = [
    [0, midS - bodyHalf],
    [long - head, midS - bodyHalf],
    [long - head, 0],
    [long, midS],
    [long - head, short],
    [long - head, midS + bodyHalf],
    [0, midS + bodyHalf],
  ];
  return pts.map(([l, s]) => {
    switch (dir) {
      case "left":
        return [x + (w - l), y + s] as [number, number];
      case "up":
        return [x + s, y + (h - l)] as [number, number];
      case "down":
        return [x + s, y + l] as [number, number];
      default:
        return [x + l, y + s] as [number, number];
    }
  });
}

function chevronPoints(x: number, y: number, w: number, h: number, dir: string, notch: number): Array<[number, number]> {
  const long = dir === "up" || dir === "down" ? h : w;
  const short = dir === "up" || dir === "down" ? w : h;
  const n = Math.min(long * 0.49, Math.max(0, long * notch));
  const pts: Array<[number, number]> = [
    [0, 0],
    [long - n, 0],
    [long, short / 2],
    [long - n, short],
    [0, short],
    [n, short / 2],
  ];
  return pts.map(([l, s]) => {
    switch (dir) {
      case "left":
        return [x + (w - l), y + s] as [number, number];
      case "up":
        return [x + s, y + (h - l)] as [number, number];
      case "down":
        return [x + s, y + l] as [number, number];
      default:
        return [x + l, y + s] as [number, number];
    }
  });
}

/**
 * Draw a node body and return a <g> ready to append. Never returns text.
 * `data` carries parametric geometry for the data-driven primitives (see
 * ShapeData) — undefined for the classic shapes.
 */
export function renderShapeBody(
  rc: RoughSVG,
  shape: ShapeKind,
  rect: ShapeRect,
  style: NodeStyle,
  data?: Record<string, unknown>,
  tune: RoughRenderTuning = {},
): SVGGElement {
  const g = docOf(rc).createElementNS(SVG_NS, "g") as SVGGElement;
  const { x, y, w, h } = rect;
  const filledOpts = nodeRoughOptions(style, true, tune);
  const strokeOpts = nodeRoughOptions(style, false, tune);
  const sd = (data ?? {}) as ShapeData;

  const add = (el: SVGGElement) => g.appendChild(el);

  switch (shape) {
    case "rectangle": {
      if (style.roundness && style.roundness > 0) {
        add(rc.path(roundedRectPath(x, y, w, h, style.roundness), filledOpts));
      } else {
        add(rc.rectangle(x, y, w, h, filledOpts));
      }
      break;
    }
    case "round-rectangle": {
      add(rc.path(roundedRectPath(x, y, w, h, style.roundness ?? Math.min(w, h) * 0.18), filledOpts));
      break;
    }
    case "pill": {
      add(rc.path(roundedRectPath(x, y, w, h, h / 2), filledOpts));
      break;
    }
    case "ellipse": {
      add(rc.ellipse(x + w / 2, y + h / 2, w, h, filledOpts));
      break;
    }
    case "circle": {
      const d = Math.min(w, h);
      add(rc.ellipse(x + w / 2, y + h / 2, d, d, filledOpts));
      break;
    }
    case "diamond": {
      add(
        rc.polygon(
          polygonPoints([
            [x + w / 2, y],
            [x + w, y + h / 2],
            [x + w / 2, y + h],
            [x, y + h / 2],
          ]),
          filledOpts,
        ),
      );
      break;
    }
    case "triangle": {
      add(
        rc.polygon(
          polygonPoints([
            [x + w / 2, y],
            [x + w, y + h],
            [x, y + h],
          ]),
          filledOpts,
        ),
      );
      break;
    }
    case "hexagon": {
      const dx = w * 0.22;
      add(
        rc.polygon(
          polygonPoints([
            [x + dx, y],
            [x + w - dx, y],
            [x + w, y + h / 2],
            [x + w - dx, y + h],
            [x + dx, y + h],
            [x, y + h / 2],
          ]),
          filledOpts,
        ),
      );
      break;
    }
    case "parallelogram": {
      const sk = w * 0.2;
      add(
        rc.polygon(
          polygonPoints([
            [x + sk, y],
            [x + w, y],
            [x + w - sk, y + h],
            [x, y + h],
          ]),
          filledOpts,
        ),
      );
      break;
    }
    case "trapezoid": {
      const inset = w * 0.2;
      add(
        rc.polygon(
          polygonPoints([
            [x + inset, y],
            [x + w - inset, y],
            [x + w, y + h],
            [x, y + h],
          ]),
          filledOpts,
        ),
      );
      break;
    }
    case "cylinder": {
      const rx = w / 2;
      const ry = Math.min(h * 0.14, 22);
      const bodyTop = y + ry;
      const bodyBot = y + h - ry;
      // filled body (top chord -> down -> bottom front arc -> up)
      const body = [
        `M${x},${bodyTop}`,
        `L${x},${bodyBot}`,
        `A${rx},${ry} 0 0 0 ${x + w},${bodyBot}`,
        `L${x + w},${bodyTop}`,
        `A${rx},${ry} 0 0 0 ${x},${bodyTop}`,
        "Z",
      ].join(" ");
      add(rc.path(body, filledOpts));
      // top rim ellipse (stroke only)
      add(rc.ellipse(x + w / 2, bodyTop, w, ry * 2, strokeOpts));
      break;
    }
    case "cloud": {
      add(rc.path(cloudPath(x, y, w, h), filledOpts));
      break;
    }
    case "document": {
      add(rc.path(documentPath(x, y, w, h), filledOpts));
      break;
    }
    case "note": {
      const { body, fold } = notePaths(x, y, w, h);
      add(rc.path(body, filledOpts));
      add(rc.path(fold, strokeOpts));
      break;
    }
    case "actor": {
      const cx = x + w / 2;
      const headR = Math.min(w, h) * 0.16;
      const headY = y + headR + 2;
      const shoulderY = headY + headR + 4;
      const hipY = y + h * 0.66;
      const footY = y + h;
      add(rc.ellipse(cx, headY, headR * 2, headR * 2, strokeOpts));
      add(rc.line(cx, shoulderY, cx, hipY, strokeOpts)); // spine
      add(rc.line(x + w * 0.2, shoulderY + 8, x + w * 0.8, shoulderY + 8, strokeOpts)); // arms
      add(rc.line(cx, hipY, x + w * 0.28, footY, strokeOpts)); // left leg
      add(rc.line(cx, hipY, x + w * 0.72, footY, strokeOpts)); // right leg
      break;
    }
    case "text": {
      // no body
      break;
    }
    // ---- data-driven primitives (viz building blocks) ----------------------
    case "polygon": {
      const pts = (sd.points ?? []).map(([u, v]) => [x + u * w, y + v * h] as [number, number]);
      if (pts.length >= 3) add(rc.polygon(pts, filledOpts));
      break;
    }
    case "polyline": {
      const pts = (sd.points ?? []).map(([u, v]) => [x + u * w, y + v * h] as [number, number]);
      if (pts.length >= 2) {
        if (sd.closed) add(rc.polygon(pts, filledOpts));
        else add(rc.linearPath(pts, strokeOpts));
      }
      break;
    }
    case "path": {
      if (sd.d) {
        const vw = sd.vw ?? w;
        const vh = sd.vh ?? h;
        const el = rc.path(sd.d, filledOpts);
        const inner = docOf(rc).createElementNS(SVG_NS, "g") as SVGGElement;
        inner.setAttribute("transform", `translate(${x} ${y}) scale(${w / vw} ${h / vh})`);
        inner.appendChild(el);
        add(inner as SVGGElement);
      }
      break;
    }
    case "sector": {
      add(rc.path(sectorPath(x, y, w, h, sd.start ?? 0, sd.end ?? 90, sd.inner ?? 0), filledOpts));
      break;
    }
    case "ring": {
      add(rc.path(sectorPath(x, y, w, h, 0, 359.999, sd.inner ?? 0.6), filledOpts));
      break;
    }
    case "arc": {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const start = sd.start ?? 180;
      const end = sd.end ?? 360;
      const sweep = Math.min(359.999, Math.max(0.001, end - start));
      const large = sweep > 180 ? 1 : 0;
      const [x1, y1] = polarPoint(cx, cy, rx, ry, start);
      const [x2, y2] = polarPoint(cx, cy, rx, ry, start + sweep);
      add(rc.path(`M${x1},${y1} A${rx},${ry} 0 ${large} 1 ${x2},${y2}`, strokeOpts));
      break;
    }
    case "block-arrow": {
      add(rc.polygon(blockArrowPoints(x, y, w, h, sd.dir ?? "right", sd.headRatio ?? 0.35, sd.bodyRatio ?? 0.55), filledOpts));
      break;
    }
    case "chevron": {
      add(rc.polygon(chevronPoints(x, y, w, h, sd.dir ?? "right", sd.notch ?? 0.22), filledOpts));
      break;
    }
    default: {
      // Plugin-registered shape?
      const plugin = getShapePlugin(shape);
      if (plugin) {
        const pg = plugin(rc, rect, style, data);
        applyStrokeTuning(pg, tune);
        return pg;
      }
      // Unknown shape -> fall back to a rounded rectangle so nothing
      // silently disappears.
      add(rc.path(roundedRectPath(x, y, w, h, 8), filledOpts));
      break;
    }
  }

  applyStrokeTuning(g, tune);
  return g;
}

/**
 * Shapes whose label hangs below the body instead of centering inside it.
 * Only `actor` (stick figure) qualifies — a `text` node's label IS its content
 * and must render inside its box, otherwise every text block sits half a block
 * lower than its scene geometry (which broke viz label placement).
 */
export function labelBelow(shape: ShapeKind): boolean {
  return shape === "actor";
}
