/**
 * Viz module barrel.
 */

import "./generators/index.js"; // register built-in templates (side effect)

export { VizContext } from "./context.js";
export type { LabelOptions, LineOptions, ShapeOptions } from "./context.js";
export { registerViz, getViz, listViz, runViz } from "./registry.js";
export { measureText, measureBlock, wrapText } from "./text.js";
export { iconPath, listIcons, ICON_VIEWBOX } from "./icons.js";
export type { VizBounds, VizDef, VizGenerate, VizItem, VizResult, VizSpec } from "./types.js";
export { itemsOf, optBool, optNum, optStr } from "./types.js";
