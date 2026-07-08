/**
 * Public engine barrel. The app (and any embedder) imports from here.
 */

// register built-in plugin shapes (side-effect import)
import "./plugins/builtins.js";

export * from "./geometry.js";
export * from "./scene/types.js";
export * from "./scene/palette.js";
export * from "./scene/defaults.js";
export * from "./scene/anchors.js";
export * from "./scene/query.js";
export { SvgRenderer } from "./render/svgRenderer.js";
export type { CameraTransform } from "./render/svgRenderer.js";
export { ensureEngineStyles, FONT_FAMILY } from "./render/theme.css.js";
export { cameraForBBox, cameraForCenter } from "./camera/fit.js";
export { CameraController } from "./camera/controller.js";
export type { MoveOptions } from "./camera/controller.js";
export { EASINGS, easingByName } from "./camera/easing.js";
export { AnnotationLayer } from "./annotate/layer.js";
export { LiveAnnotationController } from "./annotate/interact.js";
export type { Tool, LiveState } from "./annotate/interact.js";
export { hitTestNode } from "./scene/query.js";
export { TimelinePlayer } from "./timeline/player.js";
export type { PlayerState } from "./timeline/player.js";
export { applyLayout } from "./layout/index.js";
export { compileEdd } from "./dsl/index.js";
export type { CompileEddResult } from "./dsl/index.js";
export { DiagnosticBag, formatDiagnostic } from "./dsl/diagnostics.js";
export type { Diagnostic } from "./dsl/diagnostics.js";
export { downloadSVG, downloadPNG, downloadJSON, exportSVGString, exportPNGBlob } from "./export.js";
export { registerShape, getShapePlugin, listShapePlugins } from "./plugins/registry.js";
export type { ShapePluginFn } from "./plugins/registry.js";
