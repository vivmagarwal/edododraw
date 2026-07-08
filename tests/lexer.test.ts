/**
 * Lexer tests — token kinds and key fields for the EDodoDraw DSL lexer.
 * Complements dsl-smoke.test.ts (which exercises the whole compiler); here we
 * assert raw tokenization behaviour: maximal-munch edge operators, numbers with
 * units, internal-dash identifiers, strings/escapes, raw blocks, every comment
 * flavour, colors, token refs, triple-colon, booleans, and permissiveness.
 */

import { describe, expect, it } from "vitest";
import { lex } from "@engine/dsl/lexer.js";
import { T, type Token } from "@engine/dsl/tokens.js";

/** Significant tokens: drop Newline + trailing EOF. */
function toks(src: string): Token[] {
  return lex(src).filter((t) => t.kind !== T.Newline && t.kind !== T.EOF);
}
function kinds(src: string): T[] {
  return toks(src).map((t) => t.kind);
}

describe("lexer — edge operators (maximal munch)", () => {
  it("splits `a-->b` into ident, edge-op, ident with no spaces", () => {
    const ts = toks("a-->b");
    expect(ts.map((t) => t.kind)).toEqual([T.Ident, T.EdgeOp, T.Ident]);
    expect(ts[0].text).toBe("a");
    expect(ts[1].text).toBe("-->");
    expect(ts[2].text).toBe("b");
  });

  it("recognizes each edge glyph as a single EdgeOp token (space-separated)", () => {
    // spaces used so the single-dash glyphs (-o, -x) aren't glued into an ident
    const glyphs = ["<-->", "<--", "<->", "-.->", "--->", "-->", "==>", "===", "..>", "--o", "--x", "<-", "->", "~>", "-o", "-x", "--"];
    for (const g of glyphs) {
      const ts = toks(`a ${g} b`);
      expect(ts.map((t) => t.kind), `glyph ${g}`).toEqual([T.Ident, T.EdgeOp, T.Ident]);
      expect(ts[1].text, `glyph ${g} text`).toBe(g);
    }
  });

  it("recognizes the double-dash terminator glyphs with NO surrounding spaces", () => {
    // these are safe unspaced because the 2nd dash isn't an identifier char
    for (const g of ["-->", "<-->", "-.->", "==>", "~>", "--o", "--x", "--"]) {
      const ts = toks(`a${g}b`);
      expect(ts.map((t) => t.kind), `glyph ${g}`).toEqual([T.Ident, T.EdgeOp, T.Ident]);
      expect(ts[1].text).toBe(g);
    }
  });

  it("absorbs a single-dash glyph into an identifier when unspaced (`a-ob` is one Ident)", () => {
    // internal-dash rule wins: `-o` is not an edge op here, it's part of `a-ob`
    const ts = toks("a-ob");
    expect(ts).toHaveLength(1);
    expect(ts[0].kind).toBe(T.Ident);
    expect(ts[0].text).toBe("a-ob");
  });

  it("munches the longest glyph first (`--->` is one op, not `-->` + `-`)", () => {
    const ts = toks("a--->b");
    expect(ts[1].kind).toBe(T.EdgeOp);
    expect(ts[1].text).toBe("--->");
  });

  it("does not confuse `--o` / `--x` with `-->`", () => {
    expect(toks("a--ob")[1].text).toBe("--o");
    expect(toks("a--xb")[1].text).toBe("--x");
  });
});

