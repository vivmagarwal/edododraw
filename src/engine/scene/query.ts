/**
 * Read-only queries over a Scene: element lookup and bounding boxes in world
 * space. Used by the camera (fit/focus), layout, and annotation anchoring.
 */

import type { BBox, Point, Rect } from "../geometry.js";
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

/**
 * Element ids emitted for the viz data item `key` ("<blockId>.<itemId>").
 * Viz generators tag every element they emit for an item with
 * `data.vizItem = key`, so one data entry can be addressed as a unit.
 */
export function vizItemMembers(scene: Scene, key: string): string[] {
  const out: string[] = [];
  for (const n of scene.nodes) if ((n.data as { vizItem?: string } | undefined)?.vizItem === key) out.push(n.id);
  for (const e of scene.edges) if ((e.data as { vizItem?: string } | undefined)?.vizItem === key) out.push(e.id);
  return out;
}

/** Every distinct viz-item key ("<blockId>.<itemId>") present in the scene. */
export function listVizItems(scene: Scene): string[] {
  const keys = new Set<string>();
  for (const n of scene.nodes) {
    const k = (n.data as { vizItem?: string } | undefined)?.vizItem;
    if (k) keys.add(k);
  }
  for (const e of scene.edges) {
    const k = (e.data as { vizItem?: string } | undefined)?.vizItem;
    if (k) keys.add(k);
  }
  return [...keys];
}

/** Resolve any element id (node/group; edges included if routed; viz-item
 *  keys resolve to the union of their members) to a bbox. */
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
  const members = vizItemMembers(scene, id);
  if (members.length) {
    let b = emptyBBox();
    for (const m of members) {
      const mb = elementBBox(scene, m);
      if (mb) b = bboxUnion(b, mb);
    }
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

/** Distance from a point to a segment [a,b]. */
function distToSegment(p: { x: number; y: number }, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Nearest routed edge within `tol` world units of the point, or null. */
export function hitTestEdge(scene: Scene, p: { x: number; y: number }, tol: number): SceneEdge | null {
  let best: SceneEdge | null = null;
  let bestD = tol;
  for (const e of scene.edges) {
    const pts = e.points;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment(p, pts[i], pts[i + 1]);
      if (d <= bestD) {
        bestD = d;
        best = e;
      }
    }
  }
  return best;
}
