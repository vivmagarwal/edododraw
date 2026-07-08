# EDodoDraw Code (`.edd`) — Language Specification v1.0

**This document is the implementation contract.** A conforming parser MUST accept every program in the "Full Examples" section, produce the AST shapes implied by the grammar, and emit the diagnostics described in "Parser Implementation Notes." Where prose and grammar disagree, the grammar wins for *syntax* and the prose wins for *semantics*.

---

## 1. Overview

EDodoDraw code describes a diagram as a **short film**, not a static picture. A program has two halves:

1. **Structure** — declared once in a `scene`: nodes, edges, groups, anchors, styles, themes, layout. Written in a **Mermaid-friendly** surface (arrow glyphs, bracket shape sugar, `:::` classes) so structural knowledge transfers with near-zero relearning, but with **clean, block-scoped `{ key: value }` attributes** for all styling — style never leaks into the connectivity line.
2. **Choreography** — declared in a `timeline` of ordered `beat`s. Each beat is a declarative keyframe across three orthogonal channels: **camera** (fit/focus/zoom/pan), **annotate** (highlight/underline/point-at/…), and **reveal** (show/hide/draw-on/flow/…). The engine "magic-moves" between consecutive beats by **diffing their states** and spring-tweening the delta.

The language is the synthesis of three prototypes:

| Idea | Taken from |
|---|---|
| Mermaid-superset *feel* for structure (arrow glyphs, `id[Label]`, `:::class`, `%%`, verbatim `mermaid` import) | Design 1 (mermaid-superset) |
| Hard **structure / style / timeline** separation and one uniform typed `{ key: value }` block for every construct | Design 2 (block-scoped-css) |
| **Timeline-first** model: beats as camera+annotate+reveal keyframes, magic-move by diffing, rich anchors & selectors, dual inline/block surface forms | Design 3 (layered-timeline) |

**Design goals, in priority order:** (1) 100% code→diagram; (2) trivially machine/LLM-generatable with excellent parse errors; (3) a powerful, differentiating timeline layer; (4) preserve the Excalidraw hand-drawn look; (5) pluggable/extensible without grammar changes.

---

## 2. Design Principles

1. **Everything is a declaration.** Every meaningful line is either a *structure* line (`A -> B`, `node x`) or a keyword-led block (`theme`, `style`, `scene`, `timeline`, `beat`, `camera`, `highlight`, …). Keyword-first statements let a generator commit to statement *type* before details.
2. **Declare once, reference forever.** Geometry lives in `scene`; the `timeline` only ever *references* elements by `id`, `.tag`, or selector. This is what makes both magic-move (a cheap diff) and round-trippable live editing (append one declaration) work.
3. **One block shape.** `{ key: value }` is the *only* container for configuration — on nodes, edges, groups, cameras, beats, styles, and themes. Learn it once, use it everywhere.
4. **Typed, self-describing values.** `#hex`, `700ms`, `1.5x`, `12px`, `90%`, `(w,h)`, `$token`, `spring(180, 22)`. Values validate themselves, which yields precise errors and unambiguous generation.
5. **Closed enums where it matters, open plugins at the edges.** Shapes, arrowheads, flows, easings are short closed menus (great for LLMs). Anything unknown degrades to a plugin lookup (`custom("…")`, `import`) rather than a hard grammar error.
6. **Two surface forms, one semantic model.** A terse inline form (`camera focus services zoom 1.6`) for humans and an explicit block form (`camera { focus: services, zoom: 1.6 }`) for generators are *exactly equivalent*. When unsure, emit the block form.
7. **Order-independent structure.** Forward references are legal inside a `scene`; nodes and edges may appear in any order. Choreography (`timeline`) is order-*dependent* — beats play top to bottom.
8. **Fail with a map, not a wall.** The parser recovers at statement and block boundaries, reports *many* errors per run, and every diagnostic carries `line:col`, the expected set, the found token, and a fix hint.

---

## 3. Lexical Structure & Token List

### 3.1 Trivia (skipped)

- Line comments: `// …`, and `%% …` (Mermaid-style, for paste compatibility).
- Block comments: `/* … */` (nestable).
- Horizontal whitespace, except inside `STRING`, `RAWBLOCK`, and captured shape-`TEXT`.

### 3.2 Significant tokens

