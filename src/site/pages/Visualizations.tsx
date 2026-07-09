/**
 * The visualization catalog page: all 62 built-in viz templates, rendered
 * live, with a global style-preset switcher so every layout can be seen in
 * every one of the built-in styles.
 */

import { useMemo, useState } from "react";
import { listReferencePresets } from "@engine/style/presets.js";
import { DemoCard } from "../DemoCard.js";
import type { Demo } from "../demos.js";
import { VIZ_CATEGORIES, VIZ_DEMOS } from "../vizDemos.js";

const PRESETS = [
  { name: "classic", label: "Classic (hand-drawn)" },
  ...listReferencePresets().map((p) => ({ name: p.name, label: p.label })),
];

/** Inject the chosen preset into a demo snippet (before any existing meta). */
function withStyle(code: string, style: string): string {
  if (style === "classic") return code;
  return `meta { style: ${style} }\n${code}`;
}

export function Visualizations() {
  const [style, setStyle] = useState("classic");

  const demos: Demo[] = useMemo(
    () =>
      VIZ_DEMOS.map((d) => ({
        id: `viz-${d.type}-${style}`,
        category: d.category,
        title: d.title,
        description: d.description,
        code: withStyle(d.code, style),
        height: 320,
        detailRoute: `/visualizations/${d.type}`,
        detailLabel: "Styles & variations →",
      })),
    [style],
  );

  return (
    <div className="page gallery">
      <div className="page-head">
        <h1>Visualizations</h1>
        <p>
          All 62 built-in chart and diagram templates ({VIZ_DEMOS.length} demos — the mindmap variants share one card),
          each generated 100% from the code on its card. Pick a style to restyle every one of them — the same source, a
          different visual identity. Open any card's <strong>Styles &amp; variations →</strong> to see it flex across
          item counts and text lengths, in every style.
        </p>
        <label className="viz-style-picker">
          style:{" "}
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {VIZ_CATEGORIES.map((cat) => {
        const inCat = demos.filter((d) => d.category === cat);
        if (!inCat.length) return null;
        return (
          <section key={cat} className="gallery-section">
            <h2 id={cat.replace(/\s+/g, "-").toLowerCase()}>{cat}</h2>
            <div className="demo-grid">
              {inCat.map((d) => (
                <DemoCard key={d.id} demo={d} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
