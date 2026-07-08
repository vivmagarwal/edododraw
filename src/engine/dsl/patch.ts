/**
 * Source patcher — turns direct canvas edits into surgical edits of the `.edd`
 * source, so the code stays the single source of truth (you drag a node and
 * watch the code update). Uses the parser's AST spans to edit precisely and
 * leave the rest of the source untouched.
 *
 *  - move / resize  -> a machine-managed `overrides { … }` block (works for
 *    every node: declared, auto-created from an edge, or Mermaid-imported)
 *  - rename         -> replace the node's label (or add a `label:` attr)
 *  - restyle        -> upsert `fill` / `stroke` / `shape` attrs on the decl
 *  - add node/edge  -> append a declaration to the scene block
 *  - delete         -> remove the node's decl, its edges, and its override
 */

import { parse } from "./parser.js";
import type { NodeDecl, Program, SceneDecl, SceneStmt } from "./ast.js";

export interface OverrideEntry {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

const r = (n: number) => Math.round(n);

// ---- AST lookup -------------------------------------------------------------

function firstScene(program: Program): SceneDecl | undefined {
  return program.statements.find((s): s is SceneDecl => s.type === "scene");
}

function walkNodes(stmts: SceneStmt[], visit: (n: NodeDecl) => void): void {
  for (const st of stmts) {
    if (st.type === "node") visit(st);
    else if (st.type === "group") walkNodes(st.items, visit);
  }
}

function findNodeDecl(program: Program, id: string): NodeDecl | undefined {
  let found: NodeDecl | undefined;
  for (const s of program.statements) {
    if (s.type === "scene") walkNodes(s.statements, (n) => { if (n.id === id && !found) found = n; });
  }
  return found;
}

// ---- string helpers ---------------------------------------------------------

function splice(source: string, start: number, end: number, text: string): string {
  return source.slice(0, start) + text + source.slice(end);
}

/** Remove the whole line(s) a span covers (incl. trailing newline). */
function removeLines(source: string, start: number, end: number): string {
  let ls = start;
  while (ls > 0 && source[ls - 1] !== "\n") ls--;
  let le = end;
  while (le < source.length && source[le] !== "\n") le++;
  if (le < source.length) le++; // include the newline
  return source.slice(0, ls) + source.slice(le);
}

// ---- overrides block --------------------------------------------------------

function formatOverrides(entries: OverrideEntry[]): string {
  if (!entries.length) return "";
  const lines = entries
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => {
      const size = e.w != null && e.h != null ? ` size (${r(e.w)}, ${r(e.h)})` : "";
      return `  ${e.id} at (${r(e.x)}, ${r(e.y)})${size}`;
    });
  return `overrides {\n${lines.join("\n")}\n}`;
}

/** Regenerate the `overrides { … }` block (replace, append, or remove). */
export function writeOverrides(source: string, entries: OverrideEntry[]): string {
  const { program } = parse(source);
  const existing = program.statements.find((s) => s.type === "overrides");
  const block = formatOverrides(entries);
  if (existing) {
    if (!block) {
      return removeLines(source, existing.span.start, existing.span.end).replace(/\n{3,}/g, "\n\n");
    }
    return splice(source, existing.span.start, existing.span.end, block);
  }
  if (!block) return source;
  return source.replace(/\s*$/, "") + "\n\n" + block + "\n";
}

// ---- attribute upsert -------------------------------------------------------

interface AttrUpdate {
  key: string;
  value: string; // already-serialized .edd value text
}

