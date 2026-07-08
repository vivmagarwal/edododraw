# EDodoDraw — Camera & "Magic Move" System — Design Doc

Status: implementable spec. Target: TypeScript engine, SVG scene, world layer moved by a single CSS `transform` (translate + scale) on a viewport, rough.js strokes, rAF tween/spring. Grounded against Excalidraw's viewport math (`reference/excalidraw/packages/excalidraw/viewport.ts`, `scene/zoom.ts`) but re-derived for a **center-anchored camera** and a **CSS-transformed SVG world layer** (SVG stays vector, so we get crispness Excalidraw's canvas cannot).

---

## 1. Goals & non-goals

**Goals**
- One canonical camera state `{x, y, zoom}` that both syntax (`focus(id)`, `fitAll()`, `zoomBy`) and interactive input drive.
- A *provably straight, monotone* pan+zoom interpolation (the "magic move" core) so the destination never swoops away and back.
- Deterministic tweens for presentation/timeline; velocity-continuous springs for interaction and mid-flight retargeting.
- Crisp hand-drawn strokes at any zoom by exploiting SVG's vector nature + a GPU-layer settle trick.
- A `TimelinePlayer` that sequences camera moves with per-step annotation reveals.

**Non-goals**: camera rotation (designed-in as an optional matrix extension, off by default), 3D, per-element parallax.

---

## 2. Coordinate spaces & conventions

| Space | Units | Origin | Notes |
|---|---|---|---|
| **World** | world units (== SVG user units of the world `<g>`) | scene origin | Elements are authored/positioned here. `Bounds` are here. |
| **Screen** | CSS px | viewport top-left | What the user's pointer reports (after subtracting the viewport's client rect). |
| **Viewport** | CSS px | — | The fixed-size clipping box (`overflow:hidden`) that holds the world layer. |

DOM layout:

```
<div class="edodo-viewport">        <!-- fixed W×H, overflow:hidden, position:relative -->
  <svg class="edodo-svg" width=W height=H>
    <g class="edodo-world" transform-origin="0 0"><!-- CSS transform lives here --></g>
    <g class="edodo-overlay"><!-- annotations that must NOT scale (optional) --></g>
  </svg>
</div>
```

DPR: SVG is resolution-independent; **do not** bake `devicePixelRatio` into geometry. The browser rasterizes the composited SVG at device resolution.

```ts
interface Vec2 { x: number; y: number; }
interface Size { width: number; height: number; }
/** Axis-aligned world-space box. */
interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }
```

---

## 3. Camera state model

Canonical state is **center-anchored**: `(x, y)` is the world point currently under the **viewport center**; `zoom` is screen-px per world-unit. Center-anchoring (vs Excalidraw's top-left `scrollX/scrollY`) makes `focus`/`fit`/lerp symmetric and is what humans and LLMs reason about ("center on node A").

```ts
interface Camera {
  /** world X currently mapped to viewport center */
  x: number;
  /** world Y currently mapped to viewport center */
  y: number;
  /** screen px per world unit; always in [MIN_ZOOM, MAX_ZOOM] */
  zoom: number;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 40;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
```

Rotation is deliberately excluded from `Camera`. If ever needed, add `rotation?: number` and switch `toMatrix()` (§4) to a full 2×3 — everything downstream already goes through `toMatrix()`.

The viewport size lives outside `Camera` (it changes on resize independent of camera intent):

```ts
interface Viewport extends Size {}   // CSS px
```

---

## 4. The view transform (world ↔ screen, CSS emission)

With viewport center `V = (W/2, H/2)`:

```
screen = (world − cameraCenter) · zoom + V
world  = (screen − V) / zoom + cameraCenter
```

```ts
function worldToScreen(p: Vec2, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (p.x - cam.x) * cam.zoom + vp.width  / 2,
    y: (p.y - cam.y) * cam.zoom + vp.height / 2,
  };
}
function screenToWorld(s: Vec2, cam: Camera, vp: Viewport): Vec2 {
  return {
    x: (s.x - vp.width  / 2) / cam.zoom + cam.x,
    y: (s.y - vp.height / 2) / cam.zoom + cam.y,
  };
}
```

The world `<g>` holds children at raw world coordinates, so the transform that realizes the mapping above is `translate(t) · scale(zoom)`:

```
tx = W/2 − x·zoom
ty = H/2 − y·zoom
matrix(zoom, 0, 0, zoom, tx, ty)
```

```ts
/** 2×3 affine as a DOMMatrix-compatible tuple [a,b,c,d,e,f]. */
type Mat2x3 = [number, number, number, number, number, number];

function toMatrix(cam: Camera, vp: Viewport): Mat2x3 {
  const s = cam.zoom;
  return [s, 0, 0, s, vp.width / 2 - cam.x * s, vp.height / 2 - cam.y * s];
}

/** Apply to the world layer. transform-origin MUST be 0 0. */
function applyTransform(el: SVGGElement | HTMLElement, m: Mat2x3): void {
  // matrix() is exact and cheap; string built without template churn in hot path
  el.style.transform =
    `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]})`;
}
```

