/**
 * The character catalog page — an Animaker-style browser over the built-in
 * sketchnote figure library: every action (pose), every expression (emotion),
 * every shirt, plus combination examples. Every tile is rendered live by the
 * engine from the one-line snippet it opens in the playground.
 */

import { useMemo, useState } from "react";
import { listCharacterEmotions, listCharacterPoses, listCharacterShirts } from "@engine/viz/characters.js";
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
};

type Tab = "actions" | "expressions" | "shirts" | "combos";

interface Tile {
  key: string;
  code: string;
}

function tile(label: string, attrs: string): Tile {
  return { key: label, code: `viz personas c {\n  item "${label}" { ${attrs} }\n}` };
}

const COMBOS: Tile[] = [
  tile("The Founder", "pose: confident, shirt: tie, emotion: determined, prop: rocket"),
  tile("The Fan", "pose: cheering, shirt: striped, emotion: starstruck, prop: star"),
  tile("In Love", "pose: presenting, shirt: dress, emotion: love, prop: heart"),
  tile("Deep Focus", "pose: sitting, shirt: hoodie, emotion: thinking, prop: phone"),
  tile("Monday", "pose: facepalm, shirt: tee, emotion: dizzy"),
  tile("Zen Master", "pose: meditating, shirt: solid, emotion: sleeping, prop: leaf"),
  tile("On a Mission", "pose: running, shirt: striped, emotion: determined"),
  tile("The Greeter", "pose: waving, shirt: vest, emotion: wink"),
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
        list = listCharacterShirts().map((sh) => tile(sh, `pose: standing, shirt: ${sh}`));
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
    ["combos", "Combos"],
  ];

  return (
    <div className="page gallery">
      <div className="page-head">
        <h1>Characters</h1>
        <p>
          The built-in sketchnote figure library — {listCharacterPoses().length} actions × {listCharacterEmotions().length}{" "}
          expressions × {listCharacterShirts().length} shirts, plus any icon as a hand-held prop. Every tile is rendered
          live by the engine; click one to open its code in the playground. Use them in <code>personas</code> /{" "}
          <code>quote</code> items (<code>{"{ pose: cheering, emotion: starstruck, shirt: striped, prop: star }"}</code>)
          or from generator code via <code>ctx.character(…)</code>.
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
