/**
 * Small pure color helpers used by the style presets and viz generators.
 * Hex-only on purpose: presets are authored as hex tokens, and every derived
 * color must serialize straight into SVG attributes.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHex(c: string): RGB | null {
  let hex = c.trim().toLowerCase();
  if (!hex.startsWith("#")) return null;
  hex = hex.slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, (ch) => ch + ch);
  if (hex.length === 8) hex = hex.slice(0, 6); // drop alpha
  if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function toHex(rgb: RGB): string {
  const p = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${p(rgb.r)}${p(rgb.g)}${p(rgb.b)}`;
}

/** Linear mix of two hex colors; t=0 -> a, t=1 -> b. Non-hex inputs return `a`. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export function lighten(c: string, t: number): string {
  return mix(c, "#ffffff", t);
}

export function darken(c: string, t: number): string {
  return mix(c, "#000000", t);
}

/** 8-digit hex with alpha (0..1). Falls back to the color when unparseable. */
export function withAlpha(c: string, alpha: number): string {
  const rgb = parseHex(c);
  if (!rgb) return c;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${toHex(rgb)}${a}`;
}

/** Perceived luma 0..255 (BT.601). Unparseable colors count as light. */
export function luma(c: string): number {
  const rgb = parseHex(c);
  if (!rgb) return 255;
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

/** Pick a readable ink for text sitting on `bg`. */
export function contrastInk(bg: string | null | undefined, dark = "#1e1e1e", light = "#ffffff"): string {
  if (!bg) return dark;
  return luma(bg) > 150 ? dark : light;
}
