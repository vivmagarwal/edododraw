/**
 * Frame-driven arrow animation — the pure, clock-free twin of the CSS-keyframe
 * overlay in `edges.ts` + `theme.css.ts`.
 *
 * The interactive renderer animates arrows (`flow`, `dash-march`, `draw-on`,
 * `comet`, `gradient-flow`, `electric`, `pulse`) with CSS `animation-name` on a
 * clean overlay `<path>` that follows the edge's centerline. That is wall-clock
 * motion: a host that screenshots frames out of order (Remotion, Puppeteer,
 * a bake pipeline) catches those animations mid-flight and gets a different
 * picture every run — which is why `SvgRenderer { static: true }` emits no
 * overlay at all.
 *
 * This module gives such a host everything it needs to rebuild the same motion
 * from a frame number instead:
 *
 *   1. `edgeCenterline(scene, id)` — the exact `d` / `length` / `style` of the
 *      centerline the overlay would have followed. Pure: no DOM, no renderer,
 *      no scraping `[data-edge] path` out of the document.
 *   2. `ARROW_ANIMATIONS` — the dash cycle, dash array, stroke scale, duration
 *      and easing each named animation uses, transcribed from the CSS.
 *   3. `arrowFrameStyle(...)` — those two combined into the SVG presentation
 *      attributes for one instant in time.
 *
 * Everything here is a total function of its inputs, so frame N always renders
 * identically no matter which frames ran before it.
 *
 * @see docs/INTEGRATION_GUIDE.md §6
 */

import type { Point } from "../geometry.js";
import type { ArrowAnimationKind, EdgeStyle, Scene, SceneEdge } from "../scene/types.js";
import { centerlinePath, dagreRoute, pathLength, resolveEndpoints, routePoints, smoothPath } from "./edges.js";

// ---------------------------------------------------------------------------
// 1. Centerline geometry
// ---------------------------------------------------------------------------

/** The routed centerline of one edge, in WORLD coordinates. */
export interface EdgeCenterline {
  /** The edge id (`data-edge` in the rendered DOM). */
  id: string;
  /** SVG path data for the centerline — feed straight to a `<path d=…>`. */
  d: string;
  /** The routed polyline the path follows. */
  points: Point[];
  /**
   * Polyline length in world units. This is the same number the CSS overlay
   * uses (`--edd-len`), i.e. the chord length of `points` — NOT the arc length
   * of the smoothed curve, which is slightly longer. For a dash sweep that must
   * land exactly on the visible path end, measure `d` instead (SVG
   * `getTotalLength()`, or `getLength()` from `@remotion/paths`, which is pure).
   */
  length: number;
  /** The edge's resolved style (stroke, width, animation, speed, …). */
  style: EdgeStyle;
  /** True when `d` is a Catmull-Rom smoothed curve rather than a polyline. */
  smooth: boolean;
}

/**
 * Rebuild an edge's centerline from the Scene alone — identical to the geometry
 * `renderEdge` draws, including dagre waypoint routing and curve smoothing.
 *
 * Returns `null` for an unknown id. DOM-free and synchronous, so it is safe in
 * a `useMemo`, in Node, and during SSR.
 */
export function edgeCenterline(scene: Scene, edgeId: string): EdgeCenterline | null {
  const edge = scene.edges.find((e) => e.id === edgeId);
  return edge ? centerlineOf(scene, edge) : null;
}

/** Every edge's centerline, in the scene's own edge order. */
export function edgeCenterlines(scene: Scene): EdgeCenterline[] {
  return scene.edges.map((e) => centerlineOf(scene, e));
}

function centerlineOf(scene: Scene, edge: SceneEdge): EdgeCenterline {
  // Same decision tree as renderEdge(): prefer dagre's routed waypoints, then
  // fall back to direct routing; curved 3-point routes are smoothed.
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
  const d = smooth ? smoothPath(points) : centerlinePath(points, edge.routing);
  return { id: edge.id, d, points, length: pathLength(points), style: edge.style, smooth };
}

// ---------------------------------------------------------------------------
// 2. The animation constants (transcribed from theme.css.ts + edges.ts)
// ---------------------------------------------------------------------------

