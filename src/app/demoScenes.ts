/**
 * Hand-built demo scenes used to exercise the renderer before the DSL exists
 * (M1) and as fallbacks / gallery examples later.
 */

import {
  makeEdge,
  makeNode,
  emptyScene,
  FILL_PALETTE,
  STROKE_PALETTE,
  type Scene,
} from "@engine/index.js";

function fill(name: keyof typeof FILL_PALETTE) {
  return {
    fill: FILL_PALETTE[name],
    stroke: (STROKE_PALETTE as Record<string, string>)[name] ?? STROKE_PALETTE.black,
  };
}

/** A web-app architecture diagram touching most shapes/arrows/animations. */
export function architectureDemo(): Scene {
  const s = emptyScene();
  s.meta.title = "Web App Architecture";
  s.meta.layout = "manual";

  s.nodes = [
    makeNode({ id: "browser", shape: "actor", label: "User", x: 60, y: 70, w: 90, h: 130 }),
    makeNode({ id: "cdn", shape: "cloud", label: "CDN", x: 250, y: 70, w: 160, h: 110 }),
    makeNode({ id: "lb", shape: "hexagon", label: "Load\nBalancer", x: 500, y: 70, w: 170, h: 100, style: fill("violet") }),
    makeNode({ id: "web", shape: "rectangle", label: "Web Server", x: 505, y: 240, w: 160, h: 74, style: fill("blue") }),
    makeNode({ id: "api", shape: "round-rectangle", label: "API Service", x: 505, y: 380, w: 160, h: 74, style: { ...fill("green"), roundness: 16 } }),
    makeNode({ id: "auth", shape: "diamond", label: "Auth?", x: 760, y: 360, w: 150, h: 110, style: fill("yellow") }),
    makeNode({ id: "cache", shape: "cylinder", label: "Cache", x: 270, y: 380, w: 150, h: 120, style: fill("red") }),
    makeNode({ id: "db", shape: "cylinder", label: "Database", x: 500, y: 520, w: 170, h: 130, style: fill("teal") }),
    makeNode({ id: "queue", shape: "parallelogram", label: "Job Queue", x: 760, y: 530, w: 180, h: 80, style: fill("orange") }),
    makeNode({ id: "note", shape: "note", label: "v2 rollout", x: 90, y: 300, w: 150, h: 90, style: fill("yellow") }),
  ];

  s.edges = [
    makeEdge({ id: "e1", from: "browser", to: "cdn", label: "assets" }),
    makeEdge({ id: "e2", from: "browser", to: "lb", label: "request", style: { animation: "flow", stroke: STROKE_PALETTE.blue } }),
    makeEdge({ id: "e3", from: "cdn", to: "lb" }),
    makeEdge({ id: "e4", from: "lb", to: "web" }),
    makeEdge({ id: "e5", from: "web", to: "api", label: "call", style: { endArrowhead: "triangle" } }),
    makeEdge({ id: "e6", from: "api", to: "auth", label: "verify", style: { strokeStyle: "dashed" } }),
    makeEdge({ id: "e7", from: "api", to: "db", label: "query", style: { endArrowhead: "triangle", stroke: STROKE_PALETTE.teal } }),
    makeEdge({ id: "e8", from: "api", to: "cache", label: "read/write", style: { animation: "comet", stroke: STROKE_PALETTE.red } }),
    makeEdge({ id: "e9", from: "api", to: "queue", label: "enqueue", style: { animation: "gradient-flow" } }),
  ];

  s.groups = [
    {
      id: "backend",
      label: "Backend",
      members: ["web", "api", "auth", "db", "queue"],
      style: { stroke: "#adb5bd" },
      frame: true,
    },
  ];

  return s;
}

/** A tiny flow to sanity-check basic straight edges + arrowheads. */
export function simpleFlow(): Scene {
  const s = emptyScene();
  s.meta.layout = "manual";
  s.nodes = [
    makeNode({ id: "a", shape: "ellipse", label: "Start", x: 100, y: 100, w: 120, h: 80, style: fill("green") }),
    makeNode({ id: "b", shape: "rectangle", label: "Do Work", x: 320, y: 100, w: 150, h: 80 }),
    makeNode({ id: "c", shape: "diamond", label: "OK?", x: 560, y: 90, w: 140, h: 100, style: fill("yellow") }),
    makeNode({ id: "d", shape: "ellipse", label: "End", x: 800, y: 100, w: 120, h: 80, style: fill("red") }),
  ];
  s.edges = [
    makeEdge({ id: "a1", from: "a", to: "b" }),
    makeEdge({ id: "a2", from: "b", to: "c" }),
    makeEdge({ id: "a3", from: "c", to: "d", label: "yes", style: { animation: "flow" } }),
    makeEdge({ id: "a4", from: "c", to: "b", label: "no", style: { strokeStyle: "dashed" }, routing: "curved" }),
  ];
  return s;
}

/** Shape gallery — one of every built-in shape. */
export function shapeGallery(): Scene {
  const s = emptyScene();
  s.meta.layout = "manual";
  const shapes = [
    "rectangle",
    "round-rectangle",
    "ellipse",
    "circle",
    "diamond",
    "triangle",
    "hexagon",
    "parallelogram",
    "trapezoid",
    "cylinder",
    "cloud",
    "document",
    "note",
    "actor",
    "pill",
  ] as const;
  const cols = 5;
  s.nodes = shapes.map((shape, i) =>
    makeNode({
      id: shape,
      shape,
      label: shape,
      x: 60 + (i % cols) * 200,
      y: 60 + Math.floor(i / cols) * 180,
      w: 150,
      h: 100,
      style: fill((["blue", "green", "yellow", "red", "violet"] as const)[i % 5]),
    }),
  );
  return s;
}
