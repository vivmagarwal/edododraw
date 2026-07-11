/**
 * Compiler: EDodoDraw AST -> Scene IR. Applies the style cascade (theme tokens
 * -> defaults -> classes -> inline), expands edge chains/fan-outs, lifts
 * annotate blocks and timeline beats into the IR, then runs auto-layout.
 */

import { applyLayout } from "../layout/index.js";
import { applyOverrides } from "../scene/overrides.js";
import { emptyScene, makeEdge, makeNode } from "../scene/defaults.js";
import { getLayoutPlugin } from "../plugins/registry.js";
import { getEdge, getGroup, getNode, vizItemMembers } from "../scene/query.js";
import { isLightColor, resolveMarker } from "../scene/palette.js";
import { effectivePreset, getStylePreset, presetEdgeDefaults, presetNodeDefaults, presetTheme, roleStyle } from "../style/presets.js";
import { runViz } from "../viz/registry.js";
import "../viz/generators/index.js"; // register the built-in viz templates
import { lowerViz } from "./vizLower.js";
import type {
  Annotation,
  AnnotationTarget,
  CameraDirective,
  EdgeRouting,
  EdgeStyle,
  LayoutKind,
  NodeStyle,
  Scene,
  SceneGroup,
  Step,
} from "../scene/types.js";
import type {
  AnnotationCmd,
  AttrBlock,
  BeatDecl,
  EdgeDecl,
  Endpoint,
  GroupDecl,
  NodeDecl,
  Program,
  SceneStmt,
  Value,
  VizDecl,
} from "./ast.js";
import { attr } from "./ast.js";
import { DiagnosticBag } from "./diagnostics.js";
import {
  lowerGlyph,
  mapAnimation,
  mapArrowhead,
  mapEasing,
  mapFillStyle,
  mapRoughness,
  mapRouting,
  mapShape,
  mapStrokeStyle,
  mapStrokeWidth,
  numberOf,
  resolveColor,
} from "./lower.js";

export interface CompileOptions {
  diagnostics?: DiagnosticBag;
  /**
   * Force the render mode, overriding the mode derived from the active theme
   * name. Used by the app/embedder's light/dark toggle so any diagram can be
   * viewed dark without editing its source. `undefined` = derive from the DSL.
   */
  mode?: "light" | "dark";
  /**
   * Force a style preset by name, overriding `meta { style: … }`. Lets a host
   * app offer a style switcher without editing the source.
   */
  stylePreset?: string;
}

export interface CompileResult {
  scene: Scene;
  diagnostics: DiagnosticBag;
}

const FONT_MAP: Record<string, NodeStyle["fontFamily"]> = {
  hand: "hand",
  normal: "normal",
  sans: "normal",
  mono: "code",
  code: "code",
  serif: "serif",
};