function upsertAttrs(source: string, decl: NodeDecl, updates: AttrUpdate[]): string {
  if (!updates.length) return source;
  if (decl.attrOpen == null || decl.attrClose == null) {
    // no attr block -> create one after the declaration head
    const body = updates.map((u) => `${u.key}: ${u.value}`).join(", ");
    return splice(source, decl.span.end, decl.span.end, ` { ${body} }`);
  }
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const inserts: string[] = [];
  const realAttrs = decl.attrs.filter((a) => a.key !== "__use");
  const byKey = new Map(realAttrs.map((a) => [a.key, a]));
  for (const u of updates) {
    const ex = byKey.get(u.key);
    if (ex) edits.push({ start: ex.span.start, end: ex.span.end, text: `${u.key}: ${u.value}` });
    else inserts.push(`${u.key}: ${u.value}`);
  }
  if (inserts.length) {
    if (realAttrs.length) {
      // append right after the last existing attribute (clean ", " separator,
      // no stray space before the comma from the block's trailing whitespace)
      const lastEnd = Math.max(...realAttrs.map((a) => a.span.end));
      edits.push({ start: lastEnd, end: lastEnd, text: `, ${inserts.join(", ")}` });
    } else {
      // empty attr block `{ }` -> drop the new attrs just inside the braces
      const pos = decl.attrClose - 1; // just before the closing '}'
      edits.push({ start: pos, end: pos, text: `${inserts.join(", ")} ` });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits) out = splice(out, e.start, e.end, e.text);
  return out;
}

// ---- high-level ops ---------------------------------------------------------

/** Rename a node (replace its label string, or add a `label:` attr / decl). */
export function renameNode(source: string, id: string, label: string): string {
  const { program } = parse(source);
  const decl = findNodeDecl(program, id);
  const quoted = `"${label.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (!decl) return ensureNodeDecl(source, program, id, undefined, quoted, []);
  // replace the first quoted string inside the decl (the label), if any
  const declText = source.slice(decl.span.start, decl.span.end);
  const m = declText.match(/(['"])(?:\\.|(?!\1).)*\1/);
  if (m && m.index != null) {
    const start = decl.span.start + m.index;
    return splice(source, start, start + m[0].length, quoted);
  }
  return upsertAttrs(source, decl, [{ key: "label", value: quoted }]);
}

/** Set fill / stroke / shape on a node (upsert attrs, or create a decl). */
export function styleNode(source: string, id: string, style: { fill?: string; stroke?: string; shape?: string }): string {
  const { program } = parse(source);
  const decl = findNodeDecl(program, id);
  const updates: AttrUpdate[] = [];
  if (style.fill !== undefined) updates.push({ key: "fill", value: style.fill });
  if (style.stroke !== undefined) updates.push({ key: "stroke", value: style.stroke });
  if (style.shape !== undefined) updates.push({ key: "shape", value: style.shape });
  if (!updates.length) return source;
  if (decl) return upsertAttrs(source, decl, updates);
  return ensureNodeDecl(source, program, id, undefined, undefined, updates);
}

/** Insert a new node declaration into the (first) scene block. */
export function addNode(source: string, node: { id: string; shape: string; label: string }): string {
  const { program } = parse(source);
  const decl = `${node.shape} ${node.id} "${node.label.replace(/"/g, '\\"')}"`;
  return insertIntoScene(source, program, decl);
}

/** Append an edge to the (first) scene block. */
export function addEdge(source: string, edge: { from: string; to: string; glyph?: string; label?: string }): string {
  const { program } = parse(source);
  const glyph = edge.glyph ?? "-->";
  const label = edge.label ? ` "${edge.label.replace(/"/g, '\\"')}"` : "";
  return insertIntoScene(source, program, `${edge.from} ${glyph} ${edge.to}${label}`);
}

/** Delete a node: remove its decl, any edges mentioning it, and its override. */
export function deleteElements(source: string, ids: string[]): string {
  let out = source;
  for (const id of ids) {
    const { program } = parse(out);
    const removals: Array<{ start: number; end: number }> = [];
    const decl = findNodeDecl(program, id);
    if (decl) removals.push({ start: decl.span.start, end: decl.span.end });
    for (const s of program.statements) {
      if (s.type !== "scene") continue;
      for (const st of s.statements) {
        if (st.type === "edge") {
          const mentions = st.groups.some((g) => g.some((ep) => ep.id === id));
          if (mentions) removals.push({ start: st.span.start, end: st.span.end });
        }
      }
    }
    // remove bottom-up so offsets stay valid
    removals.sort((a, b) => b.start - a.start);
    for (const rm of removals) out = removeLines(out, rm.start, rm.end);
  }
  // also drop the id(s) from the overrides block
  const { program } = parse(out);
  const ov = program.statements.find((s) => s.type === "overrides");
  if (ov && ov.type === "overrides") {
    const kept = ov.entries.filter((e) => !ids.includes(e.id));
    if (kept.length !== ov.entries.length) out = writeOverrides(out, kept);
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

// ---- shared insertion -------------------------------------------------------

function insertIntoScene(source: string, program: Program, line: string): string {
  const scene = firstScene(program);
  if (scene && scene.braceClose != null) {
    // insert on its own line just before the scene's closing '}'
    let pos = scene.braceClose;
    // back up over trailing whitespace/newline before '}'
    while (pos > 0 && (source[pos - 1] === " " || source[pos - 1] === "\t")) pos--;
    const indent = "  ";
    return splice(source, pos, pos, `${source[pos - 1] === "\n" ? "" : "\n"}${indent}${line}\n`);
  }
  // no scene block -> create one at the end
  return source.replace(/\s*$/, "") + `\n\nscene {\n  ${line}\n}\n`;
}

/** Ensure a node id has a declaration; patch or create it. */
function ensureNodeDecl(
  source: string,
  program: Program,
  id: string,
  shape: string | undefined,
  quotedLabel: string | undefined,
  attrs: AttrUpdate[],
): string {
  const decl = findNodeDecl(program, id);
  if (decl) {
    let out = source;
    if (quotedLabel) out = renameNode(out, id, quotedLabel.replace(/^"|"$/g, ""));
    if (attrs.length) {
      const rp = parse(out);
      const d2 = findNodeDecl(rp.program, id);
      if (d2) out = upsertAttrs(out, d2, attrs);
    }
    return out;
  }
  const head = `${shape ?? "rect"} ${id}${quotedLabel ? ` ${quotedLabel}` : ""}`;
  const attrText = attrs.length ? ` { ${attrs.map((a) => `${a.key}: ${a.value}`).join(", ")} }` : "";
  return insertIntoScene(source, program, head + attrText);
}
