/**
 * Grid layout — arrange nodes on a uniform square grid, row-major.
 *
 * Columns = ceil(sqrt(n)). The cell is a square sized to the largest single
 * node dimension (width OR height) plus the gap, so neighbouring cells can
 * never overlap regardless of how the nodes are shaped. Each node is centred
 * inside its cell, which keeps mixed-size grids visually aligned.
 */

import type { SceneNode } from "../scene/types.js";

/** Lay `nodes` out on a grid, mutating each node's top-left x/y in place. */
export function layoutGrid(nodes: SceneNode[], gap: number): void {
  const n = nodes.length;
  if (n === 0) return;

  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));

  // Largest node extent in either axis → uniform square cell size.
  let maxDim = 0;
  for (const node of nodes) {
    if (node.w > maxDim) maxDim = node.w;
    if (node.h > maxDim) maxDim = node.h;
  }
  const cell = maxDim + gap;

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Centre the node within its cell so rows/columns line up.
    node.x = col * cell + (cell - node.w) / 2;
    node.y = row * cell + (cell - node.h) / 2;
  }
}