Emit CSS `transform` (not the SVG `transform` attribute) on the `<g>` so it can be GPU-composited during flight (§9, §12). `transform-origin:0 0` is mandatory — the default `50% 50%` would double-count the center.

---

## 5. Fit / center / zoom-about-anchor math

### 5.1 Bounds helpers

```ts
function unionBounds(a: Bounds, b: Bounds): Bounds {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
           maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
function expandBounds(b: Bounds, dx: number, dy = dx): Bounds {
  return { minX: b.minX - dx, minY: b.minY - dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}
function boundsCenter(b: Bounds): Vec2 {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
```

### 5.2 Padding & insets

Two independent margins, both in **screen px** (zoom-independent, which is what users expect):

- **`padding`** (symmetric or per-side): breathing room around the fitted content.
- **`insets`** (`{top,right,bottom,left}`): space reserved for editor UI (toolbars, side panels). Asymmetric insets shift the optical center off the geometric viewport center.

```ts
interface FitInsets { top: number; right: number; bottom: number; left: number; }
interface FitOptions {
  padding?: number | Partial<FitInsets>;   // default 48
  insets?: Partial<FitInsets>;             // default 0
  /** "contain": fill the frame (may exceed 100%); "scale-down": never zoom past maxZoom. */
  mode?: "contain" | "scale-down";         // default "scale-down"
  /** upper cap when focusing tiny elements so we don't zoom to absurd levels */
  maxZoom?: number;                        // default 4
  minZoom?: number;                        // default MIN_ZOOM
}
```

### 5.3 The fit solve — `cameraForBounds`

```ts
function resolveSides(v: number | Partial<FitInsets> | undefined,
                      d = 0): FitInsets {
  if (v == null) return { top: d, right: d, bottom: d, left: d };
  if (typeof v === "number") return { top: v, right: v, bottom: v, left: v };
  return { top: v.top ?? d, right: v.right ?? d, bottom: v.bottom ?? d, left: v.left ?? d };
}

function cameraForBounds(b: Bounds, vp: Viewport, opts: FitOptions = {}): Camera {
  const pad = resolveSides(opts.padding, 48);
  const ins = resolveSides(opts.insets, 0);

  // available screen area after UI insets + breathing padding
  const availW = Math.max(1, vp.width  - ins.left - ins.right  - pad.left - pad.right);
  const availH = Math.max(1, vp.height - ins.top  - ins.bottom - pad.top  - pad.bottom);

  const contentW = Math.max(1e-6, b.maxX - b.minX);
  const contentH = Math.max(1e-6, b.maxY - b.minY);

  let zoom = Math.min(availW / contentW, availH / contentH);
  if ((opts.mode ?? "scale-down") === "scale-down") {
    zoom = Math.min(zoom, opts.maxZoom ?? 4);   // don't over-zoom small targets
  }
  zoom = Math.min(clampZoom(zoom), opts.maxZoom ?? MAX_ZOOM);
  zoom = Math.max(zoom, opts.minZoom ?? MIN_ZOOM);

  // Optical center of the available (inset) rectangle, in screen px.
  const availCenterX = (ins.left + (vp.width  - ins.right )) / 2; // = W/2 + (left−right)/2
  const availCenterY = (ins.top  + (vp.height - ins.bottom)) / 2;

  // Camera center = content center, offset so content center lands on the
  // optical center rather than the geometric viewport center.
  const cc = boundsCenter(b);
  return {
    x: cc.x - (availCenterX - vp.width  / 2) / zoom,
    y: cc.y - (availCenterY - vp.height / 2) / zoom,
    zoom,
  };
}
```

