/**
 * Hair styles — drawn on and around the head circle (crown = the top arc,
 * angles 200°→340° in the frame's y-down convention). `f.accent` is the hair
 * colour. Masses are placed at the sides/crown so they never cover the face,
 * which is painted after hair.
 *
 * THE BROW RULE (v2, 2026-08-23). No hair stroke may dip into the band just
 * above the eyes. v1's `bob` drew a fringe as a chevron — high at the temples,
 * dipping to mid-forehead — which is, stroke for stroke, an angry unibrow: the
 * whole cast read as scowling at `emotion: neutral` and the film had to be
 * rejected before anyone traced it to the hair. A fringe must curve WITH the
 * crown (∩) or not exist. Keep every mass above `head.cy - r*0.5` or outside
 * the rim, and check any new style against `emotion: neutral` before shipping.
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
  // one continuous mass: over the crown and down BOTH sides to the jaw, its
  // inner edge well clear of the eyes. No fringe stroke — see THE BROW RULE.
  // A CAP, not a helmet: it covers the crown and stops at the temples, with two
  // short side pieces outside the rim. v2's first cut filled down to the jaw on
  // both sides and every figure wore a heavy black bowl.
  // A thin band over the crown plus two short side pieces. Solid mass is what
  // turned this into a helmet twice: keep the band under ~0.16r thick.
  f.fill([...f.arc(cx, cy, r * 1.08, 190, 350, 16), ...f.arc(cx, cy, r * 0.84, 350, 190, 16)], f.accent);
  for (const sgn of [-1, 1] as const) {
    f.stroke(
      [
        [cx + sgn * r * 1.0, cy - r * 0.48],
        [cx + sgn * r * 1.13, cy - r * 0.12],
        [cx + sgn * r * 1.06, cy + r * 0.42],
      ],
      f.lw * 1.1,
      f.accent,
    );
  }
});

registerCharacterHair("long", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.03, 190, 350, 14), f.lw, f.accent);
  for (const s of [-1, 1] as const) f.stroke([rim(f, s < 0 ? 205 : 335, 1.05), [f.head.cx + s * f.head.r * 1.1, f.head.cy + f.head.r * 1.4], [f.head.cx + s * f.head.r * 0.85, f.head.cy + f.head.r * 2.4]], f.lw * 0.9, f.accent);
});

registerCharacterHair("pigtails", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.02, 200, 340, 12), f.lw * 0.85, f.accent); // crown, curving WITH the head
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
  f.fill([...f.arc(cx, cy, r * 1.05, 198, 342, 14), ...f.arc(cx, cy, r * 0.92, 342, 198, 14)], f.accent); // cap
  // the tail hangs BEHIND the shoulder, not out to the side like a handle
  f.stroke([[cx - r * 0.98, cy - r * 0.28], [cx - r * 1.22, cy + r * 0.35], [cx - r * 1.12, cy + r * 1.05]], f.lw * 1.15, f.accent);
  f.dot(cx - r * 0.98, cy - r * 0.28, Math.max(1.2, f.h * 0.012), f.accent); // tie
});

registerCharacterHair("afro", (f) => {
  // a scalloped cloud that SITS ON the head — a bare arc floats above it
  const pts: Pt[] = [];
  for (let d = 172; d <= 368; d += 14) pts.push(rim(f, d, 1.34 + 0.1 * Math.sin(d * 1.9)));
  f.stroke([...pts, rim(f, 368, 1.0), ...f.arc(f.head.cx, f.head.cy, f.head.r * 1.0, 368, 172, 14)], f.lw, f.accent);
});

registerCharacterHair("mohawk", (f) => {
  for (const d of [255, 268, 281, 294]) f.stroke([rim(f, d, 0.95), rim(f, d, 1.6)], f.lw, f.accent);
});

registerCharacterHair("side-part", (f) => {
  const { cx, cy, r } = f.head;
  // a swoop: full over one temple, sweeping across the crown to a part
  f.fill(
    [
      [cx - r * 1.04, cy - r * 0.26],
      ...f.arc(cx, cy, r * 1.04, 195, 345, 14),
      [cx + r * 1.02, cy - r * 0.3],
      [cx + r * 0.5, cy - r * 0.74],
      [cx - r * 0.2, cy - r * 0.62],
      [cx - r * 0.76, cy - r * 0.3],
    ],
    f.accent,
  );
});

registerCharacterHair("bald", (f) => {
  for (const s of [-1, 1] as const) f.stroke(f.arc(f.head.cx + s * f.head.r * 0.9, f.head.cy, f.head.r * 0.3, s < 0 ? 250 : 290, s < 0 ? 200 : 340, 6), f.lw * 0.8, f.accent);
  f.stroke(f.arc(f.head.cx, f.head.cy - f.head.r, f.head.r * 0.14, 40, 320, 6), f.lw * 0.7, f.accent); // single curl
});
