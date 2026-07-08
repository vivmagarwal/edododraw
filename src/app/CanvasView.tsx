/**
 * CanvasView — thin React wrapper that mounts the framework-agnostic EdodoDraw
 * facade (the same class published as the npm package). The app dogfoods the
 * library, so anything that works here works for embedders.
 */

import { useEffect, useRef } from "react";
import { EdodoDraw } from "../lib/index.js";
import type { Diagnostic, EditState, LiveState, PlayerState } from "../lib/index.js";

export type CanvasEngine = EdodoDraw;

interface Props {
  source: string;
  onEngine?: (engine: EdodoDraw | null) => void;
  onState?: (state: PlayerState) => void;
  onLiveState?: (state: LiveState) => void;
  onEditState?: (state: EditState) => void;
  onDiagnostics?: (diags: Diagnostic[]) => void;
  onEdit?: (source: string) => void;
}

export function CanvasView({ source, onEngine, onState, onLiveState, onEditState, onDiagnostics, onEdit }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const eddRef = useRef<EdodoDraw | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const edd = new EdodoDraw(host, { interactive: true, grid: true });
    eddRef.current = edd;
    if (onState) edd.on("state", onState);
    if (onLiveState) edd.on("live", onLiveState);
    if (onEditState) edd.on("editstate", onEditState);
    if (onDiagnostics) edd.on("diagnostics", onDiagnostics);
    if (onEdit) edd.on("edit", onEdit);
    onEngine?.(edd);
    void edd.render(sourceRef.current);
    return () => {
      edd.destroy();
      eddRef.current = null;
      onEngine?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void eddRef.current?.render(source);
  }, [source]);

  return <div ref={hostRef} className="edd-canvas-host" data-testid="canvas-host" />;
}
