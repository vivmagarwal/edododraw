/**
 * A compact labelled tile rendering one .edd source in one style preset —
 * the building block of the style-matrix pages (viz detail + styles explorer).
 */

import { EdodoDrawView } from "../lib/react.js";
import { openInPlayground } from "./router.js";

export interface StyleTileProps {
  presetName: string;
  presetLabel: string;
  code: string;
  height?: number;
}

/** Inject a preset into a snippet (classic = the source as written). */
export function withStyle(code: string, style: string): string {
  if (style === "classic") return code;
  const stripped = code.replace(/^meta \{ style: [^}]*\}\n/, "");
  return `meta { style: ${style} }\n${stripped}`;
}

export function StyleTile({ presetName, presetLabel, code, height = 230 }: StyleTileProps) {
  const source = withStyle(code, presetName);
  return (
    <figure className="style-tile">
      <div className="style-tile-canvas" style={{ height }}>
        <EdodoDrawView source={source} interactive />
      </div>
      <figcaption>
        <code>{presetName}</code>
        <span className="style-tile-name">{presetLabel}</span>
        <button className="style-tile-open" title="Open in playground" onClick={() => openInPlayground(source)}>
          ↗
        </button>
      </figcaption>
    </figure>
  );
}
