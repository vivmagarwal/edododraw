/**
 * Color palette matched to Excalidraw's Open-Colors selection, plus named
 * "semantic" colors the DSL exposes (e.g. `fill: green`). Each semantic name
 * maps to a stroke + a soft background so `fill: green` yields the pleasant
 * Excalidraw green box with a matching darker green outline.
 */

export const STROKE_PALETTE = {
  black: "#1e1e1e",
  gray: "#495057",
  red: "#e03131",
  pink: "#c2255c",
  grape: "#9c36b5",
  violet: "#6741d9",
  blue: "#1971c2",
  cyan: "#0c8599",
  teal: "#099268",
  green: "#2f9e44",
  lime: "#66a80f",
  yellow: "#f08c00",
  orange: "#e8590c",
  brown: "#846358",
  white: "#ffffff",
} as const;

/** Soft fill backgrounds (Excalidraw's lighter shade for each hue). */
export const FILL_PALETTE = {
  transparent: null as string | null,
  none: null as string | null,
  black: "#e9ecef",
  gray: "#e9ecef",
  red: "#ffc9c9",
  pink: "#fcc2d7",
  grape: "#eebefa",
  violet: "#d0bfff",
  blue: "#a5d8ff",
  cyan: "#99e9f2",
  teal: "#96f2d7",
  green: "#b2f2bb",
  lime: "#d8f5a2",
  yellow: "#ffec99",
  orange: "#ffd8a8",
  brown: "#e5dbd4",
  white: "#ffffff",
} as const;

export type ColorName = keyof typeof STROKE_PALETTE;

/**
 * Resolve a color token to a hex string.
 * - Named strokes: "green" -> #2f9e44
 * - Hex passthrough: "#ff0000" -> "#ff0000"
 * - "transparent"/"none" -> null-safe handled by caller
 */
export function resolveStroke(token: string | undefined, fallback: string): string {
  if (!token) return fallback;
  const t = token.trim().toLowerCase();
  if (t === "transparent" || t === "none") return fallback;
  if (t.startsWith("#")) return token.trim();
  if (t in STROKE_PALETTE) return STROKE_PALETTE[t as ColorName];
  // rgb()/hsl()/css named colors pass straight through to SVG
  return token.trim();
}

/** Resolve a fill token: named -> soft bg, hex passthrough, transparent -> null. */
export function resolveFill(token: string | undefined): string | null {
  if (!token) return null;
  const t = token.trim().toLowerCase();
  if (t === "transparent" || t === "none") return null;
  if (t.startsWith("#")) return token.trim();
  if (t in FILL_PALETTE) return FILL_PALETTE[t as keyof typeof FILL_PALETTE];
  return token.trim();
}

/**
 * When a user writes `fill: green` we also nudge the stroke to the matching
 * darker green (if the stroke is still the default black). This returns the
 * "paired" stroke for a fill color name, or null if there's no pairing.
 */
export function pairedStrokeForFill(fillToken: string | undefined): string | null {
  if (!fillToken) return null;
  const t = fillToken.trim().toLowerCase();
  if (t in STROKE_PALETTE) return STROKE_PALETTE[t as ColorName];
  return null;
}

/** Highlighter/marker colors (semi-transparent) for annotations. */
export const MARKER_PALETTE = {
  yellow: "#ffe066",
  green: "#8ce99a",
  blue: "#74c0fc",
  pink: "#faa2c1",
  orange: "#ffc078",
  violet: "#b197fc",
  red: "#ff8787",
} as const;

export function resolveMarker(token: string | undefined, fallback = MARKER_PALETTE.yellow): string {
  if (!token) return fallback;
  const t = token.trim().toLowerCase();
  if (t.startsWith("#")) return token.trim();
  if (t in MARKER_PALETTE) return MARKER_PALETTE[t as keyof typeof MARKER_PALETTE];
  return resolveStroke(token, fallback);
}
