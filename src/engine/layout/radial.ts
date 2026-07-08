/**
 * Radial layout — a hub node at the world origin with the remaining nodes
 * distributed evenly around a circle.
 *
 * The hub is either the node whose id matches the requested `centerId`, or the
 * first node when no match is found. Ring radius = max(radiusFloor, n * 40),
 * which grows the circle as the node count rises so labels stay legible.
 */

import type { SceneNode } from "../scene/types.js";

/**
 * Place `nodes` radially, mutating each node's top-left x/y in place.
 *
 * @param nodes       nodes to arrange (hub + ring)
 * @param centerId    preferred hub node id; falls back to the first node
 * @param radiusFloor minimum ring radius in world px
 */
export function layoutRadial(
  nodes: SceneNode[],
  centerId: string | undefined,
  radiusFloor = 220,
): void {
  const n = nodes.length;
  if (n === 0) return;

  // Pick the hub: an explicit id match wins, otherwise the first node.
  let hubIdx = 0;
  if (centerId !== undefined) {
    const idx = nodes.findIndex((node) => node.id === centerId);
    if (idx >= 0) hubIdx = idx;
  }

  // Centre the hub on the origin (top-left = centre - half-size).
  const hub = nodes[hubIdx];
  hub.x = -hub.w / 2;
  hub.y = -hub.h / 2;

  const ring = nodes.filter((_, i) => i !== hubIdx);
  const count = ring.length;
  if (count === 0) return;

  const radius = Math.max(radiusFloor, n * 40);
  for (let k = 0; k < count; k++) {
    const angle = (2 * Math.PI * k) / count;
    const cx = Math.cos(angle) * radius;
    const cy = Math.sin(angle) * radius;
    ring[k].x = cx - ring[k].w / 2;
    ring[k].y = cy - ring[k].h / 2;
  }
}
