/**
 * Shape body generation. Each ShapeKind is turned into one or more rough.js
 * drawables and returned as a single <g>. Text is NOT drawn here (the renderer
 * overlays it). Composite shapes (cylinder, cloud, document, note, actor) are
 * built from hand-authored SVG path strings so rough.js can "sketch" them.
 */

import type rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { NodeStyle, ShapeKind } from "../scene/types.js";
import { getShapePlugin } from "../plugins/registry.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Map a NodeStyle to rough.js Options. */
export function nodeRoughOptions(style: NodeStyle, filled: boolean): Options {
  const opts: Options = {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    roughness: style.roughness,
    seed: style.seed,
    bowing: 1,
    preserveVertices: false,
  };
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
 * Draw a node body and return a <g> ready to append. Never returns text.
 */
export function renderShapeBody(
  rc: RoughSVG,
  shape: ShapeKind,
  rect: ShapeRect,
  style: NodeStyle,
): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  const { x, y, w, h } = rect;
  const filledOpts = nodeRoughOptions(style, true);
  const strokeOpts = nodeRoughOptions(style, false);

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
    default: {
      // Plugin-registered shape?
      const plugin = getShapePlugin(shape);
      if (plugin) {
        return plugin(rc, rect, style);
      }
      // Unknown shape -> fall back to a rounded rectangle so nothing
      // silently disappears.
      add(rc.path(roundedRectPath(x, y, w, h, 8), filledOpts));
      break;
    }
  }

  return g;
}

/** Shapes whose label should render above (not centered inside) the body. */
export function labelBelow(shape: ShapeKind): boolean {
  return shape === "actor" || shape === "text";
}