- `focus(id)` = `cameraForBounds(boundsOf(id), …, {mode:"scale-down"})`.
- `fitAll()` = `cameraForBounds(sceneBounds, …)`.
- `centerOn(id)` (pan only, keep zoom) = `cameraForBounds` with `mode:"none"` semantics → just set `x,y` from bounds center + inset offset, leave `zoom` unchanged.

### 5.4 Zoom about a screen anchor (wheel / pinch / `zoomBy`)

Keep the world point under the cursor fixed:

```ts
function zoomAbout(cam: Camera, vp: Viewport, anchorScreen: Vec2,
                   nextZoom: number): Camera {
  const z = clampZoom(nextZoom);
  const w = screenToWorld(anchorScreen, cam, vp);   // world point under anchor now
  // require worldToScreen(w, next) === anchorScreen  ⇒  solve center
  return {
    x: w.x - (anchorScreen.x - vp.width  / 2) / z,
    y: w.y - (anchorScreen.y - vp.height / 2) / z,
    zoom: z,
  };
}
```

`zoomBy(factor, anchor?)` → `zoomAbout(cam, vp, anchor ?? V, cam.zoom * factor)`.
`panBy(dxScreen, dyScreen)` → `{ x: cam.x − dx/zoom, y: cam.y − dy/zoom, zoom }` (drag right ⇒ world moves right ⇒ camera moves left).

---

## 6. Magic-move interpolation (the core)

**Problem.** Interpolating `zoom` geometrically (perceptually uniform) while lerping the camera center linearly makes every world point trace a *curved, non-monotone* screen path once the zoom ratio exceeds ~e — the destination visibly drifts away, then converges. This is the classic "swoop." Excalidraw solves it in `interpolateViewport`; below is the same result re-derived for our center-anchored camera, with a proof it's straight.

**Setup.** For any world point `p`, `screen(t) = p·z(t) + (V − c(t)·z(t))`. Write the affine as `screen = A(t)·p + B(t)` with `A=z`, `B=V−c·z`. Every point's screen path is a straight line **iff** `A` and `B` are both affine in one shared blend weight `m ∈ [0,1]`.

**Construction.**
1. Pick geometric zoom for pacing: `z(t) = z0 · (z1/z0)^u`, where `u` is the eased progress ∈[0,1].
2. Derive the blend weight from it: `m = (z(t) − z0) / (z1 − z0)` (fallback `m = u` when `z0 == z1`). This forces `z(t) = (1−m)z0 + m z1` — affine in `m`. �both A affine✓
3. Make `c·z` affine in the same `m`: `c(t)·z(t) = (1−m)·c0·z0 + m·c1·z1`.

Then for every `p`: `screen(t) = (1−m)·screen0(p) + m·screen1(p)` — a convex blend of its start/end screen positions, monotone because `z(t)` (hence `m`) is monotone in `u`. Straight and non-overshooting, for all points at once. ∎

```ts
/** Magic-move blend. u = eased progress in [0,1]. */
function interpolateCamera(from: Camera, to: Camera, u: number): Camera {
  if (u <= 0) return { ...from };
  if (u >= 1) return { ...to };                 // land bit-exact (pow can be off by an ulp)

  const z = from.zoom * Math.pow(to.zoom / from.zoom, u);
  const m = to.zoom === from.zoom
    ? u
    : (z - from.zoom) / (to.zoom - from.zoom);

  // c(t) = ((1−m)·c0·z0 + m·c1·z1) / z
  return {
    x: ((1 - m) * from.x * from.zoom + m * to.x * to.zoom) / z,
    y: ((1 - m) * from.y * from.zoom + m * to.y * to.zoom) / z,
    zoom: z,
  };
}
```

This one function is used by **both** the tween and the spring — they only differ in how they produce `u`.

---

## 7. Easing catalog

