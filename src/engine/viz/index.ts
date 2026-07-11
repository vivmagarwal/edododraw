/**
 * Viz module barrel.
 */

import "./generators/index.js"; // register built-in templates (side effect)

export { VizContext } from "./context.js";
export type { LabelOptions, LineOptions, ShapeOptions } from "./context.js";
export { registerViz, registerVizAlias, getViz, listViz, listVizAliases, listVizTemplates, runViz } from "./registry.js";
export type { VizTemplateInfo } from "./registry.js";
export { VIZ_ALIASES } from "./aliases.js";
export { measureText, measureBlock, wrapText } from "./text.js";
export { iconPath, listIcons, ICON_VIEWBOX } from "./icons.js";
export type { VizBounds, VizDef, VizGenerate, VizItem, VizOptionDoc, VizResult, VizSpec } from "./types.js";
export { itemsOf, optBool, optNum, optStr } from "./types.js";
