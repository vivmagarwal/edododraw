import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { CanvasView, type CanvasEngine } from "./CanvasView.js";
import type { Diagnostic, EditState, LiveState, PlayerState } from "../lib/index.js";
import { CodeEditor, type CodeEditorDiagnostic } from "../site/CodeEditor.js";
import { EXAMPLES } from "./examples.js";
import { takePlaygroundSource } from "../site/router.js";
import "./app.css";

const DEBOUNCE_MS = 180;

const EDIT_TOOLS: { tool: string; icon: string; label: string }[] = [
  { tool: "select", icon: "↖", label: "Select · move · resize (V)" },
  { tool: "hand", icon: "✋", label: "Pan the canvas (H)" },
  { tool: "rect", icon: "▭", label: "Rectangle (R)" },
  { tool: "ellipse", icon: "◯", label: "Ellipse (O)" },
  { tool: "diamond", icon: "◇", label: "Diamond (D)" },
  { tool: "text", icon: "T", label: "Text (T)" },
  { tool: "arrow", icon: "↗", label: "Connect with an arrow (A)" },
];

const ANNOT_TOOLS: { tool: string; icon: string; label: string }[] = [
  { tool: "highlight", icon: "🖍", label: "Highlight element" },
  { tool: "underline", icon: "﹍", label: "Underline element" },
  { tool: "mark-box", icon: "▢", label: "Box around element" },
  { tool: "mark-circle", icon: "◌", label: "Circle element" },
  { tool: "point", icon: "➤", label: "Point-at arrow" },
  { tool: "note", icon: "✎", label: "Sticky note" },
];

const FILL_SWATCHES = ["transparent", "blue", "green", "yellow", "red", "violet", "orange", "teal", "pink", "gray"];
const STROKE_SWATCHES = ["black", "blue", "green", "red", "violet", "orange", "teal"];
const SHAPES = ["rect", "round-rect", "ellipse", "circle", "diamond", "hexagon", "parallelogram", "cylinder", "cloud", "note", "pill", "text"];

const SWATCH_HEX: Record<string, string> = {
  transparent: "transparent", black: "#1e1e1e", gray: "#868e96", blue: "#a5d8ff", green: "#b2f2bb", yellow: "#ffec99",
  red: "#ffc9c9", violet: "#d0bfff", orange: "#ffd8a8", teal: "#96f2d7", pink: "#fcc2d7",
};
const STROKE_HEX: Record<string, string> = { black: "#1e1e1e", blue: "#1971c2", green: "#2f9e44", red: "#e03131", violet: "#6741d9", orange: "#e8590c", teal: "#099268" };

// Glyphs for the collapsed inspector pill (a compact shape hint).
const SHAPE_GLYPH: Record<string, string> = {
  rect: "▭", "round-rect": "▢", ellipse: "◯", circle: "◯", diamond: "◇", hexagon: "⬡",
  parallelogram: "▱", cylinder: "⬢", cloud: "☁", note: "🗒", pill: "⬭", text: "T",
};

// Tool letter -> engine tool id (keyboard shortcuts, Excalidraw-style).
const TOOL_KEYS: Record<string, string> = { v: "select", h: "hand", r: "rect", o: "ellipse", d: "diamond", t: "text", a: "arrow" };

type Side = "left" | "right";
// Tiny, SSR/quota-safe localStorage helpers so layout prefs persist across sessions.
const lsGet = (key: string, fallback: string): string => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const lsSet = (key: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* ignore quota / privacy mode */ }
};
const cssEscape = (s: string): string => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type ThemePref = "system" | "light" | "dark";
const prefersDark = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
// Splitter geometry: how narrow the code pane / canvas may get while dragging.
const MIN_EDITOR = 280;
const MIN_CANVAS = 360;