```ts
type Easing = (t: number) => number;   // t,return ∈ [0,1], f(0)=0, f(1)=1

const Easings = {
  linear:        (t) => t,
  smoothstep:    (t) => t * t * (3 - 2 * t),
  smootherstep:  (t) => t * t * t * (t * (t * 6 - 15) + 10),
  inQuad:        (t) => t * t,
  outQuad:       (t) => 1 - (1 - t) * (1 - t),
  inOutQuad:     (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outCubic:      (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic:    (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuint:      (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint:    (t) => t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  outExpo:       (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack:       (t) => { const c1 = 1.70158, c3 = c1 + 1;
                          return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
} satisfies Record<string, Easing>;

type EasingName = keyof typeof Easings;
```

Defaults: **`inOutCubic`** for programmatic focus/fit (settled, symmetric), **`outQuint`** for "already moving" retargets (fast entry), **`outBack`** available for playful annotation pop (used on scale, not on camera — overshoot on zoom looks like a bug). Cubic-bezier support is trivial to add (`cubicBezier(x1,y1,x2,y2)` → Newton-solved `Easing`) but the named set covers the presentation needs.

---

## 8. Duration heuristics

Duration scales with **how far the destination center must travel on screen** and **how many zoom octaves** we cross. Both are perceptual; distance is measured in the *current* screen frame so a far pan feels proportionally longer, capped so nothing drags.

```ts
interface DurationConfig {
  baseMs: number;      // fixed cost of any move        (default 220)
  travelMs: number;    // added at a full-diagonal pan  (default 520)
  zoomMs: number;      // added per zoom octave         (default 90)
  maxOctaves: number;  // clamp zoom contribution        (default 4)
  minMs: number;       // floor                          (default 180)
  maxMs: number;       // ceiling                        (default 900)
}

function computeDuration(from: Camera, to: Camera, vp: Viewport,
                         cfg: DurationConfig): number {
  // screen distance the destination's optical center moves (start frame → end frame)
  const startS = worldToScreen({ x: to.x, y: to.y }, from, vp);
  const endS   = { x: vp.width / 2, y: vp.height / 2 };
  const travel = Math.hypot(endS.x - startS.x, endS.y - startS.y);
  const diag   = Math.hypot(vp.width, vp.height);
  const travelFrac = Math.min(1, travel / diag);

  const octaves = Math.min(cfg.maxOctaves,
                           Math.abs(Math.log2(to.zoom / from.zoom)));

  const ms = cfg.baseMs + cfg.travelMs * travelFrac + cfg.zoomMs * octaves;
  return Math.round(Math.min(cfg.maxMs, Math.max(cfg.minMs, ms)));
}
```

`prefers-reduced-motion: reduce` → force duration `0` (jump). Explicit `duration` in an API call or timeline step overrides the heuristic entirely.

---

## 9. Tween engine + rAF loop

### 9.1 The shared ticker

A single rAF loop drives whatever `Motion` is active (a scene has exactly one live camera motion). One loop avoids multiple rAF callbacks fighting and lets us clamp `dt` after a tab is backgrounded.

```ts
interface Motion {
  /** advance by dt (ms since last frame); return the camera for this frame,
   *  or null when finished. */
  tick(dtMs: number): Camera | null;
  /** re-aim without stopping; implementations preserve continuity. */
  retarget(to: Camera, opts?: MotionOpts): void;
  readonly target: Camera;
}

interface MotionOpts { duration?: number; easing?: EasingName; }

class Ticker {
  private raf = 0;
  private last = 0;
  private motion: Motion | null = null;
  constructor(
    private onFrame: (cam: Camera) => void,
    private onIdle: () => void,
  ) {}

  run(motion: Motion) {
    this.motion = motion;
    if (!this.raf) { this.last = performance.now(); this.loop(this.last); }
  }
  get active() { return this.motion; }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.motion = null; }

  private loop = (now: number) => {
    const dt = Math.min(64, now - this.last);   // clamp: never step >64ms (bg tabs)
    this.last = now;
    const cam = this.motion!.tick(dt);
    if (cam) {
      this.onFrame(cam);                        // applyTransform + emit "camera" event
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.raf = 0; this.motion = null;
      this.onIdle();                            // settle: crispness commit (§12)
    }
  };
}
```

### 9.2 Deterministic tween

Used for `focus`/`fit`/`moveTo` and every timeline step — its duration is known up front, which the `TimelinePlayer` needs for scheduling.

