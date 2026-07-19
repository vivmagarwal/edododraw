/**
 * Torso / clothing styles — the workbook's figure-style continuum (vest
 * outline → filled silhouette → detailed garments). Each drawer paints over
 * the torso slot using the frame's sheared transform, so clothing leans with
 * the body. `f.accent` carries the shirtColor (stripes, tie, fills).
 */

import { registerCharacterShirt } from "./registry.js";
import type { CharacterFrame, Pt } from "./types.js";

/** Torso outline/fill — a rounded rect when upright, a sheared quad when leaning. */
function torso(f: CharacterFrame, fillColor: string | null): void {
  const [TL, TR, BR, BL] = f.torso;
  const fillStyle = fillColor ? "solid" : "none";
  const roughness = Math.min(1.1, f.ctx.preset.roughness);
  const flat = Math.abs(TL[0] - BL[0]) < 0.5 && Math.abs(TR[0] - BR[0]) < 0.5;
  if (flat) {
    const x = Math.min(TL[0], TR[0]);
    f.ctx.shape(
      "round-rectangle",
      x,
      TL[1],
      Math.abs(TR[0] - TL[0]),
      BL[1] - TL[1],
      { stroke: f.color, fill: fillColor, fillStyle, strokeWidth: f.lw, roughness, roundness: Math.max(3, f.h * 0.03) },
      { z: f.z, role: "character" },
    );
  } else {
    f.ctx.poly([TL, TR, BR, BL], { stroke: f.color, fill: fillColor, fillStyle, strokeWidth: f.lw, roughness }, { z: f.z, role: "character" });
  }
}

const q = (f: CharacterFrame, x: number, y: number): Pt => f.T([x, y]);
const bg = (f: CharacterFrame): string => f.ctx.preset.background;

const sleeve = (f: CharacterFrame, side: -1 | 1): void =>
  void f.stroke([q(f, side * 0.1, 0.3), q(f, side * 0.155, 0.335), q(f, side * 0.145, 0.385)], f.lw);

registerCharacterShirt("vest", (f) => torso(f, null));

registerCharacterShirt("tee", (f) => {
  torso(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
});

registerCharacterShirt("striped", (f) => {
  torso(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
  for (const sy of [0.35, 0.41, 0.47]) f.stroke([q(f, -0.095, sy), q(f, 0.095, sy)], f.lw * 0.7, f.accent);
});

registerCharacterShirt("solid", (f) => torso(f, f.accent));

registerCharacterShirt("tie", (f) => {
  torso(f, bg(f));
  f.stroke([q(f, -0.045, 0.25), q(f, 0, 0.3), q(f, 0.045, 0.25)], f.lw * 0.8);
  f.fill([q(f, 0, 0.3), q(f, 0.028, 0.345), q(f, 0, 0.46), q(f, -0.028, 0.345)], f.accent);
});

registerCharacterShirt("dress", (f) => {
  f.ctx.poly(
    [q(f, -0.1, 0.25), q(f, 0.1, 0.25), q(f, 0.17, 0.62), q(f, -0.17, 0.62)],
    { stroke: f.color, fill: bg(f), fillStyle: "solid", strokeWidth: f.lw, roughness: Math.min(1.1, f.ctx.preset.roughness) },
    { z: f.z, role: "character" },
  );
});

registerCharacterShirt("hoodie", (f) => {
  // hood arc behind the head (the head's bg fill covers the inside)
  const hrr = 0.14 * f.h;
  f.stroke(f.arc(f.head.cx, f.head.cy, hrr, 200, 340, 10), f.lw);
  torso(f, bg(f));
  f.stroke([q(f, -0.05, 0.47), q(f, -0.05, 0.53), q(f, 0.05, 0.53), q(f, 0.05, 0.47)], f.lw * 0.7); // pocket
  f.dot(...q(f, -0.02, 0.29), Math.max(1, f.h * 0.009));
  f.dot(...q(f, 0.02, 0.29), Math.max(1, f.h * 0.009));
});

// ---- new garments -------------------------------------------------------------

registerCharacterShirt("crew", (f) => {
  torso(f, bg(f));
  sleeve(f, -1);
  sleeve(f, 1);
  f.stroke(f.arc(q(f, 0, 0.25)[0], q(f, 0, 0.25)[1], 0.05 * f.h, 20, 160, 8), f.lw * 0.8); // crew neckline
});

registerCharacterShirt("buttoned", (f) => {
  torso(f, bg(f));
  f.stroke([q(f, -0.04, 0.25), q(f, 0, 0.29), q(f, 0.04, 0.25)], f.lw * 0.8); // collar V
  f.stroke([q(f, 0, 0.29), q(f, 0, 0.52)], f.lw * 0.6); // placket
  for (const by of [0.34, 0.41, 0.48]) f.dot(...q(f, 0, by), Math.max(1, f.h * 0.011));
});

registerCharacterShirt("blazer", (f) => {
  torso(f, f.accent === f.color ? bg(f) : f.accent);
  // lapels: two diagonals meeting at a V
  f.stroke([q(f, -0.06, 0.25), q(f, 0, 0.4), q(f, 0.06, 0.25)], f.lw * 0.9);
  f.stroke([q(f, 0, 0.4), q(f, 0, 0.53)], f.lw * 0.6);
  f.dot(...q(f, 0.055, 0.44), Math.max(1, f.h * 0.011)); // pocket square hint
});

registerCharacterShirt("labcoat", (f) => {
  torso(f, bg(f));
  f.stroke([q(f, -0.05, 0.25), q(f, -0.02, 0.4)], f.lw * 0.8); // left lapel
  f.stroke([q(f, 0.05, 0.25), q(f, 0.02, 0.4)], f.lw * 0.8); // right lapel
  f.stroke([q(f, 0, 0.4), q(f, 0, 0.55)], f.lw * 0.6); // open front seam
  f.stroke([q(f, 0.05, 0.44), q(f, 0.09, 0.44), q(f, 0.09, 0.5), q(f, 0.05, 0.5), q(f, 0.05, 0.44)], f.lw * 0.6); // pocket
});

registerCharacterShirt("overalls", (f) => {
  torso(f, bg(f));
  f.stroke([q(f, -0.06, 0.3), q(f, -0.06, 0.42)], f.lw); // left strap
  f.stroke([q(f, 0.06, 0.3), q(f, 0.06, 0.42)], f.lw); // right strap
  f.stroke([q(f, -0.075, 0.42), q(f, 0.075, 0.42)], f.lw); // bib top
  f.dot(...q(f, -0.06, 0.44), Math.max(1.1, f.h * 0.012), f.accent);
  f.dot(...q(f, 0.06, 0.44), Math.max(1.1, f.h * 0.012), f.accent);
});

registerCharacterShirt("turtleneck", (f) => {
  torso(f, f.accent === f.color ? bg(f) : f.accent);
  f.stroke([q(f, -0.05, 0.235), q(f, 0.05, 0.235)], f.lw); // rolled collar
  f.stroke([q(f, -0.05, 0.255), q(f, 0.05, 0.255)], f.lw * 0.8);
});

registerCharacterShirt("scarf", (f) => {
  torso(f, bg(f));
  f.fill([q(f, -0.07, 0.245), q(f, 0.07, 0.245), q(f, 0.07, 0.29), q(f, -0.07, 0.29)], f.accent); // wrap
  f.fill([q(f, 0.02, 0.29), q(f, 0.06, 0.29), q(f, 0.05, 0.44), q(f, 0.01, 0.44)], f.accent); // hanging end
});
