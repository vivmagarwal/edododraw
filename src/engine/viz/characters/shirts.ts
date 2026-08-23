/**
 * BODY STYLES — the `shirt:` axis. Each drawer paints the figure's torso.
 *
 * THE BEAN. The default body is an oval that is narrow at the shoulders,
 * widest just under the chest and tucked at the hem (`bodyHalfWidth` in
 * types.ts). This is the single change that separates a drawn person from an
 * assembled diagram: a rectangle reads as furniture, an oval reads as a body.
 * v1 drew a 0.20-wide rounded rectangle and every figure looked like a fridge.
 *
 * AUTHORING RULE — never write a raw unit x in this file. Use `f.B(k, y)`,
 * where k is a fraction of the body's half-width at that height (-1 = left
 * edge, +1 = right edge). A collar written as `f.B(-0.55, 0.27)` stays on the
 * collarbone if the body is ever reshaped; a collar written as `-0.055` does
 * not. `f.B` already carries the lean shear, so clothes tilt with the body.
 *
 * `f.accent` carries the caller's shirtColor (fills, stripes, ties).
 */

import { registerCharacterShirt } from "./registry.js";
import type { CharacterFrame, Pt } from "./types.js";
import { BODY_TOP, HIP_Y } from "./types.js";

const bg = (f: CharacterFrame): string => f.ctx.preset.background;
const rough = (f: CharacterFrame): number => Math.min(1.1, f.ctx.preset.roughness);

/** The bean itself. `fillColor: null` leaves it an outline. */
function bean(f: CharacterFrame, fillColor: string | null): void {
  f.ctx.poly(
    f.bodyOutline(),
    { stroke: f.color, fill: fillColor, fillStyle: fillColor ? "solid" : "none", strokeWidth: f.lw, roughness: rough(f) },
    { z: f.z, role: "character" },
  );
}

/** Short sleeve: a cap over the shoulder, following the body's own edge. */
const sleeve = (f: CharacterFrame, side: -1 | 1): void =>
  void f.stroke([f.B(side, 0.28), f.B(side * 1.34, 0.315), f.B(side * 1.18, 0.375)], f.lw * 0.9);

/** Cuff ticks at the wrists — a `detailed` figure only. */
const detail = (f: CharacterFrame, draw: () => void): void => {
  if (f.fidelity === "detailed") draw();
};

// ---- the core three -----------------------------------------------------------

registerCharacterShirt("vest", (f) => bean(f, null));

