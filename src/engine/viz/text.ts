/**
 * Pure text metrics for viz generators — the compiler is DOM-free, so widths
 * are estimated from per-font average character widths. Estimates err slightly
 * wide so labels never overflow their reserved space.
 */

import type { FontKind } from "../scene/types.js";

/** Average glyph width as a fraction of font size. */
function charFactor(font: FontKind): number {
  const f = String(font);
  if (f === "code" || f.includes("mono") || f.includes("Code")) return 0.62;
  if (f === "hand" || f.includes("Shantell") || f.includes("Excalifont")) return 0.54;
  if (f === "serif" || f.includes("Baskerville") || f.includes("STIX") || f.includes("Noto Serif") || f.includes("Aboreto")) return 0.56;
  return 0.55; // sans
}

/** Estimated pixel width of a single line. */
export function measureText(text: string, fontSize: number, font: FontKind = "hand"): number {
  const factor = charFactor(font);
  let units = 0;
  for (const ch of text) {
    if (ch === " ") units += 0.5;
    else if (/[iIl1.,:;'!|]/.test(ch)) units += 0.55;
    else if (/[A-Z0-9@#%&mwMW]/.test(ch)) units += 1.18;
    else units += 1;
  }
  return units * fontSize * factor;
}

/** Widest line of a multi-line string. */
export function measureBlock(text: string, fontSize: number, font: FontKind = "hand"): { w: number; h: number; lines: number } {
  const lines = text.split("\n");
  const w = lines.reduce((m, l) => Math.max(m, measureText(l, fontSize, font)), 0);
  return { w, h: lines.length * fontSize * 1.25, lines: lines.length };
}

/** Greedy word-wrap to a max pixel width; keeps explicit newlines. */
export function wrapText(text: string, maxWidth: number, fontSize: number, font: FontKind = "hand", maxLines = 8): string {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate, fontSize, font) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    out.push(line);
  }
  const clipped = out.slice(0, maxLines);
  if (out.length > maxLines && clipped.length) {
    clipped[clipped.length - 1] = `${clipped[clipped.length - 1]}…`;
  }
  return clipped.join("\n");
}