export function compileProgram(program: Program, opts: CompileOptions = {}): CompileResult {
  const diags = opts.diagnostics ?? new DiagnosticBag();

  // ---- gather top-level declarations --------------------------------------
  const themes = new Map<string, { tokens: { name: string; value: Value }[]; props: AttrBlock; extends?: string }>();
  const styles = new Map<string, { attrs: AttrBlock; extends?: string }>();
  const defaults = new Map<string, AttrBlock>();
  const sceneStmts: SceneStmt[] = [];
  const annotateTop: AnnotationCmd[] = [];
  let timeline: BeatDecl[] = [];
  let timelineProps: Record<string, Value> = {};
  const metaAttrs: AttrBlock = [];
  const overrideEntries: Scene["overrides"] = [];
  const vizDecls: VizDecl[] = [];
  let activeTheme: string | undefined;
  let hasMermaid = false;

  for (const s of program.statements) {
    switch (s.type) {
      case "viz":
        vizDecls.push(s);
        break;
      case "overrides":
        overrideEntries!.push(...s.entries);
        break;
      case "meta":
        metaAttrs.push(...s.attrs);
        break;
      case "theme":
        themes.set(s.name, { tokens: s.tokens, props: s.props, extends: s.extends });
        break;
      case "style":
        styles.set(s.name, { attrs: s.attrs, extends: s.extends });
        break;
      case "defaults":
        for (const r of s.rules) defaults.set(r.target, [...(defaults.get(r.target) ?? []), ...r.attrs]);
        break;
      case "scene":
        sceneStmts.push(...s.statements);
        break;
      case "annotate":
        annotateTop.push(...s.commands);
        break;
      case "timeline":
        timeline = s.beats;
        timelineProps = Object.fromEntries(s.props.map((p) => [p.key, p.value]));
        break;
      case "mermaid":
        hasMermaid = true;
        break;
    }
  }

  if (hasMermaid) {
    diags.warn("W-MERMAID-SYNC", "the pure compiler skips `mermaid` blocks; import Mermaid via the EdodoDraw facade or convertMermaid()", { line: 1, col: 1, start: 0, end: 0 }, { hint: "see docs/IMPORT_AND_EXPORT_GUIDE" });
  }

  // ---- collect scene statements (recursing into groups) -------------------
  const nodeDecls = new Map<string, NodeDecl>();
  const nodeOrder: string[] = [];
  const edgeDecls: EdgeDecl[] = [];
  const groupInfos: { decl: GroupDecl; members: string[] }[] = [];
  const nodeGroup = new Map<string, string>();
  const sceneAnnotates: AnnotationCmd[] = [];
  let layoutKind: string | undefined;
  let layoutAttrs: AttrBlock = [];

  const mergeNodeDecl = (nd: NodeDecl, group?: string) => {
    const existing = nodeDecls.get(nd.id);
    if (existing) {
      existing.classes.push(...nd.classes);
      existing.attrs.push(...nd.attrs);
      existing.anchors.push(...nd.anchors);
      if (nd.shape) existing.shape = nd.shape;
      if (nd.label !== undefined) existing.label = nd.label;
    } else {
      nodeDecls.set(nd.id, { ...nd, classes: [...nd.classes], attrs: [...nd.attrs], anchors: [...nd.anchors] });
      nodeOrder.push(nd.id);
    }
    if (group) nodeGroup.set(nd.id, group);
  };

  const walk = (stmts: SceneStmt[], group?: string) => {
    for (const st of stmts) {
      switch (st.type) {
        case "node":
          mergeNodeDecl(st, group);
          break;
        case "edge":
          edgeDecls.push(st);
          break;
        case "group": {
          const members: string[] = [];
          for (const it of st.items) if (it.type === "node") members.push(it.id);
          groupInfos.push({ decl: st, members });
          walk(st.items, st.id);
          break;
        }
        case "layout":
          layoutKind = st.kind;
          layoutAttrs = st.attrs;
          break;
        case "use":
          if (st.what === "theme") activeTheme = st.name;
          break;
        case "style":
          styles.set(st.name, { attrs: st.attrs, extends: st.extends });
          break;
        case "annotate":
          sceneAnnotates.push(...st.commands);
          break;
        case "classapply": {
          const nd: NodeDecl = { type: "node", id: st.id, classes: st.classes, attrs: [], anchors: [], span: st.span };
          mergeNodeDecl(nd, group);
          break;
        }
        case "anchor":
          // scene-level anchor: attach to its node as a synthetic attr later (skipped in M2 render)
          break;
        case "viz":
          vizDecls.push(st);
          break;
        case "mermaid":
          hasMermaid = true;
          break;
      }
    }
  };
  walk(sceneStmts);

  // ---- theme tokens -------------------------------------------------------
  const tokenMap = new Map<string, Value>();
  const themeName = activeTheme ?? [...themes.keys()][0];
  if (themeName) {
    // resolve extends chain (base first)
    const chain: string[] = [];
    let cur: string | undefined = themeName;
    const seen = new Set<string>();
    while (cur && themes.has(cur) && !seen.has(cur)) {
      chain.unshift(cur);
      seen.add(cur);
      cur = themes.get(cur)!.extends;
    }
    for (const name of chain) {
      for (const t of themes.get(name)!.tokens) tokenMap.set(t.name, t.value);
    }
  }
  // ---- style preset --------------------------------------------------------
  // `meta { style: <name> }`, overridable per-compile (host style switcher).
  // When nothing is declared, the black-and-white Classic preset is applied by
  // default so EVERY diagram — plain scenes and viz alike — shares one coherent
  // hand-drawn look. Author-declared themes/tokens still opt out of a preset.
  const metaStyleAttr = attr(metaAttrs, "style");
  const metaStyleName = metaStyleAttr && (metaStyleAttr.t === "str" || metaStyleAttr.t === "ident") ? metaStyleAttr.v : undefined;
  const presetName = opts.stylePreset ?? metaStyleName;
  const explicitPreset = getStylePreset(presetName);
  if (presetName && !explicitPreset) {
    diags.warn("W-STYLE-PRESET", `unknown style preset '${presetName}'`, { line: 1, col: 1, start: 0, end: 0 }, { hint: "see docs/STYLES_GUIDE for the built-in preset names" });
  }

  const derivedMode: "light" | "dark" = themeName?.toLowerCase().includes("dark") ? "dark" : "light";
  const mode: "light" | "dark" = opts.mode ?? explicitPreset?.mode ?? derivedMode;
  // Default to the Classic B&W look (light or dark) unless the author declared a
  // custom theme (which drives the older token-based styling path).
  const preset = explicitPreset ?? (themeName ? undefined : effectivePreset(undefined, mode));

  // ---- class chain resolution --------------------------------------------
  const classAttrs = (name: string, seen = new Set<string>()): { attrs: AttrBlock } => {
    if (seen.has(name) || !styles.has(name)) return { attrs: [] };
    seen.add(name);
    const s = styles.get(name)!;
    const base = s.extends ? classAttrs(s.extends, seen).attrs : [];
    return { attrs: [...base, ...s.attrs] };
  };

  // ---- build scene --------------------------------------------------------
  const scene = emptyScene(mode);
  if (preset) {
    scene.theme = presetTheme(preset);
    scene.theme.mode = mode;
    scene.meta.style = preset.name;
  }
  applyMeta(scene, metaAttrs, tokenMap);

  // node styling
  const styleFor = (kind: "node" | "edge", classes: string[], inline: AttrBlock): AttrBlock => {
    const layered: AttrBlock = [];
    for (const a of defaults.get(kind) ?? []) layered.push(a);
    for (const c of classes) layered.push(...classAttrs(c).attrs);
    layered.push(...inline);
    return layered;
  };

  const COLORISH = new Set(["fill", "bg", "bgColor", "background", "stroke", "color"]);
  const hasOwnColor = (layered: AttrBlock): boolean => layered.some((a) => COLORISH.has(a.key));

  const ensureNode = (id: string, label?: string) => {
    if (scene.nodes.some((n) => n.id === id)) return;
    const style = preset ? { ...presetNodeDefaults(preset) } : undefined;
    scene.nodes.push(makeNode({ id, label: label ?? id, mode, style }));
  };

  // Pre-pass for preset auto-coloring: nodes that declare no color of their own
  // cycle through the preset palette (opacity-ramp presets need the total).
  const autoColorIdx = new Map<string, number>();
  if (preset?.autoColorNodes) {
    let idx = 0;
    for (const id of nodeOrder) {
      const nd = nodeDecls.get(id)!;
      if (!hasOwnColor(styleFor("node", collectClasses(nd), nd.attrs))) autoColorIdx.set(id, idx++);
    }
  }

  // create nodes
  for (const id of nodeOrder) {
    const nd = nodeDecls.get(id)!;
    const classes = collectClasses(nd);
    const layered = styleFor("node", classes, nd.attrs);
    const built = buildNodeStyle(layered, tokenMap, mode);
    if (!preset) applyDarkInk(built.style, mode);
    let style = built.style;
    if (preset) {
      const base = presetNodeDefaults(preset);
      const autoIdx = autoColorIdx.get(id);
      if (autoIdx !== undefined) {
        const role = roleStyle(preset, autoIdx, { n: autoColorIdx.size });
        base.stroke = role.stroke;
        base.fill = role.fill;
        base.fillStyle = role.fillStyle;
        base.textColor = role.textColor;
      }
      style = { ...base, ...style };
      // Contrast pass: on a shape the author explicitly filled with a SOLID
      // light color, any LIGHT ink/outline (a dark preset's light default) would
      // vanish — darken it. Only touches gaps the author left, and only when the
      // current color is actually light (so colored strokes stay).
      if (built.style.fill != null) {
        const fillStyle = style.fillStyle ?? "solid";
        const coveringFill = fillStyle !== "none" && fillStyle !== "hachure";
        if (coveringFill && isLightColor(style.fill ?? null)) {
          if (built.style.textColor === undefined && isLightColor(style.textColor ?? null)) style = { ...style, textColor: "#1e1e1e" };
          if (built.style.stroke === undefined && isLightColor(style.stroke ?? null)) style = { ...style, stroke: "#1e1e1e" };
        }
      }
    }
    const shape = mapShape(built.shape ?? nd.shape);
    const label = built.label ?? nd.label ?? prettyId(id);
    const node = makeNode({
      id,
      shape,
      label,
      style,
      x: built.x,
      y: built.y,
      w: built.w,
      h: built.h,
      pinned: built.pinned,
      group: nodeGroup.get(id),
      mode,
      data: { tags: collectTags(nd), classes },
    });
    scene.nodes.push(node);
  }

  // groups
  for (const gi of groupInfos) {
    const g: SceneGroup = {
      id: gi.decl.id,
      label: gi.decl.label ?? "",
      members: gi.members,
      style: buildGroupStyle(gi.decl.attrs, tokenMap),
      frame: true,
    };
    scene.groups.push(g);
  }

  // edges (expand chains + fan)
  let edgeSeq = 0;
  for (const ed of edgeDecls) {
    for (let h = 0; h < ed.ops.length; h++) {
      const gl = lowerGlyph(ed.ops[h].glyph);
      const fromSet = ed.groups[h];
      const toSet = ed.groups[h + 1];
      const singleHop = ed.ops.length === 1;
      for (const from of fromSet) {
        for (const to of toSet) {
          if (from.inline) ensureInline(scene, from.inline, tokenMap, mode, styleFor);
          if (to.inline) ensureInline(scene, to.inline, tokenMap, mode, styleFor);
          ensureNode(from.id);
          ensureNode(to.id);
          const label = ed.ops[h].midLabel ?? (singleHop ? ed.label : undefined) ?? "";
          const id = ed.id && singleHop && fromSet.length === 1 && toSet.length === 1 ? ed.id : `e${edgeSeq++}_${from.id}_${to.id}`;
          const built = buildEdgeStyle(gl, styleFor("edge", [], ed.attrs), tokenMap, mode);
          const edge = makeEdge({
            id,
            from: from.id,
            to: to.id,
            fromAnchor: endpointAnchor(from),
            toAnchor: endpointAnchor(to),
            label,
            style: preset ? { ...presetEdgeDefaults(preset), ...built.style } : built.style,
            routing: built.routing ?? gl.routing ?? "straight",
            mode,
          });
          scene.edges.push(edge);
        }
      }
    }
  }

  // fan parallel edges (same unordered node pair) apart so they don't overlap
  const pairCount = new Map<string, number>();
  const pairKey = (e: (typeof scene.edges)[number]) => [e.from.node, e.to.node].filter(Boolean).sort().join("|");
  for (const e of scene.edges) pairCount.set(pairKey(e), (pairCount.get(pairKey(e)) ?? 0) + 1);
  const pairIdx = new Map<string, number>();
  for (const e of scene.edges) {
    const key = pairKey(e);
    const count = pairCount.get(key)!;
    if (count > 1) {
      const idx = pairIdx.get(key) ?? 0;
      pairIdx.set(key, idx + 1);
      e.data = { ...e.data, parallel: { index: idx, count } };
      e.routing = "curved";
    }
  }

  // ---- annotations (script) ----------------------------------------------
  for (const cmd of [...annotateTop, ...sceneAnnotates]) {
    const a = annotationFromCmd(cmd, tokenMap, "script");
    if (a) scene.annotations.push(a);
  }

  // ---- layout -------------------------------------------------------------
  scene.meta.layout = resolveLayoutKind(layoutKind, scene);
  const dir = layoutAttrs.length ? attr(layoutAttrs, "direction") : undefined;
  if (dir && dir.t === "ident") (scene.meta as { direction?: string }).direction = dir.v;
  const gap = numberOf(attr(layoutAttrs, "gap"));
  const rankGap = numberOf(attr(layoutAttrs, "rankGap")) ?? numberOf(attr(layoutAttrs, "rankgap"));
  if (gap || rankGap) scene.meta.spacing = { node: gap, rank: rankGap };
  const centerId = attr(layoutAttrs, "center");
  if (centerId && centerId.t === "ref") (scene.meta as { center?: string }).center = centerId.id;
  else if (centerId && centerId.t === "ident") (scene.meta as { center?: string }).center = centerId.v;

  // Position/size overrides (direct-edit round-trip): pin before layout.
  if (overrideEntries && overrideEntries.length) {
    scene.overrides = overrideEntries;
    applyOverrides(scene);
  }

  applyLayout(scene);

  // ---- viz templates -------------------------------------------------------
  // Generated AFTER layout so each block stacks below existing graph content
  // (viz output is pinned Scene IR — camera/annotations/editing work as usual).
  if (vizDecls.length) {
    const vizPreset = preset ?? effectivePreset(undefined, mode);
    let cursorY = contentMaxY(scene) + (scene.nodes.length ? 100 : 40);
    for (let i = 0; i < vizDecls.length; i++) {
      const spec = lowerViz(vizDecls[i], i, tokenMap);
      const result = runViz(spec, vizPreset, mode, diags);
      if (!result) continue;
      const dx = 40 - result.bounds.x;
      const dy = cursorY - result.bounds.y;
      for (const n of result.nodes) {
        n.x += dx;
        n.y += dy;
        scene.nodes.push(n);
      }
      for (const e of result.edges) {
        if (e.from.point) e.from = { ...e.from, point: { x: e.from.point.x + dx, y: e.from.point.y + dy } };
        if (e.to.point) e.to = { ...e.to, point: { x: e.to.point.x + dx, y: e.to.point.y + dy } };
        if (e.points) e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        scene.edges.push(e);
      }
      for (const a of result.annotations) scene.annotations.push(a);
      cursorY += result.bounds.h + 100;
    }
  }

  // ---- timeline -> steps ----------------------------------------------------
  // After viz generation so `reveal all` (etc.) covers viz-emitted elements.
  scene.steps = timeline.map((b, idx) => beatToStep(b, idx, scene, tokenMap, timelineProps, diags));

  // Late-bind annotation targets (viz elements exist only now) + diagnostics
  // for targets that would otherwise silently no-op.
  resolveAnnotationTargets(scene, diags);

  return { scene, diagnostics: diags };
}

