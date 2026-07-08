/**
 * Directed-acyclic (layered) layout via dagre.
 *
 * dagre works in CENTRE coordinates; the Scene IR stores TOP-LEFT, so read-back
 * subtracts half the node size. Scene groups become dagre compound clusters so
 * that grouped members are kept adjacent in the final layering.
 */

import dagre from "@dagrejs/dagre";

import type { Scene, SceneNode } from "../scene/types.js";

export type RankDir = "TB" | "BT" | "LR" | "RL";

export interface DagOptions {
  /** dagre rank direction. */
  rankdir: RankDir;
  /** Separation between nodes in the same rank (px). */
  nodesep: number;
  /** Separation between ranks (px). */
  ranksep: number;
  /** Graph margin on both axes (px). */
  margin: number;
}

/**
 * Lay out the given `movable` nodes with dagre and write their top-left x/y.
 *
 * Only nodes in `movable` are fed to the graph (pinned nodes are excluded by
 * the caller). Edges are included only when both endpoints are real nodes that
 * are present in the graph. Throws if dagre returns a non-finite position so
 * the caller can fall back to another layout.
 */
export function layoutDag(scene: Scene, movable: SceneNode[], opts: DagOptions): void {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: opts.rankdir,
    nodesep: opts.nodesep,
    ranksep: opts.ranksep,
    marginx: opts.margin,
    marginy: opts.margin,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Feed every layout-eligible node with its real size.
  const inGraph = new Set<string>();
  for (const n of movable) {
    g.setNode(n.id, { width: n.w, height: n.h });
    inGraph.add(n.id);
  }

  // Group clustering: one compound cluster per group keeps members together.
  // Skip groups whose members are all pinned/absent, and never let a cluster id
  // collide with a real node id.
  for (const grp of scene.groups) {
    if (inGraph.has(grp.id)) continue;
    const members = grp.members.filter((id) => inGraph.has(id));
    if (members.length === 0) continue;
    g.setNode(grp.id, {});
    for (const id of members) g.setParent(id, grp.id);
  }

  // Feed edges whose endpoints are both present, non-null node ids in the graph.
  for (const e of scene.edges) {
    const from = e.from.node;
    const to = e.to.node;
    if (from == null || to == null) continue;
    if (!inGraph.has(from) || !inGraph.has(to)) continue;
    g.setEdge(from, to);
  }

  dagre.layout(g);

  // Convert dagre CENTRE coordinates back to Scene TOP-LEFT coordinates.
  for (const n of movable) {
    const gn = g.node(n.id);
    if (!gn || !Number.isFinite(gn.x) || !Number.isFinite(gn.y)) {
      throw new Error(`dagre produced no finite position for node "${n.id}"`);
    }
    n.x = gn.x - n.w / 2;
    n.y = gn.y - n.h / 2;
  }

  // Capture dagre's routed waypoints per edge (world coords, same frame as node
  // centres) so the renderer can dodge nodes in dense graphs. A per-edge copy
  // avoids shared references (parallel edges) being translated twice later.
  for (const e of scene.edges) {
    const from = e.from.node;
    const to = e.to.node;
    if (from == null || to == null || !inGraph.has(from) || !inGraph.has(to)) {
      e.points = undefined;
      continue;
    }
    const ge = g.edge(from, to) as { points?: Array<{ x: number; y: number }> } | undefined;
    e.points = ge?.points && ge.points.length >= 2 ? ge.points.map((p) => ({ x: p.x, y: p.y })) : undefined;
  }
}
