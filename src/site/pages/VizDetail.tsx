/**
 * Deep-dive page for one visualization template: the demo rendered in EVERY
 * style preset (the "one layout × all styles" matrix from the reference
 * explorer), plus its source code.
 */

import { listReferencePresets } from "@engine/style/presets.js";
import { navigate, openInPlayground } from "../router.js";
import { StyleTile } from "../StyleTile.js";
import { VIZ_DEMOS } from "../vizDemos.js";

const PRESETS = [{ name: "classic", label: "Classic (hand-drawn)" }, ...listReferencePresets().map((p) => ({ name: p.name, label: p.label }))];

export function VizDetail({ type }: { type: string }) {
  const demo = VIZ_DEMOS.find((d) => d.type === type);
  if (!demo) {
    return (
      <div className="page gallery">
        <div className="page-head">
          <h1>Unknown visualization</h1>
          <p>
            No template called <code>{type}</code>.{" "}
            <a href="#/visualizations" onClick={(e) => { e.preventDefault(); navigate("/visualizations"); }}>
              Back to the catalog →
            </a>
          </p>
        </div>
      </div>
    );
  }

  const idx = VIZ_DEMOS.indexOf(demo);
  const prev = VIZ_DEMOS[(idx - 1 + VIZ_DEMOS.length) % VIZ_DEMOS.length];
  const next = VIZ_DEMOS[(idx + 1) % VIZ_DEMOS.length];

  return (
    <div className="page gallery viz-detail">
      <div className="page-head">
        <p className="viz-crumbs">
          <a href="#/visualizations" onClick={(e) => { e.preventDefault(); navigate("/visualizations"); }}>
            Visualizations
          </a>{" "}
          / {demo.category} /{" "}
          <a href={`#/visualizations/${prev.type}`} onClick={(e) => { e.preventDefault(); navigate(`/visualizations/${prev.type}`); }} title={prev.title}>
            ←
          </a>{" "}
          <strong>{demo.title}</strong>{" "}
          <a href={`#/visualizations/${next.type}`} onClick={(e) => { e.preventDefault(); navigate(`/visualizations/${next.type}`); }} title={next.title}>
            →
          </a>
        </p>
        <h1>
          {demo.title} <code className="viz-type-chip">viz {demo.type}</code>
        </h1>
        <p>{demo.description} Below: the exact same source rendered in all {PRESETS.length} style presets.</p>
      </div>

      <section className="gallery-section">
        <div className="viz-detail-code">
          <pre className="demo-code">
            <code>{demo.code}</code>
          </pre>
          <button className="demo-btn open" onClick={() => openInPlayground(demo.code)}>
            Open in playground ↗
          </button>
        </div>
      </section>

      <section className="gallery-section">
        <h2>One source, {PRESETS.length} styles</h2>
        <div className="style-matrix">
          {PRESETS.map((p) => (
            <StyleTile key={p.name} presetName={p.name} presetLabel={p.label} code={demo.code} />
          ))}
        </div>
      </section>
    </div>
  );
}