describe("lexer — numbers with units", () => {
  const cases: Array<[string, number, string | null]> = [
    ["700ms", 700, "ms"],
    ["1.5x", 1.5, "x"],
    ["90%", 90, "%"],
    ["2s", 2, "s"],
    ["45deg", 45, "deg"],
    ["12px", 12, "px"],
    ["0.25turn", 0.25, "turn"],
    ["7", 7, null],
  ];
  for (const [src, num, unit] of cases) {
    it(`lexes ${src} → num ${num} unit ${unit}`, () => {
      const t = lex(src)[0];
      expect(t.kind).toBe(T.Number);
      expect(t.num).toBe(num);
      expect(t.unit ?? null).toBe(unit);
    });
  }

  it("lexes a leading-minus number `-3` as a negative Number (not an edge op)", () => {
    const t = lex("-3")[0];
    expect(t.kind).toBe(T.Number);
    expect(t.num).toBe(-3);
    expect(t.unit).toBe(null);
  });

  it("does not swallow a trailing identifier char as a unit (`3xyz`)", () => {
    // `x` is a unit, but only at a non-identifier boundary; `3xyz` → 3, then ident
    const ts = toks("3xyz");
    expect(ts[0].kind).toBe(T.Number);
    expect(ts[0].num).toBe(3);
    expect(ts[0].unit).toBe(null);
    expect(ts[1].kind).toBe(T.Ident);
    expect(ts[1].text).toBe("xyz");
  });
});

describe("lexer — identifiers with internal dashes", () => {
  it("keeps `round-rect` as ONE Ident token", () => {
    const ts = toks("round-rect");
    expect(ts.length).toBe(1);
    expect(ts[0].kind).toBe(T.Ident);
    expect(ts[0].text).toBe("round-rect");
  });

  it("keeps `dash-march` as ONE Ident token", () => {
    const ts = toks("dash-march");
    expect(ts).toHaveLength(1);
    expect(ts[0].text).toBe("dash-march");
  });

  it("allows multiple internal dashes (`a-b-c`)", () => {
    const ts = toks("a-b-c");
    expect(ts).toHaveLength(1);
    expect(ts[0].text).toBe("a-b-c");
  });

  it("stops the identifier at a trailing dash before a non-ident char (`a- b`)", () => {
    // `a` then `- ` — the dash is not followed by an ident-part, so `a` ends.
    const ts = toks("a- b");
    expect(ts[0].kind).toBe(T.Ident);
    expect(ts[0].text).toBe("a");
    // remaining `-` alone is not an edge glyph → permissive Symbol
    expect(ts[1].kind).toBe(T.Symbol);
  });
});

describe("lexer — strings + escapes", () => {
  it("decodes a double-quoted string body", () => {
    const t = lex('"hello world"')[0];
    expect(t.kind).toBe(T.String);
    expect(t.text).toBe("hello world");
  });

  it("supports single quotes", () => {
    const t = lex("'single'")[0];
    expect(t.kind).toBe(T.String);
    expect(t.text).toBe("single");
  });

  it("decodes \\n \\t \\r escapes", () => {
    expect(lex('"a\\nb"')[0].text).toBe("a\nb");
    expect(lex('"a\\tb"')[0].text).toBe("a\tb");
    expect(lex('"a\\rb"')[0].text).toBe("a\rb");
  });

  it("passes an escaped quote and backslash through literally", () => {
    expect(lex('"a\\"b"')[0].text).toBe('a"b');
    expect(lex('"a\\\\b"')[0].text).toBe("a\\b");
  });

  it("treats an unknown escape as the literal following char", () => {
    expect(lex('"a\\qb"')[0].text).toBe("aqb");
  });
});

describe("lexer — triple-quoted RAW blocks", () => {
  it("lexes `\"\"\"…\"\"\"` as a Raw token, not a String", () => {
    const t = lex('"""\nhello\nworld\n"""')[0];
    expect(t.kind).toBe(T.Raw);
    expect(t.text).toBe("hello\nworld\n");
  });

  it("strips only the single leading newline", () => {
    const t = lex('"""\n\nkept"""')[0];
    expect(t.kind).toBe(T.Raw);
    expect(t.text).toBe("\nkept");
  });

  it("does not treat a normal string as raw", () => {
    expect(lex('"just a string"')[0].kind).toBe(T.String);
  });
});