/** Does `id` name something annotatable? (node, edge, group, or viz item) */
function targetExists(scene: Scene, id: string): boolean {
  return !!getNode(scene, id) || !!getEdge(scene, id) || !!getGroup(scene, id) || vizItemMembers(scene, id).length > 0;
}

/**
 * Resolve annotation targets against the finished scene. A dotted id like
 * `strike fix.the-busy-slide` parses as ref "fix" + part "the-busy-slide" —
 * when the ref alone matches nothing but the joined id does (viz items,
 * literal dotted ids), rewrite it. Anything still unresolved gets a
 * W-ANNOT-TARGET diagnostic instead of a silent no-op. Legitimate parts on
 * real elements (`a.label`, anchors) are untouched.
 */
function resolveAnnotationTargets(scene: Scene, diags: DiagnosticBag): void {
  const all = [...scene.annotations, ...scene.steps.flatMap((s) => s.annotations)];
  for (const a of all) {
    // annotation ids embed the command's source offset (an_<start>_<kind>)
    const start = Number(/^an_(\d+)_/.exec(a.id)?.[1] ?? 0);
    const pos = { line: 1, col: 1, start, end: start };
    const warn = (what: string) =>
      diags.warn("W-ANNOT-TARGET", `annotation target '${what}' matches no element`, pos, { hint: "check the id — viz items are addressed as <blockId>.<itemId>" });

    for (const t of [a.target, a.target2]) {
      if (!t?.ref) continue;
      if (targetExists(scene, t.ref)) continue;
      const joined = t.part ? `${t.ref}.${t.part}` : undefined;
      if (joined && targetExists(scene, joined)) {
        t.ref = joined;
        t.part = undefined;
        continue;
      }
      warn(joined ?? t.ref);
    }
    const members = a.options.members as string[] | undefined;
    if (members) for (const m of members) if (m && !targetExists(scene, m)) warn(m);
  }
}

