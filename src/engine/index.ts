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
export { applyOverrides } from "./scene/overrides.js";
export { SvgRenderer } from "./render/svgRenderer.js";
export type { CameraTransform, SvgRendererOptions } from "./render/svgRenderer.js";
export { ensureEngineStyles, whenFontsReady, FONT_FAMILY, EXCALIFONT_FAMILY, HAND_FONT_WOFF2_DATA_URI } from "./render/theme.css.js";
// Edge geometry — rebuild an edge's routed centerline without touching the DOM
// (frame-driven hosts: flowing arrows, path measurement, custom overlays).
export { resolveEndpoints, routePoints, centerlinePath, smoothPath, pathLength, edgeRoughOptions } from "./render/edges.js";
export type { RenderedEdge } from "./render/edges.js";
export {
  edgeCenterline, edgeCenterlines, arrowFrameStyle,
  ARROW_ANIMATIONS, DASH_MARCH_CYCLE_PX, COMET_HEAD_FRACTION, COMET_HEAD_MIN_PX, FLOW_GRADIENT_URL,
} from "./render/frameArrows.js";
export type { EdgeCenterline, ArrowAnimationSpec, ArrowFrameStyle, ArrowFrameOptions, AnimatedArrowKind } from "./render/frameArrows.js";
export { cameraForBBox, cameraForCenter, mixCameras } from "./camera/fit.js";
export { CameraController } from "./camera/controller.js";
export type { MoveOptions } from "./camera/controller.js";
export { EASINGS, easingByName } from "./camera/easing.js";
export { AnnotationLayer, renderSceneWithAnnotations } from "./annotate/layer.js";
export { LiveAnnotationController } from "./annotate/interact.js";
export type { Tool, LiveState } from "./annotate/interact.js";
export { EditController } from "./edit/controller.js";
export type { EditTool, EditState } from "./edit/controller.js";
export { hitTestNode } from "./scene/query.js";
export { TimelinePlayer } from "./timeline/player.js";
export type { PlayerState } from "./timeline/player.js";
export { stepStateAt, computeHiddenAt, resolveCameraDirective } from "./timeline/stepState.js";
export type { StepState, ResolveCameraOptions } from "./timeline/stepState.js";
export { applyLayout } from "./layout/index.js";
export { compileEdd } from "./dsl/index.js";
export type { CompileEddResult } from "./dsl/index.js";
export { writeOverrides, renameNode, styleNode, addNode, addEdge, deleteElements } from "./dsl/patch.js";
export type { OverrideEntry } from "./dsl/patch.js";
export { DiagnosticBag, formatDiagnostic } from "./dsl/diagnostics.js";
export type { Diagnostic } from "./dsl/diagnostics.js";
export { downloadSVG, downloadPNG, downloadJSON, exportSVGString, renderSceneToSVGString, exportPNGBlob } from "./export.js";
export type { ExportOptions } from "./export.js";
export {
  registerShape, getShapePlugin, listShapePlugins,
  registerArrowAnimation, getArrowAnimation, listArrowAnimations,
  registerAnnotation, getAnnotationPlugin, listAnnotationPlugins,
  registerLayout, getLayoutPlugin, listLayoutPlugins,
  ensurePluginStyles,
} from "./plugins/registry.js";
export type { ShapePluginFn, ArrowAnimationDef, ArrowAnimationInfo, AnnotationPluginFn, AnnotationDrawCtx, LayoutPluginFn } from "./plugins/registry.js";
export * from "./style/color.js";
export * from "./style/presets.js";
// Viz templates + the demo catalog (VIZ_DEMOS / listVizDemos / getVizDemo /
// listVizDemoCategories / animatedVizDemo). The catalog alone, with no
// renderer behind it, is also published at the "edododraw/demos" subpath.
export * from "./viz/index.js";