```ts
interface Tween extends Motion {
  from: Camera;
  target: Camera;
  durationMs: number;
  easing: Easing;
  elapsed: number;       // ms
}

function makeTween(from: Camera, to: Camera, durationMs: number,
                   easing: Easing = Easings.inOutCubic): Tween {
  return {
    from, target: to, durationMs, easing, elapsed: 0,
    tick(dt) {
      this.elapsed += dt;
      const raw = this.durationMs <= 0 ? 1
                : Math.min(1, this.elapsed / this.durationMs);
      const cam = interpolateCamera(this.from, this.target, this.easing(raw));
      return raw >= 1 ? null : cam;   // null on the settling frame → ticker idles
    },
    retarget(to, opts) {
      // re-baseline from CURRENT camera; use fast-entry easing to hide the seam
      this.from = interpolateCamera(this.from, this.target,
                                    this.easing(Math.min(1, this.elapsed / Math.max(1, this.durationMs))));
      this.target = to;
      this.durationMs = opts?.duration ?? this.durationMs;
      this.easing = opts?.easing ? Easings[opts.easing] : Easings.outQuint;
      this.elapsed = 0;
    },
  };
}
```

The `retarget` above is *position-continuous* but not *velocity-continuous* (it restarts from rest). For most focus→focus jumps that's fine because `outQuint` starts fast. For interaction-grade continuity, use the spring.

---

## 10. Spring (velocity-continuous retargeting)

To keep magic-move straightness we **spring a single scalar** `q` (the progress fed into `interpolateCamera`), not the three channels independently — springing `x,y,zoom` separately would break the geometric coupling from §6 and reintroduce the swoop.

Critically-damped, semi-implicit Euler on `q → 1`:

```ts
interface Spring extends Motion {
  from: Camera;
  target: Camera;
  q: number;    // progress 0..1
  v: number;    // dq/dt (per ms)
  omega: number; // natural frequency
}

/** response = time-to-target feel (ms); dampingRatio 1 = critical (no overshoot). */
function makeSpring(from: Camera, to: Camera,
                    response = 380, dampingRatio = 1): Spring {
  const omega = (2 * Math.PI) / response;          // per ms
  return {
    from, target: to, q: 0, v: 0, omega,
    tick(dt) {
      const zeta = dampingRatio, w = this.omega;
      // spring toward q=1
      const a = -2 * zeta * w * this.v - w * w * (this.q - 1);
      this.v += a * dt;
      this.q += this.v * dt;
      if (this.q >= 1 - 1e-3 && Math.abs(this.v) < 1e-4) return null;  // settled
      return interpolateCamera(this.from, this.target, Math.min(1, Math.max(0, this.q)));
    },
    retarget(to) {
      // continuity: keep current camera as new origin, preserve q-velocity so the
      // motion carries through instead of snapping to rest.
      this.from = interpolateCamera(this.from, this.target, Math.min(1, Math.max(0, this.q)));
      this.target = to;
      this.q = 0;                 // fresh 0..1 over the new segment
      // v is intentionally NOT reset → momentum carries into the new segment
    },
  };
}
```

**Controller policy**
- Programmatic `focus/fit/moveTo/timeline step` → **Tween** (deterministic).
- Interactive inertia (wheel-momentum, fling) and *retargeting a focus while one is already in flight* → **Spring** (momentum carries).
- The controller decides at call time: if a motion is already live and the incoming call is another programmatic focus, it converts to a spring retarget when `settle:false`/`interrupt:"blend"`, else re-baselines the tween.

---

## 11. `CameraController` API

