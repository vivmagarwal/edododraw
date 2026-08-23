/**
 * The character renderer. Builds a CharacterFrame (all coordinates
 * pre-transformed) and drives the per-axis drawers in paint order:
 *
 *   shadow → legs+feet → body/shirt → arms+hands → head → hair → face
 *          → accessory → motion+prop → fx
 *
 * Three rules carry the whole look (see types.ts for where they come from):
 *   1. NO NECK. The head's chin lands on the body's top edge and the head is
 *      painted last over it, so the join is a single clean silhouette.
 *   2. ARMS LEAVE THE BODY. Each arm's root snaps onto the body outline at its
 *      own height, so arms never float beside the figure or start inside it —
 *      whatever body shape or garment is in use.
 *   3. HANDS AND FEET ARE LOOPS, not blobs. A small open circle at the tip of
 *      a limb is the single most characteristic stroke of this drawing style.
 *
 * The lean model is the key correctness invariant: the upper body (head,
 * neck, torso, arms, face, hair, accessory) is SHEARED forward by the pose's
 * `lean` — everything above the hips tilts together, so a leaning figure's
 * head never floats off its torso. Legs are never sheared, so the feet stay
 * planted where the pose authored them.
 */

import type { VizContext } from "../context.js";
import type { StylePreset } from "../../style/presets.js";
import { contrastInk, luma, parseHex } from "../../style/color.js";
import { iconEntry } from "../icons.js";
import {
  type CharacterOptions,
  type CharacterFrame,
  type Pt,
  HIP_Y,
  HEAD_Y,
  HEAD_R,
  BODY_TOP,
  AIRBORNE_Y,
  bodyHalfWidth,
  legY,
} from "./types.js";
// note: motion streaks render UN-sheared (they belong to the world, not the body)
import {
  getCharacterPose,
  getCharacterEmotion,
  getCharacterShirt,
  getCharacterHair,
  getCharacterAccessory,
  getCharacterFx,
  shirtDrawsArms,
} from "./registry.js";

/** Smallest luma gap (0..255) between a figure's ink and the canvas that still
 *  reads as a drawn line. Line art has no fill to fall back on, so the bar is
 *  low but non-zero. */
const MIN_INK_CONTRAST = 40;

/**
 * The ink a figure is actually drawn in.
 *
 * A character is LINE ART: if its stroke matches the canvas the whole figure
 * disappears. Some presets legitimately hand shapes a background-coloured
 * outline — `mono-accent`'s `strokeMode: "seam"` makes adjacent solid blocks
 * read as cut-outs — which is right for a filled rectangle and fatal for a
 * stick figure. So the requested ink is checked against the preset background
 * and, when it would vanish, falls back to the preset ink (then to plain
 * contrast ink). Nothing is hardcoded: every candidate comes from the preset.
 * Non-hex colours are trusted as-is (we can't measure them).
 */
export function characterInk(want: string | undefined, preset: StylePreset): string {
  const wanted = want ?? preset.ink;
  const bg = preset.background;
  if (!parseHex(wanted) || !parseHex(bg)) return wanted;
  const reads = (c: string) => Math.abs(luma(c) - luma(bg)) >= MIN_INK_CONTRAST;
  if (reads(wanted)) return wanted;
  if (reads(preset.ink)) return preset.ink;
  return contrastInk(bg);
}

/**
 * The ground shadow's fill: the preset's background nudged ~7% toward its ink.
 * Derived, never hardcoded, so a dark preset gets a lighter shadow and a light
 * one gets a darker shadow, and neither ever competes with the figure.
 */
