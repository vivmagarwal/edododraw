/**
 * Emanata — the floating "state marks" of comic/sketchnote grammar (sweat,
 * "?", idea bulb, anger vein, sparkles…). Each floats near the head; `f.accent`
 * is the mark colour. A pose can set a default (e.g. `exhausted` → sweat) and
 * a call can override with `fx:`.
 */

import { registerCharacterFx } from "./registry.js";
import { iconEntry } from "../icons.js";
import type { CharacterFrame, Pt } from "./types.js";

/**
 * Above the head: `(dx, dy)` in head-radii from the head centre.
 *
 * MIRRORING RULE — an emanata's POSITION mirrors with `flip`, its GLYPH never
 * does. A "?" or a "♪" drawn backwards is just a broken character, but a mark
 * stranded behind a figure that now faces the other way is a composition bug:
 * the mark must stay on the side the figure is facing, exactly like the prop
 * at the pose's anchor. So `dx` (and only `dx`) is multiplied by `f.flip`;
 * every glyph is still painted upright.
 */
const at = (f: CharacterFrame, dx: number, dy: number): Pt => [f.head.cx + dx * f.flip * f.head.r, f.head.cy + dy * f.head.r];
const mark = (f: CharacterFrame, text: string, dx: number, dy: number, scale = 1) => {
  const p = at(f, dx, dy);
  f.ctx.label(text, p[0], p[1], { size: Math.max(11, 0.16 * f.h * scale), color: f.accent, weight: 800, font: "heading", z: f.z + 3, role: "character" });
};
const star = (f: CharacterFrame, dx: number, dy: number, rr: number) => {
  const c = at(f, dx, dy), pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rr * f.h : rr * f.h * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  f.fill(pts, f.accent);
};
const heart = (f: CharacterFrame, dx: number, dy: number, rr: number) => {
  const c = at(f, dx, dy), r = rr * f.h;
  f.fill([[c[0], c[1] + r * 0.9], [c[0] - r, c[1] - r * 0.25], [c[0] - r * 0.5, c[1] - r * 0.95], [c[0], c[1] - r * 0.3], [c[0] + r * 0.5, c[1] - r * 0.95], [c[0] + r, c[1] - r * 0.25]], f.accent);
};

registerCharacterFx("sweat", (f) => {
  for (const [dx, dy] of [[1.5, -0.9], [1.9, -0.2]] as Pt[]) {
    const c = at(f, dx, dy), s = 0.03 * f.h;
    f.fill([[c[0], c[1] - s], [c[0] + s * 0.7, c[1] + s * 0.4], [c[0], c[1] + s * 0.8], [c[0] - s * 0.7, c[1] + s * 0.4]], f.accent);
  }
});
registerCharacterFx("question", (f) => mark(f, "?", 1.4, -1.7));
registerCharacterFx("double-question", (f) => { mark(f, "?", 1.2, -1.6, 0.85); mark(f, "?", 2.0, -1.9, 1.05); });
registerCharacterFx("alarm", (f) => mark(f, "!?", 1.6, -1.7));
registerCharacterFx("exclaim", (f) => mark(f, "!", 1.3, -1.8));
registerCharacterFx("idea", (f) => {
  const c = at(f, 0, -2.1);
  if (iconEntry("bulb")) f.ctx.icon("bulb", c[0], c[1], 0.3 * f.h, f.accent, f.z + 3);
  for (const d of [250, 270, 290]) { const a = (d * Math.PI) / 180; f.stroke([[c[0] + Math.cos(a) * 0.19 * f.h, c[1] + Math.sin(a) * 0.19 * f.h], [c[0] + Math.cos(a) * 0.26 * f.h, c[1] + Math.sin(a) * 0.26 * f.h]], f.lw * 0.7, f.accent); }
});
registerCharacterFx("anger", (f) => {
  const c = at(f, 1.3, -1.2), s = 0.05 * f.h;
  f.stroke([[c[0] - s, c[1] - s * 0.2], [c[0] - s * 0.2, c[1] - s], [c[0], c[1] - s * 0.2], [c[0] + s * 0.2, c[1] - s], [c[0] + s, c[1] - s * 0.2]], f.lw * 0.8, f.accent);
  f.stroke([[c[0] - s, c[1] + s * 0.4], [c[0] - s * 0.2, c[1] - s * 0.4], [c[0], c[1] + s * 0.4], [c[0] + s * 0.2, c[1] - s * 0.4], [c[0] + s, c[1] + s * 0.4]], f.lw * 0.8, f.accent);
});
registerCharacterFx("excited", (f) => {
  // the fan is lopsided by design, so it mirrors with the figure (see `at`)
  for (const d of [235, 260, 285, 310]) { const a = (d * Math.PI) / 180, c = at(f, 0, -0.2), cx = Math.cos(a) * f.flip; f.stroke([[c[0] + cx * 1.4 * f.head.r, c[1] + Math.sin(a) * 1.4 * f.head.r], [c[0] + cx * 1.9 * f.head.r, c[1] + Math.sin(a) * 1.9 * f.head.r]], f.lw * 0.8, f.accent); }
});
registerCharacterFx("stars", (f) => { star(f, 1.5, -1.5, 0.035); star(f, 2.1, -0.9, 0.024); star(f, 1.0, -2.0, 0.02); });
registerCharacterFx("hearts", (f) => { heart(f, 1.4, -1.6, 0.03); heart(f, 2.0, -1.0, 0.022); });
registerCharacterFx("music", (f) => { mark(f, "♪", 1.5, -1.6, 0.95); mark(f, "♫", 2.1, -1.1, 1.1); });
registerCharacterFx("zzz", (f) => { mark(f, "z", 1.3, -1.4, 0.7); mark(f, "Z", 1.8, -1.9, 1.0); });
registerCharacterFx("dizzy", (f) => {
  const c = at(f, 0, -1.7), pts: Pt[] = [];
  // the spiral is chiral — mirror it with the figure so it hangs the same way
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 3, r = (0.02 + i * 0.0016) * f.h; pts.push([c[0] + Math.cos(a) * r * f.flip, c[1] + Math.sin(a) * r * 0.6]); }
  f.stroke(pts, f.lw * 0.7, f.accent);
});
registerCharacterFx("sightline", (f) => {
  // leaves the eye on the side the figure faces (see the mirroring rule above)
  const ex = f.face.eyeR - f.head.cx;
  f.ctx.line([[f.head.cx + (ex + 0.03 * f.h) * f.flip, f.face.eyeY], at(f, 2.6, -1.4)], { color: f.accent, width: f.lw * 0.6, z: f.z + 1, dotted: true });
});
