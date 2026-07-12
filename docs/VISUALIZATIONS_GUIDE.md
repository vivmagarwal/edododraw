# Visualizations Guide (`viz` templates)

EDodoDraw ships **87 visualization templates** — funnels, pyramids, venns, charts, timelines, mindmaps, business frameworks, visual metaphors — each generated **100% from text**. A `viz` block declares *data*; the template turns it into ordinary diagram elements, so everything else in EDodoDraw (camera beats, annotations, direct editing, export, style presets) works on visualizations exactly as on hand-drawn scenes.

> Browse every template live (in every style) on the site's **Visualizations** page. Styling is a separate axis — see [STYLES_GUIDE.md](STYLES_GUIDE.md).

---

## 1. The `viz` block

```edd
viz funnel "Sales Funnel" {
  input: "Potential customers"      // option: key: value
  item "Awareness" 5000             // data entry: label + value
  item "Interest" 1800 "Warm leads" // + trailing string = description
  item "Won" 38 { icon: trophy }    // + attribute block
}
```

Anatomy: `viz <type> [id] ["Title"] { options + entries }`.

- **`<type>`** — a template name (catalog below). Unknown names produce a diagnostic listing all known types.
- **`[id]`** — optional block id; element ids are prefixed with it (`sales.awareness`), so annotations and camera beats can target parts of a visualization: `spotlight sales.won`.
- **`["Title"]`** — rendered in the preset's title type above the visual (some templates place it themselves).
- **Options** are `key: value` lines (each template's options listed below).
- **Entries** are data lines: `<kind> [id] ["Label"] [-> target] [values…] [{ attrs }] [{ nested entries }]`.

### Entry anatomy

```edd
item apples "Apples" 40                    // ident id + label + value
item "Berries" 25 "Small but mighty"       // trailing string = description
flow "Solar" -> "Homes" 30                 // connection entry (sankey)
task "Design" 0 1.5                        // multiple values (gantt: start end)
item "Q1" [80, 20, 30]                     // value list (stacked bars)
item "Root" { item "Child A"; item "Child B" }   // nested children (mindmap, swot…)
item "Won" 38 { icon: trophy, color: green, detail: "Signed contracts" }
```

Entry attributes understood everywhere: `icon:` (glyph name, §5), `color:`/`fill:` (override this item's palette color), `detail:`/`note:`/`desc:` (description text), `showValue: false` (suppress this item's printed number). Every template accepts the generic `item` keyword plus natural synonyms (`stage`, `step`, `task`, `set`, `flow`, …) noted below.

**`showValues: false`** (block option, every value-printing template): values still drive the geometry — bar heights, funnel proportions, slice angles — but the numbers themselves aren't printed. For hosts with a "no unsourced numbers on screen" rule, or when the shape alone tells the story.

**`animate:` — auto-choreography (block option, every template).** One line turns any visualization into a narrated, step-by-step build: the compiler synthesizes a timeline with an overview beat (all data items hidden), one beat per item revealing its whole element group with the item's label as the caption, and a closing fit-all. No `timeline {}` needed — but an explicit timeline always wins.

```edd
viz funnel sales "Pipeline" {
  animate: pop          // true | fade | pop | draw-on (the reveal effect)
  hold: 2               // seconds per beat when playing
  animateCamera: true   // optional: magic-move focus onto each item
  item "Leads" 1200
  item "Demos" 240
  item "Won" 36
}
```

Play it with `edd.play()`, scrub it with `next()/prev()`, or drive it frame-accurately from a video host via `stepStateAt()` (see [CAMERA_AND_TIMELINE_GUIDE](CAMERA_AND_TIMELINE_GUIDE.md) and [INTEGRATION_GUIDE §6](INTEGRATION_GUIDE.md)). Nested children (mindmap branches, kanban cards) reveal with their parent item.

Multiple `viz` blocks in one document stack vertically; a `viz` block after a `scene` graph is placed below it.

### Reaching a template by name

Each template has a canonical `<type>` (the catalog below) **plus a generous set of natural-language aliases**, so you can write the intent however you'd phrase it — an unknown type produces a diagnostic listing every canonical name. A few examples:

| you can write… | you get |
|---|---|
| `viz leaderboard` / `ranking` / `winners` | `podium` |
| `viz conversion-funnel` / `sales-funnel` / `pipeline` | `funnel` |
| `viz cause-effect` / `why` / `causes` | `root-causes` |
| `viz constraint` / `chokepoint` / `throughput` | `bottleneck` |
| `viz mind-map` / `brainstorm` / `topics` | `mindmap` |
| `viz scorecard` / `dashboard` / `kpis` | `performance` |
| `viz venn-diagram` / `overlap` / `sets` | `venn` |
| `viz dial` / `meter` / `speedometer` | `gauge` |
| `viz five-forces` / `porters-five-forces` | `porters` |
| `viz gap` / `migration` / `span` | `bridge` |

The full alias set lives in `src/engine/viz/aliases.ts` (and is exported as `VIZ_ALIASES` / `listVizAliases()`).

---

## 2. Catalog

### Process

| type | data | options |
|---|---|---|
| `flowchart` (`flow`, `process`) | `item` / `step` — label, icon, detail | `direction: right` for horizontal |
| `sequence` | `item` / `step` — label + description panels in reading order | `columns: 2..4` |
| `stairs` (`staircase`) | `item` / `step` — ascending blocks, icon above, label inside | — |
| `journey` (`roadmap`) | `item` / `stage` — one ribbon-road segment per stage | — |
| `cycle` (`loop`) | `item` / `phase` — circles on a ring with swept arrows (3–4 big nodes; 5+ switches to dots) | — |
| `gantt` | `task "Name" start end` | `scale: ["Wk 1", …]`, `deadline: n`, `deadlineLabel:` |
| `kanban` (`board`) | `column "Doing" { item "Checkout flow" }` — cards per column | — |
| `swimlane-flow` (`swimlanes`) | `lane "QA" { step "Test" 2 }` — numbered steps flow across lanes | — |

### Data

| type | data | options |
|---|---|---|
| `bar` (`column`) | `item "Q1" 120` | `xTitle:`, `yTitle:` |
| `bar-horizontal` (`hbar`) | `item "Team" 34 { icon: gear }` | — |
| `stacked-bar` / `stacked-bar-horizontal` | `series "Name"` (legend) + `item "Q1" [a, b, c]` | `xTitle:`, `yTitle:` |
| `line` / `area` | `item "Jan" 1200` points | `xTitle:`, `yTitle:`, `color:` |
| `waterfall` | first `item` = start, then signed deltas; `total "Net"` = computed bar | `xTitle:`, `yTitle:` |
| `gauge` | `value: 87` + `label:` (or one item) | `value:`, `label:` |
| `pie` (`donut`) | `item "Alpha" 45` slices | `variant: donut` |
| `drop-off` (`dropoff`) | `item "Visit" 100` — nested shrinking cards | — |
| `dumbbell-vertical` (`deltas`) | `item "Speed" "+15%" { icon, detail }` | — |
| `dumbbell-horizontal` (`progress-bars`) | `item "Docs" 80 "80%"` — track + value bar + tag | — |
| `sankey` | `flow "Coal" -> "Industry" 25` | — |
| `radar` (`spider`) | `axis "Security"` + `series "Today" [3, 4, 2]` (or plain `item "X" 3`) | `max:` scale ceiling |
| `heatmap` (`risk-matrix`) | `row "API" [1, 3, 5]` intensity cells | `cols: ["Q1", …]`, `max:`, `showValues:` |
| `slope-chart` (`slopegraph`) | `item "Billing" 340 120` — before/after per line | `left:`, `right:` headers, `showValues:` |
| `bullet-chart` (`kpi-vs-target`) | `kpi "Revenue" 74 90` — actual bar vs target tick | `max:`, `showValues:` |

### Timelines

| type | data | options |
|---|---|---|
| `timeline` | `item "2019" "What happened" { icon: home }` — teardrop pins alternating up/down | — |
| `roadmap-lanes` (`product-roadmap`) | `lane "Platform" { task "SSO" 0 1.5; milestone "GA" 3 }` | `scale: ["Q1", …]` column headers |
| `milestone-path` (`path-to-goal`) | `item "Beta" "May"` milestones + `goal "Launch"` summit flag | `goal:` |

### Comparison

| type | data | options |
|---|---|---|
| `pros-and-cons` (`pros-cons`) | `pro "…"` / `con "…"` lines | `proColor:`, `conColor:` |
| `table` | `header "Feature" ["Free", "Pro"]` + `row "SSO" ["—", "Yes"]` | — |
| `versus` (`vs`) | `left "A"`, `right "B"`, `criterion "Cost" { icon, left: "…", right: "…" }` | — |
| `balance` (`scales`) | two `side "Name" { item "…" { icon } … }` blocks | `tilt: left\|right\|level` |
| `relationship` (`hub-spoke`, `orbit`) | `center "Hub" { icon }` + `item` satellites | — |
| `podium` | up to 3 `item`s in rank order (2-1-3 arrangement) | — |
| `decision` | question = title (or `question:`) + `item "Option" "why" { icon }` | — |
| `spectrum` | `item` / `zone` — first/last get arrow ends | — |
| `quadrant` (`2x2`, `matrix`) | 4 `item`s in order TL, TR, BL, BR (+ children bullets) | `xLabels: [neg, pos]`, `yLabels: [neg, pos]` |
| `venn` | `set "Name" "desc" { icon }` (2–7 sets) + `overlap all "Label"` / `overlap [a, b] "Label"` | — |
| `pricing-tiers` (`pricing`, `plans`) | `tier "Pro" 29 { highlight: true; item "SSO" }` — price + feature list cards | `period:`, `currency:`, `showValues:` |
| `decision-tree` (`yes-no`) | nested `item`s branching left→right; `{ when: "yes" }` labels the edge | — |

### Business Frameworks

| type | data | options |
|---|---|---|
| `swot` | 4 `item "Strengths" { item "…" … }` panels with bullet children | — |
| `pestel` | `item "Political" "summary" { item "…" }` cards (4–6) | — |
| `porters` (`forces`) | `item "Rivalry" "description"` forces on a ring | — |
| `pyramid` | `item` levels, top → bottom | — |
| `bullseye` (`target`) | `item` rings, **outermost first** | — |
| `funnel` | `item "Stage" [value]` | `input:`, `output:` captions |
| `flywheel` (`growth-loop`) | `item "More sellers" { icon: users }` ring segments + optional `center` entry | `center:` wheel label |
| `hex-cluster` (`honeycomb`) | `center "Core"` + `item "Cell" { icon }` hexagons on a ring | `center:` |
| `value-chain` (`chevron-process`) | `item "Build" { icon: wrench }` chevrons + `support "…"` bars above | — |
| `okr` (`goal-tree`) | `kr "NPS above 60" 0.72` progress cards under one objective | `objective:`, `showValues:` |
| `business-model-canvas` (`bmc`) | 9 kind-keyed sections (`value { item "…" }`, `segments`, `costs`, …) | — |
| `ecosystem` (`stakeholder-map`) | `center "Core"` + `ring "Partners" { item "…" { icon } }` orbits | — |

### Brainstorming / Parts of a whole

| type | data | options |
|---|---|---|
| `mindmap` (+ `mindmap-left`, `-right`, `-horizontal`, `-vertical`) | nested `item`s; root = title, a lone parent item, or a `root` entry | — |
| `key-ideas` (`ideas`) | `item "Focus" "description"` lightbulbs | — |
| `personas` (`team`, `cast`) | `item "The Builder" "detail" { pose: confident, emotion: happy, prop: wrench, shirt: tie }` characters | — |
| `quote` (`big-quote`) | title = the quote; `by:` attribution; a character presents it | `by:`, `pose:`, `emotion:`, `prop:` |
| `clouds` (`idea-clouds`) | `item "Theme" "detail" { icon }` scattered thought-cloud islands | — |
| `head-thoughts` (`in-their-head`) | `item "Will it save time?" { icon }` thoughts inside a profile head | `who:` caption |
| `list` | `item "Value" "detail" { icon }` — vertical ≤5 items, horizontal 6+ | `orientation:` |
| `diverge` | question = title + `item` options radiating on block arrows | — |
| `converge` / `lens` | `item` inputs + `output "Result" { icon }` | — |
| `iceberg` | `above "Visible" "…"` + `below "Hidden" "…"` entries | — |

### Problems & Solutions / Cause & Effect

| type | data | options |
|---|---|---|
| `problem-solution` | `problem`, `solution`, `outcome` entries + `support "…"` captions | — |
| `transformation` (`before-after`) | `before "Label" "desc"` + `after "Label" "desc"` (suspension-bridge scene) | — |
| `challenges` (`hurdles`) / `bridge` | `from`/`to` states + `item` steps spanning the gap | `action:` caption |
| `root-causes` (`root-cause`) | problem = title + `item "Cause" "description"` on the roots | — |
| `domino` (`chain-reaction`) | `item "Config typo" "detail"` tiles toppling into the outcome | — |
| `fishbone` (`ishikawa`) | title = the effect + `bone "People" { item "cause" … }` categories | — |
| `impact` | `cause "Driver"` + `item "Effect" "description"` bubbles | — |

### Visual Metaphors

| type | data | options |
|---|---|---|
| `vision` | `current "Today" "…"` + `vision "Goal" "…"` (stairs to an open door) | — |
| `performance` (`kpis`) | `item "Uptime" 99 "desc" { icon }` donut gauges | `summary:` |
| `bottleneck` | metaphor scene | `in:`, `out:`, `count:` |
| `hole` (`pit`) | title is the message | `caption:` |
| `trend` | `item` levels bottom → top on a rising staircase | — |
| `race` | `item` contestants in rank order | `finish:` banner text |
| `dialogue` (`conversation`) | `msg "…" { speaker: a\|b }` bubbles | `a:`, `b:` speaker names |
| `prism` | `input "One thing" { icon }` + `item` outputs | — |
| `pillar` (`pillars`) | `item "Trust" "description" { icon }` columns | — |
| `tug-of-war` (`force-field`) | two `side "Name" [weight] { item "force" … }` teams | `tilt: left\|right\|balanced` |
| `lighthouse` (`beacon`) | `item "Risk" "detail"` rocks under the beam | `ship:` traveler label |
| `magnet` (`attraction`) | `item "Fast CI" { icon }` chips being pulled in | `label:` magnet caption |

---

## 3. Ranges & limits

EDodoDraw is a **text→visualization generator**: it renders whatever you give it. Each template has a *sweet spot* of item counts and text lengths where it looks its best. Inside the range the layout is polished and self-spacing (side-label rows grow to fit longer descriptions); outside it, it still renders but can crowd. **If you're generating `.edd` (human or LLM), stay inside these ranges.**

| template | items — best | hard behavior at the edges |
|---|---|---|
| `flowchart` | 2–8 steps | vertical chain (tall); `direction: right` for a horizontal one |
| `sequence` | 2–9 steps | 3 per row, boustrophedon; grows downward |
| `stairs` | 2–6 steps | wider per step; >6 gets very wide |
| `journey` | 2–7 stages | one ribbon run per stage |
| `cycle` | 3–8 phases | 3–4 = large icon nodes; **5+ switches to compact dots** |
| `gantt` | 1–10 tasks | give `scale` enough ticks to cover the last `end` |
| `bar` | 1–12 bars | — |
| `bar-horizontal` | 1–8 bars | — |
| `stacked-bar` / `stacked-bar-horizontal` | 2–5 series × 2–6 categories | legend from `series` entries |
| `line` / `area` | 2–14 points | — |
| `waterfall` | 2–8 deltas | plus the start `item` and a `total` |
| `gauge` | **exactly 1** value (0–100) | one dial |
| `pie` / `donut` | 2–8 slices (best ≤6) | callouts crowd past ~8 |
| `drop-off` | 2–5 stages | each card shrinks; >5 gets tiny |
| `dumbbell-vertical` | 2–6 rows | — |
| `dumbbell-horizontal` | 2–8 rows | — |
| `sankey` | 2–5 sources × 2–5 targets | ribbons cross; keep it small |
| `timeline` | 2–7 events | alternates up/down; grows wide |
| `pros-and-cons` | 1–6 per side | two panels |
| `table` | 1–8 rows × 2–6 columns | first column = row label; wide with many columns |
| `versus` | **exactly 2 sides** × 1–6 criteria | — |
| `balance` | **exactly 2 sides** × 1–4 items each | — |
| `relationship` | 3–10 satellites | + one `center` |
| `podium` | 1–3 ranks | fixed 2-1-3 podium; extra ranks ignored |
| `decision` | 2–6 options | rows self-space for long descriptions |
| `spectrum` | 2–6 zones | first/last get arrow ends |
| `quadrant` | **exactly 4** (TL, TR, BL, BR) | extra items ignored; bullets via children |
| `venn` | **2–7 sets** | **8+ dropped with a `W-VIZ-VENN` warning** |
| `swot` | **exactly 4** sections × 1–5 bullets | fixed S/W/O/T |
| `pestel` | 3–6 cards | — |
| `porters` | 3–7 forces | on a ring |
| `pyramid` | 2–7 levels | bands grow to fit long slope labels |
| `bullseye` | 2–5 rings | **outermost first**; left labels self-space |
| `funnel` | 2–7 stages | bands grow to fit long side labels |
| `mindmap` (+ variants) | 2–7 branches × 0–5 children | balanced across sides |
| `key-ideas` | 2–5 ideas | lightbulbs in a row |
| `list` | 2–9 items | **vertical ≤5, horizontal ≥6** (or `orientation:`) |
| `diverge` | 2–4 options | 4 arrow slots; a 5th+ becomes a straight ray |
| `converge` / `lens` | 2–6 inputs | + one `output` |
| `iceberg` | 1 above + 1–5 below | first `above`, rest `below` |
| `problem-solution` | fixed + 0–3 supports | problem / solution / outcome |
| `transformation` | **exactly** before + after | — |
| `challenges` / `bridge` | 2–5 steps | + `from` / `to` states |
| `root-causes` | 2–5 causes | tree: crown + roots |
| `impact` | 2–5 effects | + one `cause` |
| `vision` | **exactly** current + vision | — |
| `performance` | 1–4 metrics | donut cards |
| `bottleneck` | fixed scene | `in:` / `out:` labels only |
| `hole` | title (+ `caption:`) | no items |
| `trend` | 2–6 levels | rising staircase |
| `race` | 2–4 racers | rank order |
| `dialogue` | 2–8 turns | **exactly 2 speakers** (`a:` / `b:`) |
| `prism` | 2–6 outputs | + one `input` |
| `pillar` | 2–5 columns | — |
| `flywheel` | 3–6 segments | arrowheads spin clockwise; center label optional |
| `radar` | 4–8 axes × 1–3 series | values clamp to `max:`; legend appears with 2+ series |
| `roadmap-lanes` | 2–5 lanes × 1–4 rows each | `scale` sets the columns; `milestone` renders a diamond |
| `milestone-path` | 3–6 milestones | + one `goal` flag; labels alternate sides of the trail |
| `value-chain` | 3–6 chevrons | + 0–3 `support` bars above the band |
| `pricing-tiers` | 2–4 tiers × ≤6 features | one `highlight: true` tier lifts + gets the badge |
| `okr` | 2–4 key results | values ≤1 read as fractions, else percentages |
| `kanban` | 2–4 columns × 1–6 cards | panels share the tallest column's height |
| `decision-tree` | 2–3 branches, depth ≤3 | one top-level item = the root; several = title becomes the root |
| `heatmap` | 2–7 rows × 2–8 cols | missing cells render dashed; intensity ramps to `max:` |
| `slope-chart` | 2–6 lines | close labels self-space vertically |
| `tug-of-war` | **exactly 2 sides** × 0–4 forces | marker drifts toward the heavier side (`value` or force count) |
| `business-model-canvas` | 5–9 sections × ≤4 bullets | kind-keyed cells; missing ones render with default titles |
| `ecosystem` | 2–3 rings × 3–6 members | + one `center`; outer-ring names point outward |
| `swimlane-flow` | 2–4 lanes × 4–8 steps total | number steps (`step "X" 2`) for cross-lane order |
| `bullet-chart` | 2–6 KPIs | second value (or `target:`) draws the target tick |
| `domino` | 3–6 tiles | fallen hardest at the trigger, upright at the outcome |
| `lighthouse` | 2–4 rocks | + `ship:`; beam sweeps over every rock |
| `magnet` | 2–5 chips | chips fan toward the poles |
| `personas` | 2–6 characters | poses cycle when unset; `pose:`/`emotion:`/`prop:` per item |
| `quote` | exactly 1 quote | `pose: none` hides the figure |
| `clouds` | 3–7 clouds | staggered rows sized by the largest cloud |
| `fishbone` | 2–6 bones × ≤4 causes | bones alternate above/below the spine |
| `head-thoughts` | 2–5 thoughts | fixed slots inside the cranium |
| `hex-cluster` | 3–6 cells | + one core; details sit below their cell |

**Text length.** Labels are single-line-ish (they wrap, but keep them a few words). Descriptions (`detail:` / trailing string) wrap to a column and the layout expands to fit — but on the compact-side-label templates (`funnel`, `pyramid`, `bullseye`, `spectrum`, `decision`) a stage/level reads best with a **name + one short sentence**; multi-sentence prose is supported but makes those layouts tall. Narrative templates (`sequence`, `journey`, `dialogue`, `iceberg`, `problem-solution`, `transformation`, `root-causes`) comfortably hold 1–2 sentences per item.

---

## 4. Composing with everything else

Viz output is plain Scene IR, so the rest of the language applies:

```edd
meta { style: chalkboard }

viz funnel sales "Pipeline" {
  item "Leads" 1200
  item "Demos" 240
  item "Won" 36
}

annotate { circle-mark sales.won "focus here" }

timeline {
  beat all { camera fit-all }
  beat close "The close" { camera focus sales.won zoom 2 }
}
```

- Element ids are `<blockId>.<itemId>` (item id = explicit ident, else a slug of the label).
- `reveal all` in a beat covers viz elements too.
- Direct manipulation: viz elements are pinned nodes — drag/restyle writes overrides like any node.

### Addressing one data item as a unit

A template usually emits **several** elements per data entry (shape + label +
detail + icon). Every one of them is tagged with its item, so the whole entry
can be addressed with the single key `<blockId>.<itemId>`:

- **Scene IR**: members carry `data.vizItem: "sales.won"` and a semantic
  `data.vizRole` (`"shape" | "label" | "detail" | "icon" | "value" | "line" |
  "edge" | "title"`). Query them with `vizItemMembers(scene, "sales.won")` /
  `listVizItems(scene)`.
- **DOM**: each member `<g>` gets `data-viz-item="sales.won"` and
  `data-viz-role="…"` attributes — select
  `[data-viz-item="sales.won"]` to choreograph the item from host code.
- **Language**: the key works as an annotation target (`strike sales.won`),
  in timeline `reveal`/`hide` (all members reveal together), and in `camera
  focus` (frames the whole item, label included). A target that matches
  nothing raises `W-ANNOT-TARGET` / `W-STEP-TARGET` instead of silently
  no-oping.

### Machine-readable catalog

`listVizTemplates()` returns `{ name, aliases, category, summary, entryKinds,
options, sweetSpot }` for every template — the tables above, as data — so
tooling can validate `.edd` before rendering.

## 5. Icons

`icon:` accepts a built-in line-glyph name; unknown names render nothing (layouts don't depend on them). Available: `check x plus minus arrow-up arrow-down arrow-right arrow-left trend-up trend-down star heart flag target bulb gear user users clock calendar rocket trophy medal search warning dollar chart pie doc mail chat home globe lock key leaf fire drop cloud database shield eye book wrench phone megaphone handshake scale puzzle diamond circle` (plus aliases like `idea`, `growth`, `money`, `team`, `award` — see `src/engine/viz/icons.ts`).

## 6. Characters

A reusable **sketchnote character library** ships with the engine — the classic
bullet-head figure (circle head + dot eyes + emotion mouth, vest-outline torso,
curved limbs with hand blobs, motion lines) drawn parametrically, preset-aware,
and deterministic like everything else.

- **Poses (24 movements)**: `standing waving pointing presenting cheering
  running confident thinking holding-overhead shrugging pulling peering
  walking jumping pushing carrying sitting meditating facepalm arms-crossed
  halting searching climbing falling` (plus any you register).
- **Emotions (14 expressions)**: `neutral happy sad surprised angry excited
  confused thinking determined wink love starstruck sleeping dizzy` — the
  workbook's mouth+eyes grid, extended with heart/star eyes, a wink, Zzz
  sleep, and dizzy X-eyes.
- **Shirts (7 styles)**: `vest tee striped solid tie dress hoodie` — the
  figure-style continuum (vest outline → filled silhouette → triangle person),
  via `shirt:` (+ `shirtColor:` for the fill/stripes/tie accent).
- **Props**: ANY icon name (§5), held at the pose's anchor — `prop: trophy`
  puts a trophy overhead in `holding-overhead`, `prop: star` crowns `cheering`.

In the DSL, characters appear through templates: `personas` renders one per
item (`{ pose: confident, emotion: happy, prop: wrench, shirt: tie }`), `quote` adds a
presenting figure, and `vision`/`hole`/`tug-of-war` use them internally. From
generator code (see EXTENDING_GUIDE):

```ts
ctx.character("cheering", cx, groundY, 120, { color: role.color, prop: "trophy", shirt: "striped" });
registerCharacterPose("dabbing", { armL: […], armR: […], legL: […], legR: […] });
```

Container shapes from the same vocabulary are first-class node shapes usable
anywhere in the DSL: `speech-bubble` (tail via `dir`), `starburst` (impact),
`ribbon` (banner titles), `paper-fold` (documents) — plus the existing `cloud`,
`note`, and `document`.

## 7. Extending

Register your own template and it's immediately usable from the DSL — no grammar change:

```ts
import { registerViz, type VizSpec, type VizContext } from "edododraw";

registerViz({
  name: "my-viz",
  category: "Custom",
  summary: "What it shows.",
  generate(spec: VizSpec, ctx: VizContext) {
    spec.items.forEach((item, i) => {
      const role = ctx.role(i, { n: spec.items.length, color: item.color });
      ctx.shape("circle", i * 120, 0, 90, 90, role, { id: ctx.uid(item.id) });
      ctx.labelBlock(item.label, item.detail, i * 120 + 45, 120, { color: role.color, align: "center" });
    });
  },
});
```

`VizContext` gives you preset-aware colors (`ctx.role`), measured/wrapped text (`ctx.label`, `ctx.labelBlock`), primitives (`ctx.poly`, `ctx.line`, `ctx.path`, sectors, block arrows), and icons (`ctx.icon`). See [EXTENDING_GUIDE.md](EXTENDING_GUIDE.md).
