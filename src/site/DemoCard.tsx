/**
 * A live gallery demo: an embedded EdodoDraw instance rendering the snippet,
 * with a code toggle, optional timeline Play controls, and "open in playground".
 */

import { useState } from "react";
import { EdodoDrawView, type EdodoDraw } from "../lib/react.js";
import type { Demo } from "./demos.js";
import { openInPlayground } from "./router.js";

export function DemoCard({ demo }: { demo: Demo }) {
  const [edd, setEdd] = useState<EdodoDraw | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [playing, setPlaying] = useState(false);

  return (
    <article className="demo-card">
      <header className="demo-card-head">
        <h3>{demo.title}</h3>
        <p>{demo.description}</p>
      </header>
      <div className="demo-canvas" style={{ height: demo.height ?? 280 }}>
        <EdodoDrawView source={demo.code} interactive grid onReady={setEdd} />
      </div>
      <footer className="demo-card-foot">
        <button className="demo-btn" onClick={() => setShowCode((s) => !s)}>
          {showCode ? "Hide code" : "Show code"}
        </button>
        {demo.timeline && edd && (
          <button
            className="demo-btn primary"
            onClick={() => {
              if (playing) {
                edd.pause();
                setPlaying(false);
              } else {
                edd.play();
                setPlaying(true);
              }
            }}
          >
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
        )}
        {edd && (
          <button className="demo-btn" onClick={() => edd.fit()}>
            ⤢ Fit
          </button>
        )}
        <span className="demo-spacer" />
        <button className="demo-btn open" onClick={() => openInPlayground(demo.code)}>
          Open in playground ↗
        </button>
      </footer>
      {showCode && (
        <pre className="demo-code">
          <code>{demo.code}</code>
        </pre>
      )}
    </article>
  );
}
