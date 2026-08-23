/**
 * The character catalog page — an Animaker-style browser over the built-in
 * sketchnote figure library: every action (pose), expression (emotion), shirt,
 * hair style, accessory, and effect, plus combination examples. Every tile is
 * rendered live by the engine from the one-line snippet it opens in the
 * playground.
 */

import { useMemo, useState } from "react";
import {
  listCharacterEmotions,
  listCharacterPoses,
  listCharacterShirts,
  listCharacterHair,
  listCharacterAccessories,
  listCharacterFx,
} from "@engine/viz/characters.js";
import { listStyleChoices } from "@engine/style/presets.js";
import { EdodoDrawView } from "../../lib/react.js";
import { openInPlayground } from "../router.js";
import { useResolvedTheme } from "../useTheme.js";

const PRESETS = listStyleChoices().map((p) => ({ name: p.name, label: p.label }));

/** Props that make certain actions legible on their tile. */
const ACTION_PROPS: Record<string, string> = {
  cheering: "star",
  "holding-overhead": "trophy",
  presenting: "flag",
  thinking: "bulb",
  carrying: "doc",
  searching: "search",
  offering: "heart",
  throwing: "star",
};

type Tab = "actions" | "expressions" | "shirts" | "hair" | "accessories" | "effects" | "combos";

interface Tile {
  key: string;
  code: string;
}

function tile(label: string, attrs: string): Tile {
  return { key: label, code: `viz personas c {\n  item "${label}" { ${attrs} }\n}` };
}

// Showcase all six axes composing on one figure.
const COMBOS: Tile[] = [
  tile("The Founder", "pose: confident, shirt: tie, hair: side-part, accessory: glasses, emotion: determined, fx: idea, prop: rocket"),
  tile("The Fan", "pose: cheering, shirt: striped, hair: spiky, emotion: starstruck, fx: stars, prop: star"),
  tile("In Love", "pose: offering, shirt: dress, hair: long, emotion: love, fx: hearts, prop: heart"),
  tile("The DJ", "pose: dancing, shirt: hoodie, hair: afro, accessory: headphones, emotion: happy, fx: music"),
  tile("Monday", "pose: facepalm, shirt: tee, hair: messy, emotion: dizzy, fx: sweat"),
  tile("Zen Master", "pose: meditating, shirt: solid, hair: bun, emotion: calm"),
  tile("On a Mission", "pose: running, shirt: striped, hair: ponytail, emotion: determined"),
  tile("The Detective", "pose: searching, shirt: labcoat, accessory: hat, emotion: curious, fx: question"),
  tile("Royalty", "pose: presenting, shirt: dress, hair: long, accessory: crown, emotion: content, prop: star"),
  tile("The Rockstar", "pose: victory, shirt: solid, shirtColor: \"#e8590c\", hair: mohawk, accessory: sunglasses, emotion: excited, fx: excited"),
  tile("Scared Stiff", "pose: falling, shirt: tee, hair: short, emotion: scared, fx: alarm"),
  tile("The Greeter", "pose: waving, shirt: vest, hair: curly, accessory: bowtie, emotion: wink"),
];

export function Characters() {
  const [tab, setTab] = useState<Tab>("actions");
  const [style, setStyle] = useState("classic");
  const theme = useResolvedTheme();

  const tiles: Tile[] = useMemo(() => {
    let list: Tile[];
    switch (tab) {
      case "actions":
        list = listCharacterPoses().map((p) => tile(p, `pose: ${p}${ACTION_PROPS[p] ? `, prop: ${ACTION_PROPS[p]}` : ""}`));
        break;
      case "expressions":
        list = listCharacterEmotions().map((e) => tile(e, `pose: standing, emotion: ${e}`));
        break;
      case "shirts":
        list = listCharacterShirts().map((sh) => tile(sh, `pose: standing, shirt: ${sh}, shirtColor: "#e8590c"`));
        break;
      case "hair":
        list = listCharacterHair().map((h) => tile(h, `pose: standing, hair: ${h}`));
        break;
      case "accessories":
        list = listCharacterAccessories().map((a) => tile(a, `pose: standing, accessory: ${a}`));
        break;
      case "effects":
        list = listCharacterFx().map((x) => tile(x, `pose: standing, emotion: happy, fx: ${x}`));
        break;
      default:
        list = COMBOS;
    }
    if (style === "classic") return list;
    return list.map((t) => ({ ...t, code: `meta { style: ${style} }\n${t.code}` }));
  }, [tab, style]);

  const TABS: Array<[Tab, string]> = [
    ["actions", `Actions (${listCharacterPoses().length})`],
    ["expressions", `Expressions (${listCharacterEmotions().length})`],
    ["shirts", `Shirts (${listCharacterShirts().length})`],
    ["hair", `Hair (${listCharacterHair().length})`],
    ["accessories", `Accessories (${listCharacterAccessories().length})`],
    ["effects", `Effects (${listCharacterFx().length})`],
    ["combos", "Combos"],
  ];

  return (
    <div className="page gallery">
      <div className="page-head">
        <h1>Characters</h1>
        <p>
          The built-in sketchnote figure library — {listCharacterPoses().length} actions × {listCharacterEmotions().length}{" "}
          expressions × {listCharacterShirts().length} shirts × {listCharacterHair().length} hair styles ×{" "}
          {listCharacterAccessories().length} accessories × {listCharacterFx().length} effects, plus any icon as a hand-held
          prop — mix and match for millions of distinct characters. Every tile is rendered live by the engine; click one to
          open its code in the playground. Drop one beside a diagram as a standalone node —{" "}
          <code>{'character brad "Brad" { pose: thinking, emotion: curious, flip: true }'}</code> — use them in{" "}
          <code>personas</code> / <code>quote</code> items (
          <code>{"{ pose: dancing, hair: afro, accessory: headphones, fx: music }"}</code>) or from generator code via{" "}
          <code>ctx.character(…)</code>. Every axis is a runtime registry, so you can register your own.
        </p>
        <div className="char-tabs">
          {TABS.map(([t, label]) => (
            <button key={t} className={`demo-btn${tab === t ? " primary" : ""}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
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
      </div>
      <div className="char-grid">
        {tiles.map((t) => (
          <button
            key={`${tab}-${t.key}-${style}`}
            className="char-tile"
            title="Open in playground"
            onClick={() => openInPlayground(t.code)}
          >
            <div className="char-tile-canvas">
              <EdodoDrawView source={t.code} interactive={false} grid={false} padding={26} colorScheme={theme} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
