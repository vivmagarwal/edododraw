/**
 * Default styles, theme, and factory helpers for building Scene elements.
 * Factories assign deterministic rough seeds (hash of id) so re-rendering an
 * unchanged element never re-jitters its hand-drawn strokes.
 */

import { hashString } from "../geometry.js";
import { STROKE_PALETTE } from "./palette.js";
import type {
  EdgeStyle,
  NodeStyle,
  Scene,
  SceneEdge,
  SceneNode,
  ShapeKind,
  Theme,
} from "./types.js";

export const LIGHT_THEME: Theme = {
  name: "excalidraw-light",
  background: "#ffffff",
  defaultStroke: STROKE_PALETTE.black,
  defaultText: STROKE_PALETTE.black,
  gridColor: "#eceff3",
  mode: "light",
};

export const DARK_THEME: Theme = {
  name: "excalidraw-dark",
  background: "#121212",
  defaultStroke: "#e3e3e3",
  defaultText: "#e3e3e3",
  gridColor: "#22262c",
  mode: "dark",
};

export function defaultNodeStyle(seed: number, mode: "light" | "dark" = "light"): NodeStyle {
  return {
    stroke: mode === "dark" ? "#e3e3e3" : STROKE_PALETTE.black,
    fill: null,
    fillStyle: "hachure",
    strokeWidth: 1.4,
    strokeStyle: "solid",
    roughness: 1.1,
    roundness: null,
    fontFamily: "hand",
    fontSize: 20,
    textColor: mode === "dark" ? "#e3e3e3" : STROKE_PALETTE.black,
    textAlign: "center",
    verticalAlign: "middle",
    opacity: 100,
    seed,
  };
}

export function defaultEdgeStyle(seed: number, mode: "light" | "dark" = "light"): EdgeStyle {
  return {
    stroke: mode === "dark" ? "#e3e3e3" : STROKE_PALETTE.black,
    strokeWidth: 1.4,
    strokeStyle: "solid",
    roughness: 1.1,
    startArrowhead: "none",
    endArrowhead: "arrow",
    animation: "none",
    animationSpeed: 1,
    opacity: 100,
    seed,
    fontFamily: "hand",
    fontSize: 16,
    textColor: mode === "dark" ? "#e3e3e3" : STROKE_PALETTE.black,
    labelBg: mode === "dark" ? "#121212" : "#ffffff",
  };
}

/** Default box size for a node given its label (rough auto-size fallback). */
export function defaultNodeSize(shape: ShapeKind, label: string): { w: number; h: number } {
  const lines = label ? label.split("\n") : [""];
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const baseW = Math.max(90, longest * 11 + 40);
  const baseH = Math.max(52, lines.length * 26 + 24);
  switch (shape) {
    case "circle":
      return { w: Math.max(baseW, baseH), h: Math.max(baseW, baseH) };
    case "diamond":
      return { w: baseW * 1.3, h: baseH * 1.3 };
    case "ellipse":
      return { w: baseW * 1.15, h: baseH * 1.15 };
    case "cylinder":
      return { w: baseW, h: baseH * 1.25 };
    case "hexagon":
    case "parallelogram":
    case "trapezoid":
      return { w: baseW * 1.2, h: baseH };
    case "text":
      return { w: baseW, h: baseH * 0.8 };
    default:
      return { w: baseW, h: baseH };
  }
}

export interface MakeNodeInput {
  id: string;
  shape?: ShapeKind;
  label?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  style?: Partial<NodeStyle>;
  group?: string;
  z?: number;
  pinned?: boolean;
  data?: Record<string, unknown>;
  mode?: "light" | "dark";
}

export function makeNode(input: MakeNodeInput): SceneNode {
  const shape = input.shape ?? "rectangle";
  const label = input.label ?? "";
  const seed = (hashString(input.id) % 2_000_000) + 1;
  const size =
    input.w != null && input.h != null
      ? { w: input.w, h: input.h }
      : defaultNodeSize(shape, label);
  return {
    id: input.id,
    shape,
    label,
    x: input.x ?? 0,
    y: input.y ?? 0,
    w: input.w ?? size.w,
    h: input.h ?? size.h,
    style: { ...defaultNodeStyle(seed, input.mode), ...input.style, seed },
    group: input.group,
    z: input.z ?? 0,
    pinned: input.pinned ?? (input.x != null && input.y != null),
    data: input.data,
  };
}

export interface MakeEdgeInput {
  id: string;
  from: string;
  to: string;
  fromAnchor?: string;
  toAnchor?: string;
  label?: string;
  style?: Partial<EdgeStyle>;
  routing?: SceneEdge["routing"];
  z?: number;
  data?: Record<string, unknown>;
  mode?: "light" | "dark";
}

export function makeEdge(input: MakeEdgeInput): SceneEdge {
  const seed = (hashString(input.id) % 2_000_000) + 1;
  return {
    id: input.id,
    from: { node: input.from, anchor: input.fromAnchor },
    to: { node: input.to, anchor: input.toAnchor },
    label: input.label ?? "",
    style: { ...defaultEdgeStyle(seed, input.mode), ...input.style, seed },
    routing: input.routing ?? "straight",
    z: input.z ?? 0,
    data: input.data,
  };
}

export function emptyScene(mode: "light" | "dark" = "light"): Scene {
  return {
    id: "scene",
    theme: mode === "dark" ? DARK_THEME : LIGHT_THEME,
    meta: { layout: "dag" },
    nodes: [],
    edges: [],
    groups: [],
    annotations: [],
    steps: [],
  };
}
