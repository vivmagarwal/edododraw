# Visualizations Guide (`viz` templates)

EDodoDraw ships **62 visualization templates** — funnels, pyramids, venns, charts, timelines, mindmaps, business frameworks, visual metaphors — each generated **100% from text**. A `viz` block declares *data*; the template turns it into ordinary diagram elements, so everything else in EDodoDraw (camera beats, annotations, direct editing, export, style presets) works on visualizations exactly as on hand-drawn scenes.

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

Entry attributes understood everywhere: `icon:` (glyph name, §4), `color:`/`fill:` (override this item's palette color), `detail:`/`note:`/`desc:` (description text). Every template accepts the generic `item` keyword plus natural synonyms (`stage`, `step`, `task`, `set`, `flow`, …) noted below.

Multiple `viz` blocks in one document stack vertically; a `viz` block after a `scene` graph is placed below it.

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

### Timelines

| type | data | options |
|---|---|---|
| `timeline` | `item "2019" "What happened" { icon: home }` — teardrop pins alternating up/down | — |

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
| `venn` | `set "Name" "desc" { icon }` (2–6 sets) + `overlap all "Label"` / `overlap [a, b] "Label"` | — |

### Business Frameworks

| type | data | options |
|---|---|---|
| `swot` | 4 `item "Strengths" { item "…" … }` panels with bullet children | — |
| `pestel` | `item "Political" "summary" { item "…" }` cards (4–6) | — |
| `porters` (`forces`) | `item "Rivalry" "description"` forces on a ring | — |
| `pyramid` | `item` levels, top → bottom | — |
| `bullseye` (`target`) | `item` rings, **outermost first** | — |
| `funnel` | `item "Stage" [value]` | `input:`, `output:` captions |

### Brainstorming / Parts of a whole

| type | data | options |
|---|---|---|
| `mindmap` (+ `mindmap-left`, `-right`, `-horizontal`, `-vertical`) | nested `item`s; root = title, a lone parent item, or a `root` entry | — |
| `key-ideas` (`ideas`) | `item "Focus" "description"` lightbulbs | — |
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

---

## 3. Composing with everything else

Viz output is plain Scene IR, so the rest of the language applies:

```edd
meta { style: bold-canvas }

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

## 4. Icons

`icon:` accepts a built-in line-glyph name; unknown names render nothing (layouts don't depend on them). Available: `check x plus minus arrow-up arrow-down arrow-right arrow-left trend-up trend-down star heart flag target bulb gear user users clock calendar rocket trophy medal search warning dollar chart pie doc mail chat home globe lock key leaf fire drop cloud database shield eye book wrench phone megaphone handshake scale puzzle diamond circle` (plus aliases like `idea`, `growth`, `money`, `team`, `award` — see `src/engine/viz/icons.ts`).

## 5. Extending

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