/** Bottom edge (max y) of the scene's current content, 0 when empty. */
function contentMaxY(scene: Scene): number {
  let maxY = 0;
  for (const n of scene.nodes) maxY = Math.max(maxY, n.y + n.h);
  return maxY;
}

// ---- helpers ---------------------------------------------------------------

function prettyId(id: string): string {
  return id;
}

function collectClasses(nd: NodeDecl): string[] {
  const out = [...nd.classes];
  for (const a of nd.attrs) {
    if (a.key === "__use" && a.value.t === "class") out.push(a.value.v);
    if (a.key === "class" && a.value.t === "ident") out.push(a.value.v);
    if (a.key === "class" && a.value.t === "class") out.push(a.value.v);
  }
  return out;
}

function collectTags(nd: NodeDecl): string[] {
  const tags: string[] = [];
  const t = nd.attrs.find((a) => a.key === "tags");
  if (t && t.value.t === "list") {
    for (const v of t.value.v) if (v.t === "ident") tags.push(v.v);
  }
  return tags;
}

interface BuiltNode {
  style: Partial<NodeStyle>;
  shape?: string;
  label?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  pinned?: boolean;
}

/**
 * Dark-mode contrast pass. In dark mode the canvas is near-black, but the fill
 * palette stays the light Excalidraw pastels — so ink can't be a single color.
 * The subtlety is fill *style*: the default is `hachure` (sketchy lines that
 * don't cover the interior), so the dark canvas shows through and text/outline
 * must be LIGHT to read. Only a **solid** light fill actually backs the label,
 * and there DARK ink reads best (exactly as in light mode).
 *
 * Rule: solid + light fill → dark ink; everything else (hachure, no fill, dark
 * fill) → light ink. Only fills gaps the author left unset — explicit
 * stroke/textColor always win. A no-op in light mode. Also runs for
 * DSL-declared `theme dark` diagrams, fixing their contrast too.
 */