/**
 * Distance in px that the `flow` / `dash-march` dash pattern travels in one
 * cycle — the `-18px` in `@keyframes edd-march`. Chosen so the "10 8" dash
 * pattern (10 on + 8 off = 18) advances by exactly one repeat per cycle and the
 * loop is seamless. Any hand-rolled marching-ants reimplementation needs this
 * number to match the interactive look.
 */
export const DASH_MARCH_CYCLE_PX = 18;

export type AnimatedArrowKind = Exclude<ArrowAnimationKind, "none">;

/** The CSS behaviour of one named arrow animation, as data. */
export interface ArrowAnimationSpec {
  /**
   * Px the `stroke-dashoffset` travels per cycle (negative = forward along the
   * path, matching the CSS keyframes). `null` when the travel is a function of
   * the edge length rather than a constant — see `arrowFrameStyle`.
   */
  dashCycle: number | null;
  /** `stroke-dasharray`, or `null` when it is derived from the edge length. */
  dashArray: string | null;
  /** Multiplier applied to the edge's `strokeWidth` for the overlay stroke. */
  strokeWidthScale: number;
  /** Seconds for one cycle at `animationSpeed: 1` (`animation-duration`). */
  durationSec: number;
  /** The keyframe's timing function. `steps-3` = CSS `steps(3)`. */
  easing: "linear" | "ease-in-out" | "steps-3";
  /** `animation-direction: alternate` — the cycle ping-pongs. */
  alternate: boolean;
  /** Animates opacity rather than the dash pattern. */
  opacityOnly: boolean;
}

/**
 * Every built-in arrow animation, transcribed 1:1 from `theme.css.ts`
 * (keyframes + timing) and `edges.ts` `animationOverlay` (stroke attributes).
 * Registered plugin animations (`registerArrowAnimation`) are not listed —
 * ask the registry for those.
 */
export const ARROW_ANIMATIONS: Record<AnimatedArrowKind, ArrowAnimationSpec> = {
  flow: { dashCycle: -18, dashArray: "10 8", strokeWidthScale: 1.2, durationSec: 0.9, easing: "linear", alternate: false, opacityOnly: false },
  "dash-march": { dashCycle: -18, dashArray: "10 8", strokeWidthScale: 1.2, durationSec: 0.9, easing: "linear", alternate: false, opacityOnly: false },
  electric: { dashCycle: -9, dashArray: "2 7", strokeWidthScale: 1.6, durationSec: 0.5, easing: "steps-3", alternate: false, opacityOnly: false },
  "gradient-flow": { dashCycle: -30, dashArray: "16 10", strokeWidthScale: 2.4, durationSec: 1.2, easing: "linear", alternate: false, opacityOnly: false },
  // length-relative: dash = the whole path, offset sweeps len -> 0 and back
  "draw-on": { dashCycle: null, dashArray: null, strokeWidthScale: 1.3, durationSec: 1.4, easing: "ease-in-out", alternate: true, opacityOnly: false },
  // length-relative: a bright segment of max(24, 14% of len) flying end to end
  comet: { dashCycle: null, dashArray: null, strokeWidthScale: 2.2, durationSec: 1.6, easing: "linear", alternate: false, opacityOnly: false },
  pulse: { dashCycle: null, dashArray: null, strokeWidthScale: 1.2, durationSec: 1.3, easing: "ease-in-out", alternate: false, opacityOnly: true },
};

/** Fraction of the path length the comet's bright head occupies. */
export const COMET_HEAD_FRACTION = 0.14;
/** The comet head never shrinks below this many px. */
export const COMET_HEAD_MIN_PX = 24;
/** `gradient-flow` paints with this gradient, already present in the renderer's `<defs>`. */
export const FLOW_GRADIENT_URL = "url(#eddFlowGradient)";

// ---------------------------------------------------------------------------
// 3. One frame of an animated arrow
// ---------------------------------------------------------------------------

/** SVG presentation attributes for an animated overlay path at one instant. */
export interface ArrowFrameStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  strokeDashoffset: number;
  strokeLinecap: "round" | "butt";
  fill: "none";
  opacity: number;
  /** Set for `comet` (the CSS uses a drop-shadow glow); `undefined` otherwise. */
  filter?: string;
}

