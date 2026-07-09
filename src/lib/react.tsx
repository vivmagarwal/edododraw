/**
 * `edododraw/react` — a thin React wrapper over the EdodoDraw facade.
 *
 *   <EdodoDrawView source={code} interactive onReady={(edd) => …} />
 *
 * React is a peer dependency; nothing here is imported by the core entry.
 */

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { EdodoDraw, type EdodoDrawOptions } from "./EdodoDraw.js";
import type { Diagnostic } from "../engine/dsl/diagnostics.js";
import type { PlayerState } from "../engine/timeline/player.js";

export interface EdodoDrawViewProps extends EdodoDrawOptions {
  /** EDodoDraw source to render (re-renders whenever it changes). */
  source: string;
  className?: string;
  style?: CSSProperties;
  /**
   * Force light/dark rendering, overriding the diagram's declared theme.
   * `null`/omitted follows the DSL's own theme. See `EdodoDraw.setColorScheme`.
   */
  colorScheme?: "light" | "dark" | null;
  /** Called once with the imperative instance after mount. */
  onReady?: (edd: EdodoDraw) => void;
  onDiagnostics?: (diags: Diagnostic[]) => void;
  onState?: (state: PlayerState) => void;
}

export function EdodoDrawView({ source, className, style, colorScheme, onReady, onDiagnostics, onState, ...opts }: EdodoDrawViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const eddRef = useRef<EdodoDraw | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const edd = new EdodoDraw(host, opts);
    eddRef.current = edd;
    if (colorScheme !== undefined) edd.setColorScheme(colorScheme); // before first render → no flash
    if (onDiagnostics) edd.on("diagnostics", onDiagnostics);
    if (onState) edd.on("state", onState);
    onReady?.(edd);
    return () => {
      edd.destroy();
      eddRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void eddRef.current?.render(source);
  }, [source]);

  useEffect(() => {
    // `undefined` and `null` both mean "follow the DSL theme" — revert either way.
    eddRef.current?.setColorScheme(colorScheme ?? null);
  }, [colorScheme]);

  return <div ref={hostRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}

export { EdodoDraw } from "./EdodoDraw.js";
export type { EdodoDrawOptions } from "./EdodoDraw.js";
