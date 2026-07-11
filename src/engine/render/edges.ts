/**
 * Edge geometry + rendering.
 *
 * An edge is drawn as:
 *   1. a hand-drawn (rough.js) base stroke following the routed centerline,
 *   2. optional arrowheads at each end (rough, matched to the stroke),
 *   3. an optional CLEAN overlay <path> that carries the animation
 *      (flow / dash-march / draw-on / comet / gradient-flow / pulse / electric),
 *   4. an optional label chip at the midpoint.
 *
 * The clean overlay follows the exact same centerline so animations read as
 * "energy flowing along the drawn line".
 */

import type rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import type { Point } from "../geometry.js";
import { rectCenter } from "../geometry.js";
import { getArrowAnimation } from "../plugins/registry.js";
import { resolveAnchor, nodeRect } from "../scene/anchors.js";
import { getNode } from "../scene/query.js";
import type { EdgeStyle, Scene, SceneEdge } from "../scene/types.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;
const SVG_NS = "http://www.w3.org/2000/svg";

export function edgeRoughOptions(style: EdgeStyle): Options {
  const opts: Options = {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    roughness: style.roughness,
    seed: style.seed,
    bowing: 1,
  };
  if (style.strokeStyle === "dashed") opts.strokeLineDash = [9, 9];
  else if (style.strokeStyle === "dotted") opts.strokeLineDash = [1.6, 6];
  return opts;
}

/** Resolve the two endpoints of an edge in world space, border-aware. */
export function resolveEndpoints(scene: Scene, edge: SceneEdge): { a: Point; b: Point } {
  const fromNode = edge.from.node ? getNode(scene, edge.from.node) : undefined;
  const toNode = edge.to.node ? getNode(scene, edge.to.node) : undefined;

  const fromCenter = fromNode ? rectCenter(nodeRect(fromNode)) : edge.from.point ?? { x: 0, y: 0 };
  const toCenter = toNode ? rectCenter(nodeRect(toNode)) : edge.to.point ?? { x: 0, y: 0 };

  let a: Point = fromNode ? resolveAnchor(fromNode, edge.from.anchor, toCenter) : fromCenter;
  let b: Point = toNode ? resolveAnchor(toNode, edge.to.anchor, fromCenter) : toCenter;

  // One refinement pass so auto-anchors aim at the *actual* opposite point.
  if (fromNode && (!edge.from.anchor || edge.from.anchor === "auto")) a = resolveAnchor(fromNode, undefined, b);
  if (toNode && (!edge.to.anchor || edge.to.anchor === "auto")) b = resolveAnchor(toNode, undefined, a);

  return { a, b };
}

/** Build the routed polyline (world points) for an edge. */
export function routePoints(edge: SceneEdge, a: Point, b: Point): Point[] {
  switch (edge.routing) {
    case "straight":
      return [a, b];
    case "curved": {
      const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      // parallel edges between the same pair fan out symmetrically
      const par = (edge.data as { parallel?: { index: number; count: number } } | undefined)?.parallel;
      let bow: number;
      if (par && par.count > 1) {
        bow = (par.index - (par.count - 1) / 2) * 38;
      } else {
        // longer curved/animated edges arc more so loop-backs clear the nodes
        bow = Math.min(70, len * 0.16);
      }
      return [a, { x: mid.x + nx * bow, y: mid.y + ny * bow }, b];
    }
    case "orthogonal":
    case "elbow": {
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      // route along the dominant axis first
      const mid: Point[] =
        dx > dy ? [{ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }] : [{ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }];
      return [a, ...mid, b];
    }
    default:
      return [a, b];
  }
}

