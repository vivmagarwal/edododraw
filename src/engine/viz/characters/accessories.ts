/**
 * Worn accessories — drawn over the face/head (glasses, hats, facial hair,
 * headphones…). `f.accent` is the accessory colour. These paint last on the
 * head so they read as "on top of" the figure.
 */

import { registerCharacterAccessory } from "./registry.js";
import type { CharacterFrame, Pt } from "./types.js";

const ring = (f: CharacterFrame, cx: number, cy: number, r: number, c = f.accent, w = f.lw * 0.7) =>
  f.ctx.shape("circle", cx - r, cy - r, r * 2, r * 2, { stroke: c, fill: null, fillStyle: "none", strokeWidth: w, roughness: 0.5 }, { z: f.z + 2, role: "character" });
const disc = (f: CharacterFrame, cx: number, cy: number, r: number, c = f.accent) =>
  f.ctx.shape("circle", cx - r, cy - r, r * 2, r * 2, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: f.z + 2, role: "character" });
const rim = (f: CharacterFrame, deg: number, out = 1): Pt => {
  const a = (deg * Math.PI) / 180;
  return [f.head.cx + Math.cos(a) * f.head.r * out, f.head.cy + Math.sin(a) * f.head.r * out];
};

registerCharacterAccessory("glasses", (f) => {
  const r = 0.03 * f.h;
  ring(f, f.face.eyeL, f.face.eyeY, r);
  ring(f, f.face.eyeR, f.face.eyeY, r);
  f.stroke([[f.face.eyeL + r, f.face.eyeY], [f.face.eyeR - r, f.face.eyeY]], f.lw * 0.6, f.accent);
  f.stroke([[f.face.eyeL - r, f.face.eyeY], rim(f, 200, 0.98)], f.lw * 0.6, f.accent);
  f.stroke([[f.face.eyeR + r, f.face.eyeY], rim(f, 340, 0.98)], f.lw * 0.6, f.accent);
});

registerCharacterAccessory("sunglasses", (f) => {
  const r = 0.032 * f.h;
  disc(f, f.face.eyeL, f.face.eyeY, r);
  disc(f, f.face.eyeR, f.face.eyeY, r);
  f.stroke([[f.face.eyeL + r, f.face.eyeY - r * 0.4], [f.face.eyeR - r, f.face.eyeY - r * 0.4]], f.lw * 0.7, f.accent);
  f.stroke([[f.face.eyeR + r, f.face.eyeY - r * 0.3], rim(f, 340, 1.0)], f.lw * 0.6, f.accent);
});

registerCharacterAccessory("monocle", (f) => {
  ring(f, f.face.eyeR, f.face.eyeY, 0.032 * f.h);
  f.stroke([[f.face.eyeR, f.face.eyeY + 0.032 * f.h], [f.face.eyeR + 0.01 * f.h, f.face.mouthY + 0.03 * f.h]], f.lw * 0.5, f.accent); // chain
});

registerCharacterAccessory("hat", (f) => {
  const top = f.head.cy - f.head.r;
  f.stroke([[f.head.cx - f.head.r * 1.3, top + 0.01 * f.h], [f.head.cx + f.head.r * 1.3, top + 0.01 * f.h]], f.lw, f.accent); // brim
  f.ctx.poly([[f.head.cx - f.head.r * 0.7, top], [f.head.cx + f.head.r * 0.7, top], [f.head.cx + f.head.r * 0.6, top - f.head.r * 0.9], [f.head.cx - f.head.r * 0.6, top - f.head.r * 0.9]], { stroke: f.accent, fill: f.ctx.preset.background, fillStyle: "solid", strokeWidth: f.lw, roughness: 0.6 }, { z: f.z + 2, role: "character" });
});

