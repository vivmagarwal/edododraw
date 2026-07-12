/**
 * Built-in viz template registration. Importing this module (side effect)
 * registers every generator; the compiler imports it so `viz <type>` blocks
 * always resolve.
 */

import "./stack.js";
import "./radial.js";
import "./venn.js";
import "./charts.js";
import "./flow.js";
import "./grid.js";
import "./tree.js";
import "./metaphor.js";
import "./strategy.js";

// Register the central LLM-friendly alias set once every generator is loaded.
import { applyVizAliases } from "../aliases.js";
applyVizAliases();