| Token | Pattern / notes |
|---|---|
| `NEWLINE` | Statement/property separator (significant; see §12.2 for continuation rules). |
| `SEMI` | `;` — alternate separator; interchangeable with `NEWLINE`. |
| `IDENT` | `[A-Za-z_][A-Za-z0-9_]*`; an internal `-` is part of the identifier **only if immediately followed by a letter or digit** (so `round-rect`, `dash-march`, `fit-all`, `cross-hatch` lex as one token, while `a-->b` lexes as `a` `-->` `b`). Ids should not end in `-`. |
| `KEYWORD` | Soft/contextual reserved words (recognized only in head position): `edd meta import as plugin define use theme style defaults extends tokens scene timeline beat step group container node edge anchor layout on at to by from via camera annotate reveal mermaid`. |
| `SHAPE_KW` | `rect round-rect ellipse circle diamond decision cylinder db hexagon parallelogram trapezoid cloud actor note document stadium subroutine triangle star text image frame custom`. |
| `LAYOUT_KW` | `dag tree grid radial flow free force`. |
| `CAMERA_KW` | `fit-all fit focus center zoom pan follow reset over ease pad tilt`. |
| `ANNOT_KW` | `highlight underline strike point-at spotlight callout label box circle-mark note-marker emphasize badge`. |
| `REVEAL_KW` | `show hide draw-on emphasize fade-in fade-out pop flow pulse move restyle add remove`. |
| `SELECTOR_KW` | `all nodes edges groups`. |
| `STRING` | `"…"` or `'…'` with `\n \t \" \\` escapes. |
| `RAWBLOCK` | `"""…"""` triple-quoted verbatim body (multiline strings and the `mermaid` block). |
| `NUMBER` | `-?\d+(\.\d+)?`. |
| `UNIT` | Suffix on a NUMBER: `px % deg rad turn ms s pt em fr x`. Produces `DIMENSION`, `PERCENT`, `DURATION`, `ANGLE`, or `SCALE` accordingly. |
| `COLOR` | `#rgb #rgba #rrggbb #rrggbbaa`, or `rgb(…)` / `rgba(…)` / `hsl(…)` function form. |
| `BOOL` | `true false yes no`. |
| `TOKEN_REF` | `$ident` — theme token / variable reference. |
| `CLASS_SEL` | `.ident` — class/tag selector ("elements marked *ident*"). |
| `TRIPLE_COLON` | `:::` — Mermaid class application (`node:::className`). |
| `EDGE_OP` | The arrow glyph set (longest-match): `-- --- -> --> <- <-- <-> <--> -.-> ..> ==> === ~> --o -o o-- o- --x -x x-- x-`. Subtype captured. |
| `AT` | `@` — normalized anchor (`node@(u,v)`) and inline endpoint anchor. |
| `AMP` | `&` — edge fan-out / fan-in. |
| `PIPE` | `\|` — Mermaid edge-label delimiter (`A -->\|Yes\| B`). |
| `COLON` `COMMA` `DOT` `SLASH` | `:` `,` `.` `/` (`.` = member/anchor/subpart; `/` = wildcard `group/*`). |
| `LBRACE` `RBRACE` | `{` `}` — attribute block, body, or diamond label (see D1, §12.4). |
| `LBRACKET` `RBRACKET` | `[` `]` — list value, selector list, or Mermaid shape sugar. |
| `LPAREN` `RPAREN` | `(` `)` — function calls, tuples, directive args. |
| `SHAPE_OPEN`/`SHAPE_CLOSE` | Mermaid bracket sugar delimiters: `[ ] ( ) (( )) ([ ]) [[ ]] [( )] {{ }} [/ /] [\ \] [/ \] [\ /] >`. |
| `EOF` | End of input. |

---

## 4. Program Structure & EBNF

Notation: `=` define · `|` alternative · `{ X }` zero-or-more · `[ X ]` optional · `( X )` group · `"x"` terminal · `UPPER` token class.