registerCharacterShirt("tee", (f) => {
  bean(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
  detail(f, () => f.stroke([f.B(-0.5, 0.27), f.B(0, 0.315), f.B(0.5, 0.27)], f.lw * 0.75)); // neckline
});

registerCharacterShirt("solid", (f) => bean(f, f.accent));

// ---- patterned / structured ---------------------------------------------------

registerCharacterShirt("striped", (f) => {
  bean(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
  for (const sy of [0.33, 0.39, 0.45, 0.51]) f.stroke([f.B(-0.86, sy), f.B(0.86, sy)], f.lw * 0.7, f.accent);
});

registerCharacterShirt("tie", (f) => {
  bean(f, bg(f));
  f.stroke([f.B(-0.5, BODY_TOP + 0.005), f.B(0, 0.305), f.B(0.5, BODY_TOP + 0.005)], f.lw * 0.8);
  f.fill([f.B(0, 0.305), f.B(0.3, 0.345), f.B(0, 0.47), f.B(-0.3, 0.345)], f.accent);
});

registerCharacterShirt("crew", (f) => {
  bean(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
  f.stroke([f.B(-0.62, 0.265), f.B(0, 0.315), f.B(0.62, 0.265)], f.lw * 0.85);
});

registerCharacterShirt("buttoned", (f) => {
  bean(f, bg(f));
  f.stroke([f.B(-0.45, BODY_TOP + 0.005), f.B(0, 0.31), f.B(0.45, BODY_TOP + 0.005)], f.lw * 0.8);
  f.stroke([f.B(0, 0.31), f.B(0, 0.52)], f.lw * 0.6);
  for (const by of [0.35, 0.42, 0.49]) f.dot(...f.B(0, by), Math.max(1, f.h * 0.011));
});

registerCharacterShirt("blazer", (f) => {
  bean(f, f.accent === f.color ? bg(f) : f.accent);
  f.stroke([f.B(-0.62, BODY_TOP + 0.005), f.B(0, 0.41), f.B(0.62, BODY_TOP + 0.005)], f.lw * 0.9);
  f.stroke([f.B(0, 0.41), f.B(0, 0.53)], f.lw * 0.6);
  detail(f, () => f.dot(...f.B(0.6, 0.45), Math.max(1, f.h * 0.011)));
});

registerCharacterShirt("labcoat", (f) => {
  bean(f, bg(f));
  f.stroke([f.B(-0.5, BODY_TOP + 0.005), f.B(-0.2, 0.41)], f.lw * 0.8);
  f.stroke([f.B(0.5, BODY_TOP + 0.005), f.B(0.2, 0.41)], f.lw * 0.8);
  f.stroke([f.B(0, 0.41), f.B(0, HIP_Y)], f.lw * 0.6);
  detail(f, () => f.stroke([f.B(0.42, 0.45), f.B(0.86, 0.45), f.B(0.86, 0.51), f.B(0.42, 0.51), f.B(0.42, 0.45)], f.lw * 0.6));
});

registerCharacterShirt("overalls", (f) => {
  bean(f, bg(f));
  f.stroke([f.B(-0.62, 0.28), f.B(-0.6, 0.43)], f.lw);
  f.stroke([f.B(0.62, 0.28), f.B(0.6, 0.43)], f.lw);
  f.stroke([f.B(-0.78, 0.43), f.B(0.78, 0.43)], f.lw);
  f.dot(...f.B(-0.6, 0.45), Math.max(1.1, f.h * 0.012), f.accent);
  f.dot(...f.B(0.6, 0.45), Math.max(1.1, f.h * 0.012), f.accent);
});

registerCharacterShirt("turtleneck", (f) => {
  bean(f, f.accent === f.color ? bg(f) : f.accent);
  f.stroke([f.B(-0.62, BODY_TOP + 0.004), f.B(0.62, BODY_TOP + 0.004)], f.lw);
  f.stroke([f.B(-0.66, BODY_TOP + 0.022), f.B(0.66, BODY_TOP + 0.022)], f.lw * 0.8);
});

registerCharacterShirt("scarf", (f) => {
  bean(f, bg(f));
  f.fill([f.B(-0.9, BODY_TOP), f.B(0.9, BODY_TOP), f.B(0.9, 0.295), f.B(-0.9, 0.295)], f.accent);
  f.fill([f.B(0.2, 0.295), f.B(0.62, 0.295), f.B(0.5, 0.45), f.B(0.12, 0.45)], f.accent);
});

registerCharacterShirt("hoodie", (f) => {
  // the hood sits BEHIND and BELOW the crown, framing the head, not hovering over it
  const hrr = f.head.r * 1.22;
  f.stroke(f.arc(f.head.cx, f.head.cy + f.head.r * 0.16, hrr, 168, 12, 14), f.lw);
  bean(f, bg(f));
  f.stroke([f.B(-0.55, 0.46), f.B(-0.55, 0.52), f.B(0.55, 0.52), f.B(0.55, 0.46)], f.lw * 0.7);
  f.dot(...f.B(-0.22, 0.29), Math.max(1, f.h * 0.009));
  f.dot(...f.B(0.22, 0.29), Math.max(1, f.h * 0.009));
});

// ---- alternative body SHAPES (workbook p. 7, "other ways to draw stick figures")

/**
 * `dress` / `triangle` — the workbook's triangle person: the body is one
 * triangle that flares well past the hips. Reads instantly as a skirt or a
 * robe, and it is the fastest way to tell two figures apart at a glance.
 */
const triangleBody = (f: CharacterFrame): void => {
  f.ctx.poly(
    // flare stops well inside the arms: a skirt that reaches the hands reads as a bell, not a dress
    [f.B(-0.62, BODY_TOP), f.B(0.62, BODY_TOP), [f.B(1.62, HIP_Y)[0], f.B(0, HIP_Y + 0.045)[1]], [f.B(-1.62, HIP_Y)[0], f.B(0, HIP_Y + 0.045)[1]]] as Pt[],
    { stroke: f.color, fill: f.accent === f.color ? bg(f) : f.accent, fillStyle: "solid", strokeWidth: f.lw, roughness: rough(f) },
    { z: f.z, role: "character" },
  );
};
registerCharacterShirt("dress", triangleBody);
registerCharacterShirt("triangle", triangleBody);

/**
 * `line` — the most abstract figure in the continuum: the body is a single
 * stroke. Use for crowds and bystanders, where a rendered body would compete
 * with the protagonist (workbook §5.4: detail IS attention).
 */
registerCharacterShirt("line", (f) => {
  f.stroke([f.B(0, BODY_TOP), f.B(0, HIP_Y)], f.lw * 1.15);
});

/**
 * `star` — the workbook's star person: the body is the W of a five-point star,
 * arms a single bar across the shoulders. Deliberately geometric; good for a
 * "team"/"everyone" mark where individuals must not read as individuals.
 */
registerCharacterShirt("star", (f) => {
  f.stroke([f.B(-1.5, 0.3), f.B(1.5, 0.3)], f.lw);
  f.stroke([f.B(-1.15, 0.3), f.B(-0.45, HIP_Y), f.B(0, 0.36), f.B(0.45, HIP_Y), f.B(1.15, 0.3)], f.lw);
});

/** `none` — no body at all: a head-only figure (a portrait, or a talking head). */
registerCharacterShirt("none", () => {});
