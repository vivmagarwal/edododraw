/**
 * Facial expressions — the workbook's eyes+mouth grid, reimplemented as
 * strokes. Each drawer paints only the face (eyes, brows, mouth, and any
 * face-local tears/blush); floating marks like "?" or sweat live in fx.ts.
 * Geometry is read from `f.face` (eye/mouth anchors, already sheared).
 */

import { registerCharacterEmotion } from "./registry.js";
import type { CharacterFrame, Pt } from "./types.js";

const ring = (f: CharacterFrame, cx: number, cy: number, r: number, rh = r, w = f.lw * 0.7) =>
  f.ctx.shape("circle", cx - r, cy - rh, r * 2, rh * 2, { stroke: f.color, fill: null, fillStyle: "none", strokeWidth: w, roughness: 0.5 }, { z: f.z + 1, role: "character" });

// ---- eye primitives -----------------------------------------------------------

const dotEyes = (f: CharacterFrame, r = f.face.eyeR2, dy = 0) => {
  f.dot(f.face.eyeL, f.face.eyeY + dy, r);
  f.dot(f.face.eyeR, f.face.eyeY + dy, r);
};
const happyEye = (f: CharacterFrame, px: number) => f.stroke([[px - 0.022 * f.h, f.face.eyeY - 0.004 * f.h], [px, f.face.eyeY + 0.012 * f.h], [px + 0.022 * f.h, f.face.eyeY - 0.004 * f.h]], f.lw * 0.7); // ∨
const calmEye = (f: CharacterFrame, px: number) => f.stroke([[px - 0.022 * f.h, f.face.eyeY + 0.006 * f.h], [px, f.face.eyeY - 0.004 * f.h], [px + 0.022 * f.h, f.face.eyeY + 0.006 * f.h]], f.lw * 0.7); // ∩
const bigEye = (f: CharacterFrame, px: number) => {
  ring(f, px, f.face.eyeY, 0.026 * f.h);
  f.dot(px, f.face.eyeY + 0.006 * f.h, f.face.eyeR2 * 0.9);
};
const dashEye = (f: CharacterFrame, px: number, dir: number) => f.stroke([[px - 0.022 * f.h * dir, f.face.eyeY - 0.012 * f.h], [px + 0.018 * f.h * dir, f.face.eyeY + 0.006 * f.h]], f.lw * 0.7);
const heartEye = (f: CharacterFrame, px: number) => {
  const r = 0.026 * f.h, y = f.face.eyeY;
  f.fill([[px, y + r * 0.9], [px - r, y - r * 0.25], [px - r * 0.5, y - r * 0.95], [px, y - r * 0.3], [px + r * 0.5, y - r * 0.95], [px + r, y - r * 0.25]]);
};
const starEye = (f: CharacterFrame, px: number) => {
  const r = 0.03 * f.h, y = f.face.eyeY, pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([px + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  f.fill(pts);
};
const xEye = (f: CharacterFrame, px: number) => {
  const r = 0.02 * f.h, y = f.face.eyeY;
  f.stroke([[px - r, y - r], [px + r, y + r]], f.lw * 0.7);
  f.stroke([[px - r, y + r], [px + r, y - r]], f.lw * 0.7);
};

// ---- brow primitives ----------------------------------------------------------

const angryBrows = (f: CharacterFrame) => {
  const { eyeL, eyeR, eyeY, h } = { ...f.face, h: f.h };
  f.stroke([[eyeL - 0.02 * h, eyeY - 0.032 * h], [eyeL + 0.012 * h, eyeY - 0.018 * h]], f.lw * 0.8);
  f.stroke([[eyeR + 0.02 * h, eyeY - 0.032 * h], [eyeR - 0.012 * h, eyeY - 0.018 * h]], f.lw * 0.8);
};
const worryBrows = (f: CharacterFrame) => {
  const { eyeL, eyeR, eyeY, h } = { ...f.face, h: f.h };
  f.stroke([[eyeL - 0.02 * h, eyeY - 0.022 * h], [eyeL + 0.012 * h, eyeY - 0.036 * h]], f.lw * 0.7);
  f.stroke([[eyeR + 0.02 * h, eyeY - 0.022 * h], [eyeR - 0.012 * h, eyeY - 0.036 * h]], f.lw * 0.7);
};
/** Lowered but PARALLEL brows — focus, not aggression. The single stroke that
 *  separates `determined` from `angry`: same height over both eyes, level, so
 *  the face reads as concentrated rather than scowling. */
const levelBrows = (f: CharacterFrame) => {
  const { eyeL, eyeR, eyeY, h } = { ...f.face, h: f.h };
  const by = eyeY - 0.027 * h;
  f.stroke([[eyeL - 0.026 * h, by], [eyeL + 0.018 * h, by]], f.lw * 0.9);
  f.stroke([[eyeR + 0.026 * h, by], [eyeR - 0.018 * h, by]], f.lw * 0.9);
};
/** High arched brows — anticipation/delight (the `excited` signature). */
const raisedBrows = (f: CharacterFrame) => {
  const { eyeL, eyeR, eyeY, h } = { ...f.face, h: f.h };
  for (const px of [eyeL, eyeR]) f.stroke([[px - 0.024 * h, eyeY - 0.04 * h], [px, eyeY - 0.05 * h], [px + 0.024 * h, eyeY - 0.04 * h]], f.lw * 0.7);
};
/** One brow arched HIGH, the other flat and LOW — the classic "I don't follow"
 *  asymmetry. Both stay level-ish: a brow slanting down toward the nose is what
 *  reads as anger, and confusion must never read as a glare. */
const skewBrows = (f: CharacterFrame) => {
  const { eyeL, eyeR, eyeY, h } = { ...f.face, h: f.h };
  f.stroke([[eyeL - 0.024 * h, eyeY - 0.042 * h], [eyeL, eyeY - 0.052 * h], [eyeL + 0.024 * h, eyeY - 0.042 * h]], f.lw * 0.75); // arched, high
  f.stroke([[eyeR - 0.02 * h, eyeY - 0.024 * h], [eyeR + 0.024 * h, eyeY - 0.024 * h]], f.lw * 0.8); // flat, low
};

// ---- mouth primitives ---------------------------------------------------------

const mw = (f: CharacterFrame) => 0.035 * f.h;
const smile = (f: CharacterFrame, d = 1) => f.stroke([[f.head.cx - mw(f), f.face.mouthY - 0.008 * f.h * d], [f.head.cx, f.face.mouthY + 0.012 * f.h * d], [f.head.cx + mw(f), f.face.mouthY - 0.008 * f.h * d]]);
const frown = (f: CharacterFrame) => f.stroke([[f.head.cx - mw(f), f.face.mouthY + 0.012 * f.h], [f.head.cx, f.face.mouthY - 0.008 * f.h], [f.head.cx + mw(f), f.face.mouthY + 0.012 * f.h]]);
const flat = (f: CharacterFrame, w = 0.8) => f.stroke([[f.head.cx - mw(f) * w, f.face.mouthY], [f.head.cx + mw(f) * w, f.face.mouthY]]);
/** A pressed, level line — held resolve. Heavier and wider than `flat`. */
const firm = (f: CharacterFrame) => f.stroke([[f.head.cx - mw(f) * 0.95, f.face.mouthY], [f.head.cx + mw(f) * 0.95, f.face.mouthY]], f.lw);
/** A wide open grin — bigger and deeper than `smile`. */
const bigSmile = (f: CharacterFrame) => f.stroke([[f.head.cx - mw(f) * 1.15, f.face.mouthY - 0.012 * f.h], [f.head.cx - mw(f) * 0.45, f.face.mouthY + 0.018 * f.h], [f.head.cx + mw(f) * 0.45, f.face.mouthY + 0.018 * f.h], [f.head.cx + mw(f) * 1.15, f.face.mouthY - 0.012 * f.h]]);
/** A symmetric squiggle — puzzlement (distinct from `zigzag`'s lopsided wobble). */
const wavy = (f: CharacterFrame) => f.stroke([[f.head.cx - mw(f) * 1.05, f.face.mouthY + 0.007 * f.h], [f.head.cx - mw(f) * 0.35, f.face.mouthY - 0.009 * f.h], [f.head.cx + mw(f) * 0.35, f.face.mouthY + 0.009 * f.h], [f.head.cx + mw(f) * 1.05, f.face.mouthY - 0.007 * f.h]]);
const zigzag = (f: CharacterFrame) => f.stroke([[f.head.cx - mw(f), f.face.mouthY], [f.head.cx - mw(f) * 0.33, f.face.mouthY + 0.012 * f.h], [f.head.cx + mw(f) * 0.33, f.face.mouthY - 0.006 * f.h], [f.head.cx + mw(f), f.face.mouthY + 0.008 * f.h]]);
const openMouth = (f: CharacterFrame, big = false) => {
  const r = (big ? 0.024 : 0.018) * f.h;
  ring(f, f.head.cx, f.face.mouthY + (big ? 0.006 * f.h : 0), r, big ? r * 1.15 : r);
};

// ---- registrations ------------------------------------------------------------

registerCharacterEmotion("neutral", (f) => { dotEyes(f); flat(f); });
registerCharacterEmotion("happy", (f) => { dotEyes(f); smile(f); });
registerCharacterEmotion("sad", (f) => { dotEyes(f); frown(f); });
registerCharacterEmotion("surprised", (f) => { dotEyes(f, f.face.eyeR2 * 1.5); openMouth(f); });
registerCharacterEmotion("angry", (f) => { dotEyes(f); flat(f, 1); angryBrows(f); });
// excited ≠ happy: wide bright eyes + high brows + an open grin (pair with `fx: excited` for the motion ticks).
registerCharacterEmotion("excited", (f) => { dotEyes(f, f.face.eyeR2 * 1.45); raisedBrows(f); bigSmile(f); });
// confused ≠ sad: asymmetric brows (one up, one down) + a wavy mouth (pair with `fx: question`).
registerCharacterEmotion("confused", (f) => { dotEyes(f); skewBrows(f); wavy(f); });
registerCharacterEmotion("thinking", (f) => { dotEyes(f, f.face.eyeR2, -0.01 * f.h); f.stroke([[f.head.cx - mw(f) * 0.6, f.face.mouthY + 0.004 * f.h], [f.head.cx + mw(f) * 0.6, f.face.mouthY]]); });
// determined ≠ angry: brows are LOWERED BUT LEVEL and the mouth is a firm level
// line — quiet resolve. Slanted brows (angryBrows) are what make a face read as anger.
registerCharacterEmotion("determined", (f) => { dotEyes(f, f.face.eyeR2 * 0.92); levelBrows(f); firm(f); });
registerCharacterEmotion("wink", (f) => { f.dot(f.face.eyeL, f.face.eyeY, f.face.eyeR2); happyEye(f, f.face.eyeR); smile(f); });
registerCharacterEmotion("love", (f) => { heartEye(f, f.face.eyeL); heartEye(f, f.face.eyeR); smile(f); });
registerCharacterEmotion("starstruck", (f) => { starEye(f, f.face.eyeL); starEye(f, f.face.eyeR); openMouth(f, true); });
registerCharacterEmotion("sleeping", (f) => {
  calmEye(f, f.face.eyeL);
  calmEye(f, f.face.eyeR);
  flat(f, 0.5);
  f.ctx.label("z", f.head.cx + f.head.r + 0.05 * f.h, f.head.cy - 0.09 * f.h, { size: Math.max(9, 0.085 * f.h), color: f.color, weight: 700, font: "heading", z: f.z + 1, role: "character" });
  f.ctx.label("Z", f.head.cx + f.head.r + 0.11 * f.h, f.head.cy - 0.16 * f.h, { size: Math.max(11, 0.11 * f.h), color: f.color, weight: 700, font: "heading", z: f.z + 1, role: "character" });
});
registerCharacterEmotion("dizzy", (f) => { xEye(f, f.face.eyeL); xEye(f, f.face.eyeR); zigzag(f); });

// ---- new expressions ----------------------------------------------------------

registerCharacterEmotion("laughing", (f) => { happyEye(f, f.face.eyeL); happyEye(f, f.face.eyeR); openMouth(f, true); });
registerCharacterEmotion("grin", (f) => { dotEyes(f); f.stroke([[f.head.cx - mw(f) * 1.1, f.face.mouthY - 0.006 * f.h], [f.head.cx, f.face.mouthY + 0.016 * f.h], [f.head.cx + mw(f) * 1.1, f.face.mouthY - 0.006 * f.h]]); f.stroke([[f.head.cx - mw(f) * 0.9, f.face.mouthY + 0.002 * f.h], [f.head.cx + mw(f) * 0.9, f.face.mouthY + 0.002 * f.h]], f.lw * 0.6); });
registerCharacterEmotion("content", (f) => { happyEye(f, f.face.eyeL); happyEye(f, f.face.eyeR); smile(f); });
registerCharacterEmotion("calm", (f) => { calmEye(f, f.face.eyeL); calmEye(f, f.face.eyeR); smile(f, 0.6); });
registerCharacterEmotion("worried", (f) => { dotEyes(f); worryBrows(f); zigzag(f); });
registerCharacterEmotion("scared", (f) => { bigEye(f, f.face.eyeL); bigEye(f, f.face.eyeR); worryBrows(f); openMouth(f); });
registerCharacterEmotion("crying", (f) => {
  calmEye(f, f.face.eyeL);
  calmEye(f, f.face.eyeR);
  frown(f);
  for (const px of [f.face.eyeL, f.face.eyeR]) f.stroke([[px, f.face.eyeY + 0.02 * f.h], [px - 0.004 * f.h, f.face.eyeY + 0.06 * f.h]], f.lw * 0.7, f.accent);
});
registerCharacterEmotion("furious", (f) => { dashEye(f, f.face.eyeL, 1); dashEye(f, f.face.eyeR, -1); angryBrows(f); f.stroke([[f.head.cx - mw(f), f.face.mouthY + 0.012 * f.h], [f.head.cx, f.face.mouthY], [f.head.cx + mw(f), f.face.mouthY + 0.012 * f.h]]); });
registerCharacterEmotion("stressed", (f) => { bigEye(f, f.face.eyeL); bigEye(f, f.face.eyeR); angryBrows(f); zigzag(f); });
registerCharacterEmotion("smug", (f) => { dashEye(f, f.face.eyeL, 1); dashEye(f, f.face.eyeR, -1); f.stroke([[f.head.cx - mw(f) * 0.4, f.face.mouthY + 0.006 * f.h], [f.head.cx + mw(f), f.face.mouthY - 0.006 * f.h]]); });
registerCharacterEmotion("curious", (f) => { dotEyes(f); f.stroke([[f.face.eyeR + 0.016 * f.h, f.face.eyeY - 0.03 * f.h], [f.face.eyeR + 0.03 * f.h, f.face.eyeY - 0.024 * f.h]], f.lw * 0.7); openMouth(f); });
registerCharacterEmotion("embarrassed", (f) => {
  dotEyes(f);
  smile(f, 0.6);
  for (const px of [f.head.cx - 0.06 * f.h, f.head.cx + 0.06 * f.h]) for (const dx of [-0.008 * f.h, 0.008 * f.h]) f.stroke([[px + dx, f.face.mouthY - 0.004 * f.h], [px + dx - 0.004 * f.h, f.face.mouthY + 0.01 * f.h]], f.lw * 0.55, f.accent);
});
