/**
 * Auto-layout — assigns world positions to a Scene's nodes.
 *
 * `applyLayout(scene)` reads `scene.meta.layout` and mutates each non-pinned
 * node's top-left `x`/`y` in place. Supported modes:
 *
 *   - "dag" / "dag-lr" / "dag-rl" / "dag-bt" — layered graph layout via dagre
 *   - "grid"   — uniform square grid, row-major
 *   - "radial" — hub node at origin, the rest on a circle
 *   - "manual" — no-op (author already positioned everything)
 *
 * Cross-cutting rules:
 *   - Any node with `pinned === true` is a fixed obstacle: it is excluded from
 *     every auto-layout mode and its coordinates are never changed.
 *   - The function never throws. If dagre fails (or a graph is empty/degenerate)
 *     it falls back to grid; an empty scene is a no-op.
 *   - After arranging, the laid-out nodes are shifted so their bounding box
 *     starts at a small positive margin (~40,40). Pinned nodes anchor an
 *     absolute frame and are not shifted; when nothing is pinned this is
 *     exactly "translate the whole diagram".
 *
 * The public surface is `applyLayout`; per-mode maths lives in dag/grid/radial.
 */

import type { LayoutKind, Scene, SceneNode } from "../scene/types.js";
import { layoutDag, type DagOptions, type RankDir } from "./dag.js";
import { layoutGrid } from "./grid.js";
import { layoutRadial } from "./radial.js";

// ----------------------------------------------------------------------------
// Tunable defaults
// ----------------------------------------------------------------------------

const DEFAULT_NODESEP = 60; // dagre same-rank separation
const DEFAULT_RANKSEP = 90; // dagre inter-rank separation
const DAG_MARGIN = 20; // dagre graph margin
const DEFAULT_GRID_GAP = 40; // gap between grid cells
const RADIAL_RADIUS_FLOOR = 220; // minimum radial ring radius
const NORMALIZE_MARGIN = 40; // final min-corner offset

/** Optional direction hint carried on meta (not part of the typed surface). */
type DirectionHint = "down" | "up" | "left" | "right" | "TB" | "BT" | "LR" | "RL";

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Assign positions to `scene.nodes` according to `scene.meta.layout`.
 * Mutates node `x`/`y` (top-left, world space) in place. Never throws.
 */
export function applyLayout(scene: Scene): void {
  // Manual layout: positions are authored — never touch a thing.
  if (scene.meta.layout === "manual") return;

  // Pinned nodes are fixed obstacles: excluded from every auto-layout mode.
  const movable = scene.nodes.filter((n) => n.pinned !== true);
  if (movable.length === 0) return; // empty scene, or everything is pinned

  runLayout(scene, movable);

  // Normalise the just-arranged nodes to a small positive margin. Pinned nodes
  // are left untouched; with no pins, `movable` is every node so this shifts
  // the whole diagram — matching the "bbox min ≈ (40,40)" contract.
  const { dx, dy } = normalizeMargin(movable, NORMALIZE_MARGIN);

  // Any dagre-routed edge waypoints share the movable frame — shift them too.
  if (dx !== 0 || dy !== 0) {
    for (const e of scene.edges) {
      if (e.points) e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
  }
}

// ----------------------------------------------------------------------------
// Mode dispatch (with grid fallback)
// ----------------------------------------------------------------------------

function runLayout(scene: Scene, movable: SceneNode[]): void {
  const kind = scene.meta.layout;
  try {
    switch (kind) {
      case "dag":
      case "dag-lr":
      case "dag-rl":
      case "dag-bt":
        layoutDag(scene, movable, dagOptions(scene, kind));
        return;
      case "grid":
        layoutGrid(movable, gridGap(scene));
        return;
      case "radial":
        layoutRadial(movable, readCenterId(scene), RADIAL_RADIUS_FLOOR);
        return;
      default:
        // Forward-compat / unknown kind → grid.
        layoutGrid(movable, gridGap(scene));
        return;
    }
  } catch {
    // Never throw: any failure (dagre error, degenerate graph, …) → grid.
    try {
      layoutGrid(movable, gridGap(scene));
    } catch {
      /* Give up silently and keep whatever coordinates already exist. */
    }
  }
}

// ----------------------------------------------------------------------------
// Option resolution
// ----------------------------------------------------------------------------

function dagOptions(scene: Scene, kind: LayoutKind): DagOptions {
  return {
    rankdir: resolveRankdir(scene, kind),
    nodesep: scene.meta.spacing?.node ?? DEFAULT_NODESEP,
    ranksep: scene.meta.spacing?.rank ?? DEFAULT_RANKSEP,
    margin: DAG_MARGIN,
  };
}

/** Base rank direction from the layout kind, overridden by any direction hint. */
function resolveRankdir(scene: Scene, kind: LayoutKind): RankDir {
  const hinted = directionToRankdir(readDirection(scene));
  if (hinted) return hinted;
  switch (kind) {
    case "dag-lr":
      return "LR";
    case "dag-rl":
      return "RL";
    case "dag-bt":
      return "BT";
    default:
      return "TB"; // "dag" and any non-dag kind that reaches here
  }
}

function directionToRankdir(dir: DirectionHint | undefined): RankDir | undefined {
  switch (dir) {
    case "down":
    case "TB":
      return "TB";
    case "up":
    case "BT":
      return "BT";
    case "left":
    case "RL":
      return "RL";
    case "right":
    case "LR":
      return "LR";
    default:
      return undefined;
  }
}

function gridGap(scene: Scene): number {
  return scene.meta.spacing?.node ?? DEFAULT_GRID_GAP;
}

// ----------------------------------------------------------------------------
// Optional meta hints — the only untyped reads in this module.
// `SceneMeta` does not declare `direction`/`center`, but importers/DSL may set
// them, so we read them defensively through a narrow cast and validate.
// ----------------------------------------------------------------------------

function readDirection(scene: Scene): DirectionHint | undefined {
  const raw = (scene.meta as { direction?: unknown }).direction;
  if (typeof raw !== "string") return undefined;
  switch (raw) {
    case "down":
    case "up":
    case "left":
    case "right":
    case "TB":
    case "BT":
    case "LR":
    case "RL":
      return raw;
    default:
      return undefined;
  }
}

function readCenterId(scene: Scene): string | undefined {
  const raw = (scene.meta as { center?: unknown }).center;
  return typeof raw === "string" ? raw : undefined;
}

// ----------------------------------------------------------------------------
// Normalisation
// ----------------------------------------------------------------------------

/**
 * Translate `nodes` so their bounding-box min corner sits at (margin, margin).
 * The min corner is simply the min of top-left x and y across the nodes.
 */
function normalizeMargin(nodes: SceneNode[], margin: number): { dx: number; dy: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { dx: 0, dy: 0 };

  const dx = margin - minX;
  const dy = margin - minY;
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };

  for (const n of nodes) {
    n.x += dx;
    n.y += dy;
  }
  return { dx, dy };
}
