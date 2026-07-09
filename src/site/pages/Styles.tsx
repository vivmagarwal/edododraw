/**
 * The styles explorer: pick a sample (new viz templates AND classic diagrams)
 * and see it rendered in every style preset side by side — the "one visual ×
 * all styles" matrix from the reference explorer.
 */

import { useState } from "react";
import { listStyleChoices } from "@engine/style/presets.js";
import { StyleTile } from "../StyleTile.js";

const PRESETS = listStyleChoices().map((p) => ({ name: p.name, label: p.label }));

interface Sample {
  id: string;
  label: string;
  kind: "viz" | "classic";
  code: string;
}

const SAMPLES: Sample[] = [
  {
    id: "venn",
    label: "Venn (viz)",
    kind: "viz",
    code: `viz venn "Product Sweet Spot" {
  set "Desirable" "What users want" { icon: heart }
  set "Feasible" "What we can build" { icon: gear }
  set "Viable" "What sustains us" { icon: dollar }
  overlap all "Great products"
}`,
  },
  {
    id: "funnel",
    label: "Funnel (viz)",
    kind: "viz",
    code: `viz funnel "Sales Funnel" {
  input: "Potential customers"
  output: "Closed deals"
  item "Awareness" 5000
  item "Interest" 1800
  item "Evaluation" 420
  item "Won" 38
}`,
  },
  {
    id: "cycle",
    label: "Cycle (viz)",
    kind: "viz",
    code: `viz cycle "Build-Measure-Learn" {
  item "Build" "Ship the smallest slice" { icon: gear }
  item "Measure" "Watch real usage" { icon: chart }
  item "Learn" "Persevere or pivot" { icon: bulb }
}`,
  },
  {
    id: "pie",
    label: "Pie (viz)",
    kind: "viz",
    code: `viz pie "Market Share" {
  item "Alpha" 45 { icon: star }
  item "Beta" 30
  item "Gamma" 15
  item "Rest" 10
}`,
  },
  {
    id: "flowchart",
    label: "Flowchart (classic)",
    kind: "classic",
    code: `scene {
  layout dag { direction: down, gap: 56 }
  a([Start]) --> b[Fetch data] --> c{Valid?}
  c -->|yes| d[Process]
  c -->|no|  e[Reject]
  d --> f([Done])
}`,
  },
  {
    id: "architecture",
    label: "Architecture (classic)",
    kind: "classic",
    code: `scene {
  layout dag { direction: right, gap: 60 }
  actor user "User"
  hexagon gw "Gateway"
  round-rect api "API"
  cylinder db "Postgres"
  round-rect cache "Cache"
  user --> gw --> api
  api --> db
  api -.-> cache "warm"
}`,
  },
];

export function Styles() {
  const [sampleId, setSampleId] = useState("venn");
  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];

  return (
    <div className="page gallery">
      <div className="page-head">
        <h1>Style presets</h1>
        <p>
          {PRESETS.length} named visual identities — palette, fills, strokes, typography, canvas — each reverse-engineered
          from a professionally designed reference. One <code>meta {"{ style: … }"}</code> line restyles a whole document:
          the new viz templates <em>and</em> classic hand-drawn diagrams alike. Pick a sample:
        </p>
        <div className="styles-sample-picker">
          {SAMPLES.map((s) => (
            <button key={s.id} className={`demo-btn${s.id === sampleId ? " primary" : ""}`} onClick={() => setSampleId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <section className="gallery-section">
        <div className="style-matrix">
          {PRESETS.map((p) => (
            <StyleTile key={`${sample.id}-${p.name}`} presetName={p.name} presetLabel={p.label} code={sample.code} height={250} />
          ))}
        </div>
      </section>
    </div>
  );
}