describe("lexer — comments", () => {
  it("skips `//` line comments", () => {
    const ts = toks("x // this is ignored\ny");
    expect(ts.map((t) => t.text)).toEqual(["x", "y"]);
  });

  it("skips `%%` line comments (mermaid-style)", () => {
    const ts = toks("x %% ignored\ny");
    expect(ts.map((t) => t.text)).toEqual(["x", "y"]);
  });

  it("skips `/* … */` block comments", () => {
    const ts = toks("a /* b c d */ e");
    expect(ts.map((t) => t.text)).toEqual(["a", "e"]);
  });

  it("handles NESTED block comments", () => {
    const ts = toks("x /* outer /* inner */ still-outer */ y");
    expect(ts.map((t) => t.text)).toEqual(["x", "y"]);
  });

  it("keeps line numbers accurate across a multi-line block comment", () => {
    const all = lex("a\n/* c1\nc2\nc3 */\nb");
    const b = all.find((t) => t.kind === T.Ident && t.text === "b")!;
    expect(b.line).toBe(5);
  });
});

describe("lexer — colors, refs, triple-colon, booleans", () => {
  it("lexes a hex color", () => {
    const t = lex("#ff0000")[0];
    expect(t.kind).toBe(T.Color);
    expect(t.text).toBe("#ff0000");
    expect(lex("#abc")[0].kind).toBe(T.Color);
  });

  it("does not treat `#` followed by a non-hex char as a color", () => {
    const ts = toks("#zzz");
    expect(ts[0].kind).toBe(T.Symbol); // bare '#'
    expect(ts[1].kind).toBe(T.Ident);
    expect(ts[1].text).toBe("zzz");
  });

  it("lexes a `$token` ref, exposing the name without the `$`", () => {
    const t = lex("$accent")[0];
    expect(t.kind).toBe(T.TokenRef);
    expect(t.name).toBe("accent");
    expect(t.text).toBe("$accent");
  });

  it("lexes `:::` as a TripleColon (distinct from a single Colon)", () => {
    expect(lex(":::")[0].kind).toBe(T.TripleColon);
    expect(lex(":")[0].kind).toBe(T.Colon);
  });

  it("lexes true/false/yes/no as Bool tokens with the right value", () => {
    expect(lex("true")[0]).toMatchObject({ kind: T.Bool, bool: true });
    expect(lex("false")[0]).toMatchObject({ kind: T.Bool, bool: false });
    expect(lex("yes")[0]).toMatchObject({ kind: T.Bool, bool: true });
    expect(lex("no")[0]).toMatchObject({ kind: T.Bool, bool: false });
  });

  it("recognizes booleans case-insensitively but keeps original text", () => {
    const t = lex("TRUE")[0];
    expect(t.kind).toBe(T.Bool);
    expect(t.bool).toBe(true);
    expect(t.text).toBe("TRUE");
    expect(lex("Yes")[0].bool).toBe(true);
    expect(lex("NO")[0].bool).toBe(false);
  });
});

describe("lexer — punctuation + robustness", () => {
  it("maps single-char punctuation to the right kinds", () => {
    expect(kinds("{}[]()")).toEqual([T.LBrace, T.RBrace, T.LBracket, T.RBracket, T.LParen, T.RParen]);
    expect(kinds("@ & | : , ;")).toEqual([T.At, T.Amp, T.Pipe, T.Colon, T.Comma, T.Semi]);
  });

  it("never throws on weird input and always ends with EOF", () => {
    for (const junk of ["@@@ ??? ~~~", "†‡§¶", "\\\\///", ")(}{][", "$$$ ### !!!"]) {
      expect(() => lex(junk)).not.toThrow();
      const all = lex(junk);
      expect(all[all.length - 1].kind).toBe(T.EOF);
    }
  });

  it("lexes `@@@ ??? ~~~` into At + permissive Symbol tokens", () => {
    const ks = kinds("@@@ ??? ~~~");
    expect(ks).toEqual([T.At, T.At, T.At, T.Symbol, T.Symbol, T.Symbol, T.Symbol, T.Symbol, T.Symbol]);
  });

  it("tracks line numbers across newlines", () => {
    const all = lex("a\nb\nc");
    expect(all.find((t) => t.text === "a")!.line).toBe(1);
    expect(all.find((t) => t.text === "b")!.line).toBe(2);
    expect(all.find((t) => t.text === "c")!.line).toBe(3);
  });
});
