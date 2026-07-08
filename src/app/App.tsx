import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasView, type CanvasEngine } from "./CanvasView.js";
import type { Diagnostic, LiveState, PlayerState, Tool } from "../lib/index.js";
import { EXAMPLES } from "./examples.js";
import { takePlaygroundSource } from "../site/router.js";
import "./app.css";

const DEBOUNCE_MS = 180;

const TOOLS: { tool: Tool; icon: string; label: string }[] = [
  { tool: "select", icon: "⤢", label: "Select / move" },
  { tool: "highlight", icon: "🖍", label: "Highlight element" },
  { tool: "underline", icon: "﹍", label: "Underline element" },
  { tool: "box", icon: "▢", label: "Box around element" },
  { tool: "circle", icon: "◯", label: "Circle element" },
  { tool: "arrow", icon: "↗", label: "Point-at arrow (drag)" },
  { tool: "text", icon: "T", label: "Sticky note" },
];

export default function App() {
  const initial = useMemo(() => takePlaygroundSource() ?? EXAMPLES[0].source, []);
  const [source, setSource] = useState<string>(initial);
  const [debounced, setDebounced] = useState<string>(initial);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
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
    if (ex) setSource(ex.source);
  };

  const commitAnnotations = () => {
    const e = engineRef.current;
    if (!e) return;
    const code = e.annotationsToCode();
    if (!code) return;
    setSource((prev) => prev.replace(/\s*$/, "") + "\n\n" + code + "\n");
    e.clearAnnotations();
  };

  const lineCount = useMemo(() => source.split("\n").length, [source]);
  const eng = engineRef.current;

  return (
    <div className="edd-app">
      <header className="edd-topbar">
        <nav className="edd-demos">
          <span className="edd-picker-label">examples:</span>
          {EXAMPLES.map((e) => (
            <button key={e.name} onClick={() => loadExample(e.name)}>
              {e.name}
            </button>
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
            <span className="edd-editor-meta">{lineCount} lines</span>
          </div>
          <textarea
            className="edd-editor"
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            data-testid="editor"
          />
          <DiagnosticsStrip diags={diags} errorCount={errorCount} warnCount={warnCount} />
        </section>

        <section className="edd-stage" data-testid="stage">
          <CanvasView
            source={debounced}
            onEngine={(e) => (engineRef.current = e)}
            onState={setPlayerState}
            onLiveState={setLiveState}
            onDiagnostics={setDiags}
          />
          <AnnotationToolbar state={liveState} engine={eng} onCommit={commitAnnotations} />
          <PlayerBar state={playerState} engine={eng} />
        </section>
      </main>
    </div>
  );
}

function AnnotationToolbar({ state, engine, onCommit }: { state: LiveState | null; engine: CanvasEngine | null; onCommit: () => void }) {
  const tool = state?.tool ?? "select";
  const count = state?.count ?? 0;
  return (
    <div className="edd-toolbar" data-testid="toolbar">
      {TOOLS.map((t) => (
        <button key={t.tool} title={t.label} className={tool === t.tool ? "active" : ""} data-tool={t.tool} onClick={() => engine?.setTool(t.tool)}>
          {t.icon}
        </button>
      ))}
      <span className="edd-toolbar-sep" />
      <button title="Undo (⌘Z)" disabled={!state?.canUndo} onClick={() => engine?.undo()}>↶</button>
      <button title="Redo (⇧⌘Z)" disabled={!state?.canRedo} onClick={() => engine?.redo()}>↷</button>
      <button title="Clear annotations" disabled={count === 0} onClick={() => engine?.clearAnnotations()}>🗑</button>
      <span className="edd-toolbar-sep" />
      <button title="Commit annotations to code" className="commit" disabled={count === 0} onClick={onCommit} data-testid="commit-btn">⤓ code</button>
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
            <span className="edd-player-step">
              {idx < 0 ? "Overview" : `${idx + 1}/${total}`} · <b>{state?.stepName}</b>
            </span>
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
