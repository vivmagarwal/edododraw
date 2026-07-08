/**
 * Recursive-descent parser for the EDodoDraw DSL.
 *
 * Strategy (spec §12.1): keyword-dispatched, LL(2). Two lookahead spots need
 * care: node-vs-edge (§12.3) and brace-role D1 (§12.4). Shape sugar (`[Label]`,
 * `((Label))`, `{Label}` …) is captured RAW from the source by offset, so the
 * permissive lexer never has to understand label contents.
 *
 * Errors are recovered at statement/block boundaries and accumulated; the
 * parser returns a best-effort AST plus a DiagnosticBag.
 */

import { DiagnosticBag } from "./diagnostics.js";
import { lex } from "./lexer.js";
import { SHAPE_KEYWORDS, T, type Token } from "./tokens.js";
import type {
  AnchorDecl,
  AnchorSpecAst,
  AnnotateDecl,
  AnnotationCmd,
  Attr,
  AttrBlock,
  BeatDecl,
  BeatItem,
  CameraStmt,
  DefaultsDecl,
  EdgeDecl,
  EdgeOpInfo,
  Endpoint,
  GroupDecl,
  LayoutDecl,
  MermaidDecl,
  MetaDecl,
  NodeDecl,
  Program,
  Prop,
  RevealBlock,
  RevealCmd,
  SceneDecl,
  SceneStmt,
  Span,
  StaggerStmt,
  StyleDecl,
  ThemeDecl,
  TimelineDecl,
  TopStmt,
  UseStmt,
  Value,
} from "./ast.js";