export default function App() {
  const initial = useMemo(() => takePlaygroundSource() ?? EXAMPLES[0].source, []);
  const [source, setSource] = useState<string>(initial);
  const [debounced, setDebounced] = useState<string>(initial);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  // --- editing-UI layout state (Excalidraw-style chrome) ---
  const [codeCollapsed, setCodeCollapsed] = useState<boolean>(() => lsGet("edd.codeCollapsed", "0") === "1");
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(false);
  const [inspectorSide, setInspectorSide] = useState<Side>(() => (lsGet("edd.inspectorSide", "left") === "right" ? "right" : "left"));
  // Draggable splitter: editor pane width in px (null = use the CSS default 42%).
  const [editorBasis, setEditorBasis] = useState<number | null>(() => {
    const v = lsGet("edd.editorBasis", "");
    const n = Number(v);
    return v !== "" && Number.isFinite(n) && n > 0 ? n : null;
  });
  // Theme: persisted preference + live system value -> resolved light/dark.
  const [themePref, setThemePref] = useState<ThemePref>(() => {
    const v = lsGet("edd.theme", "system");
    return v === "light" || v === "dark" ? v : "system";
  });
  const [systemDark, setSystemDark] = useState<boolean>(() => prefersDark());
  const [editorPct, setEditorPct] = useState<number>(42); // for the splitter's aria-valuenow
  const resolvedTheme: "light" | "dark" = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;
  const engineRef = useRef<CanvasEngine | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const dockPinned = useRef(false); // user manually chose a side for this selection
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setDebounced(source), DEBOUNCE_MS);
    return () => window.clearTimeout(debounce.current);
  }, [source]);

  // Scriptable source injection for automated visual testing (Playwright et al.)
  // — SPA hash navigation doesn't remount, and StrictMode double-mount consumes
  // the sessionStorage handoff, so tests set code through this hook instead.
  useEffect(() => {
    (window as unknown as { __eddSetSource?: (s: string) => void }).__eddSetSource = (s: string) => {
      setSource(s);
      setDebounced(s);
    };
    return () => {
      delete (window as unknown as { __eddSetSource?: (s: string) => void }).__eddSetSource;
    };
  }, []);

  useEffect(() => lsSet("edd.codeCollapsed", codeCollapsed ? "1" : "0"), [codeCollapsed]);
  useEffect(() => lsSet("edd.inspectorSide", inspectorSide), [inspectorSide]);
  useEffect(() => lsSet("edd.editorBasis", editorBasis == null ? "" : String(Math.round(editorBasis))), [editorBasis]);

  // Keep the editor basis sane as the window resizes: a wide basis saved on a big
  // monitor (or dragged, then the window shrunk) must be re-clamped so the canvas
  // never collapses. Also tracks the pane's width % for the splitter's aria-valuenow.
  useEffect(() => {
    const main = mainRef.current;
    if (!main || codeCollapsed) return;
    const recompute = () => {
      const w = main.getBoundingClientRect().width;
      if (w <= 0) return;
      if (editorBasis != null) {
        const max = Math.max(MIN_EDITOR, w - MIN_CANVAS);
        if (editorBasis > max) { setEditorBasis(max); return; }
      }
      const basisPx = editorBasis ?? w * 0.42;
      setEditorPct(Math.round(clamp((basisPx / w) * 100, 0, 100)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(main);
    return () => ro.disconnect();
  }, [editorBasis, codeCollapsed]);

  // Theme preference -> persist + drive the CSS chrome (data-theme on <html>).
  useEffect(() => {
    lsSet("edd.theme", themePref);
    document.documentElement.dataset.theme = themePref;
  }, [themePref]);
  // Track the OS theme so "system" stays live.
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  // Resolved theme drives the canvas (bg, grid, diagram ink) so chrome + canvas stay in sync.
  useEffect(() => {
    engineRef.current?.setColorScheme(resolvedTheme);
  }, [resolvedTheme]);

  // Keyboard shortcuts: tools (V/H/R/O/D/T/A) + ⌘B code pane + ⌘I inspector.
  // Guarded so typing in the code editor / any field never retools the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "b") { e.preventDefault(); setCodeCollapsed((c) => !c); }
        else if (k === "i") { e.preventDefault(); setInspectorCollapsed((c) => !c); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || el.closest?.(".edd-cm, .cm-editor"))) return;
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) engineRef.current?.setTool(tool);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset per-selection inspector state whenever the selected node changes.
  const selectedIds = editState?.selected ?? [];
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  useEffect(() => {
    setInspectorCollapsed(false);
    dockPinned.current = false;
  }, [selectedId]);

  // Never cover the selected node: measure its live rect vs the stage and dock
  // the inspector on whichever side has more clearance (unless the user pinned).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!selectedId || !stage) return;
    let raf = 0;
    const measure = () => {
      if (dockPinned.current) return;
      const node = stage.querySelector<SVGGElement>(`[data-node="${cssEscape(selectedId)}"]`);
      if (!node) return;
      const sr = stage.getBoundingClientRect();
      const nr = node.getBoundingClientRect();
      const gutter = 244; // inspector width + margins
      const nodeLeft = nr.left - sr.left;
      const nodeRight = nr.right - sr.left;
      const intrudesLeft = nodeLeft < gutter;
      const intrudesRight = nodeRight > sr.width - gutter;
      let side: Side = "left";
      if (intrudesLeft && !intrudesRight) side = "right";
      else if (intrudesLeft && intrudesRight) side = nodeLeft >= sr.width - nodeRight ? "left" : "right";
      setInspectorSide((prev) => (prev === side ? prev : side));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(stage);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [selectedId, playerState, inspectorCollapsed]);

  const errorCount = diags.filter((d) => d.severity === "error").length;
  const warnCount = diags.filter((d) => d.severity === "warning").length;

  const loadExample = (name: string) => {
    const ex = EXAMPLES.find((e) => e.name === name);
    if (ex) {
      engineRef.current?.editor.clearSelection();
      setSource(ex.source);
      setDebounced(ex.source);
      engineRef.current?.fitNext();
    }
  };

  // direct-edit round-trip: patch arrives as new source -> update editor + render now
  const onEdit = (next: string) => {
    setSource(next);
    setDebounced(next);
  };

  const commitAnnotations = () => {
    const e = engineRef.current;
    if (!e) return;
    const code = e.annotationsToCode();
    if (!code) return;
    const next = source.replace(/\s*$/, "") + "\n\n" + code + "\n";
    setSource(next);
    setDebounced(next);
    e.clearAnnotations();
  };

  const cmDiags: CodeEditorDiagnostic[] = useMemo(
    () => diags.map((d) => ({ line: d.line, col: d.col, severity: d.severity, message: d.message })),
    [diags],
  );

  const eng = engineRef.current;
  const activeTool = editState?.tool ?? liveState?.tool ?? "select";
  const selectedNode = selectedId ? eng?.getScene().nodes.find((n) => n.id === selectedId) : undefined;

  return (
    <div className="edd-app">
      <header className="edd-topbar">
        <nav className="edd-demos">
          <span className="edd-picker-label">examples:</span>
          {EXAMPLES.map((e) => (
            <button key={e.name} onClick={() => loadExample(e.name)}>{e.name}</button>
          ))}
          <span className="edd-picker-label" style={{ marginLeft: 10 }}>export:</span>
          <button title="Download SVG" onClick={() => eng?.downloadSVG()} data-testid="export-svg">SVG</button>
          <button title="Download PNG" onClick={() => eng?.downloadPNG()}>PNG</button>
          <button title="Download scene JSON" onClick={() => eng?.downloadJSON()}>JSON</button>
          <button title="Copy code" onClick={() => navigator.clipboard?.writeText(source)}>⧉ Copy</button>
        </nav>
        <div className="edd-topbar-right">
          <button
            className="edd-theme-toggle"
            onClick={(e) => setThemePref(e.shiftKey ? "system" : resolvedTheme === "dark" ? "light" : "dark")}
            title={`Theme: ${themePref}${themePref === "system" ? ` (${resolvedTheme})` : ""} — click to toggle, ⇧-click for system`}
            aria-label="Toggle color theme"
            data-testid="theme-toggle"
          >
            <span className="edd-theme-glyph">{resolvedTheme === "dark" ? "☾" : "☀"}</span>
            {themePref === "system" && <span className="edd-theme-auto">auto</span>}
          </button>
          <button
            className="edd-topbar-hint"
            onClick={() => setCodeCollapsed((c) => !c)}
            title="Toggle the code panel (⌘B)"
          >
            {codeCollapsed ? "⟩ Show code" : "⟨ Focus mode"} <kbd>⌘B</kbd>
          </button>
        </div>
      </header>

      <main className="edd-main edd-split" ref={mainRef}>
        <section
          className={`edd-editor-pane${codeCollapsed ? " edd-editor-pane--collapsed" : ""}`}
          style={editorBasis != null && !codeCollapsed ? { flexBasis: `${editorBasis}px`, maxWidth: "none", minWidth: 0, flexShrink: 1 } : undefined}
        >
          <div className="edd-editor-head">
            <span className="edd-editor-title">EDodoDraw code</span>
            <div className="edd-editor-head-right">
              <span className="edd-editor-meta">code and diagram stay in sync</span>
              <button
                className="edd-editor-collapse"
                title="Collapse code (⌘B)"
                aria-label="Collapse code panel"
                aria-expanded={!codeCollapsed}
                onClick={() => setCodeCollapsed(true)}
              >
                ⟨
              </button>
            </div>
          </div>
          <div className="edd-editor" data-testid="editor-wrap">
            <CodeEditor value={source} onChange={setSource} diagnostics={cmDiags} className="edd-cm" />
          </div>
          <DiagnosticsStrip diags={diags} errorCount={errorCount} warnCount={warnCount} />
        </section>

        {!codeCollapsed && (
          <Splitter
            mainRef={mainRef}
            pct={editorPct}
            onResize={setEditorBasis}
            onReset={() => setEditorBasis(null)}
          />
        )}

        <section className="edd-stage" data-testid="stage" ref={stageRef}>
          <CanvasView
            source={debounced}
            onEngine={(e) => {
              engineRef.current = e;
              e?.setColorScheme(resolvedTheme);
            }}
            onState={setPlayerState}
            onLiveState={setLiveState}
            onEditState={setEditState}
            onDiagnostics={setDiags}
            onEdit={onEdit}
          />
          {codeCollapsed && (
            <button
              className="edd-code-reveal"
              title="Show code (⌘B)"
              aria-label="Show code panel"
              aria-controls="editor-wrap"
              onClick={() => setCodeCollapsed(false)}
            >
              <span className="edd-code-reveal-chevron">⟩</span>
              <span className="edd-code-reveal-text">CODE</span>
            </button>
          )}
          <Toolbar activeTool={activeTool} engine={eng} editState={editState} liveState={liveState} onCommit={commitAnnotations} />
          {selectedNode && (
            <PropertyPanel
              node={selectedNode}
              selectedIds={selectedIds}
              engine={eng}
              side={inspectorSide}
              collapsed={inspectorCollapsed}
              onToggleCollapsed={() => setInspectorCollapsed((c) => !c)}
              onToggleSide={() => {
                dockPinned.current = true;
                setInspectorSide((s) => (s === "left" ? "right" : "left"));
              }}
              onDelete={() => eng?.deleteSelected()}
              onRename={() => eng?.renameSelected()}
              onDuplicate={() => eng?.duplicateSelected()}
            />
          )}
          {editState?.selectedEdge && !selectedNode && (
            <EdgePanel
              engine={eng}
              side={inspectorSide}
              onDelete={() => eng?.deleteSelected()}
              onRename={() => eng?.renameSelected()}
            />
          )}
          <PlayerBar state={playerState} engine={eng} />
        </section>
      </main>
    </div>
  );
}