```ebnf
(* ===== TOP LEVEL ===== *)
Program        = { SEP } { TopStmt { SEP } } EOF ;
SEP            = NEWLINE | ";" ;

TopStmt        = VersionDecl | MetaDecl | ImportDecl | PluginDecl | DefineDecl
               | ThemeDecl   | StyleDecl | DefaultsDecl
               | SceneDecl   | TimelineDecl
               | MermaidDecl ;                 (* top-level mermaid = implicit scene *)

VersionDecl    = "edd" NUMBER ;                (* edd 1.0  — first non-trivia line, recommended *)
MetaDecl       = "meta" Block ;                (* title/author/canvas/background/grid... *)
ImportDecl     = "import" STRING [ "as" IDENT ] ;
PluginDecl     = "plugin" STRING [ Block ] ;   (* registers shapes/arrowheads/flows/annotations *)
DefineDecl     = "define" IDENT "(" [ ParamList ] ")" MacroBody ; (* templated structure *)
ParamList      = IDENT { "," IDENT } ;
MacroBody      = "{" { SEP } { SceneStmt { SEP } } "}" ;   (* body may contain ${param} INTERP *)

(* ===== THEME / STYLE / DEFAULTS ===== *)
ThemeDecl      = "theme" IDENT [ "extends" IDENT ] "{" { SEP }
                    [ "tokens"   Block { SEP } ]        (* $name: value *)
                    { ( TokenDef | Property | DefaultRule ) { SEP } }
                 "}" ;
TokenDef       = TOKEN_REF ":" Value ;                  (* $primary: #4f8cff *)
StyleDecl      = "style" ClassName [ "extends" ClassName ] PropBlock ;
ClassName      = CLASS_SEL | IDENT ;                    (* .service  or  service *)
DefaultsDecl   = "defaults" "{" { SEP } { DefaultRule { SEP } } "}" ;
DefaultRule    = DefaultTarget PropBlock ;              (* node { ... }  edge { ... } ... *)
DefaultTarget  = "node" | "edge" | "group" | "text" | "camera" | "beat" | "annotation" ;

(* ===== SCENE (structure, order-independent) ===== *)
SceneDecl      = "scene" [ IDENT ] "{" { SEP } { SceneStmt { SEP } } "}" ;
SceneStmt      = UseStmt | LayoutStmt | NodeStmt | GroupStmt | EdgeStmt
               | AnchorStmt | StyleDecl | AnnotateDecl | MermaidDecl ;

UseStmt        = "use" ( "theme" IDENT              (* activate theme        *)
                       | ClassName                  (* apply style class     *)
                       | IDENT "(" [ ArgList ] ")" );(* expand macro          *)

(* ---- Layout ---- *)
LayoutStmt     = "layout" LayoutKind [ Block ] ;
LayoutKind     = "dag" | "tree" | "grid" | "radial" | "flow" | "free" | "force" ;

(* ---- Nodes (three equivalent forms) ---- *)
NodeStmt       = MermaidNode | KeywordNode | ExplicitNode ;
MermaidNode    = IDENT ShapeSugar { ClassApply } [ AttrBlock ] ;   (* A[Label]:::c { ... } *)
KeywordNode    = SHAPE_KW IDENT [ STRING ] { ClassApply } [ AttrBlock ] ; (* cylinder db "PG" *)
ExplicitNode   = "node" IDENT [ STRING ] [ "as" ShapeSpec ]
                     { ClassApply } [ AttrBlock ] ;
ShapeSpec      = SHAPE_KW | "custom" "(" STRING ")" ;
ClassApply     = TRIPLE_COLON IDENT ;                  (* :::className *)
ShapeSugar     = "[" TEXT "]"    | "(" TEXT ")"   | "([" TEXT "])" | "[[" TEXT "]]"
               | "[(" TEXT ")]"  | "((" TEXT "))" | "{{" TEXT "}}" | "[/" TEXT "/]"
               | "[\" TEXT "\]"  | "[/" TEXT "\]" | "[\" TEXT "/]" | ">" TEXT "]"
               | "{" TEXT "}" ;                        (* diamond — see D1, §12.4 *)

(* ---- Groups / containers ---- *)
GroupStmt      = ( "group" | "container" ) IDENT [ STRING ] [ AttrBlock ] "{" { SEP }
                    { GroupItem { SEP } }
                 "}" ;
GroupItem      = LayoutStmt | NodeStmt | EdgeStmt | GroupStmt | AnchorStmt
               | UseStmt | Property ;

(* ---- Anchors / connection points ---- *)
AnchorStmt     = "anchor" IDENT "on" IDENT "at" AnchorSpec ;   (* scene-level  *)
AnchorInline   = "anchor" IDENT "at" AnchorSpec ;             (* inside a node *)
AnchorSpec     = Cardinal
               | ( "top" | "bottom" | "left" | "right" ) ":" PERCENT   (* side fraction  *)
               | "@" "(" NUMBER "," NUMBER ")" ;                       (* normalized u,v *)
Cardinal       = "n"|"s"|"e"|"w"|"ne"|"nw"|"se"|"sw"|"c"|"center" ;

(* ---- Edges ---- *)
EdgeStmt       = [ "edge" IDENT ":" ] Endpoints EdgeHop { EdgeHop }
                     [ EdgeLabel ] [ AttrBlock ] ;
EdgeHop        = EDGE_OP [ "|" TEXT "|" ] Endpoints ;  (* pipe label = Mermaid mid-label *)
Endpoints      = Endpoint { "&" Endpoint } ;           (* fan-out / fan-in *)
Endpoint       = PortRef | MermaidNode | KeywordNode ; (* reference or inline-declare *)
PortRef        = IDENT [ "." IDENT ] [ "@" "(" NUMBER "," NUMBER ")" ] ;
EdgeLabel      = STRING ;                               (* trailing quoted label *)

(* ===== ANNOTATION LAYER (always-on, outside timeline) ===== *)
AnnotateDecl   = "annotate" [ STRING ] "{" { SEP } { AnnotationCmd { SEP } } "}" ;

(* ===== TIMELINE (choreography, order-dependent) ===== *)
TimelineDecl   = "timeline" [ IDENT ] "{" { SEP } { TimelineStmt { SEP } } "}" ;
TimelineStmt   = BeatStmt | Property ;                 (* props: autoplay,loop,defaultEase *)
BeatStmt       = ( "beat" | "step" ) IDENT [ STRING ] "{" { SEP }
                    { BeatItem { SEP } }
                 "}" ;
BeatItem       = CameraStmt | AnnotateStmt | RevealStmt | StaggerStmt
               | AnnotationCmd | RevealCmd            (* bare inline command *)
               | Property ;                            (* narrate,hold,wait,ease,duration,transition *)

StaggerStmt    = "stagger" DURATION "{" { SEP } { ( RevealCmd | AnnotationCmd ) { SEP } } "}" ;

(* ---- Camera ---- *)
CameraStmt     = "camera" ( PropBlock | CameraInline ) ;
CameraInline   = CameraVerb [ Target ] { CameraOpt } ;
CameraVerb     = "fit-all" | "fit" | "focus" | "center" | "zoom" | "pan" | "follow" | "reset" ;
CameraOpt      = "zoom" NUMBER | "over" DURATION | "ease" EaseSpec
               | "pad" NUMBER  | "by" Tuple | "to" ( Tuple | Target ) | "tilt" ANGLE ;
(* block-form keys: fit|focus|center|follow (Target), zoom, pan(Tuple), ease,
   duration, pad, tilt, hold *)

(* ---- Annotations ---- *)
AnnotateStmt   = "annotate" "{" { SEP } { AnnotationCmd { SEP } } "}" ;
AnnotationCmd  = AnnKind Target [ STRING ] [ Tail ] ;
AnnKind        = "highlight" | "underline" | "strike" | "point-at" | "spotlight"
               | "callout"   | "label"     | "box"    | "circle-mark"
               | "note-marker"| "emphasize" | "badge" ;

(* ---- Reveal (progressive disclosure + animation triggers) ---- *)
RevealStmt     = "reveal" "{" { SEP } { RevealCmd { SEP } } "}" ;
RevealCmd      = RevealVerb Target [ RevealArg ] [ Tail ]
               | "move"    Target "to" ( Tuple | Target ) [ Tail ]
               | "restyle" Target PropBlock
               | "add"     ( NodeStmt | EdgeStmt )
               | "remove"  Target ;
RevealVerb     = "show" | "hide" | "draw-on" | "emphasize" | "fade-in"
               | "fade-out" | "pop" | "flow" | "pulse" ;
RevealArg      = "with" IDENT ;                        (* show x with pop *)

(* ===== SHARED ===== *)
Tail           = PropBlock | InlineProps ;
InlineProps    = Property { [ "," ] Property } ;       (* run to end-of-line *)
Block          = "{" { SEP } { Property { SEP } } "}" ;
AttrBlock      = "{" { SEP } { PropItem { SEP } } "}" ;
PropBlock      = AttrBlock ;
PropItem       = Property | AnchorInline | UseStmt | NestedProp ;
NestedProp     = IDENT PropBlock ;                     (* font { size: 18, align: center } *)
Property       = Key ( ":" | "=" ) Value { "," Value } ;  (* value or comma value-list *)
Key            = IDENT ;

Target         = SelectorList ;
SelectorList   = Selector | "[" Selector { "," Selector } "]" ;
Selector       = SELECTOR_KW | CLASS_SEL | Wildcard | Tuple | PortRef ;
Wildcard       = IDENT "/" "*" ;                       (* group/*  = all descendants *)

Value          = STRING | RAWBLOCK | NUMBER | PERCENT | DURATION | ANGLE | DIMENSION
               | SCALE | COLOR | BOOL | TOKEN_REF | CLASS_SEL
               | Tuple | List | FuncCall | PortRef | IDENT ;   (* IDENT = enum keyword *)
Tuple          = "(" [ Value { "," Value } ] ")" ;
List           = "[" [ Value { "," Value } ] "]" ;
FuncCall       = IDENT "(" [ ArgList ] ")" ;
ArgList        = Arg { "," Arg } ;
Arg            = [ IDENT ":" ] Value ;                  (* positional or named *)
EaseSpec       = IDENT | FuncCall ;

(* ---- Mermaid interop ---- *)
MermaidDecl    = "mermaid" [ "as" IDENT ] RAWBLOCK ;    (* verbatim mermaid, lowered to scene *)
```