```ts
interface MoveOptions {
  /** ms; omit → computeDuration heuristic */
  duration?: number;
  easing?: EasingName;                 // default inOutCubic (tween) / n/a (spring)
  /** false = jump instantly (also forced under prefers-reduced-motion) */
  animate?: boolean;                   // default true
  /** how to treat an in-flight motion */
  interrupt?: "blend" | "restart" | "queue";  // default "blend"
  fit?: FitOptions;
  signal?: AbortSignal;                // cancel a queued/inflight move
}

interface CameraController {
  // ---- state ----
  readonly camera: Readonly<Camera>;
  readonly viewport: Readonly<Viewport>;
  readonly isAnimating: boolean;

  // ---- element/bounds resolution (host-provided) ----
  /** world bounds of an element or group id; null if unknown/empty. */
  boundsOf(id: string): Bounds | null;
  /** union bounds of everything (fitAll target). */
  sceneBounds(): Bounds | null;

  // ---- coordinate helpers ----
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;

  // ---- imperative moves (all return a Promise that resolves on settle,
  //      rejects on interrupt/abort) ----
  focus(id: string | string[], opts?: MoveOptions): Promise<void>;
  fitAll(opts?: MoveOptions): Promise<void>;
  fitBounds(b: Bounds, opts?: MoveOptions): Promise<void>;
  centerOn(target: string | Vec2, opts?: MoveOptions): Promise<void>; // pan-only
  moveTo(cam: Partial<Camera>, opts?: MoveOptions): Promise<void>;
  zoomTo(zoom: number, anchor?: Vec2, opts?: MoveOptions): Promise<void>;

  // ---- interactive (immediate, no promise; feed a spring/inertia) ----
  panBy(dxScreen: number, dyScreen: number): void;
  zoomBy(factor: number, anchorScreen?: Vec2): void;
  /** velocity in screen px/s for fling; drives inertial spring */
  fling(vx: number, vy: number): void;
  stop(): void;                        // freeze wherever we are

  // ---- lifecycle ----
  setViewport(vp: Viewport): void;     // on resize; re-derives transform, keeps camera intent
  onCameraChange(cb: (cam: Camera) => void): () => void;  // returns unsubscribe
}
```

Reference wiring of the three primitives (`Ticker`, `Tween`/`Spring`, `interpolateCamera`) inside `focus`:

```ts
focus(id, opts = {}) {
  const b = Array.isArray(id)
    ? id.map(this.boundsOf).filter(Boolean).reduce(unionBounds)
    : this.boundsOf(id);
  if (!b) return Promise.reject(new Error(`unknown target ${id}`));
  const to = cameraForBounds(b, this.viewport, opts.fit);
  return this.animateTo(to, opts);
}

private animateTo(to: Camera, opts: MoveOptions): Promise<void> {
  if (opts.animate === false || this.reducedMotion) {
    this.commit(to); return Promise.resolve();
  }
  const dur = opts.duration ?? computeDuration(this.camera, to, this.viewport, this.durCfg);
  return new Promise((resolve, reject) => {
    const live = this.ticker.active;
    if (live && opts.interrupt !== "restart") {
      live.retarget(to, { duration: dur, easing: opts.easing }); // blend
      this.rebind(resolve, reject, opts.signal);
    } else {
      const easing = Easings[opts.easing ?? "inOutCubic"];
      const m = makeTween({ ...this.camera }, to, dur, easing);
      this.ticker.run(m);
      this.bind(resolve, reject, opts.signal);
    }
  });
}
```

`setViewport` (resize) keeps *intent*: if the controller was created via `fitAll`/`focus`, it re-runs the fit against the new size; if the user had freely panned, it keeps `camera.{x,y,zoom}` and just recomputes the matrix (camera is center-anchored, so content stays centered — the natural behavior).

---

## 12. Keeping hand-drawn strokes crisp while scaling

**Key advantage over Excalidraw:** our world layer is **SVG**, not a `<canvas>`. rough.js output is vector `<path>` data, so it is resolution-independent — a CSS `scale()` does *not* rasterize the geometry. There is exactly one blur source and one fix.

1. **The only blur source: GPU-layer texture caching.** During flight we want `will-change: transform` (or `transform: translateZ(0)`) so the browser composites the world layer on the GPU at 60fps. When promoted, the browser rasterizes the layer's *current* size into a texture and scales that texture — so zooming *in* past the promoted scale shows a stale, blurry texture.

   **Fix — settle commit.** Toggle GPU promotion only during motion, and force re-rasterization at the final scale on settle:

   ```ts
   // Ticker.onFrame (first frame of a motion):
   world.style.willChange = "transform";
   // Ticker.onIdle (settle):
   world.style.willChange = "auto";        // drop the cached texture
   // force a synchronous reflow so re-raster happens at final zoom before paint
   void world.getBoundingClientRect();
   ```

   In flight, minor texture blur while everything is moving is imperceptible; the settle commit guarantees pin-sharp geometry at rest. No rough.js regeneration needed.

