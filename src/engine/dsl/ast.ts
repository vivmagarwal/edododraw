/**
 * AST for the EDodoDraw DSL. A pragmatic, compile-oriented tree: it captures
 * everything the compiler needs to emit a Scene IR (structure + annotations +
 * timeline steps) while staying close to the surface grammar.
 */

export interface Span {
  start: number;
  end: number;
  line: number;
  col: number;
}

// ---- values ----------------------------------------------------------------

export type Value =
  | { t: "str"; v: string }
  | { t: "num"; v: number; unit: string | null }
  | { t: "color"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ident"; v: string } // enum keyword / bare word
  | { t: "token"; v: string } // $name
  | { t: "class"; v: string } // .name (selector)
  | { t: "tuple"; v: Value[] } // (a, b)
  | { t: "list"; v: Value[] } // [a, b, c]
  | { t: "call"; name: string; args: Value[] } // spring(180, 22)
  | { t: "styled"; name: string; block: Attr[] } // flow { speed: 1.2 }
  | { t: "ref"; id: string; sub?: string; uv?: [number, number] }; // port ref

export interface Attr {
  key: string;
  value: Value;
  span: Span;
}

export type AttrBlock = Attr[];

export function attr(block: AttrBlock, key: string): Value | undefined {
  const found = block.find((a) => a.key === key);
  return found?.value;
}

// ---- endpoints / anchors ---------------------------------------------------

export interface Endpoint {
  id: string;
  sub?: string; // .anchor or .label
  uv?: [number, number]; // @(u,v)
  /** inline-declared node (e.g. `a --> b[New]`). */
  inline?: NodeDecl;
  span: Span;
}

export interface AnchorDecl {
  type: "anchor";
  name: string;
  on?: string; // scene-level: `anchor x on node at ...`
  spec: AnchorSpecAst;
  span: Span;
}

export type AnchorSpecAst =
  | { kind: "cardinal"; v: string }
  | { kind: "side"; side: string; frac: number }
  | { kind: "uv"; u: number; v: number };

// ---- scene statements ------------------------------------------------------

export interface NodeDecl {
  type: "node";
  id: string;
  label?: string;
  shape?: string;
  classes: string[];
  attrs: AttrBlock;
  anchors: AnchorDecl[];
  span: Span;
  /** Source offsets of the attribute block braces (for surgical patching). */
  attrOpen?: number;
  attrClose?: number;
}

export interface EdgeOpInfo {
  glyph: string;
  midLabel?: string;
}

export interface EdgeDecl {
  type: "edge";
  id?: string;
  /** fan groups connected by ops: groups[0] --op0--> groups[1] --op1--> ... */
  groups: Endpoint[][];
  ops: EdgeOpInfo[];
  label?: string; // trailing quoted label
  attrs: AttrBlock;
  span: Span;
}

export interface GroupDecl {
  type: "group";
  id: string;
  label?: string;
  attrs: AttrBlock;
  layout?: LayoutDecl;
  items: SceneStmt[];
  span: Span;
}

export interface LayoutDecl {
  type: "layout";
  kind: string;
  attrs: AttrBlock;
  span: Span;
}

export interface UseStmt {
  type: "use";
  what: "theme" | "class" | "macro";
  name: string;
  args?: Value[];
  span: Span;
}

export interface ClassApplyStmt {
  type: "classapply";
  id: string;
  classes: string[];
  span: Span;
}

export interface MermaidDecl {
  type: "mermaid";
  body: string;
  span: Span;
}

// ---- visualizations ---------------------------------------------------------

/**
 * One data entry inside a `viz` block: `item "Label" 40 { color: red }`,
 * `flow a -> b 30`, `row ["Q1", 10, 12]`, `series "2024" [4, 8, 15]`, …
 * The entry keyword set is OPEN — each viz generator validates the kinds it
 * understands, so new visualization types need no grammar change.
 */
export interface VizEntry {
  kind: string; // item | row | series | flow | set | task | …
  /** Optional bare-ident id (`item apples "Apples"`). */
  id?: string;
  /** Quoted display label. */
  label?: string;
  /** Arrow target for connection-like entries (`flow a -> b`). */
  to?: string;
  /** Positional values after the label: numbers, strings, idents, lists. */
  values: Value[];
  attrs: AttrBlock;
  children: VizEntry[];
  span: Span;
}

/** `viz funnel "Title" { orientation: down; item "A" 40; … }` */
export interface VizDecl {
  type: "viz";
  vizType: string;
  id?: string;
  title?: string;
  attrs: AttrBlock; // options (key: value pairs)
  entries: VizEntry[];
  span: Span;
}

export type SceneStmt =
  | NodeDecl
  | EdgeDecl
  | GroupDecl
  | LayoutDecl
  | AnchorDecl
  | UseStmt
  | StyleDecl
  | AnnotateDecl
  | MermaidDecl
  | VizDecl
  | ClassApplyStmt;

// ---- annotations -----------------------------------------------------------

export interface AnnotationCmd {
  type: "annotcmd";
  kind: string; // highlight, underline, point-at, spotlight, callout, box, ...
  target?: Endpoint;
  targetList?: Value; // for box [a,b,c]
  text?: string;
  attrs: AttrBlock;
  span: Span;
}

export interface AnnotateDecl {
  type: "annotate";
  name?: string;
  commands: AnnotationCmd[];
  span: Span;
}

// ---- timeline --------------------------------------------------------------

export interface CameraStmt {
  type: "camera";
  op?: string; // fit-all, fit, focus, center, zoom, pan, follow, reset
  targets?: Value[]; // node/group ids or [list]
  zoom?: number;
  over?: number; // ms
  ease?: Value;
  pad?: number;
  pan?: [number, number];
  attrs: AttrBlock;
  span: Span;
}

export interface RevealCmd {
  type: "revealcmd";
  verb: string; // show, hide, draw-on, emphasize, flow, pulse, pop, fade-in, ...
  targets: Value[];
  with?: string;
  attrs: AttrBlock;
  span: Span;
}

export interface RevealBlock {
  type: "reveal";
  commands: RevealCmd[];
  span: Span;
}

export interface StaggerStmt {
  type: "stagger";
  delayMs: number;
  commands: (RevealCmd | AnnotationCmd)[];
  span: Span;
}

export interface Prop {
  type: "prop";
  key: string;
  value: Value;
  span: Span;
}

export type BeatItem = CameraStmt | AnnotateDecl | RevealBlock | StaggerStmt | AnnotationCmd | RevealCmd | Prop;

export interface BeatDecl {
  type: "beat";
  id: string;
  title?: string;
  items: BeatItem[];
  span: Span;
}

export interface TimelineDecl {
  type: "timeline";
  name?: string;
  props: Prop[];
  beats: BeatDecl[];
  span: Span;
}

// ---- top-level -------------------------------------------------------------

export interface MetaDecl {
  type: "meta";
  attrs: AttrBlock;
  span: Span;
}

export interface ThemeDecl {
  type: "theme";
  name: string;
  extends?: string;
  tokens: { name: string; value: Value }[];
  props: AttrBlock;
  span: Span;
}

export interface StyleDecl {
  type: "style";
  name: string; // class name (without leading dot)
  extends?: string;
  attrs: AttrBlock;
  span: Span;
}

export interface DefaultsDecl {
  type: "defaults";
  rules: { target: string; attrs: AttrBlock }[];
  span: Span;
}

export interface SceneDecl {
  type: "scene";
  name?: string;
  statements: SceneStmt[];
  span: Span;
  /** Source offsets of the scene block braces (for appending nodes/edges). */
  braceOpen?: number;
  braceClose?: number;
}

export interface OverrideEntry {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface OverridesDecl {
  type: "overrides";
  entries: OverrideEntry[];
  span: Span;
}

export interface VersionDecl {
  type: "version";
  value: number;
  span: Span;
}

export interface ImportDecl {
  type: "import";
  path: string;
  as?: string;
  span: Span;
}

export type TopStmt =
  | VersionDecl
  | MetaDecl
  | ImportDecl
  | ThemeDecl
  | StyleDecl
  | DefaultsDecl
  | SceneDecl
  | TimelineDecl
  | AnnotateDecl
  | MermaidDecl
  | VizDecl
  | OverridesDecl;

export interface Program {
  type: "program";
  statements: TopStmt[];
}