---

## 5. Constructs, One by One (with a short example each)

### 5.1 Preamble

```edd
edd 1.0                                   // version pragma (recommended first line)
meta { title: "Payments", canvas: (1920, 1080), background: $bg, grid: true }
import "std/icons" as icons               // plugin/asset pack, namespaced as icons.*
plugin "edd-aws-shapes" { region: us-east-1 }
```

### 5.2 Theme, tokens, style classes, defaults

```edd
theme light {
  tokens { $bg: #ffffff; $surface: #f4f4f5; $accent: #2563eb; $danger: #ef4444 }
  font: hand                              // 'hand' => Excalifont (keeps the look)
  roughness: 1                            // rough.js amount: 0 | 1 | 2
}
theme dark extends light { tokens { $bg: #0f172a; $surface: #1e293b } }

style .card    { shape: round-rect, fill: $surface, fillStyle: hachure }
style .store   extends .card { shape: cylinder, fill: #dbeafe }
style .critical{ stroke: $danger, strokeWidth: bold, animate: pulse }

defaults {
  node   { use: .card }
  edge   { curve: bezier, color: $accent, endArrow: triangle }
  camera { ease: spring(180, 22), duration: 700ms, pad: 48 }
  beat   { transition: magic-move, hold: 0 }
}
```

### 5.3 Nodes — three equivalent forms

```edd
scene {
  a[Login]                       // Mermaid sugar: rectangle, label "Login"
  b(Rounded)                     // rounded rect
  cylinder db "Postgres"         // keyword form
  node gw "API Gateway" as hexagon { strokeWidth: bold }   // explicit form
  d{Decision?}                   // Mermaid diamond (D1)
  x[Cache]:::store { opacity: 0.9 }  // sugar + class + attribute block
}
```

### 5.4 Groups / containers (own layout + style scope, addressable as one)

```edd
group services "Application Tier" {
  layout grid { cols: 3, gap: 40 }
  fill: $surface
  round-rect auth "Auth"
  round-rect api  "API" { tags: [critical] }
  api -> auth "verify"           // intra-group edge
}
```

### 5.5 Anchors / connection points (richer than Excalidraw)

```edd
hexagon gw "Gateway" {
  anchor ingress at left:50%     // fraction of the left side
  anchor secure  at @(0.9, 0.2)  // normalized (u,v) inside the bbox
}
anchor writer on db at top:30%   // scene-level anchor declaration
// referenced in edges: gw.ingress, db.writer, api@(1, 0.5)
```

### 5.6 Edges — Mermaid glyphs, anchors, chaining, labels, animation

```edd
a -> b                                   // solid arrow
a --> b                                  // solid arrow (Mermaid spelling, identical)
a -.-> c "async"                         // dotted + trailing label
a ==> d { strokeWidth: 3 }               // thick
a -->|Yes| b                             // Mermaid pipe label
gw.ingress -> db.writer { endArrow: crowfoot_many, animate: draw-on }  // anchor→anchor
a -> b -> c                              // chain (expands to two edges)
a -> b & c                               // fan-out to two targets
edge hot: api ~> worker "enqueue" { curve: arc, animate: flow }        // named edge
```

### 5.7 Always-on annotation layer (outside the timeline)

```edd
annotate "persistent" {
  callout   db "source of truth" { placement: bottom }
  underline gw.label { style: double, color: $accent }
}
```

### 5.8 Timeline, beats, camera, annotate, reveal, stagger

```edd
timeline story {
  autoplay: false
  defaultEase: spring(0.7, 12)

  beat overview "Whole system" {
    camera fit-all over 800ms
    reveal { show all with fade-in }
    narrate: "End-to-end request path."
    hold: 1.5s
  }

  beat ingress "Traffic enters" {
    camera focus [a, gw] zoom 1.5 ease spring   // inline camera
    stagger 120ms {                              // staggered sub-reveal
      draw-on a -> gw
      show gw
    }
    annotate {
      point-at gw "single entry point" { from: ne, color: $accent }
      highlight a { style: marker }
    }
  }

  beat data "Where state lives" {
    camera { focus: [db, x], zoom: 1.8, pan: (0, -40),   // block-form camera
             ease: cubic-bezier(0.2, 0.8, 0.2, 1), duration: 1200ms }
    reveal { emphasize db with pulse; hide legacy }
    annotate { callout db "primary of record" { placement: right } }
  }
}
```

### 5.9 Mermaid import

```edd
mermaid """
flowchart LR
  metrics[Prometheus] --> grafana[Grafana]
  metrics --> alertmgr[Alertmanager]
"""
// node ids `metrics`, `grafana`, `alertmgr` are now first-class scene ids,
// targetable by camera / annotate / reveal in the timeline.
```

