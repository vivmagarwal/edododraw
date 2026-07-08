/**
 * Apply position/size overrides to a scene. Overrides come from the DSL
 * `overrides { … }` block (what direct canvas edits write back to). Applied
 * before layout so overridden nodes are pinned at their coordinates and the
 * auto-layout arranges everything else around them. Idempotent — safe to call
 * again after Mermaid injection so imported nodes can be overridden too.
 */

import type { Scene } from "./types.js";

export function applyOverrides(scene: Scene): void {
  if (!scene.overrides || !scene.overrides.length) return;
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  for (const o of scene.overrides) {
    const n = byId.get(o.id);
    if (!n) continue;
    n.x = o.x;
    n.y = o.y;
    if (o.w != null && o.w > 0) n.w = o.w;
    if (o.h != null && o.h > 0) n.h = o.h;
    n.pinned = true;
  }
}