/**
 * Draggable divider between the code pane and the canvas. Drives the editor's
 * flex-basis in px (clamped so neither side collapses); double-click resets to
 * the default. Keyboard-resizable for accessibility (role="separator").
 */
function Splitter({
  mainRef, pct, onResize, onReset,
}: {
  mainRef: RefObject<HTMLElement | null>;
  pct: number;
  onResize: (basis: number) => void;
  onReset: () => void;
}) {
  const dragging = useRef(false);
  const clampToMain = (px: number): number => {
    const main = mainRef.current;
    const w = main ? main.getBoundingClientRect().width : 1200;
    return clamp(px, MIN_EDITOR, Math.max(MIN_EDITOR, w - MIN_CANVAS));
  };
  const basisFromClientX = (clientX: number): number => {
    const main = mainRef.current;
    const left = main ? main.getBoundingClientRect().left : 0;
    return clampToMain(clientX - left);
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).classList.add("is-dragging");
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    onResize(basisFromClientX(e.clientX));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    dragging.current = false;
    (e.currentTarget as HTMLElement).classList.remove("is-dragging");
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const pane = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null;
      const cur = pane ? pane.getBoundingClientRect().width : MIN_EDITOR;
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 64 : 24);
      onResize(clampToMain(cur + step));
    } else if (e.key === "Enter" || e.key === "Backspace") {
      e.preventDefault();
      onReset();
    }
  };
  return (
    <div
      className="edd-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize code and canvas panes"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      tabIndex={0}
      data-testid="splitter"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <span className="edd-splitter-grip" />
    </div>
  );
}

