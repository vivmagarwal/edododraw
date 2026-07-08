import { useEffect, useRef } from "react";
import { Annotation, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import {
  HighlightStyle,
  StreamLanguage,
  type StringStream,
  bracketMatching,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  type Diagnostic as CmDiagnostic,
  lintGutter,
  setDiagnostics,
} from "@codemirror/lint";
import { type Tag, tags as t } from "@lezer/highlight";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface CodeEditorDiagnostic {
  line: number;
  col: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics?: CodeEditorDiagnostic[];
  className?: string;
}

// ---------------------------------------------------------------------------
// .edd language — a defensive streaming tokenizer.
//
// The token function must NEVER throw and must ALWAYS advance the stream, so
// every branch either consumes via a stream.* helper or falls through to a
// guaranteed single-character advance at the end.
// ---------------------------------------------------------------------------

interface EddTokState {
  inComment: boolean; // inside an unterminated /* ... */ block
  inTriple: boolean; // inside an unterminated """ ... """ string
}

// Edge glyphs, sorted longest-first so multi-char forms win over their
// prefixes (e.g. "-->" before "--", "-.->" before "..>").
const EDGE_GLYPHS = [
  "-.->",
  "-->",
  "<->",
  "==>",
  "--o",
  "--x",
  "<--",
  "..>",
  "~>",
  "->",
  "--",
];

const KEYWORDS = new Set<string>([
  // head keywords
  "edd", "meta", "import", "theme", "style", "defaults", "scene", "timeline",
  "beat", "step", "group", "container", "node", "edge", "anchor", "layout",
  "use", "annotate", "reveal", "camera", "mermaid", "overrides", "at", "size",
  // shape keywords
  "rect", "round-rect", "ellipse", "circle", "diamond", "decision", "cylinder",
  "db", "hexagon", "parallelogram", "trapezoid", "cloud", "actor", "note",
  "document", "stadium", "pill", "subroutine", "triangle", "star", "text",
  "image", "frame", "custom",
  // camera / annotation / reveal words
  "fit-all", "fit", "focus", "center", "zoom", "pan", "follow", "reset",
  "highlight", "underline", "strike", "point-at", "spotlight", "callout",
  "box", "circle-mark", "note-marker", "emphasize", "show", "hide", "draw-on",
  "flow", "pulse",
]);

const BOOLEANS = new Set<string>(["true", "false", "yes", "no"]);

// Identifiers allow internal hyphens (round-rect, point-at) but a hyphen must
// be followed by an alphanumeric, so "--" / "-->" are never swallowed.
const IDENT_RE = /^[A-Za-z_](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9]))*/;
const NAME_TAIL_RE = /^[A-Za-z0-9_](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9]))*/;
const NUMBER_RE = /^[0-9]+(?:\.[0-9]+)?/;
const UNIT_RE = /^(px|deg|rem|em|pt|vw|vh|fr|ms|s|x|%)(?![A-Za-z])/;
const HEX_RE = /^[0-9a-fA-F]+/;

function eddToken(stream: StringStream, state: EddTokState): string | null {
  // --- continue a multi-line block comment ---
  if (state.inComment) {
    while (!stream.eol()) {
      const c = stream.next();
      if (c === "*" && stream.peek() === "/") {
        stream.next();
        state.inComment = false;
        break;
      }
    }
    return "comment";
  }

  // --- continue a multi-line triple-quoted string ---
  if (state.inTriple) {
    while (!stream.eol()) {
      if (stream.match('"""')) {
        state.inTriple = false;
        break;
      }
      stream.next();
    }
    return "string";
  }

  // --- whitespace ---
  if (stream.eatSpace()) return null;

  const ch = stream.peek();
  if (!ch) {
    // Should not happen (token isn't called at eol) but stay defensive.
    stream.next();
    return null;
  }

  // --- line comments: //…  and  %%… ---
  if (stream.match("//") || stream.match("%%")) {
    stream.skipToEnd();
    return "comment";
  }

  // --- block comment: /* … */ ---
  if (stream.match("/*")) {
    state.inComment = true;
    while (!stream.eol()) {
      const c = stream.next();
      if (c === "*" && stream.peek() === "/") {
        stream.next();
        state.inComment = false;
        break;
      }
    }
    return "comment";
  }

  // --- triple-quoted string: """ … """ (check before plain ") ---
  if (stream.match('"""')) {
    state.inTriple = true;
    while (!stream.eol()) {
      if (stream.match('"""')) {
        state.inTriple = false;
        break;
      }
      stream.next();
    }
    return "string";
  }

  // --- plain strings: "…" and '…' (with escapes; tolerant of no close) ---
  if (ch === '"' || ch === "'") {
    const quote = ch;
    stream.next();
    while (!stream.eol()) {
      const c = stream.next();
      if (c === "\\") {
        stream.next();
        continue;
      }
      if (c === quote) break;
    }
    return "string";
  }

  // --- edge glyphs (before numbers / .class / punctuation) ---
  for (const glyph of EDGE_GLYPHS) {
    if (stream.match(glyph)) return "operator";
  }

  // --- #hex colors ---
  if (ch === "#") {
    stream.next();
    if (stream.match(HEX_RE)) return "color";
    return "punctuation";
  }

  // --- $token references ---
  if (ch === "$") {
    stream.next();
    stream.match(NAME_TAIL_RE);
    return "variableName";
  }

  // --- :::class then :  ---
  if (stream.match(":::")) {
    stream.match(NAME_TAIL_RE);
    return "labelName";
  }
  if (ch === ":") {
    stream.next();
    return "punctuation";
  }

  // --- .class (edges like ..>/-.-> already handled above) ---
  if (ch === ".") {
    stream.next();
    if (stream.match(IDENT_RE)) return "className";
    return "punctuation";
  }

  // --- numbers with optional unit ---
  if (ch >= "0" && ch <= "9") {
    stream.match(NUMBER_RE);
    stream.match(UNIT_RE);
    return "number";
  }

  // --- identifiers / keywords / booleans ---
  if (stream.match(IDENT_RE)) {
    const word = stream.current();
    if (BOOLEANS.has(word)) return "bool";
    if (KEYWORDS.has(word)) return "keyword";
    return null;
  }

  // --- braces / brackets / parens ---
  if (
    ch === "{" || ch === "}" ||
    ch === "[" || ch === "]" ||
    ch === "(" || ch === ")"
  ) {
    stream.next();
    return "bracket";
  }

  // --- comma punctuation ---
  if (ch === ",") {
    stream.next();
    return "punctuation";
  }

  // --- guaranteed advance fallback ---
  stream.next();
  return null;
}

