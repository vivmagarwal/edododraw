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
export { iconPath, iconEntry, registerIcon, listIcons, ICON_VIEWBOX } from "./icons.js";
export { vizToScene, vizItem } from "./compose.js";
export {
  drawCharacter,
  registerCharacterPose,
  getCharacterPose,
  listCharacterPoses,
  registerCharacterEmotion,
  listCharacterEmotions,
  registerCharacterShirt,
  listCharacterShirts,
  registerCharacterHair,
  listCharacterHair,
  registerCharacterAccessory,
  listCharacterAccessories,
  registerCharacterFx,
  listCharacterFx,
} from "./characters.js";
export type { CharacterPose, CharacterOptions, CharacterFrame } from "./characters.js";
export type { VizComposeOptions, VizComposeResult, VizItemInput, VizSpecInput } from "./compose.js";
export type { VizBounds, VizDef, VizGenerate, VizItem, VizOptionDoc, VizResult, VizSpec } from "./types.js";
export { itemsOf, optBool, optNum, optStr } from "./types.js";