export interface ArrowFrameOptions {
  /** Override the edge's own animation (e.g. force `flow` on a plain arrow). */
  animation?: AnimatedArrowKind;
  /** Override `style.animationSpeed`. 1 = the interactive default. */
  speed?: number;
  /**
   * Path length to use. Defaults to the centerline's chord length (what the CSS
   * uses). Pass a measured arc length — `getTotalLength()`, or `getLength(d)`
   * from `@remotion/paths` — for a `draw-on`/`comet` sweep that lands exactly
   * on a smoothed curve's end.
   */
  length?: number;
}

/**
 * The overlay's presentation attributes at `timeSec` seconds into the loop —
 * the CSS animation, evaluated as a pure function.
 *
 * In a frame-driven host, `timeSec = frame / fps`:
 *
 *   const cl = edgeCenterline(scene, "e0_a_b")!;
 *   const s  = arrowFrameStyle(cl, frame / fps)!;
 *   <path d={cl.d} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth}
 *         strokeDasharray={s.strokeDasharray} strokeDashoffset={s.strokeDashoffset}
 *         strokeLinecap={s.strokeLinecap} opacity={s.opacity} />
 *
 * Returns `null` when the edge has no animation (`"none"`) or the kind is a
 * runtime-registered plugin this module knows nothing about.
 */
export function arrowFrameStyle(
  edge: { style: EdgeStyle; length: number },
  timeSec: number,
  opts: ArrowFrameOptions = {},
): ArrowFrameStyle | null {
  const kind = (opts.animation ?? edge.style.animation) as ArrowAnimationKind;
  if (!kind || kind === "none") return null;
  const spec = ARROW_ANIMATIONS[kind as AnimatedArrowKind];
  if (!spec) return null;

  const len = Math.max(1, opts.length ?? edge.length);
  const speed = opts.speed ?? edge.style.animationSpeed ?? 1;
  const duration = spec.durationSec / (speed || 1);
  const sw = edge.style.strokeWidth * spec.strokeWidthScale;

  // 0..1 position inside the current cycle, then the keyframe's easing.
  let t = cycleFraction(timeSec, duration);
  if (spec.alternate) t = t < 0.5 ? t * 2 : 2 - t * 2; // animation-direction: alternate
  t = ease(t, spec.easing);

  const base: ArrowFrameStyle = {
    stroke: kind === "gradient-flow" ? FLOW_GRADIENT_URL : edge.style.stroke,
    strokeWidth: sw,
    strokeDasharray: "",
    strokeDashoffset: 0,
    strokeLinecap: kind === "pulse" ? "butt" : "round",
    fill: "none",
    opacity: 1,
  };

  switch (kind) {
    case "flow":
    case "dash-march":
    case "electric":
    case "gradient-flow":
      base.strokeDasharray = spec.dashArray!;
      base.strokeDashoffset = (spec.dashCycle as number) * t;
      return base;
    case "draw-on":
      // from stroke-dashoffset: len  ->  0 (the whole line draws itself on)
      base.strokeDasharray = String(len);
      base.strokeDashoffset = len * (1 - t);
      return base;
    case "comet": {
      const head = Math.max(COMET_HEAD_MIN_PX, len * COMET_HEAD_FRACTION);
      base.strokeDasharray = `${head} ${len}`;
      // from len -> -0.14*len: the head enters, crosses, and exits
      base.strokeDashoffset = len + (-COMET_HEAD_FRACTION * len - len) * t;
      base.filter = "drop-shadow(0 0 4px currentColor)";
      return base;
    }
    case "pulse":
      // 0%,100% { opacity: 0.15 } 50% { opacity: 0.85 }
      base.opacity = 0.15 + 0.7 * (1 - Math.abs(2 * t - 1));
      return base;
    default:
      return null;
  }
}

/** Position inside the current animation cycle, 0..1. Handles negative time. */
function cycleFraction(timeSec: number, durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  const f = (timeSec / durationSec) % 1;
  return f < 0 ? f + 1 : f;
}

function ease(t: number, kind: ArrowAnimationSpec["easing"]): number {
  switch (kind) {
    case "ease-in-out":
      // CSS `ease-in-out` = cubic-bezier(0.42, 0, 0.58, 1); the classic
      // smoothstep is within ~1% of it and needs no solver.
      return t * t * (3 - 2 * t);
    case "steps-3":
      return Math.floor(t * 3) / 3; // CSS steps(3) == steps(3, jump-end)
    default:
      return t;
  }
}