### 5.10 Macros (repetitive structure)

```edd
define microservice(id, title, accent) {
  round-rect ${id} "${title}" { class: .card, stroke: ${accent} }
}
scene {
  use microservice("auth", "Auth", $accent)
  use microservice("orders", "Orders", $danger)
}
```

---

## 6. Reference Tables

### 6.1 Shapes (`shape:` / keyword / sugar → renderable primitive)

| Keyword | Mermaid sugar | Lowers to | Keyword | Sugar | Lowers to |
|---|---|---|---|---|---|
| `rect` | `[x]` | rectangle | `hexagon` | `{{x}}` | polygon→rectangle bbox |
| `round-rect` | `(x)` | rounded rectangle | `parallelogram` | `[/x/]` | polygon |
| `stadium`/`pill` | `([x])` | rounded rectangle | `trapezoid` | `[/x\]` | polygon |
| `subroutine` | `[[x]]` | rectangle (double) | `cloud` | — | plugin path → rectangle |
| `cylinder`/`db` | `[(x)]` | cylinder | `actor` | — | stickman group |
| `circle` | `((x))` | ellipse | `note`/`document` | — | rectangle |
| `ellipse` | — | ellipse | `triangle`/`star` | — | polygon |
| `diamond`/`decision` | `{x}` | diamond | `text` | — | bare text |
| `flag` | `>x]` | polygon | `image`/`frame` | — | image / frame |
| `custom("id")` | — | plugin-registered path | | | |

Unknown shape name ⇒ plugin lookup; if unresolved ⇒ semantic error `unknown-shape` (never a parse error).

### 6.2 Edge operators (glyph → default lowering)

| Glyph | Line | End head | Notes |
|---|---|---|---|
| `--` / `---` | solid | none | plain connector |
| `->` / `-->` | solid | triangle | canonical arrow (Mermaid spelling `-->`) |
| `<-` / `<--` | solid | triangle at start | reversed |
| `<->` / `<-->` | solid | triangle both | bidirectional |
| `-.->` / `..>` | dotted | triangle | async / dependency |
| `==>` / `===` | thick | triangle / none | emphasis |
| `~>` | curvy (organic) | triangle | default `animate: flow` |
| `--o` / `-o` | solid | circle | association |
| `--x` / `-x` | solid | bar | termination |
| `o--o` / `x--x` | solid | circle / bar both | — |

Any glyph's implied style is overridable by the trailing `{ … }` block.

### 6.3 Arrowheads (`startArrow` / `endArrow`)

`none` · `arrow` · `triangle` · `triangle_outline` · `bar` · `dot` · `circle` · `circle_outline` · `diamond` · `diamond_outline` · `crowfoot_one` · `crowfoot_many` · `crowfoot_one_or_many` · `cardinality_one` · `cardinality_many` · `cardinality_one_or_many` · `cardinality_exactly_one` · `cardinality_zero_or_one` · `cardinality_zero_or_many`.

### 6.4 Arrow / edge animations (`animate:` / `flow` reveal verb)

| Value | Effect |
|---|---|
| `none` | static |
| `flow` | dashes flow along the path, direction of travel |
| `dash-march` | marching ants (dashoffset loop) |
| `pulse` | width/opacity pulse along stroke |
| `draw-on` | path draws itself in on reveal |
| `glow` | soft animated glow halo |
| `comet` | bright leading head with fading trail |
| `electric` | jittered high-frequency stroke |
| `caravan` | evenly spaced dots travelling the path |
| `wiggle` | subtle hand-drawn wobble loop |

Options via block: `animate: flow { speed: 1.2, direction: forward, trail: 0.35 }`.

### 6.5 Annotation types

| Kind | Meaning | Common opts |
|---|---|---|
| `highlight` | marker/glow behind target | `style: marker\|glow\|box`, `color` |
| `underline` | hand-drawn underline of a text run | `style: solid\|double\|wavy`, `color` |
| `strike` | strike-through | `color` |
| `point-at` | pointer arrow to target | `from: <cardinal\|point>`, `curve`, `head` |
| `spotlight` | dim everything except target | `dim: 0..1`, `shape`, `pad` |
| `callout` | leader-line bubble with text | `placement`, `connector: true` |
| `label` | (re)label a node/edge | `color`, `placement` |
| `box` | draw a labelled box around a set | `pad`, `color` |
| `circle-mark` | hand-drawn ring around target | `color` |
| `note-marker` | numbered/lettered pin | `color` |
| `emphasize` | scale/pulse to draw the eye | `scale`, `with: pulse` |
| `badge` | small corner badge with text | `placement` |

### 6.6 Camera operations

| Op | Form | Meaning |
|---|---|---|
| `fit-all` | `camera fit-all` | frame the entire diagram |
| `fit` | `camera fit [a,b,c]` | frame a specific set |
| `focus` | `camera focus x zoom 1.5` | center + zoom on one target/set |
| `center` | `camera center db` | center a target, keep zoom |
| `zoom` | `camera zoom 1.3` | set zoom factor |
| `pan` | `camera pan to (x,y)` / `pan by (dx,dy)` | absolute / relative move |
| `follow` | `camera follow worker over 800ms` | track a moving target |
| `reset` | `camera reset` | return to `fit-all` home view |

Shared options: `zoom N` · `over <duration>` · `ease <easing>` · `pad N` · `tilt <angle>`.

### 6.7 Easings

`linear` · `ease` · `ease-in` · `ease-out` · `ease-in-out` · `bounce` · `magic` (default spring tuned for magic-move) · `spring(stiffness, damping)` (or named `spring(mass:1, stiffness:180, damping:22)`) · `cubic-bezier(a, b, c, d)`.

### 6.8 Fill / stroke / roughness enums