function Toolbar({ activeTool, engine, editState, liveState, onCommit }: { activeTool: string; engine: CanvasEngine | null; editState: EditState | null; liveState: LiveState | null; onCommit: () => void }) {
  const annCount = liveState?.count ?? 0;
  const canUndo = !!editState?.canUndo || !!liveState?.canUndo;
  const canRedo = !!editState?.canRedo || !!liveState?.canRedo;
  return (
    <div className="edd-toolbar" data-testid="toolbar" role="toolbar" aria-label="Editing tools">
      <div className="edd-tool-group" title="Edit tools">
        {EDIT_TOOLS.map((t) => (
          <button key={t.tool} title={t.label} className={activeTool === t.tool ? "active" : ""} data-tool={t.tool} onClick={() => engine?.setTool(t.tool)}>
            {t.icon}
          </button>
        ))}
      </div>
      <span className="edd-toolbar-sep" />
      <div className="edd-tool-group edd-tool-group--annotate" title="Annotate tools">
        {ANNOT_TOOLS.map((t) => (
          <button key={t.tool} title={t.label} className={activeTool === t.tool ? "active" : ""} data-tool={t.tool} onClick={() => engine?.setTool(t.tool)}>
            {t.icon}
          </button>
        ))}
      </div>
      <span className="edd-toolbar-sep" />
      <button title="Undo (⌘Z)" disabled={!canUndo} onClick={() => engine?.undo()}>↶</button>
      <button title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => engine?.redo()}>↷</button>
      <button title="Commit annotations to code" className="commit" disabled={annCount === 0} onClick={onCommit} data-testid="commit-btn">⤓</button>
    </div>
  );
}

