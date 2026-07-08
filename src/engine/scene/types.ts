/**
 * Scene IR — the single intermediate representation every producer compiles to
 * (EDodoDraw DSL, Mermaid import, programmatic API) and the renderer consumes.
 *
 * Design goals:
 *  - Flat, serializable, JSON-friendly (no class instances, no functions).
 *  - Forward-compatible: annotations + timeline steps live here from day one.
 *  - Plugin-extensible: `shape`, arrow `animation`, and annotation `kind` are
 *    open string unions resolved through registries, not hard-coded switches.
 */

import type { Point } from "../geometry.js";

// ----------------------------------------------------------------------------
// Enums / open unions
// ----------------------------------------------------------------------------

/** Built-in node shapes. Plugins may register more (any string is accepted). */
export type ShapeKind =
  | "rectangle"
  | "round-rectangle"
  | "ellipse"
  | "circle"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "parallelogram"
  | "trapezoid"
  | "cylinder"
  | "cloud"
  | "document"
  | "note"
  | "actor"
  | "pill"
  | "text"
  | (string & {});

export type FillStyle =
  | "hachure"
  | "cross-hatch"
  | "solid"
  | "zigzag"
  | "dots"
  | "none";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export type FontKind = "hand" | "normal" | "code";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

/** Arrowhead styles. Plugins may register more. */
export type ArrowheadKind =
  | "none"
  | "arrow"
  | "triangle"
  | "triangle-outline"
  | "bar"
  | "dot"
  | "circle"
  | "circle-outline"
  | "diamond"
  | "diamond-outline"
  | "crow"
  | (string & {});

/** Animated arrow presentation. Plugins may register more. */
export type ArrowAnimationKind =
  | "none"
  | "flow"
  | "dash-march"
  | "draw-on"
  | "pulse"
  | "comet"
  | "gradient-flow"
  | "electric"
  | (string & {});

export type EdgeRouting = "straight" | "curved" | "orthogonal" | "elbow";

export type LayoutKind =
  | "dag"
  | "dag-lr"
  | "dag-rl"
  | "dag-bt"
  | "grid"
  | "radial"
  | "manual";

// ----------------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------------

export interface NodeStyle {
  stroke: string;
  fill: string | null;
  fillStyle: FillStyle;
  strokeWidth: number; // logical px, typically 1..4
  strokeStyle: StrokeStyle;
  roughness: number; // 0..3, hand-drawn intensity
  roundness: number | null; // corner radius (px) or null for shape default
  fontFamily: FontKind;
  fontSize: number;
  textColor: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  opacity: number; // 0..100
  seed: number; // deterministic rough seed
  shadow?: boolean;
}

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  startArrowhead: ArrowheadKind;
  endArrowhead: ArrowheadKind;
  animation: ArrowAnimationKind;
  animationSpeed: number; // 1 = default
  opacity: number;
  seed: number;
  fontFamily: FontKind;
  fontSize: number;
  textColor: string;
  labelBg: string | null;
}

// ----------------------------------------------------------------------------
// Connection anchors
// ----------------------------------------------------------------------------

/**
 * A connection point on a node. Either a named compass anchor, a fractional
 * position along a side ("top:0.3"), or an explicit angle. Resolved to a world
 * point by the anchor resolver — see scene/anchors.ts.
 */
export type AnchorName =
  | "c"
  | "center"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | (string & {}); // "top:0.3", "angle:45", or plugin-registered

export interface EndpointRef {
  /** Node id to attach to, or null for a free/world point. */
  node: string | null;
  /** Anchor on the node (ignored for free points). Undefined = auto. */
  anchor?: AnchorName;
  /** Free world point (used when node is null). */
  point?: Point;
}

// ----------------------------------------------------------------------------
// Elements
// ----------------------------------------------------------------------------

export interface SceneNode {
  id: string;
  shape: ShapeKind;
  /** World-space top-left + size. Set by layout or explicitly. */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: NodeStyle;
  /** Group id this node belongs to (for containers/frames). */
  group?: string;
  /** z-order; higher draws on top. */
  z: number;
  /** Layout hint: explicit position pins the node (manual placement). */
  pinned?: boolean;
  /** Arbitrary plugin/importer data (e.g. mermaid subtype). */
  data?: Record<string, unknown>;
}