- `fillStyle`: `hachure` · `cross-hatch` · `solid` · `zigzag`
- `strokeStyle`: `solid` · `dashed` · `dotted`
- `strokeWidth`: `thin` · `medium` · `bold` · *number*
- `roughness`: `architect`(0) · `artist`(1) · `cartoonist`(2) · *number*
- `curve`: `straight` · `bezier` · `curved` · `orthogonal` · `elbow` · `step` · `arc`
- `layout`: `dag` · `tree` · `grid` · `radial` · `flow` · `free` · `force`; `direction: up|down|left|right` (aliases `TB|BT|LR|RL`).

---

## 7. Full Example 1 — Simple Flow

```edd
edd 1.0
meta { title: "Signup Flow" }

scene {
  layout dag { direction: down, gap: 60 }

  start([Start])
  form[Signup Form]
  valid{Valid?}
  ok(Create Account):::good
  err(Show Errors):::bad

  start --> form
  form  --> valid
  valid -->|yes| ok
  valid -->|no|  err
  err   --> form
}

style .good { stroke: #16a34a }
style .bad  { stroke: #ef4444 }
```

---

## 8. Full Example 2 — Complex Architecture (steps + annotations + animated arrows)

```edd
edd 1.0

meta { title: "WebShop Reference Architecture", author: "platform-team", canvas: (1920, 1080) }
import "std/icons" as icons

theme light {
  tokens { $bg:#ffffff; $surface:#f4f4f5; $stroke:#1f2937; $accent:#2563eb; $danger:#ef4444; $muted:#9ca3af }
  font: hand
  roughness: 1
}
theme dark extends light { tokens { $bg:#0f172a; $surface:#1e293b; $stroke:#e2e8f0 } }

style .card     { shape: round-rect, fill: $surface, stroke: $stroke, fillStyle: hachure }
style .store    extends .card { shape: cylinder, fill: #dbeafe }
style .critical { stroke: $danger, strokeWidth: bold, animate: pulse }

defaults {
  node   { use: .card }
  edge   { curve: bezier, color: $muted, endArrow: triangle }
  camera { ease: spring(180, 22), duration: 700ms, pad: 48 }
  beat   { transition: magic-move, hold: 0 }
}

scene main {
  use theme light
  layout dag { direction: down, gap: 60, rankGap: 110 }

  actor client "User"
  cloud cdn "CDN / Edge" { fill: #ecfeff, icon: icons.globe }

  hexagon gateway "API Gateway" {
    strokeWidth: bold
    anchor north_in at top:50%
    anchor ingress  at @(0.0, 0.5)
    tags: [edge, critical]
  }

  group services "Application Services" {
    layout grid { cols: 3, gap: 40 }
    fill: $surface
    round-rect auth   "Auth Service"
    round-rect api    "API Service" { strokeWidth: bold, tags: [critical] }
    subroutine worker "Async Worker"
  }

  group data "Data Layer" {
    layout radial { center: db, radius: 180, startAngle: 30deg }
    cylinder db "Postgres" {
      use .store
      anchor writer at top:30%
      anchor reader at bottom:70%
    }
    cylinder      cache "Redis" { fill: #fee2e2 }
    parallelogram queue "Message Queue"
  }

  note legacy "Legacy Billing\n(deprecate)" { at: (1500, 60), pin: true, strokeStyle: dashed, opacity: 0.6 }

  // edges: arrowhead + animation variety
  edge e_https:   client  -> cdn "https"
  edge e_miss:    cdn     ==> gateway.north_in "cache miss" { color: $accent }
  edge e_auth:    gateway -> auth "authZ" { startArrow: dot }
  edge e_rest:    gateway -> api  "REST"  { animate: dash-march }
  edge e_job:     api     ~> worker "enqueue" { curve: arc, animate: flow }
  edge e_write:   api@(1,0.5) -> db.writer "write" { endArrow: crowfoot_many, animate: draw-on }
  edge e_read:    api     -.-> cache "read-through" { endArrow: cardinality_zero_or_one }
  edge e_pub:     worker  -> queue "publish" { animate: pulse }
  edge e_persist: queue   -> db.reader "persist"
  edge e_dep:     api     -x legacy "deprecated" { color: $muted, strokeStyle: dashed }

  api -> worker -> queue { color: $muted, curve: orthogonal }   // chained observability path
}

annotate "persistent" {
  callout db "source of truth" { placement: bottom, connector: true }
}

timeline story {
  autoplay: false
  defaultEase: spring(0.7, 12)

  beat overview "The whole system" {
    camera fit-all over 800ms
    reveal { show all with fade-in }
    narrate: "Here is the end-to-end request path."
    hold: 1.5s
  }

  beat ingress "Traffic enters at the edge" {
    camera focus [client, cdn, gateway] zoom 1.5 ease spring
    stagger 150ms {
      draw-on e_https { over: 600ms }
      draw-on e_miss  { over: 600ms }
    }
    reveal { hide .critical }
    annotate {
      point-at gateway "single entry point" { from: ne, color: $accent }
      highlight cdn { style: marker, color: #fef08a }
    }
    transition: magic-move
  }

  beat services "Inside the app tier" {
    camera focus services zoom 1.6
    reveal {
      show .critical with pop
      emphasize api with pulse
      flow [e_rest, e_job]
    }
    annotate {
      spotlight services { dim: 0.72 }
      underline api.label { style: wavy, color: $accent }
      label e_auth "OIDC"
    }
    narrate: "Auth fronts the API; the worker drains async jobs."
    hold: 2s
  }

  beat data "Where state lives" {
    camera { focus: [db, cache, queue], zoom: 1.8, pan: (0, -40),
             ease: cubic-bezier(0.2, 0.8, 0.2, 1), duration: 1200ms, pad: 64 }
    reveal {
      draw-on [e_write, e_read, e_persist] { over: 500ms }
      pulse db
      hide legacy
    }
    annotate {
      callout     db "primary of record\n2 sync replicas" { placement: right }
      circle-mark queue "retry here"
      box [gateway, api, db] "critical write path"
    }
    narrate: "All writes funnel through Postgres; Redis is read-through."
    hold: 2s
  }

  beat recap "Recap" {
    camera reset over 900ms ease ease-in-out
    reveal { show all }
    annotate { note-marker gateway "start"; note-marker db "end" }
  }
}
```

