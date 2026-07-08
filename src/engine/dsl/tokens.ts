/**
 * Token model for the EDodoDraw DSL lexer.
 *
 * Design notes (per the language spec §3, §12):
 *  - Keywords are SOFT: they lex as IDENT and the parser recognizes them by
 *    text in head position. This keeps the token set small and lets ids like
 *    `focus` or `label` be used as node ids in non-keyword positions.
 *  - The lexer is PERMISSIVE: it never throws. Unknown characters become a
 *    SYMBOL token so shape-sugar innards (captured raw by the parser via source
 *    offsets) don't crash lexing.
 *  - Every token keeps byte offsets + line/col for diagnostics and for the
 *    parser's raw shape-sugar capture.
 */

export enum T {
  Newline = "Newline",
  Semi = "Semi",
  Ident = "Ident",
  String = "String",
  Raw = "Raw", // triple-quoted / mermaid body
  Number = "Number", // value + optional unit
  Color = "Color",
  Bool = "Bool",
  TokenRef = "TokenRef", // $name
  TripleColon = "TripleColon", // :::
  EdgeOp = "EdgeOp",
  At = "At", // @
  Amp = "Amp", // &
  Pipe = "Pipe", // |
  Colon = "Colon",
  Comma = "Comma",
  Dot = "Dot",
  Slash = "Slash",
  Eq = "Eq",
  LBrace = "LBrace",
  RBrace = "RBrace",
  LBracket = "LBracket",
  RBracket = "RBracket",
  LParen = "LParen",
  RParen = "RParen",
  Symbol = "Symbol", // any other single char (permissive)
  EOF = "EOF",
}

export interface Token {
  kind: T;
  /** Raw lexeme text (for STRING/RAW: the decoded content). */
  text: string;
  /** Numeric value for Number tokens. */
  num?: number;
  /** Unit suffix for Number tokens: px % deg rad turn ms s pt em fr x. */
  unit?: string | null;
  /** For Bool tokens. */
  bool?: boolean;
  /** For TokenRef: the name without `$`. For Raw: an optional tag. */
  name?: string;
  start: number; // source offset (inclusive)
  end: number; // source offset (exclusive)
  line: number; // 1-based
  col: number; // 1-based
}

/** Edge operator glyphs, longest-first for maximal-munch matching. */
export const EDGE_GLYPHS: string[] = [
  "<-->",
  "<--",
  "<->",
  "-.->",
  "--->",
  "-->",
  "==>",
  "===",
  "..>",
  "--o",
  "--x",
  "---",
  "<-",
  "->",
  "~>",
  "-o",
  "-x",
  "--",
];

/** Soft keyword sets used by the parser (not the lexer). */
export const KEYWORDS = new Set([
  "edd", "meta", "import", "as", "plugin", "define", "use", "theme", "style",
  "defaults", "extends", "tokens", "scene", "timeline", "beat", "step", "group",
  "container", "node", "edge", "anchor", "layout", "on", "at", "to", "by",
  "from", "via", "camera", "annotate", "reveal", "mermaid",
]);

export const SHAPE_KEYWORDS = new Set([
  "rect", "rectangle", "round-rect", "round-rectangle", "roundrect", "ellipse",
  "circle", "diamond", "decision", "cylinder", "db", "database", "hexagon",
  "parallelogram", "trapezoid", "cloud", "actor", "note", "document", "stadium",
  "pill", "subroutine", "triangle", "star", "text", "image", "frame", "custom",
]);

export const LAYOUT_KEYWORDS = new Set([
  "dag", "tree", "grid", "radial", "flow", "free", "force", "manual",
]);
