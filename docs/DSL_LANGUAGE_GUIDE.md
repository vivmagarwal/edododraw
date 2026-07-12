# EDodoDraw Language Guide (`.edd`)

The complete reference for **EDodoDraw code** — the text syntax that compiles 100% to a diagram. Written to be equally readable by humans and generatable by LLMs.

> Implementation: `src/engine/dsl/` (lexer → parser → compiler). This guide documents what the compiler **actually accepts today**. Runnable examples live in `examples/`.

---

## 1. Mental model

A program has two halves:

1. **Structure** — declared once inside `scene { … }`: nodes, edges, groups, styles, layout. Mermaid-friendly (arrow glyphs, `id[Label]` sugar, `:::class`) with clean `{ key: value }` attribute blocks for styling.
2. **Choreography** (optional) — a `timeline { … }` of ordered `beat`s. Each beat is a keyframe of **camera** (fit/focus/zoom/pan), **annotate** (highlight/underline/point-at/…), and **reveal** (show/hide). The engine "magic-moves" between beats.

Minimal program:

```edd
scene {
  a[Start] --> b[Do work] --> c{OK?}
  c -->|yes| d(Done)
  c -->|no|  a
}
```

Everything else is optional layering on top.

---

## 2. Top-level statements

| Statement | Purpose |
|---|---|
| `edd 1.0` | Optional version marker (first line). |
| `meta { title: "…", background: "#…", style: chalkboard }` | Diagram metadata; `style:` applies a [style preset](STYLES_GUIDE.md). |
| `theme name { tokens { $x: #hex, … } }` | Named theme + reusable `$tokens`. |
| `style .name { … }` / `style .name extends .other { … }` | Reusable style class. |
| `defaults { node { … } edge { … } }` | Defaults applied to every node/edge. |
| `scene [name] { … }` | Structure. Multiple `scene` blocks merge. |
| `viz <type> [id] ["Title"] { … }` | A data-driven visualization template — 85 built-in types (see §12 and VISUALIZATIONS_GUIDE.md). |
| `annotate ["label"] { … }` | Always-on annotations (outside the timeline). |
| `timeline [name] { … }` | Choreography (beats). |
| `overrides { id at (x, y) [size (w, h)] … }` | Pinned positions/sizes (usually machine-written by direct editing — see §11). |
| `mermaid """ … """` | Import a raw Mermaid diagram (see IMPORT_AND_EXPORT_GUIDE.md). |

A theme whose **name contains `dark`** renders in dark mode (near‑black canvas, light default ink, dark grid). An embedder can override the diagram's declared theme at the view level — `EdodoDraw.setColorScheme("dark")`, `<EdodoDrawView colorScheme>`, or `compileEdd(src, { mode })` — so the same source follows a host app's light/dark toggle (see INTEGRATION_GUIDE.md). Colors you set explicitly are always kept; only *default* ink adapts for contrast.

Comments: `// line`, `%% line` (Mermaid-style), `/* block */` (nestable).

---

## 3. Nodes — three equivalent forms

```edd
// 1. Mermaid sugar (shape from the bracket kind)
db[(Postgres)]          // cylinder
q{{Load Balancer}}      // hexagon
ok([Success])           // pill / stadium

// 2. Keyword form (explicit shape keyword first) — best for LLMs
cylinder db "Postgres"
hexagon  lb "Load Balancer"

// 3. Explicit form
node db "Postgres" as cylinder
```

### Shape sugar table

| Sugar | Shape | Sugar | Shape |
|---|---|---|---|
| `[x]` | rectangle | `[(x)]` | cylinder |
| `(x)` | round-rectangle | `((x))` | circle |
| `([x])` | pill / stadium | `{x}` | diamond |
| `[[x]]` | rectangle | `{{x}}` | hexagon |
| `[/x/]` | parallelogram | `[/x\]` | trapezoid |

### Full shape keyword list

`rect` · `round-rect` · `ellipse` · `circle` · `diamond` (`decision`) · `triangle` · `hexagon` · `parallelogram` · `trapezoid` · `cylinder` (`db`) · `cloud` · `document` · `note` · `actor` · `pill` (`stadium`) · `text` · `star`

Unknown shape names resolve through the **shape plugin registry** (`registerShape`) — see DEVELOPMENT_STANDARDS.md.

### Node attributes