---

## 9. Full Example 3 — Mermaid import, then annotate

```edd
edd 1.0
meta { title: "Observability — imported from Mermaid, presented in EDodoDraw" }

// 1) Structure comes verbatim from Mermaid; ids become first-class scene ids.
mermaid """
flowchart LR
  app[App Servers] --> otel[OTel Collector]
  otel --> prom[Prometheus]
  otel --> loki[Loki]
  prom --> grafana[Grafana]
  loki --> grafana
  prom --> alertmgr[Alertmanager]
"""

// 2) Layer EDodoDraw styling on the imported nodes.
style .signal { stroke: #7c3aed }
scene { grafana:::signal; alertmgr:::signal }   // re-open scene to tag imported nodes

// 3) Choreograph a walkthrough that references the Mermaid ids directly.
timeline walkthrough {
  beat all "Pipeline overview" {
    camera fit-all over 700ms
    reveal { show all }
    narrate: "Telemetry flows left to right into Grafana."
  }

  beat collect "Collection" {
    camera focus [app, otel] zoom 1.6
    annotate {
      highlight otel { style: glow }
      point-at otel "single ingestion point" { from: s }
    }
    reveal { flow app -> otel }
  }

  beat visualize "Dashboards & alerts" {
    camera focus [grafana, alertmgr] zoom 1.5
    annotate {
      underline grafana.label { style: double }
      callout alertmgr "pages on-call" { placement: top }
    }
    reveal { emphasize grafana with pulse }
  }
}
```

---

## 10. Semantic Rules the Parser Feeds the Engine

### 10.1 Style cascade (lowest → highest precedence)

1. Active `theme` values.
2. `defaults { <type> { … } }`.
3. Applied style classes (`:::c`, `use .c`, `class:` attribute); multiple classes merge left→right; `extends` resolved first.
4. Inline node/edge `{ … }` attributes.
5. Beat-scoped `restyle` (timeline only, non-destructive to the base scene).

### 10.2 Layout precedence

A node with `at: (x,y)` **and** `pin: true` is placed absolutely and excluded from auto-layout. A node with `at:` but no `pin` uses that point as a layout *seed*. All others are positioned by the enclosing `layout`. Group layouts nest: a group runs its own algorithm, then participates in its parent's layout as a single box.

### 10.3 Beat state model (magic-move contract) — **normative**

Between consecutive beats the engine diffs state and spring-tweens the delta. What carries over:

| Channel | Carry-over rule |
|---|---|
| **Camera** | **Sticky.** A beat with no `camera` keeps the previous camera. |
| **Visibility** (`show`/`hide`/`fade-*`) | **Sticky** until changed. |
| **Position / restyle / move / add / remove** | **Sticky** (they mutate the working scene for the remainder of the timeline). |
| **Looping animations** (`flow`/`pulse`/`emphasize`) | **Sticky** until a later beat targets the same element with a different/`none` animation. |
| **Annotations** (`annotate { … }`) | **Beat-scoped: cleared at the start of each beat** unless the command carries `persist: true`, or it lives in a top-level `annotate` block (always-on layer). |

`transition:` (default `magic-move`) and `ease:`/`duration:` on a beat govern how the diff animates. `hold:`/`wait:` set dwell time; `narrate:` is a speaker note (non-visual).

### 10.4 Namespaces & resolution

- Node ids, group ids, and edge ids share one scene namespace; duplicates are an error.
- `.name` selectors match elements bearing class **or** tag `name`.
- `x.foo` resolves as: reserved subpart if `foo ∈ {label, text, title, body}`, else an anchor of `x`; unresolved ⇒ `unknown-anchor`.
- Forward references are legal in `scene`; a two-pass resolver binds refs after the whole scene is parsed. Timeline refs must resolve to already-declared scene elements (or ones created by a prior `add`).

---

## 11. Round-Trip / Live Editing Contract

Every interactive edit lowers to exactly one appended declaration, keeping canvas and code in sync:

| User action on canvas | Appended `.edd` |
|---|---|
| Draw a highlight/underline/arrow while a beat is active | `annotate { … }` / `edge …` inside that beat |
| Draw one on the base diagram | statement in the always-on `annotate` block |
| Move/pin a node | `at: (x,y)` + `pin: true` on that node (or `move … to` in a beat) |
| Add a node/edge live during a beat | `add node …` / `add edge …` inside the beat |
| Re-tint an element in a beat | `restyle target { … }` |

Because structure is order-independent and choreography is append-only per beat, edits never force a re-ordering or reflow of existing source.

---

## 12. Parser Implementation Notes (normative)

### 12.1 Overall strategy

Hand-written **recursive-descent, keyword-dispatched, LL(2)**. Top-level and in-block statements are chosen by their leading keyword (`theme`, `scene`, `beat`, `camera`, `highlight`, …). The only places needing two-token lookahead are the node-vs-edge decision (§12.3) and the brace-role decision D1 (§12.4). No backtracking beyond two tokens is ever required.

### 12.2 Statement terminators & line continuation

