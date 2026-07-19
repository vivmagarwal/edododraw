/**
 * Hair styles — drawn on and around the head circle (crown = the top arc,
 * angles 200°→340° in the frame's y-down convention). `f.accent` is the hair
 * colour. Masses are placed at the sides/crown so they never cover the face,
 * which is painted after hair.
 */

import { registerCharacterHair } from "./registry.js";
import type { CharacterFrame, Pt } from "./types.js";

/** Point on the head rim at angle `deg`, pushed out by `out` × radius. */
const rim = (f: CharacterFrame, deg: number, out = 1): Pt => {
  const a = (deg * Math.PI) / 180;
  return [f.head.cx + Math.cos(a) * f.head.r * out, f.head.cy + Math.sin(a) * f.head.r * out];
};

registerCharacterHair("short", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.02, 188, 352, 14), f.lw, f.accent);
  for (const d of [215, 250, 285, 320]) f.stroke([rim(f, d, 0.98), rim(f, d, 1.22)], f.lw * 0.7, f.accent);
});

registerCharacterHair("spiky", (f) => {
  for (const d of [205, 228, 251, 274, 297, 320, 343]) f.stroke([rim(f, d, 0.95), rim(f, d, 1.4)], f.lw * 0.8, f.accent);
});

registerCharacterHair("messy", (f) => {
  const pts: Pt[] = [];
  for (let d = 190; d <= 350; d += 12) pts.push(rim(f, d, 1 + (d % 24 === 190 % 24 ? 0.28 : 0.12) + 0.14 * Math.abs(Math.sin(d))));
  f.stroke(pts, f.lw * 0.8, f.accent);
});

registerCharacterHair("curly", (f) => {
  for (let d = 198; d <= 342; d += 24) f.stroke(f.arc(...rim(f, d, 1.12), f.head.r * 0.2, 0, 320, 8), f.lw * 0.7, f.accent);
});

registerCharacterHair("bob", (f) => {
  const { cx, cy, r } = f.head;
  f.stroke(f.arc(cx, cy, r * 1.06, 178, 362, 16), f.lw, f.accent); // cap over the crown
  // side flaps framing the face (just outside the head), temple → jaw
  for (const s of [-1, 1] as const) f.fill([[cx + s * r * 0.86, cy - r * 0.55], [cx + s * r * 1.28, cy - r * 0.3], [cx + s * r * 1.2, cy + r * 0.9], [cx + s * r * 0.82, cy + r * 0.55]], f.accent);
  f.stroke([rim(f, 232, 0.98), [cx, cy - r * 0.55], rim(f, 308, 0.98)], f.lw * 0.85, f.accent); // fringe
});

registerCharacterHair("long", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.03, 190, 350, 14), f.lw, f.accent);
  for (const s of [-1, 1] as const) f.stroke([rim(f, s < 0 ? 205 : 335, 1.05), [f.head.cx + s * f.head.r * 1.1, f.head.cy + f.head.r * 1.4], [f.head.cx + s * f.head.r * 0.85, f.head.cy + f.head.r * 2.4]], f.lw * 0.9, f.accent);
});

registerCharacterHair("pigtails", (f) => {
  f.stroke([rim(f, 248, 0.95), [f.head.cx, f.head.cy - f.head.r * 0.55], rim(f, 292, 0.95)], f.lw * 0.7, f.accent); // fringe
  for (const s of [-1, 1] as const) {
    f.stroke([rim(f, s < 0 ? 205 : 335, 0.95), [f.head.cx + s * f.head.r * 1.35, f.head.cy]], f.lw, f.accent);
    f.fill(f.arc(f.head.cx + s * f.head.r * 1.5, f.head.cy + f.head.r * 0.15, f.head.r * 0.32, 0, 360, 12), f.accent);
  }
});

registerCharacterHair("bun", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.03, 200, 340, 12), f.lw, f.accent);
  f.fill(f.arc(f.head.cx, f.head.cy - f.head.r * 1.05, f.head.r * 0.36, 0, 360, 12), f.accent);
});

registerCharacterHair("ponytail", (f) => {
  const { cx, cy, r } = f.head;
  f.stroke(f.arc(cx, cy, r * 1.04, 192, 350, 12), f.lw, f.accent); // cap
  f.stroke([rim(f, 210, 1.04), [cx - r * 1.35, cy - r * 0.5], [cx - r * 1.6, cy + r * 0.35], [cx - r * 1.4, cy + r * 1.15]], f.lw, f.accent); // tail swept back
  f.dot(...rim(f, 208, 1.06), Math.max(1.2, f.h * 0.013), f.accent); // tie
});

registerCharacterHair("afro", (f) => {
  const pts: Pt[] = [];
  for (let d = 165; d <= 375; d += 15) pts.push(rim(f, d, 1.45 + 0.12 * Math.sin(d * 1.7)));
  f.stroke(pts, f.lw, f.accent);
});

registerCharacterHair("mohawk", (f) => {
  for (const d of [255, 268, 281, 294]) f.stroke([rim(f, d, 0.95), rim(f, d, 1.6)], f.lw, f.accent);
});

registerCharacterHair("side-part", (f) => {
  f.fill([rim(f, 190), rim(f, 250, 0.98), [f.head.cx + f.head.r * 0.15, f.head.cy - f.head.r * 0.5], rim(f, 320, 1.02), rim(f, 350), [f.head.cx + f.head.r * 0.9, f.head.cy - f.head.r * 0.55], [f.head.cx - f.head.r * 0.9, f.head.cy - f.head.r * 0.55]], f.accent);
  f.stroke([[f.head.cx + f.head.r * 0.15, f.head.cy - f.head.r * 0.62], [f.head.cx + f.head.r * 0.35, f.head.cy - f.head.r * 0.2]], f.lw * 0.6, f.ctx.preset.background); // part
});

registerCharacterHair("bald", (f) => {
  for (const s of [-1, 1] as const) f.stroke(f.arc(f.head.cx + s * f.head.r * 0.9, f.head.cy, f.head.r * 0.3, s < 0 ? 250 : 290, s < 0 ? 200 : 340, 6), f.lw * 0.8, f.accent);
  f.stroke(f.arc(f.head.cx, f.head.cy - f.head.r, f.head.r * 0.14, 40, 320, 6), f.lw * 0.7, f.accent); // single curl
});