```edd
rect api "API Service" {
  fill: green            // palette name or #hex → soft bg + matching stroke
  stroke: #1971c2
  fillStyle: hachure     // hachure | cross-hatch | solid | zigzag | dots | none
  strokeWidth: bold      // thin | medium | bold | thick | <number>
  strokeStyle: dashed    // solid | dashed | dotted
  roughness: artist      // architect(0) | artist(1) | cartoonist(2) | <number>
  roundness: 16          // corner radius (px)
  font: hand             // hand | normal | code
  fontSize: 22
  opacity: 0.9           // 0..1 or 0..100
  at: (1180, 40)         // absolute world position
  pin: true              // exclude from auto-layout (pinned)
  size: (180, 80)        // explicit width,height
  tags: [edge, critical] // selectable via .edge / .critical
}
```

Apply style classes with `:::` — `rect api "API" :::card :::critical`.

### Named colors

Stroke palette: `black gray red pink grape violet blue cyan teal green lime yellow orange brown white`.
`fill: green` yields the pleasant Excalidraw soft-green box with a matching darker-green outline. `transparent`/`none` → no fill.

---

**Sketchnote containers** are ordinary shapes too: `speech-bubble` (dialogue),
`starburst` (impact statements), `ribbon` (banner titles), `paper-fold`
(documents) — e.g. `starburst wow "BE GOOD, DO GOOD"`.

## 4. Edges

```edd
a --> b                      // arrow
a --> b "label"              // trailing label
a -->|mid label| b           // Mermaid mid-label
a -> b -> c                  // chain → two edges
a -> b & c                   // fan-out → a→b and a→c
a@(1,0.5) -> b.n             // anchored endpoints (see §7)
edge e1: a --> b "named"     // give the edge an id
```

### Glyph table

| Glyph | Line | End arrowhead | Notes |
|---|---|---|---|
| `--` `---` | solid | none | plain connector |
| `->` `-->` | solid | arrow | canonical |
| `<-` `<--` | solid | arrow at start | reversed |
| `<->` `<-->` | solid | arrows both | bidirectional |
| `-.->` | dashed | arrow | async |
| `..>` | dotted | arrow | dependency |
| `==>` | solid (thick) | arrow | emphasis |
| `===` | solid (thick) | none | plain connector (thick) |
| `~>` | solid (curved) | arrow | **animated `flow` by default** |
| `--o` `-o` | solid | circle | association |
| `--x` `-x` | solid | bar | termination |

### Edge attributes

```edd
a -> b {
  color: #1971c2
  strokeWidth: bold
  strokeStyle: dashed
  startArrow: dot          // none arrow triangle bar dot circle diamond crow …
  endArrow: triangle
  curve: curved            // straight | curved | orthogonal | elbow | bezier | arc
  animate: dash-march      // see §5
}
```

Parallel edges between the same pair automatically fan out so they never overlap.

---

## 5. Animated arrows

Set `animate: <kind>` on any edge. EDodoDraw ships far more than Excalidraw:

| Kind | Effect |
|---|---|
| `flow` | dashes flow along the path |
| `dash-march` | marching ants |
| `draw-on` | the line draws itself in (loops) |
| `comet` | bright head with a fading trail + glow |
| `gradient-flow` | animated multi-color gradient stroke |
| `electric` | fast jittered dashes |
| `pulse` | opacity/width pulse |

`glow`→comet, `caravan`→dash-march, `wiggle`→flow are accepted aliases. Speed: `animate: flow { speed: 1.4 }`.

---

## 6. Layout

```edd
scene {
  layout dag { direction: down, gap: 64, rankGap: 110 }
  …
}
```

| Kind | Behavior |
|---|---|
| `dag` / `tree` / `flow` | layered graph via dagre (respects `direction`) |
| `grid` | row-major grid |
| `radial` | hub + ring (`center: id`) |
| `manual` / `free` | use each node's `at:` position |

`direction`: `down`(TB) · `up`(BT) · `right`(LR) · `left`(RL). Nodes with `pin: true` (or `at:` set) are excluded from auto-layout and kept fixed. Groups are clustered so their members stay together.

---

## 7. Connection anchors (richer than Excalidraw's 4)

Attach an edge endpoint to a specific point on a node with `.anchor` or `@(u,v)`:

- Compass: `.n .s .e .w .ne .nw .se .sw .c` (aliases `.top .bottom .left .right .center`).
- Side fraction: `.top:0.3` (30% along the top edge), also `.right:0.75`, `.bottom:0.5`, `.left:0.2`.
- Normalized: `@(0.5, 1.0)` — u,v in 0..1 of the node box.
- Angle: `.angle:45` — degrees from the center (0 = east, clockwise).

```edd
gw.s      -> api.n            // bottom of gw → top of api
api@(1, 0.5) -> db.top:0.3    // right-middle of api → 30% along db's top edge
```