const DARK_INK = "#1e1e1e";
const LIGHT_INK = "#e3e3e3";
function applyDarkInk(style: Partial<NodeStyle>, mode: "light" | "dark"): void {
  if (mode !== "dark") return;
  const solidLightFill = style.fillStyle === "solid" && isLightColor(style.fill ?? null);
  const ink = solidLightFill ? DARK_INK : LIGHT_INK;
  if (style.textColor === undefined) style.textColor = ink;
  // Stroke: keep the light default (visible on the dark canvas); only darken it
  // when the outline sits on a solid light fill.
  if (style.stroke === undefined && solidLightFill) style.stroke = DARK_INK;
}

function buildNodeStyle(attrs: AttrBlock, tokens: Map<string, Value>, _mode: "light" | "dark"): BuiltNode {
  const style: Partial<NodeStyle> = {};
  const out: BuiltNode = { style };
  for (const a of attrs) {
    const v = a.value;
    switch (a.key) {
      case "stroke":
      case "color": {
        const c = resolveColor(v, tokens, "stroke");
        if (c) style.stroke = c;
        break;
      }
      case "fill":
      case "bg":
      case "bgColor":
      case "background": {
        const c = resolveColor(v, tokens, "fill");
        style.fill = c;
        break;
      }
      case "fillStyle": {
        const fs = mapFillStyle(v);
        if (fs) style.fillStyle = fs;
        break;
      }
      case "strokeWidth": {
        const w = mapStrokeWidth(v);
        if (w != null) style.strokeWidth = w;
        break;
      }
      case "strokeStyle": {
        const ss = mapStrokeStyle(v);
        if (ss) style.strokeStyle = ss;
        break;
      }
      case "roughness": {
        const r = mapRoughness(v);
        if (r != null) style.roughness = r;
        break;
      }
      case "roundness":
      case "radius":
        if (v.t === "num") style.roundness = v.v;
        break;
      case "font":
        if (v.t === "ident") style.fontFamily = FONT_MAP[v.v] ?? "hand";
        break;
      case "fontSize":
        if (v.t === "num") style.fontSize = v.v;
        break;
      case "textColor": {
        const c = resolveColor(v, tokens, "stroke");
        if (c) style.textColor = c;
        break;
      }
      case "textAlign":
        if (v.t === "ident") style.textAlign = v.v as NodeStyle["textAlign"];
        break;
      case "opacity":
        if (v.t === "num") style.opacity = v.unit === "%" ? v.v : v.v <= 1 ? v.v * 100 : v.v;
        break;
      case "shape":
        if (v.t === "ident") out.shape = v.v;
        else if (v.t === "call" && v.name === "custom") out.shape = `custom:${v.args[0]?.t === "str" ? v.args[0].v : ""}`;
        break;
      case "label":
      case "text":
        if (v.t === "str") out.label = v.v;
        break;
      case "at":
        if (v.t === "tuple" && v.v[0]?.t === "num" && v.v[1]?.t === "num") {
          out.x = v.v[0].v;
          out.y = v.v[1].v;
        }
        break;
      case "pin":
        if (v.t === "bool") out.pinned = v.v;
        break;
      case "size":
        if (v.t === "tuple" && v.v[0]?.t === "num" && v.v[1]?.t === "num") {
          out.w = v.v[0].v;
          out.h = v.v[1].v;
        }
        break;
      case "w":
      case "width":
        if (v.t === "num") out.w = v.v;
        break;
      case "h":
      case "height":
        if (v.t === "num") out.h = v.v;
        break;
    }
  }
  if (out.pinned === undefined && out.x != null) out.pinned = true;
  return out;
}