// Map our token style names onto @lezer/highlight tags.
const eddTokenTable: Record<string, Tag> = {
  comment: t.comment,
  string: t.string,
  number: t.number,
  color: t.color,
  variableName: t.variableName,
  className: t.className,
  labelName: t.labelName,
  operator: t.operator,
  keyword: t.keyword,
  bool: t.bool,
  bracket: t.bracket,
  punctuation: t.punctuation,
};

const eddLanguage = StreamLanguage.define<EddTokState>({
  name: "edd",
  startState: () => ({ inComment: false, inTriple: false }),
  copyState: (s) => ({ inComment: s.inComment, inTriple: s.inTriple }),
  token: eddToken,
  tokenTable: eddTokenTable,
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});

// ---------------------------------------------------------------------------
// Light highlight style + theme (soft, to match the site).
// ---------------------------------------------------------------------------

const eddHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "#8a8f98", fontStyle: "italic" },
  { tag: t.string, color: "#2f9e44" },
  { tag: t.number, color: "#e8590c" },
  { tag: t.bool, color: "#e8590c" },
  { tag: t.color, color: "#0c8599" },
  { tag: t.variableName, color: "#6741d9" },
  { tag: t.className, color: "#9c36b5" },
  { tag: t.labelName, color: "#c2255c" },
  { tag: t.operator, color: "#1971c2", fontWeight: "600" },
  { tag: t.keyword, color: "#5f3dc4", fontWeight: "600" },
  { tag: t.bracket, color: "#495057" },
  { tag: t.punctuation, color: "#868e96" },
]);

const eddTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      width: "100%",
      backgroundColor: "#fbfbfd",
      color: "#1f2430",
      fontSize: '13.5px',
    },
    ".cm-scroller": {
      fontFamily: '"Cascadia Code", ui-monospace, monospace',
      lineHeight: "1.6",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "#6741d9",
      padding: "8px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#6741d9",
      borderLeftWidth: "2px",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-gutters": {
      backgroundColor: "#f2f3f7",
      color: "#a0a6b0",
      border: "none",
    },
    ".cm-activeLine": {
      backgroundColor: "#f0eefc",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#e7e2fb",
      color: "#6741d9",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 8px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgba(103, 65, 217, 0.18)",
      },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgba(103, 65, 217, 0.16)",
      outline: "1px solid rgba(103, 65, 217, 0.45)",
    },
    ".cm-nonmatchingBracket": {
      backgroundColor: "rgba(224, 49, 49, 0.14)",
    },
  },
  { dark: false },
);

// Static, declarative extensions shared by every mount.
const BASE_EXTENSIONS = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  history(),
  drawSelection(),
  indentUnit.of("  "),
  bracketMatching(),
  eddLanguage,
  syntaxHighlighting(eddHighlightStyle),
  eddTheme,
  lintGutter(),
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
];

// Marks transactions that come from a programmatic `value` reconcile, so the
// update listener can skip re-notifying the parent (which would loop).
const External = Annotation.define<boolean>();

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function toCmDiagnostics(
  state: EditorState,
  input: readonly CodeEditorDiagnostic[],
): CmDiagnostic[] {
  const doc = state.doc;
  return input.map((d) => {
    const lineNo = clamp(Math.floor(d.line) || 1, 1, doc.lines);
    const line = doc.line(lineNo);
    const from = clamp(line.from + Math.max(0, Math.floor(d.col) - 1), line.from, line.to);
    const to = Math.min(line.to, from + 1);
    return {
      from,
      to: Math.max(to, from),
      severity: d.severity,
      message: d.message,
    };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CodeEditor(props: CodeEditorProps) {
  const { value, onChange, diagnostics, className } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep the latest onChange without re-mounting the editor.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount CodeMirror once; destroy on unmount.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((vu) => {
      if (!vu.docChanged) return;
      // Ignore our own programmatic reconcile transactions.
      const external = vu.transactions.some((tr) => tr.annotation(External));
      if (external) return;
      onChangeRef.current(vu.state.doc.toString());
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [BASE_EXTENSIONS, updateListener],
      }),
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once: subsequent `value` changes are handled by the reconcile
    // effect below. Intentionally empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled reconcile: push external `value` changes into the editor,
  // comparing against current text first to avoid an update loop.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: External.of(true),
    });
  }, [value]);

  // Display-only diagnostics: re-apply whenever the incoming list changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cmDiags = toCmDiagnostics(view.state, diagnostics ?? []);
    view.dispatch(setDiagnostics(view.state, cmDiags));
  }, [diagnostics]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
    />
  );
}