- A statement/property ends at `SEP` (`NEWLINE` or `;`). Consecutive `SEP`s collapse.
- `SEP` is **ignored** (lines join) when: inside `()`/`[]`; immediately after `{` or before `}`; and when the previous significant token is an *opener or connector* — any `EDGE_OP`, `&`, `,`, `:`, `=`, `|`, `(`, `[`, `{`. This lets edges and attribute blocks wrap across lines safely.
- A backslash at end of line (`\`) forces continuation regardless.

### 12.3 Node vs. edge disambiguation

Parse a leading `PortRef`/`MermaidNode` (id + optional shape sugar + optional `.anchor`/`@(u,v)`). Then peek **one** token:
- `EDGE_OP` (or `&` before one) ⇒ **EdgeStmt**.
- `{` ⇒ apply D1 (§12.4): attribute block ⇒ **NodeStmt**; diamond text ⇒ **NodeStmt** (diamond shape).
- `:::`, `STRING`, `as`, `SEP`, or `EOF` ⇒ **NodeStmt / reference**.
- Anything else ⇒ error `expected edge operator or attribute block after 'X'`.

`SHAPE_KW`- and `node`-led forms are unambiguous (keyword first).

### 12.4 D1 — brace role (`{` is attribute block, body, or diamond label)

After a node id/sugar, a `{` opens one of: an **attribute block**, or a **diamond label** (Mermaid). Resolve by peeking past `SEP`s at the first meaningful content:
- `}` (empty) → attribute block.
- `IDENT` followed by `:` or `=` , or a `NestedProp`/`use`/`anchor` keyword → attribute block.
- Otherwise → **diamond label**: capture raw `TEXT` up to the matching `}`.

A diamond label that literally contains `key:` **must be quoted**: `d{"a: b"}`. In statement/body position (`scene {`, `group {`, `beat {`, `timeline {`), `{` is always a **body** — never a diamond — because it does not follow a node id. Documentation recommends the unambiguous `decision id "…"` / `diamond id "…"` form when a label might look like attributes.

### 12.5 Precedence & associativity

- **Edge chains** `a -> b -> c` are **left-associative**; lower to N−1 binary edges sharing the trailing attribute block.
- **Fan-out** `a -> b & c` binds `&` tighter than the hop: it expands to `a -> b` and `a -> c`.
- **Values**: `(` after an `IDENT` ⇒ `FuncCall`; `(` elsewhere ⇒ `Tuple`. `.`/`@` after an `IDENT` in value position ⇒ `PortRef`; otherwise the `IDENT` is an enum keyword.
- **Longest-match lexing** for `EDGE_OP` (so `-->` beats `--` beats `-`, `<-->` beats `<->`).
- **Comma vs. SEP** inside blocks: both separate items; a trailing separator before `}` is allowed.

### 12.6 Enum & key validation

Unknown attribute *keys*, enum *values*, shapes, arrowheads, flows, and easings are **not** parse errors. The parser accepts any `IDENT`/`FuncCall` in value position and records a `SemanticNote`; the resolver then (a) matches a plugin, or (b) emits a `warning` (unknown key) / `error` (unknown enum in a closed position) with a **"did you mean …"** suggestion computed by edit distance against the closed menu. This keeps LLM output resilient (a near-miss becomes a fixable warning, not a hard failure).

### 12.7 Error recovery (panic-mode, multi-error)

- **Statement level:** on error, skip to the next `SEP`; resynchronize. Emit one diagnostic; continue.
- **Block level:** if a `{ … }` body is malformed, skip to the matching `}` (tracking nesting) and resume with the parent.
- **Top level:** always resynchronize on the next top-level keyword.
- **Bracket balancing:** unmatched `{[(` are reported at the opener with the point where balance was lost; the recovery inserts a virtual closer so later statements still parse.
- The parser **collects all diagnostics** in one pass rather than aborting on the first.

### 12.8 Diagnostic format (required fields)

```
<severity> [<code>] <file>:<line>:<col>: <message>
  <source line>
  <caret underline>
  expected: <set> ; found: <token>
  hint: <actionable suggestion>
```

Severities: `error` (blocks render), `warning` (renders, unknown key / soft enum miss), `info`. Stable machine codes, e.g. `E-EDGE-NOOP` (edge operator expected), `E-DUP-ID`, `E-UNRESOLVED-REF`, `W-UNKNOWN-KEY`, `W-ENUM-NEARMISS`, `E-UNCLOSED-BLOCK`, `E-BAD-DIAMOND` (unquoted `:` in diamond label). Every code maps to one doc anchor.

### 12.9 Two-pass pipeline

1. **Lex** → token stream (comments/whitespace as trivia; positions retained for round-trip).
2. **Parse** → concrete + abstract syntax tree; structural errors recovered as above.
3. **Expand** → macros (`define`/`use(...)`, `${}` interpolation), and lower `mermaid` raw blocks via the bundled Mermaid→scene converter (its own errors are re-emitted with `M-` codes and mapped back to the raw block's line range).
4. **Resolve** → bind refs, anchors, classes, tokens; run enum/key validation; apply the cascade (§10.1).
5. **Layout plan** → attach dagre/grid/radial hints (positions computed by the engine, not the parser).
6. **Emit** → `{ scene: SceneGraph, timeline: Beat[] }`, the engine's input contract.

### 12.10 Stability guarantees for round-trip

The AST retains byte spans, trivia, and original formatting hints so a formatter/serializer can (a) append new statements without reflowing existing text, and (b) reprint an edited element in place. Serialization is deterministic: attribute keys emit in declared order, and inline↔block camera/annotation forms are preserved as authored unless the writer is explicitly asked to normalize.

---

## 13. Conformance Checklist

A v1.0-conforming implementation MUST: parse all three full examples; honor the style cascade (§10.1), layout precedence (§10.2), and beat state model (§10.3); support all shapes/arrowheads/animations/annotations/camera-ops/easings in §6; accept the three node forms and the full edge-operator table; resolve forward references; lower `mermaid` blocks into the shared scene graph; validate closed enums with near-miss suggestions; and emit the diagnostic format of §12.8 with multi-error recovery. It SHOULD support macros (`define`/`use`), plugins (`import`/`plugin`, `custom(…)`), and deterministic round-trip serialization.