function buildGroupStyle(attrs: AttrBlock, tokens: Map<string, Value>): Partial<NodeStyle> {
  const style: Partial<NodeStyle> = {};
  const stroke = attrs.find((a) => a.key === "stroke" || a.key === "color");
  if (stroke) {
    const c = resolveColor(stroke.value, tokens, "stroke");
    if (c) style.stroke = c;
  }
  const fill = attrs.find((a) => a.key === "fill" || a.key === "bg");
  if (fill) style.fill = resolveColor(fill.value, tokens, "fill");
  return style;
}

interface BuiltEdge {
  style: Partial<EdgeStyle>;
  routing?: EdgeRouting;
}

function buildEdgeStyle(
  gl: ReturnType<typeof lowerGlyph>,
  attrs: AttrBlock,
  tokens: Map<string, Value>,
  _mode: "light" | "dark",
): BuiltEdge {
  const style: Partial<EdgeStyle> = {
    strokeStyle: gl.strokeStyle,
    startArrowhead: gl.startArrowhead,
    endArrowhead: gl.endArrowhead,
  };
  if (gl.animation) style.animation = gl.animation;
  if (gl.strokeWidthMul) style.strokeWidth = 1.4 * gl.strokeWidthMul;
  let routing: BuiltEdge["routing"];
  for (const a of attrs) {
    const v = a.value;
    switch (a.key) {
      case "stroke":
      case "color": {
        const c = resolveColor(v, tokens, "stroke");
        if (c) style.stroke = c;
        break;
      }
      case "strokeWidth": {
        const w = mapStrokeWidth(v);
        if (w != null) style.strokeWidth = w;
        break;
      }
      case "strokeStyle": {
        const ss = mapStrokeStyle(v);
        if (ss) style.strokeStyle = ss;
        break;
      }
      case "roughness": {
        const r = mapRoughness(v);
        if (r != null) style.roughness = r;
        break;
      }
      case "startArrow":
      case "startArrowhead": {
        const ah = mapArrowhead(v);
        if (ah) style.startArrowhead = ah;
        break;
      }
      case "endArrow":
      case "endArrowhead": {
        const ah = mapArrowhead(v);
        if (ah) style.endArrowhead = ah;
        break;
      }
      case "animate":
      case "animation": {
        const an = mapAnimation(v);
        if (an) {
          style.animation = an.kind;
          if (an.speed) style.animationSpeed = an.speed;
        }
        break;
      }
      case "curve":
      case "routing": {
        const r = mapRouting(v);
        if (r) routing = r;
        break;
      }
      case "opacity":
        if (v.t === "num") style.opacity = v.unit === "%" ? v.v : v.v <= 1 ? v.v * 100 : v.v;
        break;
      case "fontSize":
        if (v.t === "num") style.fontSize = v.v;
        break;
      case "textColor": {
        const c = resolveColor(v, tokens, "stroke");
        if (c) style.textColor = c;
        break;
      }
      case "labelBg": {
        const c = resolveColor(v, tokens, "fill");
        style.labelBg = c;
        break;
      }
    }
  }
  return { style, routing };
}

function endpointAnchor(e: Endpoint): string | undefined {
  if (e.uv) return `@${e.uv[0]},${e.uv[1]}`; // engine ignores unknown -> center; refined later
  if (e.sub && e.sub !== "label" && e.sub !== "text") return e.sub;
  return undefined;
}

function ensureInline(
  scene: Scene,
  nd: NodeDecl,
  tokens: Map<string, Value>,
  mode: "light" | "dark",
  styleFor: (kind: "node" | "edge", classes: string[], inline: AttrBlock) => AttrBlock,
): void {
  if (scene.nodes.some((n) => n.id === nd.id)) return;
  const layered = styleFor("node", nd.classes, nd.attrs);
  const built = buildNodeStyle(layered, tokens, mode);
  applyDarkInk(built.style, mode);
  scene.nodes.push(
    makeNode({
      id: nd.id,
      shape: mapShape(built.shape ?? nd.shape),
      label: built.label ?? nd.label ?? nd.id,
      style: built.style,
      x: built.x,
      y: built.y,
      w: built.w,
      h: built.h,
      pinned: built.pinned,
      mode,
    }),
  );
}