export interface SceneEdge {
  id: string;
  from: EndpointRef;
  to: EndpointRef;
  label: string;
  style: EdgeStyle;
  routing: EdgeRouting;
  /** Computed polyline in world space (filled by router/layout). */
  points?: Point[];
  z: number;
  data?: Record<string, unknown>;
}

export interface SceneGroup {
  id: string;
  label: string;
  /** Member node ids. */
  members: string[];
  style: Partial<NodeStyle>;
  /** If true, draws a container frame around members. */
  frame: boolean;
}

// ----------------------------------------------------------------------------
// Annotations (scripted + real-time share this model — see annotate/*)
// ----------------------------------------------------------------------------

export type AnnotationKind =
  | "highlight"
  | "underline"
  | "point-at"
  | "spotlight"
  | "box-around"
  | "circle-around"
  | "strike"
  | "connector"
  | "callout"
  | "ink"
  | (string & {});

/** How an annotation anchors so it tracks its target under camera/layout moves. */
export interface AnnotationTarget {
  /** Target a node/edge/group by id, or null for absolute world placement. */
  ref: string | null;
  /** Optional sub-target: "label" | "border" | anchor name. */
  part?: string;
  /** Absolute world point/rect for ref-less annotations. */
  point?: Point;
  rect?: { x: number; y: number; w: number; h: number };
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  target: AnnotationTarget;
  /** Secondary target for connectors/point-at (the "from" side). */
  target2?: AnnotationTarget;
  text?: string;
  color: string;
  /** Free-form per-kind options (thickness, padding, curve, etc.). */
  options: Record<string, unknown>;
  z: number;
  /** Whether this annotation was authored in code (scripted) or live (user). */
  origin: "script" | "live";
}

// ----------------------------------------------------------------------------
// Timeline (magic-move presentation)
// ----------------------------------------------------------------------------

export type EasingName =
  | "linear"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "back-out"
  | "anticipate"
  | "spring";

export interface CameraDirective {
  /** Camera operation for this step. */
  op: "fit-all" | "focus" | "focus-group" | "zoom" | "pan" | "reset" | "none";
  /** Target node/group ids for focus ops. */
  targets?: string[];
  zoom?: number;
  /** Padding around focus target in screen px. */
  padding?: number;
  /** Absolute pan center (world). */
  center?: Point;
  easing?: EasingName;
  durationMs?: number;
}

export interface Step {
  id: string;
  name: string;
  camera?: CameraDirective;
  /** Annotations revealed during this step (ids reference scene.annotations,
   *  or inline annotations owned by the step). */
  annotations: Annotation[];
  /** Node/edge ids to reveal (fade/draw-in) at this step; empty = all visible. */
  reveal?: string[];
  /** Per-beat reveal animation: element id -> effect ("fade" | "pop" | "sweep").
   *  Set when a `reveal … with <effect>` (or an effect-verb) names targets;
   *  the player replays it each time the beat is entered. */
  revealFx?: Record<string, string>;
  /** Node/edge ids to hide during this step. */
  hide?: string[];
  /** Narration / caption shown for the step. */
  caption?: string;
  /** Auto-advance after N ms (0/undefined = wait for user). */
  autoAdvanceMs?: number;
}

// ----------------------------------------------------------------------------
// Theme + Scene
// ----------------------------------------------------------------------------

export interface Theme {
  name: string;
  background: string;
  defaultStroke: string;
  defaultText: string;
  gridColor: string;
  /** Named color palette resolved by the DSL (e.g. "green" -> stroke/fill). */
  mode: "light" | "dark";
}

export interface SceneMeta {
  title?: string;
  layout: LayoutKind;
  /** Layout tuning (rank/node separation). */
  spacing?: { rank?: number; node?: number };
  /** Author-declared canvas hints. */
  background?: string;
}

/** A machine-managed position/size override (from the `overrides { … }` block).
 *  Applied before layout so the node is pinned at these coords — this is what
 *  direct canvas edits (drag/resize) write back to code. */
export interface NodeOverride {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface Scene {
  id: string;
  theme: Theme;
  meta: SceneMeta;
  nodes: SceneNode[];
  edges: SceneEdge[];
  groups: SceneGroup[];
  /** Baseline annotations always present (step annotations layer on top). */
  annotations: Annotation[];
  steps: Step[];
  /** Position/size overrides applied before layout (direct-edit round-trip). */
  overrides?: NodeOverride[];
}
