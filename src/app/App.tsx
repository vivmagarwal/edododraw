import { useEffect, useMemo, useRef, useState } from "react";
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

export default function App() {
  const initial = useMemo(() => takePlaygroundSource() ?? EXAMPLES[0].source, []);
  const [source, setSource] = useState<string>(initial);
  const [debounced, setDebounced] = useState<string>(initial);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => setDebounced(source), DEBOUNCE_MS);
    return () => window.clearTimeout(debounce.current);
  }, [source]);

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
  const selectedId = editState?.selected ?? null;
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
      </header>

      <main className="edd-main edd-split">
        <section className="edd-editor-pane">
          <div className="edd-editor-head">
            <span>EDodoDraw code</span>
            <span className="edd-editor-meta">edit the code or the diagram — they stay in sync</span>
          </div>
          <div className="edd-editor" data-testid="editor-wrap">
            <CodeEditor value={source} onChange={setSource} diagnostics={cmDiags} className="edd-cm" />
          </div>
          <DiagnosticsStrip diags={diags} errorCount={errorCount} warnCount={warnCount} />
        </section>

        <section className="edd-stage" data-testid="stage">
          <CanvasView
            source={debounced}
            onEngine={(e) => (engineRef.current = e)}
            onState={setPlayerState}
            onLiveState={setLiveState}
            onEditState={setEditState}
            onDiagnostics={setDiags}
            onEdit={onEdit}
          />
          <Toolbar activeTool={activeTool} engine={eng} liveState={liveState} onCommit={commitAnnotations} />
          {selectedNode && (
            <PropertyPanel
              node={selectedNode}
              engine={eng}
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

function Toolbar({ activeTool, engine, liveState, onCommit }: { activeTool: string; engine: CanvasEngine | null; liveState: LiveState | null; onCommit: () => void }) {
  const annCount = liveState?.count ?? 0;
  return (
    <div className="edd-toolbar" data-testid="toolbar">
      <div className="edd-tool-group">
        {EDIT_TOOLS.map((t) => (
          <button key={t.tool} title={t.label} className={activeTool === t.tool ? "active" : ""} data-tool={t.tool} onClick={() => engine?.setTool(t.tool)}>
            {t.icon}
          </button>
        ))}
      </div>
      <div className="edd-tool-label">annotate</div>
      <div className="edd-tool-group">
        {ANNOT_TOOLS.map((t) => (
          <button key={t.tool} title={t.label} className={activeTool === t.tool ? "active" : ""} data-tool={t.tool} onClick={() => engine?.setTool(t.tool)}>
            {t.icon}
          </button>
        ))}
      </div>
      <span className="edd-toolbar-sep" />
      <button title="Undo annotation (⌘Z)" disabled={!liveState?.canUndo} onClick={() => engine?.undo()}>↶</button>
      <button title="Redo annotation" disabled={!liveState?.canRedo} onClick={() => engine?.redo()}>↷</button>
      <button title="Commit annotations to code" className="commit" disabled={annCount === 0} onClick={onCommit} data-testid="commit-btn">⤓</button>
    </div>
  );
}

function PropertyPanel({ node, engine, onDelete, onRename }: { node: { id: string; shape: string; style: { fill: string | null; stroke: string } }; engine: CanvasEngine | null; onDelete: () => void; onRename: () => void }) {
  return (
    <div className="edd-props" data-testid="props">
      <div className="edd-props-row">
        <span className="edd-props-label">Fill</span>
        <div className="edd-swatches">
          {FILL_SWATCHES.map((c) => (
            <button
              key={c}
              className={`edd-swatch${c === "transparent" ? " transparent" : ""}`}
              style={{ background: SWATCH_HEX[c] }}
              title={c}
              onClick={() => engine?.applyStyle(node.id, { fill: c })}
            />
          ))}
        </div>
      </div>
      <div className="edd-props-row">
        <span className="edd-props-label">Stroke</span>
        <div className="edd-swatches">
          {STROKE_SWATCHES.map((c) => (
            <button key={c} className="edd-swatch" style={{ background: STROKE_HEX[c] }} title={c} onClick={() => engine?.applyStyle(node.id, { stroke: c })} />
          ))}
        </div>
      </div>
      <div className="edd-props-row">
        <span className="edd-props-label">Shape</span>
        <select className="edd-shape-select" value={SHAPES.includes(node.shape) ? node.shape : ""} onChange={(e) => engine?.applyStyle(node.id, { shape: e.target.value })}>
          {SHAPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="edd-props-actions">
        <button onClick={onRename} title="Rename (double-click the shape)">✎ Rename</button>
        <button onClick={onDelete} className="danger" title="Delete (Del)" data-testid="del-btn">🗑 Delete</button>
      </div>
    </div>
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
