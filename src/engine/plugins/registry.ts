/**
 * Plugin registries — the extension seams that make EDodoDraw "much more
 * extendible than Excalidraw". A plugin registers a named renderer for a
 * shape, an arrow animation, an annotation kind, or a layout, and it becomes
 * usable from the DSL immediately (`shape: myshape`, `animate: surge`,
 * `surge a "text"`, `layout ring`) — no grammar change, no engine fork.
 *
 * The Scene IR types are open unions, so the compiler already accepts unknown
 * names; the renderer/DSL resolve them here. Everything in this module is
 * DOM-free at import time (DOM types are erased), so the synchronous compiler
 * can consult the registries in Node.
 */

import type rough from "roughjs";
import type { BBox } from "../geometry.js";
import type { Annotation, NodeStyle, Scene, SceneEdge, SceneNode, ShapeKind } from "../scene/types.js";
import type { ShapeRect } from "../render/shapes.js";

type RoughSVG = ReturnType<(typeof rough)["svg"]>;

// ----------------------------------------------------------------------------
// Shapes
// ----------------------------------------------------------------------------

export type ShapePluginFn = (rc: RoughSVG, rect: ShapeRect, style: NodeStyle, data?: Record<string, unknown>) => SVGGElement;

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

// ----------------------------------------------------------------------------
// Arrow animations
// ----------------------------------------------------------------------------

export interface ArrowAnimationInfo {
  /** Centerline path length (world units). Also on the path as `--edd-len`. */
  length: number;
  /** Author speed multiplier (`animation: kind { speed: N }`), default 1. */
  speed: number;
}

export interface ArrowAnimationDef {
  /**
   * CSS injected once per document (keyframes + rules). Class the overlay
   * carries is `edd-anim edd-anim-<kind>` — target `.edd-anim-<kind>`.
   * Reduced-motion and static mode are handled for you (`.edd-anim` blanket).
   */
  css?: string;
  /** Style the clean overlay path (stroke, dash pattern, animationDuration). */
  apply: (path: SVGPathElement, edge: SceneEdge, info: ArrowAnimationInfo) => void;
}

const arrowAnimations = new Map<string, ArrowAnimationDef>();
let pluginCssVersion = 0;

export function registerArrowAnimation(kind: string, def: ArrowAnimationDef): void {
  arrowAnimations.set(kind, def);
  if (def.css) pluginCssVersion++;
}

export function getArrowAnimation(kind: string): ArrowAnimationDef | undefined {
  return arrowAnimations.get(kind);
}

export function listArrowAnimations(): string[] {
  return [...arrowAnimations.keys()];
}

/**
 * Inject/refresh the CSS contributed by registered arrow animations into a
 * document. Cheap and idempotent (version-guarded); the renderer calls it on
 * every render so plugins registered after mount still get their keyframes.
 */
export function ensurePluginStyles(doc: Document): void {
  const id = "edd-plugin-styles";
  let style = doc.getElementById(id) as HTMLStyleElement | null;
  if (style && Number(style.dataset.version) === pluginCssVersion) return;
  if (!style) {
    style = doc.createElement("style");
    style.id = id;
    doc.head.appendChild(style);
  }
  style.dataset.version = String(pluginCssVersion);
  style.textContent = [...arrowAnimations.values()].map((d) => d.css ?? "").join("\n");
}

// ----------------------------------------------------------------------------
// Annotation kinds
// ----------------------------------------------------------------------------

export interface AnnotationDrawCtx {
  scene: Scene;
  /** rough.js canvas — draw hand-drawn marks with a stable `seed`. */
  rc: RoughSVG;
  /** Append your SVG elements here (world space; tracks camera + target). */
  g: SVGGElement;
  /** Resolved world bbox of the annotation's target (null = no target). */
  box: BBox | null;
  /** Resolve any element id / group / viz-item key to a world bbox. */
  resolveBBox: (id: string) => BBox | undefined;
  /** Hand-drawn-font text helper, same as the built-in kinds use. */
  label: (text: string, at: { x: number; y: number }, color: string, anchor?: "start" | "middle" | "end", size?: number) => void;
}

export type AnnotationPluginFn = (an: Annotation, ctx: AnnotationDrawCtx) => void;

const annotationPlugins = new Map<string, AnnotationPluginFn>();

export function registerAnnotation(kind: string, fn: AnnotationPluginFn): void {
  annotationPlugins.set(kind, fn);
}

export function getAnnotationPlugin(kind: string): AnnotationPluginFn | undefined {
  return annotationPlugins.get(kind);
}

export function listAnnotationPlugins(): string[] {
  return [...annotationPlugins.keys()];
}

// ----------------------------------------------------------------------------
// Layouts
// ----------------------------------------------------------------------------

/**
 * Position `movable` (the scene's non-pinned nodes) by mutating each node's
 * top-left x/y in place. Runs inside applyLayout's never-throw envelope; the
 * result is normalized to a small positive margin afterwards.
 */
export type LayoutPluginFn = (scene: Scene, movable: SceneNode[]) => void;

const layoutPlugins = new Map<string, LayoutPluginFn>();

export function registerLayout(name: string, fn: LayoutPluginFn): void {
  layoutPlugins.set(name, fn);
}

export function getLayoutPlugin(name: string): LayoutPluginFn | undefined {
  return layoutPlugins.get(name);
}

export function listLayoutPlugins(): string[] {
  return [...layoutPlugins.keys()];
}
