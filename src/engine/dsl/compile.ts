/**
 * Compiler: EDodoDraw AST -> Scene IR. Applies the style cascade (theme tokens
 * -> defaults -> classes -> inline), expands edge chains/fan-outs, lifts
 * annotate blocks and timeline beats into the IR, then runs auto-layout.
 */

import { applyLayout } from "../layout/index.js";
import { emptyScene, makeEdge, makeNode } from "../scene/defaults.js";
import { resolveMarker } from "../scene/palette.js";
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
  let activeTheme: string | undefined;
  let hasMermaid = false;

  for (const s of program.statements) {
    switch (s.type) {
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
    diags.warn("W-MERMAID-M5", "mermaid import is wired in a later milestone; the block was skipped", { line: 1, col: 1, start: 0, end: 0 }, { hint: "use EDodoDraw node/edge syntax for now" });
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
  const mode: "light" | "dark" = themeName?.toLowerCase().includes("dark") ? "dark" : "light";

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
  applyMeta(scene, metaAttrs, tokenMap);

  // node styling
  const styleFor = (kind: "node" | "edge", classes: string[], inline: AttrBlock): AttrBlock => {
    const layered: AttrBlock = [];
    for (const a of defaults.get(kind) ?? []) layered.push(a);
    for (const c of classes) layered.push(...classAttrs(c).attrs);
    layered.push(...inline);
    return layered;
  };

  const ensureNode = (id: string, label?: string) => {
    if (scene.nodes.some((n) => n.id === id)) return;
    scene.nodes.push(makeNode({ id, label: label ?? id, mode }));
  };

  // create nodes
  for (const id of nodeOrder) {
    const nd = nodeDecls.get(id)!;
    const classes = collectClasses(nd);
    const layered = styleFor("node", classes, nd.attrs);
    const built = buildNodeStyle(layered, tokenMap, mode);
    const shape = mapShape(built.shape ?? nd.shape);
    const label = built.label ?? nd.label ?? prettyId(id);
    const node = makeNode({
      id,
      shape,
      label,
      style: built.style,
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
            style: built.style,
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

  // ---- timeline -> steps --------------------------------------------------
  scene.steps = timeline.map((b, idx) => beatToStep(b, idx, scene, tokenMap, timelineProps));

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

  applyLayout(scene);

  return { scene, diagnostics: diags };
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
  // members for box/spotlight over a list
  let members: string[] | undefined;
  if (cmd.targetList && cmd.targetList.t === "list") {
    members = cmd.targetList.v.map((v) => (v.t === "ident" ? v.v : v.t === "ref" ? v.id : "")).filter(Boolean);
    options.members = members;
  }
  const target = cmd.targetList ? { ref: members?.[0] ?? null } : annotationTargetFromEndpoint(cmd.target);
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

function resolveTargetIds(v: Value, scene: Scene): string[] {
  switch (v.t) {
    case "ident": {
      if (v.v === "all") return [...scene.nodes.map((n) => n.id), ...scene.edges.map((e) => e.id)];
      if (v.v === "nodes") return scene.nodes.map((n) => n.id);
      if (v.v === "edges") return scene.edges.map((e) => e.id);
      if (v.v === "groups") return scene.groups.map((g) => g.id);
      return [v.v];
    }
    case "ref":
      return [v.id];
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
      return v.v.flatMap((x) => resolveTargetIds(x, scene));
    case "str":
      return [v.v];
    default:
      return [];
  }
}

function beatToStep(b: BeatDecl, idx: number, scene: Scene, tokens: Map<string, Value>, timelineProps: Record<string, Value>): Step {
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
        step.camera = cameraDirective(item, scene, tokens, timelineProps);
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
        for (const c of item.commands) applyRevealToStep(c, scene, step);
        break;
      case "revealcmd":
        applyRevealToStep(item, scene, step);
        break;
      case "stagger":
        for (const c of item.commands) {
          if (c.type === "revealcmd") applyRevealToStep(c, scene, step);
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

function applyRevealToStep(c: { verb: string; targets: Value[] }, scene: Scene, step: Step): void {
  const ids = c.targets.flatMap((t) => resolveTargetIds(t, scene));
  if (c.verb === "hide" || c.verb === "fade-out" || c.verb === "remove") {
    step.hide!.push(...ids);
  } else {
    step.reveal!.push(...ids);
  }
}

function cameraDirective(cam: import("./ast.js").CameraStmt, scene: Scene, _tokens: Map<string, Value>, timelineProps: Record<string, Value>): CameraDirective {
  const op = (cam.op ?? "fit-all") as CameraDirective["op"];
  const directive: CameraDirective = { op: normalizeCamOp(op) };
  if (cam.targets && cam.targets.length) {
    directive.targets = cam.targets.flatMap((t) => resolveTargetIds(t, scene));
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