2. **Stroke width policy (design choice, configurable).**
   - **Default: strokes scale with zoom** (world-space width). Zooming in thickens strokes — the natural, hand-drawn "getting closer to paper" feel. Set `shape-rendering: geometricPrecision` on stroke paths so scaled anti-aliasing stays smooth.
   - **Option `nonScalingStroke:true`**: add `vector-effect: non-scaling-stroke` so stroke width stays constant in *screen* px at any zoom. Useful for schematic/technical diagrams and to avoid hairline strokes vanishing when zoomed way out. It slightly weakens the hand-drawn character, hence off by default.

3. **rough.js seed stability.** Fix each element's rough `seed` at generation time so the sketchy jitter is deterministic and does **not** re-roll on zoom/settle — otherwise the settle re-raster would look like the drawing "twitches." (rough.js honors an explicit `seed` option; store it per element.)

4. **Text (Excalifont).** Render text as SVG `<text>`/`<path>`, never HTML in `<foreignObject>` — SVG text scales crisply through the same transform; foreignObject HTML gets bitmap-scaled and blurs. Set `text-rendering: geometricPrecision`.

5. **Sub-pixel snapping.** Do **not** round `tx,ty` during animation (rounding causes visible stair-stepping on slow pans). Optionally snap to the device-pixel grid *once* on settle for maximum text sharpness: `t = Math.round(t * dpr) / dpr`.

6. **Non-scaling overlay.** Annotations that must keep constant screen size (e.g. a fixed-radius focus ring, callout labels) live in `.edodo-overlay` (untransformed) and are positioned each frame via `worldToScreen` of their anchor. Everything else lives in `.edodo-world` and scales.

---

## 13. Timeline / steps (magic-move presentation)

A timeline is an ordered list of **steps**; each step is a camera target plus annotation reveal/hide sets and a dwell. The `TimelinePlayer` sequences them, reusing the same `Tween` machinery so step transitions are magic-moves.

```ts
type StepTarget =
  | { kind: "focus"; id: string | string[]; fit?: FitOptions }
  | { kind: "fitAll"; fit?: FitOptions }
  | { kind: "bounds"; bounds: Bounds; fit?: FitOptions }
  | { kind: "camera"; camera: Partial<Camera> }
  | { kind: "hold" };                       // stay put; only annotations change

interface AnnotationCue {
  id: string;                               // annotation element id
  action: "reveal" | "hide";
  /** delay after the step's camera STARTS (or set `afterCamera` to wait for settle) */
  delayMs?: number;
  afterCamera?: boolean;                    // default false
}

interface Step {
  id?: string;
  target: StepTarget;
  /** transition into this step */
  duration?: number;                        // omit → heuristic
  easing?: EasingName;                      // default inOutCubic
  /** annotation reveals/hides tied to this step */
  cues?: AnnotationCue[];
  /** stagger applied to cues without explicit delay */
  stagger?: number;                         // default 90ms
  /** how long to dwell after the step fully arrives before auto-advancing */
  holdMs?: number;                          // default 0 (manual advance)
  onEnter?: () => void;
  onExit?: () => void;
}

interface Timeline {
  steps: Step[];
  /** auto-play through holds, or wait for next()/user input */
  autoplay?: boolean;                       // default false
  loop?: boolean;                           // default false
}

interface TimelinePlayer {
  readonly index: number;                   // current step
  readonly length: number;
  readonly state: "idle" | "transitioning" | "holding" | "done";

  load(t: Timeline): void;
  play(): void;                             // begin autoplay from current index
  pause(): void;
  next(opts?: MoveOptions): Promise<void>;  // advance one step
  prev(opts?: MoveOptions): Promise<void>;  // step back (annotations reverse)
  goTo(index: number, opts?: MoveOptions): Promise<void>;
  seek(index: number): void;                // jump w/o animation (scrubbing)
  reset(): void;

  onStep(cb: (index: number, step: Step) => void): () => void;
}
```

