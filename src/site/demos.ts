/**
 * Live gallery demos — each is a self-contained `.edd` snippet that renders in
 * an embedded EdodoDraw instance next to its explanation. Grouped by feature.
 */

import architecture from "../../examples/architecture.edd?raw";
import mermaidImport from "../../examples/mermaid-import.edd?raw";

export interface Demo {
  id: string;
  category: string;
  title: string;
  description: string;
  code: string;
  /** show timeline play controls on the card. */
  timeline?: boolean;
  height?: number;
}

export const CATEGORIES = [
  "Getting started",
  "Shapes",
  "Edges & arrows",
  "Animated arrows",
  "Layouts",
  "Camera & timeline",
  "Annotations",
  "Mermaid import",
  "Plugins",
] as const;

export const DEMOS: Demo[] = [
  {
    id: "hello",
    category: "Getting started",
    title: "Hello, diagram",
    description: "The whole diagram is generated from this text. Edit it in the playground and watch it update live.",
    code: `scene {
  layout dag { direction: right }
  a([Start]) --> b[Do work] --> c{OK?}
  c -->|yes| d(Done):::good
  c -->|no|  a
}
style .good { fill: green }`,
  },
  {
    id: "shapes",
    category: "Shapes",
    title: "Shape library",
    description: "15+ hand-drawn shapes. Use a keyword (`cylinder db`), Mermaid sugar (`db[(Postgres)]`), or `shape:` in an attribute block.",
    height: 360,
    code: `scene {
  layout grid { gap: 30 }
  rect        a "rect"        { fill: blue }
  round-rect  b "round-rect"  { fill: green }
  ellipse     c "ellipse"     { fill: yellow }
  diamond     d "diamond"     { fill: red }
  hexagon     e "hexagon"     { fill: violet }
  cylinder    f "cylinder"    { fill: teal }
  cloud       g "cloud"       { fill: cyan }
  parallelogram h "parallelo" { fill: orange }
  document    i "document"    { fill: lime }
  note        j "note"        { fill: yellow }
  actor       k "actor"
  pill        l "pill"        { fill: grape }
}`,
  },
  {
    id: "edges",
    category: "Edges & arrows",
    title: "Edge glyphs & arrowheads",
    description: "Mermaid-style glyphs lower to line styles + arrowheads. Override any of them in a `{ … }` block.",
    height: 340,
    code: `scene {
  layout dag { direction: right, gap: 40 }
  a[A] --> b[B] "arrow"
  a -.-> c[C] "dashed"
  a ==> d[D] "thick"
  a --o e[E] "circle"
  a --x f[F] "bar"
  a <--> g[G] "bidirectional"
  a -> h[H] "crow" { endArrow: crow }
}`,
  },
  {
    id: "anchors",
    category: "Edges & arrows",
    title: "Connection anchors",
    description: "Far more connection points than Excalidraw: compass (`n s e w ne …`), side fractions (`top:0.3`), and `@(u,v)`.",
    height: 300,
    code: `scene {
  layout manual
  rect hub "Hub" { at: (240, 120), size: (160, 90) }
  circle a "N" { at: (280, 20) }
  circle b "E" { at: (470, 130) }
  circle c "S" { at: (280, 250) }
  circle d "W" { at: (60, 130) }
  a -> hub.n
  b -> hub.e
  c -> hub.s
  d -> hub.w
}`,
  },
  {
    id: "animated",
    category: "Animated arrows",
    title: "Seven animated connectors",
    description: "Set `animate:` on any edge (or use the `~>` glyph). Parallel edges fan out automatically so they never overlap.",
    height: 380,
    code: `scene {
  layout dag { direction: right, gap: 140 }
  circle a "A" { fill: blue }
  circle b "B" { fill: green }
  a -> b "flow"          { animate: flow }
  a -> b "dash-march"    { animate: dash-march }
  a -> b "draw-on"       { animate: draw-on }
  a -> b "comet"         { animate: comet, color: red }
  a -> b "gradient-flow" { animate: gradient-flow }
  a -> b "electric"      { animate: electric, color: violet }
  a -> b "pulse"         { animate: pulse }
}`,
  },
  {
    id: "layout-dag",
    category: "Layouts",
    title: "Layered (dag)",
    description: "`layout dag { direction: down|up|left|right }` — dagre layered layout. Edges route around nodes automatically.",
    height: 320,
    code: `scene {
  layout dag { direction: down, gap: 50 }
  a[Ingest] --> b[Validate] --> c[Transform]
  c --> d[Store]
  c --> e[Index]
  b --> f[Reject]
}`,
  },
  {
    id: "layout-radial",
    category: "Layouts",
    title: "Radial",
    description: "`layout radial { center: id }` places a hub in the middle with everything else on a ring.",
    height: 340,
    code: `scene {
  layout radial { center: core }
  circle core "Core" { fill: violet }
  rect a "Auth"; rect b "Billing"; rect c "Search"
  rect d "Email"; rect e "Files"; rect f "Admin"
  core -> a; core -> b; core -> c
  core -> d; core -> e; core -> f
}`,
  },
  {
    id: "timeline",
    category: "Camera & timeline",
    title: "Magic-move presentation",
    description: "A `timeline` of `beat`s turns a static diagram into a guided walkthrough — smooth camera focus + annotations. Press Play.",
    timeline: true,
    height: 420,
    code: architecture,
  },
  {
    id: "annotations",
    category: "Annotations",
    title: "Scripted annotations",
    description: "Highlight, underline, circle, point-at, callout, spotlight — anchored to elements, tracking the camera. (Draw them live in the Playground, then commit to code.)",
    height: 360,
    code: `scene {
  layout dag { direction: right, gap: 70 }
  rect app "App" { fill: blue }
  cylinder db "Postgres" { fill: teal }
  cylinder cache "Redis" { fill: red }
  app -> db "write"
  app -> cache "read"
}

annotate {
  highlight app { color: yellow }
  underline db
  circle-mark cache "hot path" { color: orange }
  point-at db "source of truth" { from: n, color: blue }
}`,
  },
  {
    id: "mermaid",
    category: "Mermaid import",
    title: "Import raw Mermaid",
    description: "Paste a Mermaid diagram in a `mermaid \"\"\" … \"\"\"` block. Node ids are preserved, so you can choreograph and annotate it.",
    timeline: true,
    height: 380,
    code: mermaidImport,
  },
  {
    id: "plugin-star",
    category: "Plugins",
    title: "Custom shape plugin",
    description: "`registerShape('star', …)` adds a hand-drawn 5-point star, usable immediately from the DSL — no grammar change. See the Extending guide.",
    height: 300,
    code: `scene {
  layout dag { direction: right }
  star s "Plugin!" { fill: yellow }
  circle c "Core" { fill: blue }
  s --> c "extends"
}`,
  },
];