export function shadowInk(preset: StylePreset): string {
  const bg = parseHex(preset.background);
  const ink = parseHex(preset.ink);
  if (!bg || !ink) return "rgba(0,0,0,0.07)";
  const mix = (a: number, b: number) => Math.round(a + (b - a) * 0.055);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(bg.r, ink.r))}${hex(mix(bg.g, ink.g))}${hex(mix(bg.b, ink.b))}`;
}

/** Shear weight: 1 at/above head height, 0 at the hips, clamped. */
function shearWeight(y: number): number {
  const t = (HIP_Y - y) / (HIP_Y - HEAD_Y);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Draw a character with its FEET at `(cx, groundY)` and total height `h`.
 * Emits ordinary scene elements through `ctx` (so item scoping, presets, and
 * deterministic strokes all apply). Returns the drawn bounds.
 */
export function drawCharacter(
  ctx: VizContext,
  cx: number,
  groundY: number,
  h: number,
  opts: CharacterOptions = {},
): { x: number; y: number; w: number; h: number } {
  const pose = getCharacterPose(opts.pose ?? "standing") ?? getCharacterPose("standing")!;
  const emotion = opts.emotion ?? pose.emotion ?? "neutral";
  const color = characterInk(opts.color ?? ctx.ink, ctx.preset);
  const flip: 1 | -1 = opts.flip ? -1 : 1;
  const y0 = groundY - h;
  const z = opts.z ?? 0;
  const lw = Math.max(1.7, h * 0.017);
  const legW = lw * 1.12; // legs carry the figure — a touch heavier than the arms
  const lean = pose.lean ?? 0;
  const fidelity = opts.fidelity ?? "plain";

  const Y = (u: number): number => y0 + u * h;
  const Xr = (u: number): number => cx + u * flip * h;
  const P = (p: Pt): Pt => [Xr(p[0]), Y(p[1])];
  /** Legs only: authored against LEGACY_HIP, drawn against the current hip. */
  const L = (p: Pt): Pt => [Xr(p[0]), Y(legY(p[1]))];
  /**
   * Keep a hand OUT of the skull. Poses author a gesture, not a head size — so
   * when the head grows, a hand raised to the temple would end up buried in it.
   * Any arm point inside the head circle is pushed radially out to the rim.
   * `contact` poses (facepalm) keep a hand deliberately on the face.
   */
  const clearHead = (pts: Pt[]): Pt[] =>
    pts.map(([x, y], i) => {
      if (i === 0) return [x, y] as Pt;
      const dx = x - 0;
      const dy = y - HEAD_Y;
      const d = Math.hypot(dx, dy);
      const rim = HEAD_R * 1.05;
      if (d >= rim || d === 0) return [x, y] as Pt;
      return [(dx / d) * rim, HEAD_Y + (dy / d) * rim] as Pt;
    });
  const T = (p: Pt): Pt => [Xr(p[0] + lean * shearWeight(p[1])), Y(p[1])];

  /** An OPEN circle — the loop that ends a hand or a foot. Never filled. */
  const loop = (px: number, py: number, r: number, c = color) =>
    ctx.shape("circle", px - r, py - r, r * 2, r * 2, { stroke: c, fill: null, fillStyle: "none", strokeWidth: lw * 0.85, roughness: 0.5 }, { z: z + 1, role: "character" });
  const dot = (px: number, py: number, r: number, c = color) =>
    ctx.shape("circle", px - r, py - r, r * 2, r * 2, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: z + 1, role: "character" });
  const stroke = (pts: Pt[], w = lw * 0.8, c = color) => ctx.line(pts, { color: c, width: w, z: z + 1 });
  const fill = (pts: Pt[], c = color) => ctx.poly(pts, { stroke: c, fill: c, fillStyle: "solid", strokeWidth: 1, roughness: 0.4 }, { z: z + 1, role: "character" });
  const arc = (acx: number, acy: number, r: number, from: number, to: number, steps = 12): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      out.push([acx + Math.cos(a) * r, acy + Math.sin(a) * r]);
    }
    return out;
  };

  // Head / body / face anchors (all sheared with the upper body).
  const headCenter = T([0, HEAD_Y]);
  const head = { cx: headCenter[0], cy: headCenter[1], r: HEAD_R * h };
  const torso: [Pt, Pt, Pt, Pt] = [
    T([-bodyHalfWidth(BODY_TOP), BODY_TOP]),
    T([bodyHalfWidth(BODY_TOP), BODY_TOP]),
    T([bodyHalfWidth(HIP_Y), HIP_Y]),
    T([-bodyHalfWidth(HIP_Y), HIP_Y]),
  ];
  /** A point on the body silhouette: k ∈ [-1, 1] across the bean's width at `y`. */
  const B = (k: number, y: number): Pt => T([k * bodyHalfWidth(y), y]);
  /** The bean as a closed polyline (inset shrinks it, for a garment inside the outline). */
  const bodyOutline = (inset = 0): Pt[] => {
    const pts: Pt[] = [];
    const k = 1 - inset;
    const STEPS = 22;
    for (let i = 0; i <= STEPS; i++) pts.push(B(k, BODY_TOP + ((HIP_Y - BODY_TOP) * i) / STEPS));
    for (let i = STEPS; i >= 0; i--) pts.push(B(-k, BODY_TOP + ((HIP_Y - BODY_TOP) * i) / STEPS));
    pts.push(pts[0]);
    return pts;
  };
  // Eyes sit WIDE and HIGH, the mouth LOW and wide — small features clustered in
  // the middle of a head read as a squint, which is most of why v1 looked cross.
  const ex = 0.045 * h;
  const face = {
    eyeL: head.cx - ex,
    eyeR: head.cx + ex,
    eyeY: head.cy - 0.03 * h,
    mouthY: head.cy + 0.052 * h,
    eyeR2: Math.max(1.4, h * 0.017),
  };

  const frame: CharacterFrame = {
    ctx,
    h,
    color,
    accent: color,
    lw,
    z,
    flip,
    T,
    P,
    head,
    torso,
    face,
    fidelity,
    B,
    bodyOutline,
    loop,
    stroke,
    dot,
    fill,
    arc,
  };

  // ---- layer 0: ground shadow (a standing figure that casts nothing floats)
  const grounded = !pose.airborne && (opts.shadow ?? true);
  if (grounded) {
    const sw = 0.235 * h;
    const sh = 0.036 * h;
    ctx.shape(
      "ellipse",
      cx - sw / 2 + lean * 0.02 * h * flip,
      groundY - sh * 0.45,
      sw,
      sh,
      // fill only, NO stroke: the shadow is scenery, and a stroked shadow both
      // reads as an outline and trips every "does this ink contrast?" check
      { stroke: undefined, fill: shadowInk(ctx.preset), fillStyle: "solid", strokeWidth: 0, roughness: 0.6 },
      { z: z - 1, role: "character-shadow", id: ctx.uid("figure-shadow") },
    );
  }

  // ---- layer 1: legs (unsheared — planted) + feet
  const limb = (pts: Pt[], tf: (p: Pt) => Pt, tip: "loop" | "none", w = lw) => {
    ctx.line(pts.map(tf), { color, width: w, z });
    if (tip === "loop") {
      const n = pts.length;
      const end = tf(pts[n - 1]);
      const prev = tf(pts[Math.max(0, n - 2)]);
      // push the loop a little PAST the limb's end, along its own direction, so
      // the hand reads as attached rather than as a bead threaded on the line
      const dx = end[0] - prev[0];
      const dy = end[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const r = Math.max(1.8, h * 0.026);
      loop(end[0] + (dx / len) * r * 0.55, end[1] + (dy / len) * r * 0.55, r);
    }
  };
  limb(pose.legL, L, "none", legW);
  limb(pose.legR, L, "none", legW);
  if (!pose.airborne) {
    for (const leg of [pose.legL, pose.legR]) {
      const end = leg[leg.length - 1];
      if (end[1] < AIRBORNE_Y) continue; // a lifted heel keeps its bare end
      const f = L(end);
      // a shoe: a flat loop sitting ON the ground line, toe pointing the way the figure faces
      if (fidelity === "minimal") {
        ctx.line([[f[0], f[1]], [f[0] + 0.05 * h * flip, f[1]]], { color, width: lw, z });
      } else {
        const fw = 0.062 * h;
        const fh = 0.036 * h;
        ctx.shape(
          "ellipse",
          f[0] - fw * 0.34,
          f[1] - fh * 0.82,
          fw,
          fh,
          { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw * 0.85, roughness: 0.55 },
          { z, role: "character" },
        );
      }
    }
  }

  // ---- layer 2: shirt / torso
  frame.accent = opts.shirtColor ?? color;
  const shirtDraw = getCharacterShirt(opts.shirt ?? "vest") ?? getCharacterShirt("vest")!;
  shirtDraw(frame);

  // ---- layer 3: arms over the shirt (sheared), rooted ON the body outline
  const showHands = pose.hands !== false && fidelity !== "minimal";
  const rootOnBody = (pts: Pt[]): Pt[] => {
    if (pose.freeArms || pts.length < 2) return pts;
    const [x, y] = pts[0];
    const edge = bodyHalfWidth(y) * Math.sign(x || 1);
    return [[edge, y], ...pts.slice(1)];
  };
  const arm = (pts: Pt[]) => (pose.contact ? rootOnBody(pts) : clearHead(rootOnBody(pts)));
  if (!shirtDrawsArms(opts.shirt)) {
    limb(arm(pose.armL), T, showHands ? "loop" : "none");
    limb(arm(pose.armR), T, showHands ? "loop" : "none");
  }

  // ---- layer 4: head, painted OVER the body top — no neck, one silhouette
  ctx.shape("circle", head.cx - head.r, head.cy - head.r, head.r * 2, head.r * 2, { stroke: color, fill: ctx.preset.background, fillStyle: "solid", strokeWidth: lw, roughness: Math.min(1, ctx.preset.roughness) }, { z, role: "character" });

  // ---- layer 5: hair (on the head rim, under the face)
  if (opts.hair && opts.hair !== "none") {
    frame.accent = opts.hairColor ?? color;
    getCharacterHair(opts.hair)?.(frame);
  }

  // ---- layer 6: face (a `minimal` figure has none — the pose does the talking,
  //      exactly as the workbook's motion figures do)
  if (fidelity !== "minimal") {
    frame.accent = color;
    (getCharacterEmotion(emotion) ?? getCharacterEmotion("neutral")!)(frame);
  }

  // ---- layer 7: worn accessory (over the face — glasses, hat, beard)
  if (opts.accessory && opts.accessory !== "none") {
    frame.accent = opts.accessoryColor ?? color;
    getCharacterAccessory(opts.accessory)?.(frame);
  }

  // ---- layer 8: motion lines + prop
  for (const [a, b] of pose.motion ?? []) ctx.line([P(a), P(b)], { color, width: lw * 0.8, z });
  if (opts.prop && iconEntry(opts.prop)) {
    const anchor = pose.propAnchor ?? pose.armR[pose.armR.length - 1];
    const size = (pose.propSize ?? 0.3) * h;
    const a = T(anchor);
    ctx.icon(opts.prop, a[0], a[1] - size * 0.28, size, opts.propColor ?? color, z + 2);
  }

  // ---- layer 9: floating state mark
  const fx = opts.fx ?? pose.fx;
  if (fx && fx !== "none") {
    frame.accent = opts.fxColor ?? color;
    getCharacterFx(fx)?.(frame);
  }

  // ---- bounds (pose extents + prop overhead + motion streaks)
  const xs: number[] = [];
  const ys: number[] = [0, 1];
  for (const l of [pose.armL, pose.armR]) for (const p of l) { xs.push(p[0] + lean * shearWeight(p[1])); ys.push(p[1]); }
  for (const l of [pose.legL, pose.legR]) for (const p of l) { xs.push(p[0]); ys.push(legY(p[1])); }
  for (const [a, b] of pose.motion ?? []) { xs.push(a[0], b[0]); ys.push(a[1], b[1]); }
  const minX = Math.min(-0.18, ...xs) - 0.05;
  const maxX = Math.max(0.18, ...xs) + 0.05;
  const minY = Math.min(-0.16, ...ys);
  return { x: cx + (flip > 0 ? minX : -maxX) * h, y: y0 + minY * h, w: (maxX - minX) * h, h: (1 - minY) * h };
}