**Player semantics (per `next`)**
1. Run `onExit` of the current step; schedule its `hide` cues to reverse if any are step-scoped.
2. Resolve `StepTarget` → `Camera` via §5, kick a `Tween` through the controller (`interrupt:"blend"` so rapid `next()` presses chain smoothly instead of stuttering).
3. Schedule `cues`: `reveal` cues fire at `delayMs` after camera start, or on the settle callback when `afterCamera`. Cues lacking an explicit delay get `i * stagger`. Reveal = fade/scale-in the annotation element (CSS transition or a small rAF on opacity/`transform: scale`, `outBack` for a gentle pop).
4. On settle, if `autoplay` and `holdMs > 0`, arm a timer to auto-`next()`; `pause()` clears it.
5. `prev` re-derives the previous step's camera and *reverses* that step's cues (hide what it revealed). `seek` sets camera with `animate:false` and sets annotation visibility to the cumulative state at that index (compute by folding cues `0..index`), enabling a scrubber.

**Reduced motion:** player forces `animate:false` transitions and reveals annotations without the pop (opacity only).

Authoring maps 1:1 to EDodoDraw syntax, e.g.:

```
step { focus: "authService"; reveal: [note1]; hold: 1200ms }
step { focus: ["authService","db"]; reveal: [arrow1 @300ms]; easing: inOutQuint }
step { fitAll; hide: [note1] }
```

---

## 14. Interruption & retargeting — summary matrix

| Situation | Primitive | Behavior |
|---|---|---|
| `focus()` while idle | Tween | fresh magic-move, heuristic duration |
| `focus()` while a Tween is flying, `interrupt:"blend"` | Tween.retarget | re-baseline `from` = current cam, `outQuint`, position-continuous |
| `focus()` while flying, `interrupt:"restart"` | new Tween | hard restart from current cam |
| `focus()` while flying, `interrupt:"queue"` | queued | runs after current settles (respects `signal`) |
| wheel/pinch/drag | direct `zoomAbout`/`panBy` | no tween; immediate |
| fling / inertia | Spring | velocity-continuous, critically damped |
| rapid timeline `next()` | Tween.retarget (`blend`) | chained magic-moves, no stutter |
| resize | recompute | keep intent (fit re-solves; free-pan keeps center) |

`stop()` freezes the ticker and leaves the camera at the current frame. `AbortSignal` on a `MoveOptions` rejects the pending promise and stops the motion.

---

## 15. Default constants

```ts
const DEFAULTS = {
  zoom:    { MIN: 0.02, MAX: 40 },
  fit:     { padding: 48, mode: "scale-down" as const, maxAutoZoom: 4 },
  duration:{ baseMs: 220, travelMs: 520, zoomMs: 90, maxOctaves: 4, minMs: 180, maxMs: 900 },
  easing:  { focus: "inOutCubic", retarget: "outQuint", annotationPop: "outBack" },
  spring:  { response: 380, dampingRatio: 1 },   // ms, critical
  timeline:{ stagger: 90, hold: 0 },
  ticker:  { maxFrameMs: 64 },
  render:  { nonScalingStroke: false, snapOnSettle: true },
};
```

---

## 16. Implementation order (suggested)

1. `Camera`, `Viewport`, `worldToScreen`/`screenToWorld`/`toMatrix`/`applyTransform` (§3–4) — static camera renders.
2. `cameraForBounds`, `zoomAbout`, `panBy` (§5) + wire `focus`/`fitAll`/wheel/drag with `animate:false` — instant navigation.
3. `interpolateCamera` (§6) + `Easings` (§7) + `computeDuration` (§8) + `Tween` + `Ticker` (§9) — animated focus/fit. This is the "magic move" milestone.
4. Settle-commit crispness (§12).
5. `Spring` + interruption policy (§10, §14) — interaction polish.
6. `TimelinePlayer` + annotation cues (§13).

Every layer above sits behind the `CameraController` interface (§11), so the syntax/plugin layers and the interactive editor consume one stable surface.

---

Relevant reference files consulted (for math alignment): `/Users/vivmagarwal/Work/edodo-draw/reference/excalidraw/packages/excalidraw/viewport.ts` (`interpolateViewport`, `zoomValueToFitBoundsOnViewport`, `centerScrollOn`) and `/Users/vivmagarwal/Work/edodo-draw/reference/excalidraw/packages/excalidraw/scene/zoom.ts` (`getStateForZoom`). The magic-move interpolation in §6 is the center-anchored re-derivation of Excalidraw's `interpolateViewport`; the fit solve in §5 mirrors `zoomToFitBounds` with added per-side insets.