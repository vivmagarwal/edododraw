/**
 * `edododraw/demos` — the visualization demo catalog on its own.
 *
 * One runnable `.edd` demo per registered viz template (87 of them), plus the
 * animated form of each. This entry deliberately imports nothing else from the
 * engine: it is pure data + string helpers, so a gallery, a docs site or an LLM
 * prompt builder can take the catalog without pulling in the renderer, dagre or
 * rough.js. Compile the strings with the main entry when you want pictures.
 */

export {
  VIZ_DEMOS,
  listVizDemos,
  getVizDemo,
  listVizDemoCategories,
  listVizDemosInCategory,
  animatedVizDemo,
  animateVizSource,
  injectVizOptions,
  VIZ_ANIMATION_DEFAULTS,
} from "../engine/viz/demos.js";
export type { VizDemo, VizAnimationOptions } from "../engine/viz/demos.js";
