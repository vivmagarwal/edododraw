/**
 * Plugin registries — the extension seams that make EDodoDraw "much more
 * extendible than Excalidraw". A plugin registers a named renderer for a shape
 * (or, later, an arrow animation / annotation kind) and it becomes usable from
 * the DSL immediately (`shape: myshape` or the keyword), with no grammar change.
 *
 * The Scene IR types are open unions, so the compiler already accepts unknown
 * names; the renderer resolves them here.
 */

import type rough from "roughjs";
import type { NodeStyle, ShapeKind } from "../scene/types.js";
import type { ShapeRect } from "../render/shapes.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

export type ShapePluginFn = (rc: RoughSVG, rect: ShapeRect, style: NodeStyle) => SVGGElement;

const shapePlugins = new Map<string, ShapePluginFn>();

export function registerShape(name: string, fn: ShapePluginFn): void {
  shapePlugins.set(name, fn);
}

export function getShapePlugin(name: ShapeKind): ShapePluginFn | undefined {
  return shapePlugins.get(name);
}

export function listShapePlugins(): string[] {
  return [...shapePlugins.keys()];
}