function applyMeta(scene: Scene, attrs: AttrBlock, tokens: Map<string, Value>): void {
  for (const a of attrs) {
    if (a.key === "title" && a.value.t === "str") scene.meta.title = a.value.v;
    if (a.key === "background" || a.key === "bg") {
      const c = resolveColor(a.value, tokens, "fill");
      if (c) scene.meta.background = c;
    }
  }
}

function resolveLayoutKind(kind: string | undefined, scene: Scene): LayoutKind {
  if (!kind) {
    // default: if every node is pinned or has coords, treat as manual
    const anyUnpinned = scene.nodes.some((n) => !n.pinned);
    return anyUnpinned ? "dag" : "manual";
  }
  // runtime-registered layouts pass through by name (see plugins/registry)
  if (getLayoutPlugin(kind)) return kind;
  const map: Record<string, LayoutKind> = {
    dag: "dag",
    tree: "dag",
    flow: "dag",
    force: "dag",
    grid: "grid",
    radial: "radial",
    free: "manual",
    manual: "manual",
  };
  return map[kind] ?? "dag";
}

// ---- annotations -----------------------------------------------------------

function valueToPlain(v: Value, tokens: Map<string, Value>): unknown {
  switch (v.t) {
    case "num":
      return v.v;
    case "str":
    case "ident":
    case "color":
    case "class":
      return v.v;
    case "bool":
      return v.v;
    case "token": {
      const t = tokens.get(v.v);
      return t ? valueToPlain(t, tokens) : undefined;
    }
    case "tuple":
    case "list":
      return v.v.map((x) => valueToPlain(x, tokens));
    default:
      return undefined;
  }
}

function annotationTargetFromEndpoint(e: Endpoint | undefined): AnnotationTarget {
  if (!e) return { ref: null };
  return { ref: e.id, part: e.sub };
}

export function annotationFromCmd(cmd: AnnotationCmd, tokens: Map<string, Value>, origin: "script" | "live"): Annotation | null {
  const colorAttr = cmd.attrs.find((a) => a.key === "color");
  const colorPlain = colorAttr ? (resolveColor(colorAttr.value, tokens, "stroke") ?? String(valueToPlain(colorAttr.value, tokens))) : undefined;
  const options: Record<string, unknown> = {};
  for (const a of cmd.attrs) {
    if (a.key === "color") continue;
    options[a.key] = valueToPlain(a.value, tokens);
  }
  // members for box/spotlight over a list (dotted refs keep their full id)
  let members: string[] | undefined;
  if (cmd.targetList && cmd.targetList.t === "list") {
    members = cmd.targetList.v.map((v) => (v.t === "ident" ? v.v : v.t === "ref" ? (v.sub ? `${v.id}.${v.sub}` : v.id) : "")).filter(Boolean);
    options.members = members;
  }
  let target = cmd.targetList ? { ref: members?.[0] ?? null } : annotationTargetFromEndpoint(cmd.target);
  // explicit `target:` attribute — lets a quoted string address dotted ids:
  // strike { target: "fix.the-busy-slide" }
  const targetAttr = cmd.attrs.find((a) => a.key === "target");
  if (targetAttr) {
    const tv = targetAttr.value;
    const ref = tv.t === "str" || tv.t === "ident" ? tv.v : tv.t === "ref" ? (tv.sub ? `${tv.id}.${tv.sub}` : tv.id) : undefined;
    if (ref) {
      target = { ref };
      delete options.target;
    }
  }
  const defaultColor = cmd.kind === "highlight" ? resolveMarker(undefined) : cmd.kind === "spotlight" ? "#000000" : "#1971c2";
  return {
    id: `an_${cmd.span.start}_${cmd.kind}`,
    kind: cmd.kind,
    target,
    text: cmd.text,
    color: colorPlain ?? defaultColor,
    options,
    z: 0,
    origin,
  };
}

// ---- timeline --------------------------------------------------------------

/** Expand one target id: viz-item keys ("block.item") become their member
 *  element ids so reveal/hide/focus treat a data item as a unit. */
function expandTargetId(id: string, scene: Scene): string[] {
  const members = vizItemMembers(scene, id);
  if (!members.length) return [id];
  return members.includes(id) ? members : [id, ...members];
}