function PropertyPanel({
  node, selectedIds, engine, side, collapsed, onToggleCollapsed, onToggleSide, onDelete, onRename, onDuplicate,
}: {
  node: { id: string; shape: string; style: { fill: string | null; stroke: string } };
  selectedIds: string[];
  engine: CanvasEngine | null;
  side: Side;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleSide: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDuplicate: () => void;
}) {
  const fill = node.style.fill;
  const stroke = node.style.stroke;
  const multi = selectedIds.length > 1;
  // Style edits apply to the whole selection; the swatches reflect the primary.
  const ids = selectedIds.length ? selectedIds : [node.id];
  const style = (s: { fill?: string; stroke?: string; shape?: string }) => engine?.applyStyleMany(ids, s);
  // A swatch is "active" if its palette name OR its hex matches the node's value.
  const isFill = (c: string) => c === fill || SWATCH_HEX[c] === fill;
  const isStroke = (c: string) => c === stroke || STROKE_HEX[c] === stroke;

  return (
    <aside
      className={`edd-props${side === "right" ? " edd-props--right" : ""}${collapsed ? " edd-props--collapsed" : ""}`}
      data-testid="props"
      data-side={side}
    >
      <div className="edd-props-head">
        <span className="edd-props-title">{multi ? `${selectedIds.length} selected` : "Selection"}</span>
        <div className="edd-props-head-actions">
          <button className="edd-props-dock" title={`Dock ${side === "left" ? "right" : "left"}`} aria-label="Move inspector to the other side" onClick={onToggleSide}>⇄</button>
          <button className="edd-props-collapse" title="Collapse inspector (⌘I)" aria-label="Collapse inspector" aria-expanded={!collapsed} onClick={onToggleCollapsed}>{collapsed ? "⌄" : "⌃"}</button>
        </div>
      </div>

      {collapsed ? (
        <button className="edd-props-pill" title="Expand inspector (⌘I)" onClick={onToggleCollapsed}>
          <span className="edd-props-pill-dot" style={{ background: fill ? SWATCH_HEX[fill] ?? fill : "transparent" }} />
          <span className="edd-props-pill-dot" style={{ background: STROKE_HEX[stroke] ?? stroke ?? "#1e1e1e" }} />
          <span className="edd-props-pill-shape">{SHAPE_GLYPH[node.shape] ?? "▭"}</span>
        </button>
      ) : (
        <div className="edd-props-body">
          <div className="edd-props-row">
            <span className="edd-props-label">Stroke</span>
            <div className="edd-swatches">
              {STROKE_SWATCHES.map((c) => (
                <button key={c} className={`edd-swatch${isStroke(c) ? " is-active" : ""}`} style={{ background: STROKE_HEX[c] }} title={c} aria-label={`Stroke ${c}`} onClick={() => style({ stroke: c })} />
              ))}
            </div>
          </div>
          <div className="edd-props-row">
            <span className="edd-props-label">Fill</span>
            <div className="edd-swatches">
              {FILL_SWATCHES.map((c) => (
                <button
                  key={c}
                  className={`edd-swatch${c === "transparent" ? " transparent" : ""}${isFill(c) ? " is-active" : ""}`}
                  style={{ background: SWATCH_HEX[c] }}
                  title={c}
                  aria-label={`Fill ${c}`}
                  onClick={() => style({ fill: c })}
                />
              ))}
            </div>
          </div>
          <div className="edd-props-row edd-props-row--shape">
            <span className="edd-props-label">Shape</span>
            <select className="edd-shape-select" value={SHAPES.includes(node.shape) ? node.shape : ""} onChange={(e) => style({ shape: e.target.value })}>
              {SHAPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="edd-props-actions">
            {!multi && <button onClick={onRename} title="Rename (double-click the shape)">✎ Rename</button>}
            <button onClick={onDuplicate} title="Duplicate (⌘D)">⧉ Duplicate</button>
            <button onClick={onDelete} className="danger" title="Delete (Del)" data-testid="del-btn">🗑 Delete</button>
          </div>
        </div>
      )}
    </aside>
  );
}

function EdgePanel({ engine, side, onDelete, onRename }: { engine: CanvasEngine | null; side: Side; onDelete: () => void; onRename: () => void }) {
  return (
    <aside className={`edd-props${side === "right" ? " edd-props--right" : ""}`} data-testid="edge-props" data-side={side}>
      <div className="edd-props-head">
        <span className="edd-props-title">Arrow</span>
      </div>
      <div className="edd-props-body">
        <p className="edd-props-hint">Drag either end to reconnect it. Double-click to edit the label.</p>
        <div className="edd-props-actions">
          <button onClick={onRename} title="Edit the arrow's label">✎ Label</button>
          <button onClick={onDelete} className="danger" title="Delete (Del)" data-testid="edge-del-btn">🗑 Delete</button>
        </div>
      </div>
    </aside>
  );
}

function PlayerBar({ state, engine }: { state: PlayerState | null; engine: CanvasEngine | null }) {
  const total = state?.total ?? 0;
  const idx = state?.index ?? -1;
  const playing = state?.playing ?? false;
  return (
    <div className="edd-playerbar" data-testid="playerbar">
      <div className="edd-player-controls">
        <button title="Fit view" onClick={() => engine?.fit()} data-testid="fit-btn">⤢ Fit</button>
        {total > 0 && (
          <>
            <span className="edd-player-sep" />
            <button title="Restart" onClick={() => engine?.restart()}>⏮</button>
            <button title="Previous" onClick={() => engine?.prev()} disabled={idx < 0}>◀</button>
            {playing ? (
              <button title="Pause" onClick={() => engine?.pause()} data-testid="pause-btn">⏸ Pause</button>
            ) : (
              <button title="Play" onClick={() => engine?.play()} className="primary" data-testid="play-btn">▶ Play</button>
            )}
            <button title="Next" onClick={() => engine?.next()} disabled={idx >= total - 1}>▶</button>
            <span className="edd-player-step">{idx < 0 ? "Overview" : `${idx + 1}/${total}`} · <b>{state?.stepName}</b></span>
          </>
        )}
      </div>
      {state?.caption && <div className="edd-player-caption">{state.caption}</div>}
    </div>
  );
}

function DiagnosticsStrip({ diags, errorCount, warnCount }: { diags: Diagnostic[]; errorCount: number; warnCount: number }) {
  return (
    <div className="edd-diagnostics" data-testid="diagnostics">
      <div className="edd-diag-summary">
        {errorCount === 0 && warnCount === 0 ? (
          <span className="ok">✓ no problems</span>
        ) : (
          <>
            {errorCount > 0 && <span className="err">✕ {errorCount} error{errorCount > 1 ? "s" : ""}</span>}
            {warnCount > 0 && <span className="warn">▲ {warnCount} warning{warnCount > 1 ? "s" : ""}</span>}
          </>
        )}
      </div>
      {diags.length > 0 && (
        <ul className="edd-diag-list">
          {diags.slice(0, 8).map((d, i) => (
            <li key={i} className={d.severity}>
              <span className="edd-diag-loc">{d.line}:{d.col}</span>
              <span className="edd-diag-code">{d.code}</span>
              <span className="edd-diag-msg">{d.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
