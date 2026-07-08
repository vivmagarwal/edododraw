/**
 * Read-only queries over a Scene: element lookup and bounding boxes in world
 * space. Used by the camera (fit/focus), layout, and annotation anchoring.
 */

import type { BBox, Rect } from "../geometry.js";
import { bboxOfPoints, bboxUnion, emptyBBox, rectToBBox } from "../geometry.js";
import { nodeRect } from "./anchors.js";
import type { Scene, SceneEdge, SceneGroup, SceneNode } from "./types.js";

export function getNode(scene: Scene, id: string): SceneNode | undefined {
  return scene.nodes.find((n) => n.id === id);
}

export function getEdge(scene: Scene, id: string): SceneEdge | undefined {
  return scene.edges.find((e) => e.id === id);
}

export function getGroup(scene: Scene, id: string): SceneGroup | undefined {
  return scene.groups.find((g) => g.id === id);
}

export function nodeBBox(n: SceneNode): BBox {
  return rectToBBox(nodeRect(n));
}

export function edgeBBox(e: SceneEdge): BBox {
  if (e.points && e.points.length) return bboxOfPoints(e.points);
  return emptyBBox();
}

export function groupBBox(scene: Scene, g: SceneGroup): BBox {
  let b = emptyBBox();
  for (const id of g.members) {
    const n = getNode(scene, id);
    if (n) b = bboxUnion(b, nodeBBox(n));
  }
  return b;
}

/** Resolve any element id (node/group; edges included if routed) to a bbox. */
export function elementBBox(scene: Scene, id: string): BBox | undefined {
  const n = getNode(scene, id);
  if (n) return nodeBBox(n);
  const g = getGroup(scene, id);
  if (g) return groupBBox(scene, g);
  const e = getEdge(scene, id);
  if (e) {
    const b = edgeBBox(e);
    return Number.isFinite(b.minX) ? b : undefined;
  }
  return undefined;
}

/** Union bbox of several element ids. */
export function elementsBBox(scene: Scene, ids: string[]): BBox {
  let b = emptyBBox();
  for (const id of ids) {
    const eb = elementBBox(scene, id);
    if (eb) b = bboxUnion(b, eb);
  }
  return b;
}

/** BBox covering every node (and routed edge) in the scene. */
export function sceneBBox(scene: Scene): BBox {
  let b = emptyBBox();
  for (const n of scene.nodes) b = bboxUnion(b, nodeBBox(n));
  for (const e of scene.edges) {
    const eb = edgeBBox(e);
    if (Number.isFinite(eb.minX)) b = bboxUnion(b, eb);
  }
  return b;
}

export function nodeRectOf(n: SceneNode): Rect {
  return nodeRect(n);
}

/** Topmost node whose bounding box contains the given world point, or null. */
export function hitTestNode(scene: Scene, p: { x: number; y: number }): SceneNode | null {
  let best: SceneNode | null = null;
  for (const n of scene.nodes) {
    if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) {
      if (!best || n.z >= best.z) best = n;
    }
  }
  return best;
}