const SUGAR: Array<{ open: string; close: string; shape: string }> = [
  { open: "((", close: "))", shape: "circle" },
  { open: "([", close: "])", shape: "pill" },
  { open: "[[", close: "]]", shape: "rectangle" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "[/", close: "/]", shape: "parallelogram" },
  { open: "[/", close: "\\]", shape: "trapezoid" },
  { open: "[\\", close: "/]", shape: "trapezoid" },
  { open: "[\\", close: "\\]", shape: "parallelogram" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[", close: "]", shape: "rectangle" },
  { open: "(", close: ")", shape: "round-rectangle" },
  { open: "{", close: "}", shape: "diamond" },
];

export interface ParseResult {
  program: Program;
  diagnostics: DiagnosticBag;
}

export function parse(source: string): ParseResult {
  const p = new Parser(source);
  const program = p.parseProgram();
  return { program, diagnostics: p.diags };
}

class Parser {
  toks: Token[];
  i = 0;
  source: string;
  diags = new DiagnosticBag();

  constructor(source: string) {
    this.source = source;
    this.toks = lex(source);
  }

  // ---- cursor -------------------------------------------------------------
  private cur(): Token {
    return this.toks[this.i];
  }
  private peek(n = 1): Token {
    return this.toks[Math.min(this.i + n, this.toks.length - 1)];
  }
  private is(kind: T): boolean {
    return this.cur().kind === kind;
  }
  private isKw(text: string): boolean {
    const t = this.cur();
    return t.kind === T.Ident && t.text === text;
  }
  private advance(): Token {
    const t = this.toks[this.i];
    if (this.i < this.toks.length - 1) this.i++;
    return t;
  }
  private eat(kind: T): Token | null {
    if (this.is(kind)) return this.advance();
    return null;
  }
  private atEnd(): boolean {
    return this.is(T.EOF);
  }
  private spanFrom(t: Token): Span {
    const end = this.toks[Math.max(0, this.i - 1)];
    return { start: t.start, end: end.end, line: t.line, col: t.col };
  }
  private tokSpan(t: Token): Span {
    return { start: t.start, end: t.end, line: t.line, col: t.col };
  }

  /** consume newline/semi/comma separators (commas are interchangeable). */
  private skipSeps(): void {
    while (this.is(T.Newline) || this.is(T.Semi) || this.is(T.Comma)) this.advance();
  }
  private isSep(): boolean {
    return this.is(T.Newline) || this.is(T.Semi) || this.is(T.EOF) || this.is(T.RBrace);
  }

  /** move cursor to the first token whose start offset >= off (for raw sugar). */
  private seekOffset(off: number): void {
    while (this.i < this.toks.length - 1 && this.cur().start < off) this.i++;
  }

  private error(code: string, message: string, at: Token, extra?: { expected?: string; hint?: string }): void {
    this.diags.error(code, message, this.tokSpan(at), { found: at.text || at.kind, ...extra });
  }

  /** skip to the next SEP for statement-level recovery. */
  private recoverStmt(): void {
    let depth = 0;
    while (!this.atEnd()) {
      const k = this.cur().kind;
      if (depth === 0 && (k === T.Newline || k === T.Semi)) {
        return;
      }
      if (k === T.LBrace || k === T.LBracket || k === T.LParen) depth++;
      if (k === T.RBrace || k === T.RBracket || k === T.RParen) {
        if (depth === 0) return;
        depth--;
      }
      this.advance();
    }
  }

  /** consume a balanced { ... } block for block-level recovery. */
  private skipBlock(): void {
    if (!this.eat(T.LBrace)) return;
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      const k = this.advance().kind;
      if (k === T.LBrace) depth++;
      else if (k === T.RBrace) depth--;
    }
  }

  // ---- program ------------------------------------------------------------
  parseProgram(): Program {
    const statements: TopStmt[] = [];
    this.skipSeps();
    while (!this.atEnd()) {
      const before = this.i;
      const stmt = this.parseTop();
      if (stmt) statements.push(stmt);
      if (this.i === before) this.advance(); // guarantee progress
      this.skipSeps();
    }
    return { type: "program", statements };
  }

  private parseTop(): TopStmt | null {
    const t = this.cur();
    if (t.kind === T.Ident) {
      switch (t.text) {
        case "edd":
          return this.parseVersion();
        case "meta":
          return this.parseMeta();
        case "import":
          return this.parseImport();
        case "theme":
          return this.parseTheme();
        case "style":
          return this.parseStyle();
        case "defaults":
          return this.parseDefaults();
        case "scene":
          return this.parseScene();
        case "timeline":
          return this.parseTimeline();
        case "annotate":
          return this.parseAnnotate();
        case "mermaid":
          return this.parseMermaid();
        case "plugin":
        case "define":
          // parsed-but-ignored for now: skip its block/line
          this.advance();
          if (this.is(T.String)) this.advance();
          if (this.is(T.LBrace)) this.skipBlock();
          else this.recoverStmt();
          return null;
      }
    }
    // Unknown top-level construct: report once and recover.
    this.error("E-TOP", `unexpected '${t.text || t.kind}' at top level`, t, {
      expected: "meta | theme | style | defaults | scene | timeline | annotate | mermaid",
      hint: "structure lives inside a `scene { … }` block",
    });
    this.recoverStmt();
    return null;
  }

  private parseVersion(): TopStmt {
    const t = this.advance(); // edd
    const num = this.eat(T.Number);
    return { type: "version", value: num?.num ?? 1, span: this.spanFrom(t) };
  }

  private parseImport(): TopStmt {
    const t = this.advance(); // import
    const path = this.eat(T.String)?.text ?? "";
    let as: string | undefined;
    if (this.isKw("as")) {
      this.advance();
      as = this.eat(T.Ident)?.text;
    }
    return { type: "import", path, as, span: this.spanFrom(t) };
  }

  private parseMeta(): MetaDecl {
    const t = this.advance(); // meta
    const attrs = this.parseAttrBlock();
    return { type: "meta", attrs, span: this.spanFrom(t) };
  }

  private parseMermaid(): MermaidDecl {
    const t = this.advance(); // mermaid
    const raw = this.eat(T.Raw);
    return { type: "mermaid", body: raw?.text ?? "", span: this.spanFrom(t) };
  }

  private parseTheme(): ThemeDecl {
    const t = this.advance(); // theme
    const name = this.eat(T.Ident)?.text ?? "theme";
    let ext: string | undefined;
    if (this.isKw("extends")) {
      this.advance();
      ext = this.eat(T.Ident)?.text;
    }
    const tokens: { name: string; value: Value }[] = [];
    const props: AttrBlock = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      if (this.isKw("tokens")) {
        this.advance();
        this.eat(T.LBrace);
        this.skipSeps();
        while (!this.is(T.RBrace) && !this.atEnd()) {
          if (this.cur().kind === T.TokenRef) {
            const tk = this.advance();
            this.eat(T.Colon);
            tokens.push({ name: tk.name ?? tk.text.slice(1), value: this.parseValue() });
          } else {
            this.advance();
          }
          while (this.is(T.Comma) || this.is(T.Newline) || this.is(T.Semi)) this.advance();
        }
        this.eat(T.RBrace);
      } else if (this.cur().kind === T.TokenRef) {
        const tk = this.advance();
        this.eat(T.Colon);
        tokens.push({ name: tk.name ?? tk.text.slice(1), value: this.parseValue() });
      } else {
        const a = this.parseAttrEntry();
        if (a) props.push(a);
      }
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "theme", name, extends: ext, tokens, props, span: this.spanFrom(t) };
  }

  private parseStyle(): StyleDecl {
    const t = this.advance(); // style
    // class name: `.name` or `name`
    let name = "";
    if (this.is(T.Dot)) {
      this.advance();
      name = this.eat(T.Ident)?.text ?? "";
    } else {
      name = this.eat(T.Ident)?.text ?? "";
    }
    let ext: string | undefined;
    if (this.isKw("extends")) {
      this.advance();
      if (this.is(T.Dot)) this.advance();
      ext = this.eat(T.Ident)?.text;
    }
    const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
    return { type: "style", name, extends: ext, attrs, span: this.spanFrom(t) };
  }

  private parseDefaults(): DefaultsDecl {
    const t = this.advance(); // defaults
    const rules: { target: string; attrs: AttrBlock }[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const target = this.eat(T.Ident)?.text ?? "node";
      const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
      rules.push({ target, attrs });
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "defaults", rules, span: this.spanFrom(t) };
  }

  private parseAnnotate(): AnnotateDecl {
    const t = this.advance(); // annotate
    const name = this.is(T.String) ? this.advance().text : undefined;
    const commands: AnnotationCmd[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const cmd = this.parseAnnotationCmd();
      if (cmd) commands.push(cmd);
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "annotate", name, commands, span: this.spanFrom(t) };
  }

  // ---- scene --------------------------------------------------------------
  private parseScene(): SceneDecl {
    const t = this.advance(); // scene
    const name = this.is(T.Ident) && !this.is(T.LBrace) ? this.maybeSceneName() : undefined;
    const statements: SceneStmt[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const before = this.i;
      const stmt = this.parseSceneStmt();
      if (stmt) statements.push(stmt);
      if (this.i === before) this.advance();
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "scene", name, statements, span: this.spanFrom(t) };
  }

  private maybeSceneName(): string | undefined {
    // scene name only if an ident directly precedes the '{'
    if (this.is(T.Ident) && this.peek().kind === T.LBrace) return this.advance().text;
    return undefined;
  }

  private parseSceneStmt(): SceneStmt | null {
    const t = this.cur();
    if (t.kind === T.Ident) {
      switch (t.text) {
        case "layout":
          return this.parseLayout();
        case "group":
        case "container":
          return this.parseGroup();
        case "anchor":
          return this.parseAnchorStmt();
        case "use":
          return this.parseUse();
        case "style":
          return this.parseStyle();
        case "annotate":
          return this.parseAnnotate();
        case "mermaid":
          return this.parseMermaid();
        case "node":
          return this.parseExplicitNode();
      }
      // shape-keyword-led node: `cylinder db "Postgres"` — only if next is an id
      if (SHAPE_KEYWORDS.has(t.text) && this.peek().kind === T.Ident) {
        return this.parseKeywordNode();
      }
    }
    // otherwise: id-led node or edge (disambiguate)
    return this.parseNodeOrEdge();
  }

  private parseLayout(): LayoutDecl {
    const t = this.advance(); // layout
    const kind = this.eat(T.Ident)?.text ?? "dag";
    const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
    return { type: "layout", kind, attrs, span: this.spanFrom(t) };
  }

  private parseUse(): UseStmt {
    const t = this.advance(); // use
    if (this.isKw("theme")) {
      this.advance();
      const name = this.eat(T.Ident)?.text ?? "";
      return { type: "use", what: "theme", name, span: this.spanFrom(t) };
    }
    if (this.is(T.Dot)) {
      this.advance();
      const name = this.eat(T.Ident)?.text ?? "";
      return { type: "use", what: "class", name, span: this.spanFrom(t) };
    }
    const name = this.eat(T.Ident)?.text ?? "";
    let args: Value[] | undefined;
    if (this.is(T.LParen)) args = this.parseArgList();
    return { type: "use", what: args ? "macro" : "class", name, args, span: this.spanFrom(t) };
  }

  private parseAnchorStmt(): AnchorDecl {
    const t = this.advance(); // anchor
    const name = this.eat(T.Ident)?.text ?? "";
    let on: string | undefined;
    if (this.isKw("on")) {
      this.advance();
      on = this.eat(T.Ident)?.text;
    }
    let spec: AnchorSpecAst = { kind: "cardinal", v: "c" };
    if (this.isKw("at")) {
      this.advance();
      spec = this.parseAnchorSpec();
    }
    return { type: "anchor", name, on, spec, span: this.spanFrom(t) };
  }

  private parseAnchorSpec(): AnchorSpecAst {
    if (this.is(T.At)) {
      this.advance();
      this.eat(T.LParen);
      const u = this.eat(T.Number)?.num ?? 0;
      this.eat(T.Comma);
      const v = this.eat(T.Number)?.num ?? 0;
      this.eat(T.RParen);
      return { kind: "uv", u, v };
    }
    const word = this.eat(T.Ident)?.text ?? "c";
    if (this.is(T.Colon)) {
      this.advance();
      const num = this.eat(T.Number);
      const raw = num?.num ?? 50;
      const frac = num?.unit === "%" ? raw / 100 : raw > 1 ? raw / 100 : raw;
      return { kind: "side", side: word, frac };
    }
    return { kind: "cardinal", v: word };
  }

  // keyword node: SHAPE_KW id ["label"] {:::cls} [attrs]
  private parseKeywordNode(): NodeDecl {
    const t = this.advance(); // shape kw
    const shape = t.text;
    const id = this.eat(T.Ident)?.text ?? "";
    return this.finishNode(t, id, shape, undefined);
  }

  // explicit: node id ["label"] [as shape] {:::cls} [attrs]
  private parseExplicitNode(): NodeDecl {
    const t = this.advance(); // node
    const id = this.eat(T.Ident)?.text ?? "";
    let label: string | undefined;
    if (this.is(T.String)) label = this.advance().text;
    let shape: string | undefined;
    if (this.isKw("as")) {
      this.advance();
      shape = this.eat(T.Ident)?.text;
      if (shape === "custom" && this.is(T.LParen)) {
        const args = this.parseArgList();
        const s = args[0];
        shape = s && s.t === "str" ? `custom:${s.v}` : "custom";
      }
    }
    return this.finishNode(t, id, shape, label);
  }

  private finishNode(t: Token, id: string, shape: string | undefined, label: string | undefined): NodeDecl {
    if (label === undefined && this.is(T.String)) label = this.advance().text;
    const classes: string[] = [];
    // shape sugar right after id (only for id-led — keyword/explicit rarely use it)
    if (shape === undefined) {
      const sug = this.tryCaptureSugar();
      if (sug) {
        shape = sug.shape;
        if (label === undefined && sug.label) label = sug.label;
      }
    }
    while (this.is(T.TripleColon)) {
      this.advance();
      const cls = this.eat(T.Ident)?.text;
      if (cls) classes.push(cls);
    }
    if (label === undefined && this.is(T.String)) label = this.advance().text;
    const anchors: AnchorDecl[] = [];
    let attrs: AttrBlock = [];
    if (this.is(T.LBrace)) {
      const block = this.parseNodeBlock();
      attrs = block.attrs;
      anchors.push(...block.anchors);
      if (block.diamondLabel !== undefined) {
        shape = shape ?? block.diamondShape ?? "diamond";
        if (label === undefined) label = block.diamondLabel;
        // brace sugar (`{Label}` / `{{Label}}`) may be followed by an
        // attribute block: `gw{{API Gateway}} { fill: violet }`.
        if (this.is(T.LBrace)) {
          const attrBlock = this.parseNodeBlock();
          attrs = attrBlock.attrs;
          anchors.push(...attrBlock.anchors);
        }
      }
    }
    return { type: "node", id, label, shape, classes, attrs, anchors, span: this.spanFrom(t) };
  }

  /** Parse `{ ... }` after a node: could be attr-block OR a diamond label (D1). */
  private parseNodeBlock(): { attrs: AttrBlock; anchors: AnchorDecl[]; diamondLabel?: string; diamondShape?: string } {
    if (this.braceIsAttr()) {
      const anchors: AnchorDecl[] = [];
      const attrs: AttrBlock = [];
      this.eat(T.LBrace);
      this.skipSeps();
      while (!this.is(T.RBrace) && !this.atEnd()) {
        if (this.isKw("anchor")) {
          const a = this.parseAnchorStmt();
          anchors.push(a);
        } else if (this.isKw("use")) {
          const u = this.parseUse();
          // represent `use .class` inside node as a synthetic attr for the cascade
          attrs.push({ key: "__use", value: { t: "class", v: u.name }, span: u.span });
        } else {
          const a = this.parseAttrEntry();
          if (a) attrs.push(a);
        }
        this.skipSeps();
      }
      this.eat(T.RBrace);
      return { attrs, anchors };
    }
    // brace sugar ({Label} diamond, {{Label}} hexagon): raw-capture to close
    const open = this.cur();
    const cap = this.captureSugarAt(open.start);
    if (cap) {
      this.seekOffset(cap.end);
      return { attrs: [], anchors: [], diamondLabel: cap.label, diamondShape: cap.shape };
    }
    // fallback: treat as empty attr block
    this.skipBlock();
    return { attrs: [], anchors: [] };
  }

  /** D1: does the `{` at cursor open an attribute block (vs a diamond label)? */
  private braceIsAttr(): boolean {
    // peek past the '{' and separators
    let j = this.i + 1;
    while (j < this.toks.length && (this.toks[j].kind === T.Newline || this.toks[j].kind === T.Semi)) j++;
    const a = this.toks[j];
    if (!a) return true;
    if (a.kind === T.RBrace) return true; // empty -> attr
    if (a.kind === T.Ident) {
      // keyword-led (use/anchor) or `ident:` / `ident=` -> attr
      if (a.text === "use" || a.text === "anchor") return true;
      const b = this.toks[j + 1];
      if (b && (b.kind === T.Colon || b.kind === T.Eq)) return true;
    }
    if (a.kind === T.TokenRef) return true;
    return false;
  }

  // ---- node vs edge -------------------------------------------------------
  private parseNodeOrEdge(): SceneStmt | null {
    // optional `edge id:` prefix
    let edgeId: string | undefined;
    if (this.isKw("edge")) {
      this.advance();
      edgeId = this.eat(T.Ident)?.text;
      this.eat(T.Colon);
    }

    const t = this.cur();
    if (t.kind !== T.Ident) {
      this.error("E-STMT", `unexpected '${t.text || t.kind}'`, t, { hint: "expected a node id, shape keyword, or statement keyword" });
      this.recoverStmt();
      return null;
    }

    const first = this.parseEndpointGroup();

    // edge?
    if (this.is(T.EdgeOp)) {
      return this.parseEdgeRest(t, edgeId, first);
    }

    if (edgeId !== undefined) {
      // `edge id:` must be followed by an edge
      this.error("E-EDGE-NOOP", "expected an edge operator after 'edge' declaration", this.cur(), { expected: "-> | --> | -.-> | ==> | ~> | -- | <->" });
    }

    // Node declaration (single endpoint, no fan). The endpoint may already hold
    // shape sugar (parseEndpoint captured it) — carry it into the node.
    const ep = first[0];
    // gather :::classes
    const classes: string[] = [];
    while (this.is(T.TripleColon)) {
      this.advance();
      const cls = this.eat(T.Ident)?.text;
      if (cls) classes.push(cls);
    }
    // bare `id:::class` (no sugar, no attrs) => classapply (re-tagging an id)
    const hasMore = this.is(T.String) || this.is(T.LBrace);
    if (!ep.inline && !hasMore && classes.length > 0) {
      return { type: "classapply", id: ep.id, classes, span: this.spanFrom(t) };
    }
    const nd = this.finishNode(t, ep.id, ep.inline?.shape, ep.inline?.label);
    nd.classes.unshift(...classes);
    return nd;
  }

  private parseEndpointGroup(): Endpoint[] {
    const list = [this.parseEndpoint()];
    while (this.is(T.Amp)) {
      this.advance();
      list.push(this.parseEndpoint());
    }
    return list;
  }

  private parseEndpoint(): Endpoint {
    const t = this.cur();
    const id = this.eat(T.Ident)?.text ?? "";
    let sub: string | undefined;
    let uv: [number, number] | undefined;
    let inline: NodeDecl | undefined;
    // inline bracket sugar: `b[Label]`, `b([Label])`, `b((Label))` …
    const sug = this.tryCaptureSugar();
    if (sug) {
      inline = { type: "node", id, label: sug.label, shape: sug.shape, classes: [], attrs: [], anchors: [], span: this.tokSpan(t) };
    } else if (this.is(T.LBrace) && !this.braceIsAttr()) {
      // inline brace sugar: `b{Decision}` (diamond) / `b{{Gateway}}` (hexagon).
      // Only when the `{` is NOT an attribute block (D1), so edge attr blocks
      // like `a -> b { color: red }` are still left for the edge to consume.
      const cap = this.captureSugarAt(this.cur().start);
      if (cap) {
        this.seekOffset(cap.end);
        inline = { type: "node", id, label: cap.label, shape: cap.shape, classes: [], attrs: [], anchors: [], span: this.tokSpan(t) };
      }
    }
    if (this.is(T.Dot)) {
      this.advance();
      sub = this.eat(T.Ident)?.text;
    }
    if (this.is(T.At)) {
      this.advance();
      this.eat(T.LParen);
      const u = this.eat(T.Number)?.num ?? 0;
      this.eat(T.Comma);
      const v = this.eat(T.Number)?.num ?? 0;
      this.eat(T.RParen);
      uv = [u, v];
    }
    return { id, sub, uv, inline, span: this.tokSpan(t) };
  }

  private parseEdgeRest(t: Token, edgeId: string | undefined, first: Endpoint[]): EdgeDecl {
    const groups: Endpoint[][] = [first];
    const ops: EdgeOpInfo[] = [];
    while (this.is(T.EdgeOp)) {
      const glyph = this.advance().text;
      let midLabel: string | undefined;
      if (this.is(T.Pipe)) {
        midLabel = this.readPipeLabel();
      }
      const g = this.parseEndpointGroup();
      groups.push(g);
      ops.push({ glyph, midLabel });
    }
    let label: string | undefined;
    if (this.is(T.String)) label = this.advance().text;
    const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
    return { type: "edge", id: edgeId, groups, ops, label, attrs, span: this.spanFrom(t) };
  }

  private readPipeLabel(): string {
    // cur is Pipe; capture raw source until next Pipe
    const open = this.advance(); // first pipe
    const start = open.end;
    let end = start;
    while (this.i < this.toks.length && !this.is(T.Pipe) && !this.atEnd()) {
      end = this.cur().end;
      this.advance();
    }
    this.eat(T.Pipe);
    return this.source.slice(start, end).trim();
  }

  // ---- groups -------------------------------------------------------------
  private parseGroup(): GroupDecl {
    const t = this.advance(); // group|container
    const id = this.eat(T.Ident)?.text ?? "";
    let label: string | undefined;
    if (this.is(T.String)) label = this.advance().text;
    const attrs: AttrBlock = [];
    let layout: LayoutDecl | undefined;
    const items: SceneStmt[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const before = this.i;
      if (this.isKw("layout")) {
        layout = this.parseLayout();
      } else if (this.cur().kind === T.Ident && this.peek().kind === T.Colon && !SHAPE_KEYWORDS.has(this.cur().text)) {
        // group-level property like `fill: $surface`
        const a = this.parseAttrEntry();
        if (a) attrs.push(a);
      } else {
        const stmt = this.parseSceneStmt();
        if (stmt) items.push(stmt);
      }
      if (this.i === before) this.advance();
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "group", id, label, attrs, layout, items, span: this.spanFrom(t) };
  }

  // ---- timeline -----------------------------------------------------------
  private parseTimeline(): TimelineDecl {
    const t = this.advance(); // timeline
    const name = this.is(T.Ident) && this.peek().kind === T.LBrace ? this.advance().text : undefined;
    const props: Prop[] = [];
    const beats: BeatDecl[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const before = this.i;
      if (this.isKw("beat") || this.isKw("step")) {
        beats.push(this.parseBeat());
      } else if (this.cur().kind === T.Ident && this.peek().kind === T.Colon) {
        const a = this.parseAttrEntry();
        if (a) props.push({ type: "prop", key: a.key, value: a.value, span: a.span });
      } else {
        this.recoverStmt();
      }
      if (this.i === before) this.advance();
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "timeline", name, props, beats, span: this.spanFrom(t) };
  }

  private parseBeat(): BeatDecl {
    const t = this.advance(); // beat|step
    const id = this.eat(T.Ident)?.text ?? `beat_${t.line}`;
    const title = this.is(T.String) ? this.advance().text : undefined;
    const items: BeatItem[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const before = this.i;
      const item = this.parseBeatItem();
      if (item) items.push(item);
      if (this.i === before) this.advance();
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "beat", id, title, items, span: this.spanFrom(t) };
  }

  private parseBeatItem(): BeatItem | null {
    const t = this.cur();
    if (t.kind === T.Ident) {
      switch (t.text) {
        case "camera":
          return this.parseCamera();
        case "reveal":
          return this.parseReveal();
        case "annotate":
          return this.parseAnnotate();
        case "stagger":
          return this.parseStagger();
      }
      // property? `key: value`
      if (this.peek().kind === T.Colon) {
        const a = this.parseAttrEntry();
        if (a) return { type: "prop", key: a.key, value: a.value, span: a.span };
        return null;
      }
      // bare annotation or reveal command
      if (ANNOT_KINDS.has(t.text)) return this.parseAnnotationCmd();
      if (REVEAL_VERBS.has(t.text)) return this.parseRevealCmd();
    }
    this.error("E-BEAT", `unexpected '${t.text || t.kind}' in beat`, t, {
      hint: "expected camera | reveal | annotate | stagger | narrate: … | a command",
    });
    this.recoverStmt();
    return null;
  }

  private parseCamera(): CameraStmt {
    const t = this.advance(); // camera
    const cam: CameraStmt = { type: "camera", attrs: [], span: this.spanFrom(t) };
    // block form: camera { focus: …, zoom: … }
    if (this.is(T.LBrace)) {
      cam.attrs = this.parseAttrBlock();
      this.applyCameraAttrs(cam);
      cam.span = this.spanFrom(t);
      return cam;
    }
    // inline form: camera <op> [targets] [zoom N] [over D] [ease E] [pad N] [pan (x,y)]
    if (this.is(T.Ident)) {
      cam.op = this.advance().text;
    }
    // optional targets (ident / ref / list) unless the next word is a modifier
    if (this.canStartCameraTarget()) {
      cam.targets = [this.parseValue()];
    }
    // modifiers
    while (this.is(T.Ident) || this.is(T.LBrace)) {
      if (this.is(T.LBrace)) {
        const block = this.parseAttrBlock();
        cam.attrs.push(...block);
        this.applyCameraAttrs(cam);
        break;
      }
      const w = this.cur().text;
      if (w === "zoom") {
        this.advance();
        cam.zoom = this.eat(T.Number)?.num;
      } else if (w === "over" || w === "duration") {
        this.advance();
        cam.over = this.readDuration();
      } else if (w === "ease") {
        this.advance();
        cam.ease = this.parseValue();
      } else if (w === "pad") {
        this.advance();
        cam.pad = this.eat(T.Number)?.num;
      } else if (w === "pan") {
        this.advance();
        this.eat(T.Ident); // to|by (optional)
        const v = this.parseValue();
        if (v.t === "tuple" && v.v.length >= 2 && v.v[0].t === "num" && v.v[1].t === "num") {
          cam.pan = [v.v[0].v, v.v[1].v];
        }
      } else {
        break;
      }
    }
    cam.span = this.spanFrom(t);
    return cam;
  }

  private canStartCameraTarget(): boolean {
    if (this.is(T.LBracket)) return true;
    if (this.is(T.Dot)) return true;
    if (this.is(T.Ident)) {
      const w = this.cur().text;
      return !["zoom", "over", "ease", "pad", "pan", "duration", "tilt"].includes(w);
    }
    return false;
  }

  private applyCameraAttrs(cam: CameraStmt): void {
    for (const a of cam.attrs) {
      switch (a.key) {
        case "focus":
          cam.op = "focus";
          cam.targets = [a.value];
          break;
        case "fit":
          cam.op = "fit";
          cam.targets = [a.value];
          break;
        case "center":
          cam.op = "center";
          cam.targets = [a.value];
          break;
        case "zoom":
          if (a.value.t === "num") cam.zoom = a.value.v;
          break;
        case "pad":
          if (a.value.t === "num") cam.pad = a.value.v;
          break;
        case "duration":
        case "over":
          if (a.value.t === "num") cam.over = a.value.unit === "s" ? a.value.v * 1000 : a.value.v;
          break;
        case "ease":
          cam.ease = a.value;
          break;
        case "pan":
          if (a.value.t === "tuple" && a.value.v[0]?.t === "num" && a.value.v[1]?.t === "num") {
            cam.pan = [a.value.v[0].v, a.value.v[1].v];
          }
          break;
      }
    }
  }

  private parseReveal(): RevealBlock {
    const t = this.advance(); // reveal
    const commands: RevealCmd[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const cmd = this.parseRevealCmd();
      if (cmd) commands.push(cmd);
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "reveal", commands, span: this.spanFrom(t) };
  }

  private parseRevealCmd(): RevealCmd | null {
    const t = this.cur();
    const verb = this.eat(T.Ident)?.text ?? "";
    const targets: Value[] = [];
    // targets until 'with' / block / sep
    while (this.canStartValue() && !this.isKw("with")) {
      targets.push(this.parseValue());
      if (this.is(T.Comma)) this.advance();
      else break;
    }
    let withEffect: string | undefined;
    if (this.isKw("with")) {
      this.advance();
      withEffect = this.eat(T.Ident)?.text;
    }
    const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
    return { type: "revealcmd", verb, targets, with: withEffect, attrs, span: this.spanFrom(t) };
  }

  private parseStagger(): StaggerStmt {
    const t = this.advance(); // stagger
    const delayMs = this.readDuration();
    const commands: (RevealCmd | AnnotationCmd)[] = [];
    this.eat(T.LBrace);
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const w = this.cur().text;
      if (this.cur().kind === T.Ident && ANNOT_KINDS.has(w)) {
        const c = this.parseAnnotationCmd();
        if (c) commands.push(c);
      } else {
        const c = this.parseRevealCmd();
        if (c) commands.push(c);
      }
      this.skipSeps();
    }
    this.eat(T.RBrace);
    return { type: "stagger", delayMs, commands, span: this.spanFrom(t) };
  }

  private parseAnnotationCmd(): AnnotationCmd | null {
    const t = this.cur();
    const kind = this.eat(T.Ident)?.text ?? "";
    let target: Endpoint | undefined;
    let targetList: Value | undefined;
    if (this.is(T.LBracket)) {
      targetList = this.parseValue();
    } else if (this.is(T.Ident)) {
      target = this.parseEndpoint();
    }
    const text = this.is(T.String) ? this.advance().text : undefined;
    const attrs = this.is(T.LBrace) ? this.parseAttrBlock() : [];
    return { type: "annotcmd", kind, target, targetList, text, attrs, span: this.spanFrom(t) };
  }

  // ---- attributes & values ------------------------------------------------
  private parseAttrBlock(): AttrBlock {
    const attrs: AttrBlock = [];
    if (!this.eat(T.LBrace)) return attrs;
    this.skipSeps();
    while (!this.is(T.RBrace) && !this.atEnd()) {
      const a = this.parseAttrEntry();
      if (a) attrs.push(a);
      // separators between entries: comma or newline/semi
      while (this.is(T.Comma) || this.is(T.Newline) || this.is(T.Semi)) this.advance();
    }
    this.eat(T.RBrace);
    return attrs;
  }

  private parseAttrEntry(): Attr | null {
    const t = this.cur();
    if (t.kind !== T.Ident) {
      this.error("E-ATTR", `expected attribute name, found '${t.text || t.kind}'`, t);
      this.recoverStmt();
      return null;
    }
    const key = this.advance().text;
    if (!this.eat(T.Colon)) this.eat(T.Eq); // accept ':' or '='
    const value = this.parseValue();
    return { key, value, span: this.spanFrom(t) };
  }

  private canStartValue(): boolean {
    switch (this.cur().kind) {
      case T.String:
      case T.Number:
      case T.Color:
      case T.Bool:
      case T.TokenRef:
      case T.Ident:
      case T.LParen:
      case T.LBracket:
      case T.Dot:
        return true;
      default:
        return false;
    }
  }

  private parseValue(): Value {
    const t = this.cur();
    switch (t.kind) {
      case T.String:
        this.advance();
        return { t: "str", v: t.text };
      case T.Number:
        this.advance();
        return { t: "num", v: t.num ?? 0, unit: t.unit ?? null };
      case T.Color:
        this.advance();
        return { t: "color", v: t.text };
      case T.Bool:
        this.advance();
        return { t: "bool", v: t.bool ?? false };
      case T.TokenRef:
        this.advance();
        return { t: "token", v: t.name ?? t.text.slice(1) };
      case T.Dot: {
        this.advance();
        const name = this.eat(T.Ident)?.text ?? "";
        return { t: "class", v: name };
      }
      case T.LParen:
        return this.parseTuple();
      case T.LBracket:
        return this.parseList();
      case T.Ident:
        return this.parseIdentValue();
      default:
        this.advance();
        return { t: "ident", v: t.text };
    }
  }

  private parseIdentValue(): Value {
    const t = this.advance();
    // func call: name(...)
    if (this.is(T.LParen)) {
      const args = this.parseArgList();
      return { t: "call", name: t.text, args };
    }
    // port ref: name.sub or name@(u,v)
    if (this.is(T.Dot) || this.is(T.At)) {
      let sub: string | undefined;
      let uv: [number, number] | undefined;
      if (this.is(T.Dot)) {
        this.advance();
        sub = this.eat(T.Ident)?.text;
      }
      if (this.is(T.At)) {
        this.advance();
        this.eat(T.LParen);
        const u = this.eat(T.Number)?.num ?? 0;
        this.eat(T.Comma);
        const v = this.eat(T.Number)?.num ?? 0;
        this.eat(T.RParen);
        uv = [u, v];
      }
      return { t: "ref", id: t.text, sub, uv };
    }
    // styled enum: `flow { speed: 1.2 }`
    if (this.is(T.LBrace)) {
      const block = this.parseAttrBlock();
      return { t: "styled", name: t.text, block };
    }
    return { t: "ident", v: t.text };
  }

  private parseTuple(): Value {
    this.eat(T.LParen);
    const vals: Value[] = [];
    this.skipSeps();
    while (!this.is(T.RParen) && !this.atEnd()) {
      vals.push(this.parseValue());
      while (this.is(T.Comma) || this.is(T.Newline)) this.advance();
    }
    this.eat(T.RParen);
    return { t: "tuple", v: vals };
  }

  private parseList(): Value {
    this.eat(T.LBracket);
    const vals: Value[] = [];
    this.skipSeps();
    while (!this.is(T.RBracket) && !this.atEnd()) {
      vals.push(this.parseValue());
      while (this.is(T.Comma) || this.is(T.Newline)) this.advance();
    }
    this.eat(T.RBracket);
    return { t: "list", v: vals };
  }

  private parseArgList(): Value[] {
    this.eat(T.LParen);
    const args: Value[] = [];
    this.skipSeps();
    while (!this.is(T.RParen) && !this.atEnd()) {
      // support named args `mass: 1` by flattening to value (drop name for now)
      if (this.cur().kind === T.Ident && this.peek().kind === T.Colon) {
        this.advance();
        this.advance();
      }
      args.push(this.parseValue());
      while (this.is(T.Comma) || this.is(T.Newline)) this.advance();
    }
    this.eat(T.RParen);
    return args;
  }

  private readDuration(): number {
    const n = this.eat(T.Number);
    if (!n) return 0;
    const val = n.num ?? 0;
    return n.unit === "s" ? val * 1000 : val;
  }

  // ---- shape sugar capture ------------------------------------------------
  private tryCaptureSugar(): { shape: string; label: string } | null {
    // only if cur token starts a sugar opener in the source
    const t = this.cur();
    if (t.kind !== T.LBracket && t.kind !== T.LParen) return null;
    const cap = this.captureSugarAt(t.start);
    if (!cap) return null;
    this.seekOffset(cap.end);
    return { shape: cap.shape, label: cap.label };
  }

  /** raw-capture mermaid shape sugar from source at `start`. */
  private captureSugarAt(start: number): { shape: string; label: string; end: number } | null {
    const src = this.source;
    for (const s of SUGAR) {
      if (src.startsWith(s.open, start)) {
        const bodyStart = start + s.open.length;
        const closeIdx = src.indexOf(s.close, bodyStart);
        if (closeIdx === -1) continue;
        // guard: don't let '[' greedily swallow a following '(' opener for '(['
        const label = src.slice(bodyStart, closeIdx).trim().replace(/^["']|["']$/g, "");
        return { shape: s.shape, label, end: closeIdx + s.close.length };
      }
    }
    return null;
  }
}

const ANNOT_KINDS = new Set([
  "highlight", "underline", "strike", "point-at", "spotlight", "callout",
  "label", "box", "circle-mark", "note-marker", "emphasize", "badge",
]);

const REVEAL_VERBS = new Set([
  "show", "hide", "draw-on", "emphasize", "fade-in", "fade-out", "pop", "flow",
  "pulse", "move", "restyle", "add", "remove",
]);
