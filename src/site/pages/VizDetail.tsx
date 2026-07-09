/**
 * Deep-dive page for one visualization template — matches the reference lab's
 * `l-<layout>.html`: the template rendered across every content variation
 * (item counts + text lengths) AND every style preset, plus its source.
 */

import { listReferencePresets } from "@engine/style/presets.js";
import { EdodoDrawView } from "../../lib/react.js";
import { navigate, openInPlayground } from "../router.js";
import { StyleTile } from "../StyleTile.js";
import { VIZ_DEMOS } from "../vizDemos.js";
import { variationsFor } from "../vizVariations.js";

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
  const variations = variationsFor(demo.type);

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
        <p>{demo.description}</p>
        <p className="viz-detail-jump">
          <a href="#variations">↓ {variations.length} content variations</a> · <a href="#styles">↓ {PRESETS.length} styles</a>
        </p>
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

      {variations.length > 0 && (
        <section className="gallery-section">
          <h2 id="variations">Content variations</h2>
          <p className="section-lead">
            The same template flexes to different item counts and text lengths — declare the data, the layout adapts.
          </p>
          <div className="style-matrix">
            {variations.map((v) => (
              <figure className="style-tile" key={v.label}>
                <div className="style-tile-canvas" style={{ height: 250 }}>
                  <EdodoDrawView source={v.code} interactive />
                </div>
                <figcaption>
                  <span className="style-tile-name var-label">{v.label}</span>
                  <button className="style-tile-open" title="Open in playground" onClick={() => openInPlayground(v.code)}>
                    ↗
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="gallery-section">
        <h2 id="styles">One source, {PRESETS.length} styles</h2>
        <p className="section-lead">The exact same code, restyled by each built-in preset.</p>
        <div className="style-matrix">
          {PRESETS.map((p) => (
            <StyleTile key={p.name} presetName={p.name} presetLabel={p.label} code={demo.code} />
          ))}
        </div>
      </section>
    </div>
  );
}
