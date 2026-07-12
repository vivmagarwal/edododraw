/**
 * LLM-friendly aliases — the natural words a person or model reaches for when
 * describing an intent ("leaderboard", "conversion funnel", "cause and effect",
 * "constraint") mapped to the canonical `viz` template that renders it. Kept in
 * ONE place (not scattered across generators) so the whole synonym surface is
 * auditable and collision-checked (`registerVizAlias` skips duplicates).
 *
 * These are IN ADDITION to each generator's own inline `aliases`. Canonical
 * names and existing inline aliases are never re-listed here.
 */

import { registerVizAlias } from "./registry.js";

export const VIZ_ALIASES: Record<string, string[]> = {
  // ---- Process --------------------------------------------------------------
  flowchart: ["workflow", "flow-chart", "steps-flow"],
  kanban: ["board", "task-board", "kanban-board"],
  "swimlane-flow": ["swimlanes", "cross-functional-flow", "raci-flow"],
  sequence: ["sequential", "step-by-step", "procedure"],
  stairs: ["steps", "step-up", "climb"],
  journey: ["journey-map", "user-journey", "path"],
  cycle: ["cyclic", "circular", "feedback-loop"],
  gantt: ["schedule", "project-plan", "gantt-chart"],

  // ---- Data -----------------------------------------------------------------
  bar: ["bar-chart", "bars", "vertical-bar"],
  "bar-horizontal": ["horizontal-bar", "bar-chart-horizontal"],
  "stacked-bar": ["stacked-column", "stacked-bars"],
  "stacked-bar-horizontal": ["stacked-hbar", "horizontal-stacked-bar"],
  line: ["line-chart", "line-graph"],
  area: ["area-chart", "filled-line"],
  waterfall: ["waterfall-chart", "cascade", "bridge-chart"],
  gauge: ["dial", "meter", "speedometer"],
  pie: ["pie-chart", "doughnut", "share"],
  "drop-off": ["attrition", "funnel-drop", "leakage"],
  "dumbbell-vertical": ["change-comparison", "yoy", "before-after-values"],
  "dumbbell-horizontal": ["goal-progress", "kpi-bars"],
  sankey: ["flow-diagram", "sankey-diagram", "flows"],
  radar: ["spider", "spider-chart", "radar-chart", "capability-map", "skills-chart"],
  heatmap: ["heat-map", "intensity-grid", "risk-matrix", "skills-grid"],
  "slope-chart": ["slope", "slopegraph", "before-after-lines", "rank-change"],
  "bullet-chart": ["bullet", "kpi-vs-target", "target-bars"],

  // ---- Timelines ------------------------------------------------------------
  timeline: ["milestones", "chronology", "history"],
  "roadmap-lanes": ["product-roadmap", "swimlane-roadmap", "quarterly-roadmap", "release-plan"],
  "milestone-path": ["path-to-goal", "summit", "trail", "journey-to-goal"],

  // ---- Comparison -----------------------------------------------------------
  "pros-and-cons": ["pro-con", "plus-minus", "for-against"],
  table: ["comparison-table", "grid", "feature-table"],
  versus: ["head-to-head", "comparison", "showdown"],
  balance: ["tradeoff", "trade-off", "weigh"],
  relationship: ["network", "hub"],
  podium: ["ranking", "leaderboard", "winners", "top-three"],
  decision: ["choose", "options"],
  spectrum: ["range", "continuum", "scale-range"],
  quadrant: ["four-quadrant", "grid-2x2"],
  venn: ["venn-diagram", "overlap", "sets", "intersection"],
  "pricing-tiers": ["pricing", "plans", "pricing-table", "packages"],
  "decision-tree": ["decision-flow", "yes-no", "branching", "choice-tree"],

  // ---- Business Frameworks --------------------------------------------------
  swot: ["swot-analysis", "strengths-weaknesses"],
  pestel: ["pest", "pestle", "pestel-analysis", "macro-environment"],
  porters: ["five-forces", "porters-five-forces", "competitive-forces"],
  pyramid: ["hierarchy", "layers", "tiers", "triangle"],
  bullseye: ["concentric", "priorities", "rings"],
  funnel: ["sales-funnel", "conversion-funnel", "pipeline"],
  flywheel: ["momentum", "growth-loop", "virtuous-cycle", "growth-engine"],
  okr: ["okrs", "objectives", "goal-tree", "key-results"],
  "business-model-canvas": ["bmc", "business-canvas", "model-canvas"],
  ecosystem: ["orbits", "stakeholder-map", "ecosystem-map"],
  "value-chain": ["porter-value-chain", "chevron-process", "delivery-chain"],
  "tug-of-war": ["force-field", "push-pull", "tension"],

  // ---- Brainstorming / Parts of a whole -------------------------------------
  mindmap: ["mind-map", "brainstorm", "topics"],
  personas: ["team", "cast", "roles", "characters", "people"],
  quote: ["quotation", "big-quote", "saying", "callout-quote"],
  clouds: ["idea-clouds", "thought-clouds", "sticky-ideas", "scattered-ideas"],
  "key-ideas": ["highlights", "takeaways", "key-points"],
  list: ["bullets", "checklist", "items", "bullet-list"],
  diverge: ["diverging", "branch-out", "fan-out"],
  converge: ["converging", "funnel-in", "merge", "inputs"],
  iceberg: ["visible-hidden", "surface-depth", "above-below"],

  // ---- Problems & Solutions / Cause & Effect --------------------------------
  "problem-solution": ["issue-fix", "challenge-response"],
  transformation: ["transition", "change", "makeover"],
  challenges: ["obstacles", "barriers"],
  bridge: ["gap", "migration", "span", "bridge-gap"],
  "root-causes": ["why", "causes", "cause-tree", "cause-effect"],
  domino: ["chain-reaction", "dominoes", "cascade-effect", "knock-on"],
  fishbone: ["ishikawa", "fishbone-diagram", "cause-categories"],
  impact: ["ripple", "consequences", "effects"],

  // ---- Visual Metaphors -----------------------------------------------------
  vision: ["goal", "aspiration", "destination", "north-star"],
  performance: ["scorecard", "dashboard", "kpi-donuts"],
  bottleneck: ["constraint", "chokepoint", "throughput"],
  hole: ["trap", "pitfall", "risk"],
  trend: ["growth", "upward", "trajectory", "maturity", "rising"],
  race: ["competition", "finish-line", "contest"],
  dialogue: ["chat", "qa", "discussion"],
  lens: ["focus", "magnify", "filter"],
  prism: ["refraction", "one-to-many", "split"],
  pillar: ["columns", "foundations", "supports"],
  lighthouse: ["guidance", "beacon", "watch-out"],
  magnet: ["attraction", "retention", "pull"],
};

/** Register every alias in VIZ_ALIASES against its canonical template. */
export function applyVizAliases(): void {
  for (const [canonical, aliases] of Object.entries(VIZ_ALIASES)) {
    for (const alias of aliases) registerVizAlias(alias, canonical);
  }
}