Omit the anchor for automatic border attachment aimed at the other endpoint.

---

## 8. Groups

```edd
scene {
  group services "Application Services" {
    round-rect auth "Auth"
    round-rect api  "API"
  }
}
```

Draws a labelled dashed frame around its members. A group is addressable as one target (e.g. `camera focus services`, `spotlight services`).

---

## 9. Annotations

Annotate elements in an always-on `annotate { … }` block or inside a timeline beat.

| Command | Example |
|---|---|
| `highlight` | `highlight cdn { color: yellow }` |
| `underline` | `underline api { color: #2563eb, style: wavy }` |
| `strike` | `strike legacy { color: red }` |
| `box` (over a set) | `box [gateway, api, db] "critical path" { color: red }` |
| `circle-mark` | `circle-mark queue "retry here"` |
| `point-at` | `point-at gateway "single entry" { from: ne, color: #2563eb }` |
| `callout` | `callout db "source of truth" { placement: bottom }` |
| `spotlight` | `spotlight services { dim: 0.72 }` |
| `note-marker` | `note-marker db "1"` |

`from` / `placement` take a cardinal (`n s e w ne …`). Annotations anchor to their target and track the camera. See ANNOTATIONS_GUIDE.md for the real-time editor and round-trip.

**Targets.** Any node/edge/group id works, plus viz element/item ids with dots — `strike sales.won` resolves against the finished scene (viz items anchor to the union of the item's elements). An explicit attribute form is also accepted: `strike { target: "sales.won" }`. Targets that match nothing raise a `W-ANNOT-TARGET` diagnostic (they never silently no-op).

---

## 10. Timeline (magic-move presentation)

```edd
timeline story {
  beat overview "The whole system" {
    camera fit-all over 800ms
    reveal { show all with fade-in }
    narrate: "End-to-end request path."
  }

  beat data "Where state lives" {
    camera focus [db, cache, queue] zoom 1.7 ease ease-in-out
    annotate {
      callout db "primary of record" { placement: right }
      spotlight [db, cache, queue] { dim: 0.7 }
    }
    narrate: "All writes funnel through Postgres."
    hold: 2s
  }
}
```

### Camera operations (inline or block form)

| Op | Inline | Block |
|---|---|---|
| Frame all | `camera fit-all` | `camera { }` |
| Focus target(s) | `camera focus [a,b] zoom 1.6` | `camera { focus: [a,b], zoom: 1.6 }` |
| Absolute zoom | `camera zoom 1.3` | `camera { zoom: 1.3 }` |
| Pan | `camera pan (x, y)` | `camera { pan: (x,y) }` |
| Reset | `camera reset` | — |

Shared modifiers: `zoom N` · `over <ms|s>` (alias `duration`) · `ease <easing>` · `pad N`. Op aliases: `fit <target>` / `center <target>` / `follow <target>` all normalize to `focus`; `reset` → `fit-all`. `pan (x,y)` also accepts `pan to (x,y)` / `pan by (x,y)`.
Easings: `linear ease ease-in ease-out ease-in-out back-out anticipate spring` — plus `magic` / `bounce` (aliases for the tuned spring). `spring(…)` is accepted and animates with the tuned spring; `cubic-bezier(…)` is accepted syntax but currently falls back to the default `ease-in-out` (parameters for both are reserved for a future release).
An **explicit `zoom N` is applied uncapped** (a beat can zoom past the interactive limits); wheel/gesture zoom is clamped to 0.05–8×. Numeric contracts (fit padding/maxZoom, auto-duration) are in [CAMERA_AND_TIMELINE_GUIDE.md](CAMERA_AND_TIMELINE_GUIDE.md).

### Reveal / hide (with entrance effects)

`reveal { show <targets> }` reveals nodes/edges; `reveal { hide <targets> }` hides them. Visibility is **sticky** across beats until changed. Add an entrance animation with `with <effect>`, replayed each time the beat is entered:

| Effect | `with …` | Also as a verb | Motion |
|---|---|---|---|
| Fade | `with fade-in` (alias `fade`) | `fade-in <t>` | opacity 0→1 (~0.4s) |
| Pop | `with pop` (alias `emphasize`) | `pop <t>` | scale-bounce in (~0.45s) |
| Draw-on | `with draw-on` (aliases `draw`, `sweep`) | `draw-on <t>` | left-to-right marker sweep (~0.5s) |

```edd
reveal { show all with fade-in }     // whole diagram fades in
reveal { show [db, cache] with pop } // pop just these two
reveal { draw-on [gw] }              // effect-verb form
reveal { show legacy }               // no `with` -> instant (no animation)
```

A plain `show`/`hide` with no effect is instant. Effects honor `prefers-reduced-motion`. Beat annotations are cleared at the start of each beat (unless in the always-on `annotate` block).

### Beat & timeline properties

`narrate: "caption"` (speaker note shown under the diagram), `hold: 2s` (dwell before auto-advance during Play; alias `wait:`). At the `timeline { … }` level, `defaultEase: <easing>` sets the fallback easing for every beat that doesn't specify its own `ease`.

---

## 11. Overrides — where direct edits live

The layout engine positions nodes automatically. When you **drag, resize, add, rename, restyle, or delete elements directly on the canvas** (in the playground, or via the editor API — see INTEGRATION_GUIDE.md), those changes are written straight back into the source so the code stays the single source of truth. Geometry lands in an `overrides { … }` block:

```edd
scene {
  layout dag { direction: down }
  rect a "A"
  rect b "B"
  a --> b
}

overrides {
  a at (120, 40)             // pin a node's top-left corner (world units)
  b at (120, 220) size (160, 90)   // …and optionally its width/height
}
```

- Each entry is `id at (x, y)` with an optional `size (w, h)`. Coordinates are the node's top-left in world units; `id` may be any node — declared, auto-created from an edge, or Mermaid-imported.
- A pinned node keeps its coordinates; the layout still routes edges and places any *un-pinned* nodes around it.
- The block is **machine-managed**: dragging a node rewrites its entry, and the engine freezes the other nodes' current positions into the block at the same time so the layout doesn't reshuffle under you. You can hand-edit or delete entries freely — remove the whole block to hand control back to auto-layout.
- Restyle/rename/add/delete edits patch the node's declaration and edges in place (e.g. a fill swatch upserts `{ fill: green }`); only position/size use `overrides`.

---

## 12. Visualizations (`viz`) & style presets

Declare a chart or diagram template with data instead of drawing it:

```edd
meta { style: chalkboard }          // optional: one of the built-in styles (default is classic B&W)

viz funnel sales "Sales Funnel" {
  input: "Potential customers"        // template option
  item "Awareness" 5000               // data entry: label + value
  item "Interest" 1800 "Warm leads"   // + trailing string = description
  item "Won" 38 { icon: trophy }      // + icon / color / detail attributes
}
```

85 templates ship built-in — funnel, pyramid, venn, pie, bar/line/area, radar, heatmap, slope-chart, waterfall, sankey, gantt, timeline, roadmap-lanes, kanban, flywheel, okr, decision-tree, mindmap, swot, quadrant, journey, pricing-tiers, iceberg, and many more. Entries are `<kind> [id] ["Label"] [-> target] [values…] [{ attrs }] [{ nested entries }]`; every template accepts `item` plus natural synonyms (`stage`, `flow "A" -> "B" 25`, `task "Design" 0 3`, `set`, `pro`/`con`, …).

Viz output is ordinary scene structure: elements get ids like `sales.won`, so annotations, camera beats, `reveal`, and direct editing all target them — and `sales.won` used as a target addresses the item's **whole element group** (shape + label + icon together). Add `showValues: false` as a block option (or `showValue: false` on one item) to keep values driving the geometry without printing the numbers. `meta { style: <name> }` restyles the *whole* document — viz templates and classic scenes alike — through one of the named styles (`classic-color`, `chalkboard`, `crayon`, `mono-accent`, …).

Full catalog + per-template options: [VISUALIZATIONS_GUIDE.md](VISUALIZATIONS_GUIDE.md). Preset reference: [STYLES_GUIDE.md](STYLES_GUIDE.md).

---

## 13. Diagnostics

The compiler recovers from errors and reports many at once, each with `line:col`, a stable code (`E-EDGE-NOOP`, `E-STMT`, `E-ATTR`, `W-MERMAID-SYNC`, …), and a hint. A bad statement never blanks the diagram — valid statements still render.

---

## 14. LLM authoring tips

- Prefer the **keyword node form** (`cylinder db "…"`) and the **block form** for camera/annotations — they're unambiguous.
- One statement per line. Attributes are `{ key: value, … }` (commas or newlines both separate).
- Declare structure once in `scene`; reference ids everywhere else. Forward references are fine.
- Colors: use palette names (`green`, `blue`) for the Excalidraw look, or `#hex`.
- To animate a connector, add `animate: flow` (or use the `~>` glyph).
- To present, add a `timeline` of `beat`s with `camera focus …` — that's the differentiator.

See `examples/*.edd` for complete, runnable programs.