function resolveTargetIds(v: Value, scene: Scene, diags?: DiagnosticBag): string[] {
  const checked = (id: string): string[] => {
    if (diags && !targetExists(scene, id)) {
      diags.warn("W-STEP-TARGET", `timeline target '${id}' matches no element`, { line: 1, col: 1, start: 0, end: 0 }, { hint: "check the id — viz items are addressed as <blockId>.<itemId>" });
    }
    return expandTargetId(id, scene);
  };
  switch (v.t) {
    case "ident": {
      if (v.v === "all") return [...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id)];
      if (v.v === "nodes") return scene.nodes.map((n) => n.id);
      if (v.v === "edges") return scene.edges.map((e) => e.id);
      if (v.v === "groups") return scene.groups.map((g) => g.id);
      return checked(v.v);
    }
    case "ref": {
      // dotted targets (`fix.item1`) parse as ref+sub: prefer the joined id
      // when it names something (viz items, literal dotted ids)
      if (v.sub) {
        const joined = `${v.id}.${v.sub}`;
        if (targetExists(scene, joined)) return expandTargetId(joined, scene);
      }
      return checked(v.id);
    }
    case "class": {
      const cls = v.v;
      return scene.nodes
        .filter((n) => {
          const d = (n.data ?? {}) as { classes?: string[]; tags?: string[] };
          return d.classes?.includes(cls) || d.tags?.includes(cls);
        })
        .map((n) => n.id);
    }
    case "list":
      return v.v.flatMap((x) => resolveTargetIds(x, scene, diags));
    case "str":
      return checked(v.v);
    default:
      return [];
  }
}

function beatToStep(b: BeatDecl, idx: number, scene: Scene, tokens: Map<string, Value>, timelineProps: Record<string, Value>, diags?: DiagnosticBag): Step {
  const step: Step = {
    id: b.id || `beat_${idx}`,
    name: b.title ?? b.id,
    annotations: [],
    reveal: [],
    hide: [],
  };

  for (const item of b.items) {
    switch (item.type) {
      case "camera":
        step.camera = cameraDirective(item, scene, tokens, timelineProps, diags);
        break;
      case "annotate":
        for (const c of item.commands) {
          const a = annotationFromCmd(c, tokens, "script");
          if (a) step.annotations.push(a);
        }
        break;
      case "annotcmd": {
        const a = annotationFromCmd(item, tokens, "script");
        if (a) step.annotations.push(a);
        break;
      }
      case "reveal":
        for (const c of item.commands) applyRevealToStep(c, scene, step, diags);
        break;
      case "revealcmd":
        applyRevealToStep(item, scene, step, diags);
        break;
      case "stagger":
        for (const c of item.commands) {
          if (c.type === "revealcmd") applyRevealToStep(c, scene, step, diags);
          else {
            const a = annotationFromCmd(c, tokens, "script");
            if (a) step.annotations.push(a);
          }
        }
        break;
      case "prop":
        if (item.key === "narrate" && item.value.t === "str") step.caption = item.value.v;
        if ((item.key === "hold" || item.key === "wait") && item.value.t === "num") {
          step.autoAdvanceMs = item.value.unit === "s" ? item.value.v * 1000 : item.value.v;
        }
        break;
    }
  }
  return step;
}

function applyRevealToStep(c: { verb: string; targets: Value[]; with?: string }, scene: Scene, step: Step, diags?: DiagnosticBag): void {
  const ids = c.targets.flatMap((t) => resolveTargetIds(t, scene, diags));
  if (c.verb === "hide" || c.verb === "fade-out" || c.verb === "remove") {
    step.hide!.push(...ids);
    return;
  }
  step.reveal!.push(...ids);
  // Reveal animation: an explicit `with <effect>`, or an effect-verb like
  // `pop [a]` / `draw-on [x]` / `fade-in all`. Plain `show` stays instant.
  const effect = revealEffect(c.with ?? (c.verb !== "show" ? c.verb : undefined));
  if (effect) {
    step.revealFx = step.revealFx ?? {};
    for (const id of ids) step.revealFx[id] = effect;
  }
}

/** Normalize a reveal-effect word to a renderer effect ("fade" | "pop" | "sweep"). */
function revealEffect(raw: string | undefined): string | undefined {
  switch (raw) {
    case "fade-in":
    case "fade":
      return "fade";
    case "pop":
    case "pop-in":
    case "emphasize":
      return "pop";
    case "draw-on":
    case "draw":
    case "sweep":
      return "sweep";
    default:
      return undefined; // unknown / continuous verbs (flow, pulse) => plain show
  }
}

function cameraDirective(cam: import("./ast.js").CameraStmt, scene: Scene, _tokens: Map<string, Value>, timelineProps: Record<string, Value>, diags?: DiagnosticBag): CameraDirective {
  const op = (cam.op ?? "fit-all") as CameraDirective["op"];
  const directive: CameraDirective = { op: normalizeCamOp(op) };
  if (cam.targets && cam.targets.length) {
    directive.targets = cam.targets.flatMap((t) => resolveTargetIds(t, scene, diags));
  }
  if (cam.zoom != null) directive.zoom = cam.zoom;
  if (cam.pad != null) directive.padding = cam.pad;
  if (cam.pan) directive.center = { x: cam.pan[0], y: cam.pan[1] };
  directive.easing = mapEasing(cam.ease ?? timelineProps.defaultEase);
  if (cam.over != null) directive.durationMs = cam.over;
  return directive;
}

function normalizeCamOp(op: string): CameraDirective["op"] {
  switch (op) {
    case "fit-all":
    case "reset":
      return "fit-all";
    case "fit":
      return "focus";
    case "focus":
      return "focus";
    case "center":
      return "focus";
    case "zoom":
      return "zoom";
    case "pan":
      return "pan";
    case "follow":
      return "focus";
    default:
      return "focus";
  }
}
