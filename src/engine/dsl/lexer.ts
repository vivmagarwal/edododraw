/**
 * Lexer for the EDodoDraw DSL. Permissive (never throws), position-tracking,
 * maximal-munch for edge operators. See tokens.ts for the token model and the
 * language spec §3/§12 for rules.
 */

import { EDGE_GLYPHS, T, type Token } from "./tokens.js";

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const HEX = /[0-9a-fA-F]/;
const EDGE_START = new Set(["-", "<", "=", "~", "."]);
const UNITS = ["turn", "deg", "rad", "px", "pt", "em", "fr", "ms", "s", "x", "%"];
const BOOLS: Record<string, boolean> = { true: true, false: false, yes: true, no: false };

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  const col = () => pos - lineStart + 1;
  const push = (kind: T, start: number, extra: Partial<Token> = {}) => {
    tokens.push({ kind, text: source.slice(start, pos), start, end: pos, line, col: start - lineStart + 1, ...extra });
  };
  const newline = () => {
    const start = pos;
    pos++;
    tokens.push({ kind: T.Newline, text: "\n", start, end: pos, line, col: col() });
    line++;
    lineStart = pos;
  };

  while (pos < len) {
    const c = source[pos];

    // horizontal whitespace
    if (c === " " || c === "\t" || c === "\r") {
      pos++;
      continue;
    }
    if (c === "\n") {
      newline();
      continue;
    }

    // comments
    if (c === "/" && source[pos + 1] === "/") {
      while (pos < len && source[pos] !== "\n") pos++;
      continue;
    }
    if (c === "%" && source[pos + 1] === "%") {
      while (pos < len && source[pos] !== "\n") pos++;
      continue;
    }
    if (c === "/" && source[pos + 1] === "*") {
      let depth = 1;
      pos += 2;
      while (pos < len && depth > 0) {
        if (source[pos] === "/" && source[pos + 1] === "*") {
          depth++;
          pos += 2;
        } else if (source[pos] === "*" && source[pos + 1] === "/") {
          depth--;
          pos += 2;
        } else {
          if (source[pos] === "\n") {
            line++;
            lineStart = pos + 1;
          }
          pos++;
        }
      }
      continue;
    }

    if (c === ";") {
      const start = pos;
      pos++;
      push(T.Semi, start);
      continue;
    }

    // triple-quoted raw block """..."""
    if (c === '"' && source[pos + 1] === '"' && source[pos + 2] === '"') {
      const start = pos;
      const startLine = line;
      const startLineStart = lineStart;
      pos += 3;
      let body = "";
      while (pos < len && !(source[pos] === '"' && source[pos + 1] === '"' && source[pos + 2] === '"')) {
        if (source[pos] === "\n") {
          line++;
          lineStart = pos + 1;
        }
        body += source[pos];
        pos++;
      }
      pos += 3; // closing """
      tokens.push({ kind: T.Raw, text: body.replace(/^\n/, ""), start, end: pos, line: startLine, col: start - startLineStart + 1 });
      continue;
    }

    // strings
    if (c === '"' || c === "'") {
      const start = pos;
      const quote = c;
      pos++;
      let value = "";
      while (pos < len && source[pos] !== quote) {
        if (source[pos] === "\\") {
          const n = source[pos + 1];
          value += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n ?? "";
          pos += 2;
        } else {
          if (source[pos] === "\n") {
            line++;
            lineStart = pos + 1;
          }
          value += source[pos];
          pos++;
        }
      }
      pos++; // closing quote
      tokens.push({ kind: T.String, text: value, start, end: pos, line, col: start - lineStart + 1 });
      continue;
    }

    // color hex
    if (c === "#" && HEX.test(source[pos + 1] ?? "")) {
      const start = pos;
      pos++;
      while (pos < len && HEX.test(source[pos])) pos++;
      push(T.Color, start);
      continue;
    }

    // token ref $name
    if (c === "$" && IDENT_START.test(source[pos + 1] ?? "")) {
      const start = pos;
      pos++;
      const nameStart = pos;
      while (pos < len && IDENT_PART.test(source[pos])) pos++;
      tokens.push({ kind: T.TokenRef, text: source.slice(start, pos), name: source.slice(nameStart, pos), start, end: pos, line, col: start - lineStart + 1 });
      continue;
    }

    // ::: before :
    if (c === ":" && source[pos + 1] === ":" && source[pos + 2] === ":") {
      const start = pos;
      pos += 3;
      push(T.TripleColon, start);
      continue;
    }

    // edge operators (maximal munch)
    if (EDGE_START.has(c)) {
      const glyph = matchEdge(source, pos);
      if (glyph) {
        const start = pos;
        pos += glyph.length;
        push(T.EdgeOp, start);
        continue;
      }
      // '.' -> Dot; '=' -> Eq; others fall through
      if (c === ".") {
        const start = pos;
        pos++;
        push(T.Dot, start);
        continue;
      }
      if (c === "=") {
        const start = pos;
        pos++;
        push(T.Eq, start);
        continue;
      }
      // '-' followed by digit => number (handled below); '<'/'~'/'-' alone => symbol
      if (c !== "-") {
        const start = pos;
        pos++;
        push(T.Symbol, start);
        continue;
      }
    }

    // number (optionally negative)
    if (DIGIT.test(c) || (c === "-" && DIGIT.test(source[pos + 1] ?? ""))) {
      const start = pos;
      if (c === "-") pos++;
      while (pos < len && DIGIT.test(source[pos])) pos++;
      if (source[pos] === "." && DIGIT.test(source[pos + 1] ?? "")) {
        pos++;
        while (pos < len && DIGIT.test(source[pos])) pos++;
      }
      const numText = source.slice(start, pos);
      const unit = matchUnit(source, pos);
      if (unit) pos += unit.length;
      tokens.push({ kind: T.Number, text: source.slice(start, pos), num: parseFloat(numText), unit: unit ?? null, start, end: pos, line, col: start - lineStart + 1 });
      continue;
    }

    // identifier (with internal-dash rule) / bool
    if (IDENT_START.test(c)) {
      const start = pos;
      pos++;
      while (pos < len) {
        const ch = source[pos];
        if (IDENT_PART.test(ch)) {
          pos++;
        } else if (ch === "-" && IDENT_PART.test(source[pos + 1] ?? "")) {
          pos++;
        } else {
          break;
        }
      }
      const text = source.slice(start, pos);
      const low = text.toLowerCase();
      if (low in BOOLS) {
        tokens.push({ kind: T.Bool, text, bool: BOOLS[low], start, end: pos, line, col: start - lineStart + 1 });
      } else {
        push(T.Ident, start);
      }
      continue;
    }

    // single-char punctuation
    const single: Record<string, T> = {
      "@": T.At,
      "&": T.Amp,
      "|": T.Pipe,
      ":": T.Colon,
      ",": T.Comma,
      "/": T.Slash,
      "{": T.LBrace,
      "}": T.RBrace,
      "[": T.LBracket,
      "]": T.RBracket,
      "(": T.LParen,
      ")": T.RParen,
    };
    if (c in single) {
      const start = pos;
      pos++;
      push(single[c], start);
      continue;
    }

    // anything else -> permissive symbol (keeps lexing alive for raw sugar)
    {
      const start = pos;
      pos++;
      push(T.Symbol, start);
    }
  }

  tokens.push({ kind: T.EOF, text: "", start: pos, end: pos, line, col: col() });
  return tokens;
}

function matchEdge(source: string, pos: number): string | null {
  for (const g of EDGE_GLYPHS) {
    if (source.startsWith(g, pos)) return g;
  }
  return null;
}

function matchUnit(source: string, pos: number): string | null {
  for (const u of UNITS) {
    if (source.startsWith(u, pos)) {
      const after = source[pos + u.length] ?? "";
      // a letter-unit must end at a non-identifier boundary; '%' always ok
      if (u === "%" || !IDENT_PART.test(after)) return u;
    }
  }
  return null;
}
