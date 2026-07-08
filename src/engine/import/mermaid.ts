/**
 * Mermaid import — converts a mermaid diagram string into EDodoDraw Scene IR
 * fragments (nodes + edges) via @excalidraw/mermaid-to-excalidraw. Node ids are
 * preserved (mermaid ids like `grafana`), so the timeline/annotate layers can
 * reference imported elements directly.
 *
 * Runs in the browser only (mermaid renders to a hidden SVG). The pure DSL
 * compiler stays synchronous; the app awaits this and injects the result.
 */

import { makeEdge, makeNode } from "../scene/defaults.js";
import type { SceneEdge, SceneNode, ShapeKind } from "../scene/types.js";

// mermaid is heavy (it pulls in every diagram type + katex). It is lazy-loaded
// on first use so it never bloats the main bundle — only pages that actually
// contain a `mermaid` block pay for it.
type ParseFn = (def: string, config?: unknown) => Promise<{ elements: SkeletonElement[] }>;
let _parse: ParseFn | null = null;
async function loadParser(): Promise<ParseFn> {
  if (!_parse) {
    const mod = await import("@excalidraw/mermaid-to-excalidraw");
    _parse = mod.parseMermaidToExcalidraw as unknown as ParseFn;
  }
  return _parse;
}

interface SkeletonElement {
  id?: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  roundness?: unknown;
  label?: { text?: string | null };
  text?: string;
  start?: { id?: string };
  end?: { id?: string };
}

export interface MermaidFragment {
  nodes: SceneNode[];
  edges: SceneEdge[];
}

function shapeFor(el: SkeletonElement): ShapeKind {
  switch (el.type) {
    case "ellipse":
      return "ellipse";
    case "diamond":
      return "diamond";
    case "rectangle":
      return el.roundness ? "round-rectangle" : "rectangle";
    default:
      return "rectangle";
  }
}

/** Convert a mermaid definition into Scene IR fragments. */
export async function convertMermaid(definition: string, mode: "light" | "dark" = "light"): Promise<MermaidFragment> {
  const parse = await loadParser();
  const { elements } = await parse(definition, { themeVariables: { fontSize: "20px" } });

  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const nodeIds = new Set<string>();

  // First pass: container/vertex + standalone text elements -> nodes
  for (const el of elements) {
    if (el.type === "arrow" || el.type === "line") continue;
    if (el.type === "text" && !el.id) continue; // labels handled via container
    const id = el.id ?? `m_${nodes.length}`;
    if (nodeIds.has(id)) continue;
    const label = el.label?.text ?? el.text ?? "";
    const node = makeNode({
      id,
      shape: el.type === "text" ? "text" : shapeFor(el),
      label,
      x: el.x ?? 0,
      y: el.y ?? 0,
      w: el.width && el.width > 0 ? el.width : undefined,
      h: el.height && el.height > 0 ? el.height : undefined,
      pinned: true,
      mode,
      style: {
        ...(el.strokeColor ? { stroke: el.strokeColor } : {}),
        ...(el.backgroundColor && el.backgroundColor !== "transparent" ? { fill: el.backgroundColor } : {}),
      },
      data: { source: "mermaid" },
    });
    nodes.push(node);
    nodeIds.add(id);
  }

  // Second pass: arrows -> edges
  let seq = 0;
  for (const el of elements) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const from = el.start?.id;
    const to = el.end?.id;
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push(
      makeEdge({
        id: el.id ?? `me${seq++}_${from}_${to}`,
        from,
        to,
        label: el.label?.text ?? "",
        mode,
        style: {
          strokeStyle: el.strokeStyle === "dashed" ? "dashed" : "solid",
          strokeWidth: el.strokeWidth === 4 ? 2.6 : 1.4,
          endArrowhead: el.type === "line" ? "none" : "arrow",
        },
        data: { source: "mermaid" },
      }),
    );
  }

  // normalize so the fragment's min corner sits near the origin
  if (nodes.length) {
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    for (const n of nodes) {
      n.x -= minX - 40;
      n.y -= minY - 40;
    }
  }

  return { nodes, edges };
}

/**
 * Merge a mermaid fragment into a scene. If a node id already exists (e.g. a
 * `grafana:::signal` class-application placeholder), keep its cascaded style but
 * adopt the mermaid geometry/shape/label.
 */
export function injectMermaid(scene: import("../scene/types.js").Scene, frag: MermaidFragment): void {
  for (const n of frag.nodes) {
    const ex = scene.nodes.find((x) => x.id === n.id);
    if (ex) {
      ex.x = n.x;
      ex.y = n.y;
      ex.w = n.w;
      ex.h = n.h;
      ex.pinned = true;
      if (ex.shape === "rectangle") ex.shape = n.shape;
      if (!ex.label) ex.label = n.label;
    } else {
      scene.nodes.push(n);
    }
  }
  for (const e of frag.edges) {
    if (!scene.edges.some((x) => x.id === e.id)) scene.edges.push(e);
  }
}

/** Extract `mermaid """ … """` block bodies from EDodoDraw source. */
export function extractMermaidBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /mermaid\s*"""([\s\S]*?)"""/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    blocks.push(m[1].replace(/^\n/, ""));
  }
  return blocks;
}