/** SVG path `d` for the clean overlay following the same routed points. */
export function centerlinePath(points: Point[], routing: SceneEdge["routing"]): string {
  if (points.length < 2) return "";
  if (routing === "curved" && points.length === 3) {
    const [a, c, b] = points;
    return `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  if (routing === "elbow" && points.length >= 3) {
    // rounded corners
    let d = `M${points[0].x},${points[0].y}`;
    const r = 10;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const next = points[i + 1];
      const v1 = norm(sub(prev, p));
      const v2 = norm(sub(next, p));
      const p1 = { x: p.x + v1.x * r, y: p.y + v1.y * r };
      const p2 = { x: p.x + v2.x * r, y: p.y + v2.y * r };
      d += ` L${p1.x},${p1.y} Q${p.x},${p.y} ${p2.x},${p2.y}`;
    }
    const last = points[points.length - 1];
    d += ` L${last.x},${last.y}`;
    return d;
  }
  return "M" + points.map((p) => `${p.x},${p.y}`).join(" L");
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}
function norm(v: Point): Point {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/**
 * Route an edge through dagre's computed waypoints (so it dodges nodes in dense
 * graphs). Returns null when there are no usable waypoints or the edge is a
 * fanned parallel edge (which handles its own bow). Endpoints are re-clipped to
 * the node borders aimed at the first/last bend.
 */
function dagreRoute(scene: Scene, edge: SceneEdge): Point[] | null {
  const raw = edge.points;
  if (!raw || raw.length < 3) return null;
  if ((edge.data as { parallel?: unknown } | undefined)?.parallel) return null;
  const fromNode = edge.from.node ? getNode(scene, edge.from.node) : undefined;
  const toNode = edge.to.node ? getNode(scene, edge.to.node) : undefined;
  const firstBend = raw[1];
  const lastBend = raw[raw.length - 2];
  const a = fromNode ? resolveAnchor(fromNode, edge.from.anchor, firstBend) : raw[0];
  const b = toNode ? resolveAnchor(toNode, edge.to.anchor, lastBend) : raw[raw.length - 1];
  return [a, ...raw.slice(1, -1), b];
}

/** Catmull-Rom smooth path through points (for the animated overlay). */
function smoothPath(points: Point[]): string {
  if (points.length < 3) return "M" + points.map((p) => `${p.x},${p.y}`).join(" L");
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Draw the rough base stroke of an edge. */
function drawBase(rc: RoughSVG, points: Point[], edge: SceneEdge, smooth: boolean): SVGGElement {
  const opts = edgeRoughOptions(edge.style);
  if (smooth && points.length >= 3) {
    return rc.curve(points.map((p) => [p.x, p.y]) as [number, number][], opts);
  }
  if (points.length === 2) {
    return rc.line(points[0].x, points[0].y, points[1].x, points[1].y, opts);
  }
  return rc.linearPath(points.map((p) => [p.x, p.y]) as [number, number][], opts);
}

// --- arrowheads --------------------------------------------------------------

function drawArrowhead(
  rc: RoughSVG,
  kind: string,
  tip: Point,
  angle: number,
  style: EdgeStyle,
): SVGGElement | null {
  if (!kind || kind === "none") return null;
  const size = 11 + style.strokeWidth * 2.4;
  const opts: Options = {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    roughness: Math.min(style.roughness, 1),
    seed: style.seed,
  };
  const filledOpts: Options = { ...opts, fill: style.stroke, fillStyle: "solid" };
  const back = (dist: number, spread: number): Point => ({
    x: tip.x - Math.cos(angle - spread) * dist,
    y: tip.y - Math.sin(angle - spread) * dist,
  });
  const back2 = (dist: number, spread: number): Point => ({
    x: tip.x - Math.cos(angle + spread) * dist,
    y: tip.y - Math.sin(angle + spread) * dist,
  });

  switch (kind) {
    case "arrow": {
      const p1 = back(size, 0.42);
      const p2 = back2(size, 0.42);
      return rc.linearPath(
        [
          [p1.x, p1.y],
          [tip.x, tip.y],
          [p2.x, p2.y],
        ],
        opts,
      );
    }
    case "triangle": {
      const p1 = back(size, 0.42);
      const p2 = back2(size, 0.42);
      return rc.polygon(
        [
          [tip.x, tip.y],
          [p1.x, p1.y],
          [p2.x, p2.y],
        ],
        filledOpts,
      );
    }
    case "triangle-outline": {
      const p1 = back(size, 0.42);
      const p2 = back2(size, 0.42);
      return rc.polygon(
        [
          [tip.x, tip.y],
          [p1.x, p1.y],
          [p2.x, p2.y],
        ],
        opts,
      );
    }
    case "bar": {
      const p1 = {
        x: tip.x - Math.cos(angle + Math.PI / 2) * size * 0.6,
        y: tip.y - Math.sin(angle + Math.PI / 2) * size * 0.6,
      };
      const p2 = {
        x: tip.x + Math.cos(angle + Math.PI / 2) * size * 0.6,
        y: tip.y + Math.sin(angle + Math.PI / 2) * size * 0.6,
      };
      return rc.line(p1.x, p1.y, p2.x, p2.y, opts);
    }
    case "dot":
    case "circle": {
      const r = size * 0.42;
      const c = { x: tip.x - Math.cos(angle) * r, y: tip.y - Math.sin(angle) * r };
      return rc.circle(c.x, c.y, r * 2, kind === "dot" ? filledOpts : opts);
    }
    case "circle-outline": {
      const r = size * 0.42;
      const c = { x: tip.x - Math.cos(angle) * r, y: tip.y - Math.sin(angle) * r };
      return rc.circle(c.x, c.y, r * 2, opts);
    }
    case "diamond":
    case "diamond-outline": {
      const r = size * 0.55;
      const c = { x: tip.x - Math.cos(angle) * r, y: tip.y - Math.sin(angle) * r };
      const perp = angle + Math.PI / 2;
      const pts: [number, number][] = [
        [tip.x, tip.y],
        [c.x + Math.cos(perp) * r * 0.6, c.y + Math.sin(perp) * r * 0.6],
        [c.x - Math.cos(angle) * r, c.y - Math.sin(angle) * r],
        [c.x - Math.cos(perp) * r * 0.6, c.y - Math.sin(perp) * r * 0.6],
      ];
      return rc.polygon(pts, kind === "diamond" ? filledOpts : opts);
    }
    case "crow": {
      const spread = 0.5;
      const p1 = back(size, spread);
      const p2 = back2(size, spread);
      const mid = back(size, 0);
      const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
      g.appendChild(rc.line(tip.x, tip.y, p1.x, p1.y, opts));
      g.appendChild(rc.line(tip.x, tip.y, p2.x, p2.y, opts));
      g.appendChild(rc.line(tip.x, tip.y, mid.x, mid.y, opts));
      return g;
    }
    default:
      return null;
  }
}

function angleOf(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

// --- animated overlay --------------------------------------------------------

/**
 * A clean <path> following the centerline that carries the CSS-driven flow
 * animation. Returns null when animation is "none". The overlay sits above the
 * hand-drawn base so the motion reads as energy travelling along the line.
 */
function animationOverlay(edge: SceneEdge, centerline: string, len: number): SVGPathElement | null {
  const kind = edge.style.animation;
  if (!kind || kind === "none") return null;
  const p = document.createElementNS(SVG_NS, "path") as SVGPathElement;
  p.setAttribute("d", centerline);
  p.setAttribute("fill", "none");
  p.setAttribute("class", `edd-anim edd-anim-${kind}`);
  p.setAttribute("pointer-events", "none");
  const speed = edge.style.animationSpeed || 1;
  const sw = edge.style.strokeWidth;
  const stroke = edge.style.stroke;
  const style = p.style;
  style.setProperty("--edd-len", String(Math.max(1, Math.round(len))));
  style.setProperty("--edd-speed", String(speed));

  // runtime-registered animation kinds take precedence (see plugins/registry)
  const plugin = getArrowAnimation(kind);
  if (plugin) {
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", String(sw * 1.2));
    p.setAttribute("stroke-linecap", "round");
    plugin.apply(p, edge, { length: len, speed });
    return p;
  }

  switch (kind) {
    case "flow":
    case "dash-march":
    case "electric": {
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(sw * (kind === "electric" ? 1.6 : 1.2)));
      const dash = kind === "electric" ? "2 7" : "10 8";
      p.setAttribute("stroke-dasharray", dash);
      p.setAttribute("stroke-linecap", "round");
      style.animationDuration = `${(kind === "electric" ? 0.5 : 0.9) / speed}s`;
      break;
    }
    case "draw-on": {
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(sw * 1.3));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-dasharray", String(len));
      style.setProperty("--edd-dashoffset", String(len));
      style.animationDuration = `${1.4 / speed}s`;
      break;
    }
    case "comet": {
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(sw * 2.2));
      p.setAttribute("stroke-linecap", "round");
      const seg = Math.max(24, len * 0.14);
      p.setAttribute("stroke-dasharray", `${seg} ${len}`);
      p.style.filter = "drop-shadow(0 0 4px currentColor)";
      p.style.color = stroke;
      style.animationDuration = `${1.6 / speed}s`;
      break;
    }
    case "pulse": {
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(sw * 1.2));
      style.animationDuration = `${1.3 / speed}s`;
      break;
    }
    case "gradient-flow": {
      p.setAttribute("stroke", "url(#eddFlowGradient)");
      p.setAttribute("stroke-width", String(sw * 2.4));
      p.setAttribute("stroke-linecap", "round");
      style.animationDuration = `${1.2 / speed}s`;
      break;
    }
    default:
      return null;
  }
  return p;
}

// --- public render -----------------------------------------------------------

export interface RenderedEdge {
  group: SVGGElement;
  points: Point[];
  centerline: string;
  length: number;
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/**
 * Render one edge into a <g>. `animId` uniquely identifies the animation
 * overlay so we can wire per-edge gradients/keyframes. `opts.static` skips the
 * animated overlay entirely (deterministic frame rendering — the hand-drawn
 * base stroke and arrowheads already depict the edge fully).
 */
export function renderEdge(rc: RoughSVG, scene: Scene, edge: SceneEdge, opts: { static?: boolean } = {}): RenderedEdge {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("data-edge", edge.id);
  g.setAttribute("class", "edd-edge");
  g.style.opacity = String(edge.style.opacity / 100);

  // Prefer dagre's routed waypoints (dodges nodes); fall back to direct routing.
  const routed = dagreRoute(scene, edge);
  let points: Point[];
  let smooth: boolean;
  if (routed) {
    points = routed;
    smooth = true;
  } else {
    const { a, b } = resolveEndpoints(scene, edge);
    points = routePoints(edge, a, b);
    smooth = edge.routing === "curved" && points.length === 3;
  }
  const centerline = smooth ? smoothPath(points) : centerlinePath(points, edge.routing);
  const len = pathLength(points);

  // 1. base rough stroke
  g.appendChild(drawBase(rc, points, edge, smooth));

  // 2. arrowheads
  const endTangent = angleOf(points[points.length - 2], points[points.length - 1]);
  const startTangent = angleOf(points[1], points[0]);
  const endHead = drawArrowhead(rc, edge.style.endArrowhead, points[points.length - 1], endTangent, edge.style);
  if (endHead) g.appendChild(endHead);
  const startHead = drawArrowhead(rc, edge.style.startArrowhead, points[0], startTangent, edge.style);
  if (startHead) g.appendChild(startHead);

  // 3. animated overlay (flow/march/draw-on/comet/gradient/pulse/electric) —
  // never emitted in static mode (screenshots would catch it mid-flight)
  const overlay = opts.static ? null : animationOverlay(edge, centerline, len);
  if (overlay) g.appendChild(overlay);

  return { group: g, points, centerline, length: len };
}
