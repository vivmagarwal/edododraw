# Viz roadmap — next presentation-worthy templates (2026-07)

Planning note (not docs): candidate additions to the 62 built-in templates,
selected for how often they appear in real business/product presentations and
how well the hand-drawn language elevates them. Each entry sketches the data
model in `.edd` terms so implementation is a `registerViz` away. House rules
apply: colors only via `ctx.role`/`ctx.ink`/`ctx.preset`, item scoping via
`ctx.item`, values gated by `ctx.showValue`, `entryKinds`/`options`/`sweetSpot`
declared on the def.

## Tier 1 — SHIPPED 2026-07-12 in 0.4.0 (all six)

1. **`flywheel`** — the momentum loop every strategy deck wants. 3–6 thick
   banana-arc segments forming a continuous ring, arrowheads between, center
   label. Distinct from `cycle` (which is nodes-on-a-ring): the segments ARE
   the ring. Data: `item "More sellers" { icon: users }`. Primitives: `sector`/
   `arc` shapes already exist.
2. **`radar`** (spider chart) — capability/maturity assessments. 4–8 axes,
   1–3 series polygons with soft fills. Data: `axis "Security"` +
   `series "Today" [3, 4, 2, 5]`. Biggest pure-data gap in the catalog.
3. **`roadmap-lanes`** — quarters × workstreams swimlane timeline (the product
   roadmap slide). Data: `scale: ["Q1","Q2","Q3","Q4"]` + `lane "Platform"
   { task "SSO" 1 2 }`. Gantt's row math reuses; lanes add grouping bands.
4. **`milestone-path`** — a winding path to a summit flag, milestones as dots
   along the way (journey with stakes; complements `journey`'s flat ribbon).
   Data: `item "Beta" "May" { icon: flag }` + `goal "Launch"`.
5. **`value-chain`** — Porter-style chevron band: 3–7 chevrons in sequence,
   optional support rows beneath. `chevron`/`block-arrow` shapes exist.
6. **`pricing-tiers`** — 2–4 plan cards, feature bullets, one `highlight: true`
   tier lifted/accented. Data: `tier "Pro" 29 { item "SSO"; item "API" }`.

## Tier 2 — SHIPPED 2026-07-12 in 0.5.0 (all six)

7. **`okr` / `goal-tree`** — objective node branching into key results with
   progress bars (`item "NPS > 60" 0.7`). Values drive bar fill; `showValues`
   applies naturally.
8. **`kanban`** — 2–4 named columns with hand-drawn cards. Data: `column "Doing"
   { item "Checkout flow" }`. Instant recognition; trivial layout.
9. **`decision-tree`** — true binary/ternary branching with labeled edges and
   outcome leaves (mindmap is radial; this is directional with yes/no gates).
10. **`heatmap`** — matrix with intensity-filled cells (risk matrices, skills
    grids). `row "API" [1, 3, 5]`; intensity = role color opacity ramp.
11. **`slope-chart`** — before→after lines per series; tells rank-change
    stories the dumbbells can't.
12. **`tug-of-war`** — two teams pulling a rope; forces-for vs forces-against
    with the rope's knot offset by the value balance. Great change-management
    metaphor.

## Tier 3 — SHIPPED 2026-07-12 in 0.6.0 (all seven)

13. **`business-model-canvas`** — the 9-box BMC (needs dense text handling).
14. **`ecosystem`** — concentric stakeholder orbits (bullseye × relationship).
15. **`swimlane-flow`** — flowchart with responsibility lanes (complex routing;
    do after decision-tree).
16. **`domino`** — cascade of falling tiles for chain reactions.
17. **`lighthouse`** — beam sweeping over labeled rocks (risks) toward a ship.
18. **`bullet-chart`** — classic KPI-vs-target bars (complements `performance`).
19. **`magnet`** — attraction/retention: horseshoe magnet pulling item chips.

## Polish pass — DONE 2026-07-12 in 0.5.0 (all four below)

`vision` and `root-causes` were reworked in July 2026 (stepped silhouette +
figure + ascent arrow + light rays; scalloped canopy + per-cause colored roots
+ ground line). Next weakest by the same bar (render the QA set and look):

- **`bottleneck`** — the pipe reads abstract; give it a literal funnel-neck with
  queued dots piling up before the neck.
- **`hole`** — the ladder/pit needs a figure and depth hatching to land.
- **`challenges`/`bridge`** — the gap could use water/depth marks and clearer
  from/to platforms.
- **`race`** — lanes + a finish-line checker band would sell the metaphor.

## Notes

- Every new template ships with: demo in `src/site/vizDemos.ts`, aliases in
  `aliases.ts`, catalog metadata, docs table rows (VISUALIZATIONS_GUIDE §2/§3),
  and renders under all presets via `tests/viz.test.ts`.
- The QA loop that worked for the July rework: `scripts/qa/render-viz.mts` →
  `qlmanage` PNG → look → adjust. Iterate visually before writing tests.
