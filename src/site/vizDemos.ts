/**
 * The visualization demo catalog — now part of the shipped engine so consumers
 * of the package (a Remotion gallery, an LLM prompt builder) can reach it too.
 * This module is the site's view onto it: one source of truth, no copies.
 *
 * @see src/engine/viz/demos.ts
 */

export { VIZ_DEMOS, listVizDemos, getVizDemo, listVizDemoCategories, listVizDemosInCategory, animatedVizDemo, animateVizSource, injectVizOptions, VIZ_ANIMATION_DEFAULTS } from "../engine/viz/demos.js";
export type { VizDemo, VizAnimationOptions } from "../engine/viz/demos.js";

import { listVizDemoCategories } from "../engine/viz/demos.js";

/** Catalog categories in presentation order (the gallery's section headings). */
export const VIZ_CATEGORIES: string[] = listVizDemoCategories();