registerCharacterAccessory("cap", (f) => {
  f.ctx.poly([rim(f, 185, 1.02), ...f.arc(f.head.cx, f.head.cy, f.head.r * 1.02, 185, 355, 10), rim(f, 355, 1.02)], { stroke: f.accent, fill: f.ctx.preset.background, fillStyle: "solid", strokeWidth: f.lw, roughness: 0.6 }, { z: f.z + 2, role: "character" });
  f.fill([rim(f, 350, 1.0), [f.head.cx + f.head.r * 1.7, f.head.cy - f.head.r * 0.35], [f.head.cx + f.head.r * 1.7, f.head.cy - f.head.r * 0.55], rim(f, 335, 0.9)], f.accent); // bill
});

registerCharacterAccessory("beard", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.06, 28, 152, 12), f.lw, f.accent); // jawline
  for (const d of [55, 75, 90, 105, 125]) f.stroke([rim(f, d, 0.9), rim(f, d, 1.3)], f.lw * 0.6, f.accent); // stubble
});

registerCharacterAccessory("mustache", (f) => {
  const my = f.face.mouthY - 0.012 * f.h;
  f.stroke([[f.head.cx, my], [f.head.cx - 0.02 * f.h, my - 0.006 * f.h], [f.head.cx - 0.04 * f.h, my + 0.006 * f.h]], f.lw * 0.8, f.accent);
  f.stroke([[f.head.cx, my], [f.head.cx + 0.02 * f.h, my - 0.006 * f.h], [f.head.cx + 0.04 * f.h, my + 0.006 * f.h]], f.lw * 0.8, f.accent);
});

registerCharacterAccessory("bowtie", (f) => {
  const c = f.T([0, 0.235]);
  const w = 0.03 * f.h;
  f.fill([[c[0], c[1]], [c[0] - w, c[1] - w * 0.7], [c[0] - w, c[1] + w * 0.7]], f.accent);
  f.fill([[c[0], c[1]], [c[0] + w, c[1] - w * 0.7], [c[0] + w, c[1] + w * 0.7]], f.accent);
});

registerCharacterAccessory("headphones", (f) => {
  f.stroke(f.arc(f.head.cx, f.head.cy, f.head.r * 1.12, 195, 345, 12), f.lw, f.accent); // band
  disc(f, ...rim(f, 178, 1.02), 0.028 * f.h);
  disc(f, ...rim(f, 2, 1.02), 0.028 * f.h);
});

registerCharacterAccessory("earrings", (f) => {
  disc(f, ...rim(f, 150, 1.02), Math.max(1.2, f.h * 0.013));
  disc(f, ...rim(f, 30, 1.02), Math.max(1.2, f.h * 0.013));
});

registerCharacterAccessory("crown", (f) => {
  const base = f.head.cy - f.head.r * 0.95;
  const x0 = f.head.cx - f.head.r * 0.7;
  const x1 = f.head.cx + f.head.r * 0.7;
  f.fill([[x0, base], [x0, base - f.head.r * 0.4], [f.head.cx - f.head.r * 0.35, base - f.head.r * 0.15], [f.head.cx, base - f.head.r * 0.55], [f.head.cx + f.head.r * 0.35, base - f.head.r * 0.15], [x1, base - f.head.r * 0.4], [x1, base]], f.accent);
});

registerCharacterAccessory("mask", (f) => {
  const y = f.face.eyeY;
  f.fill([rim(f, 198, 0.98), [f.face.eyeL - 0.03 * f.h, y - 0.03 * f.h], [f.face.eyeR + 0.03 * f.h, y - 0.03 * f.h], rim(f, 342, 0.98), [f.face.eyeR + 0.02 * f.h, y + 0.03 * f.h], [f.face.eyeL - 0.02 * f.h, y + 0.03 * f.h]], f.accent);
  f.dot(f.face.eyeL, y, 0.016 * f.h, f.ctx.preset.background); // eye holes
  f.dot(f.face.eyeR, y, 0.016 * f.h, f.ctx.preset.background);
});
