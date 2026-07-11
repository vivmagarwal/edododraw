# Camera & Timeline Guide

How EDodoDraw does "magic-move" — smooth, scriptable camera moves and step-by-step presentations.

## Architecture

The camera is a `{ cx, cy, zoom }` transform (world point centered in the viewport). It is applied as the SVG `transform` on the world `<g>`:

```
translate(vw/2, vh/2) · scale(zoom) · translate(-cx, -cy)
```

- **Math** — `src/engine/camera/fit.ts` (`cameraForBBox`: frame any bbox with padding).
- **Easing** — `src/engine/camera/easing.ts` (`linear ease ease-in ease-out ease-in-out back-out anticipate spring`; `spring` is a tuned overshoot for magic-move).
- **Controller** — `src/engine/camera/controller.ts` drives interruptible, retargetable rAF tweens. Position eases linearly; **zoom interpolates in log space** so fast/slow zooms feel natural. Duration auto-scales with travel distance + zoom ratio when not specified.

```ts
const controller = new CameraController(renderer);
await controller.fitAll(scene, { padding: 80 });           // frame everything
await controller.focus(scene, ["db", "cache"], { zoom: 1.7, easing: "spring" });
await controller.focusBBox({ minX, minY, maxX, maxY }, { zoom: 2 }); // frame an arbitrary world box
controller.zoomBy(1.2, screenPoint);   // wheel zoom around cursor (relative)
controller.panByScreen(dx, dy);         // drag pan
```

Mid-flight `animateTo` retargets smoothly from the current interpolated state — no snap.

### Numeric contracts

The behaviors an author or embedder can rely on (all from `controller.ts` / `fit.ts`):

| Contract | Value |
|---|---|
| Zoom = scale factor | `1.0` = 100% (1 world unit = 1 screen px); `zoom: 1.7` = 170%. |
| Wheel / `zoomBy` clamp | **0.05–8×** (5%–800%). |
| Fit clamp | `fitAll`/`focusBBox` cap at **2.5×**; `focus`'s *computed* framing caps at **4×**. |
| Explicit `zoom` | **Bypasses all clamps** — a passed `zoom` (DSL `camera … zoom N`, or `focus(..,{zoom})`) is applied as-is, so a beat can exceed the interactive limits. |
| Auto-duration | When `over`/`durationMs` is omitted: `clamp(420 + dist·0.12 + |ln(zoomTo/zoomFrom)|·320, 420, 1300)` ms. |
| Padding defaults | `fitAll` 80px, `focus`/`focusBBox` 90px, bare `cameraForBBox` 64px. |
| Default easing | Compiled DSL beats default to **`ease-in-out`** (via `mapEasing`); a raw programmatic `animateTo` with no `easing` defaults to **`spring`**. |

## Interaction (built into the canvas)

- **Wheel** → zoom around the cursor.
- **Drag** → pan.
- Any user gesture pauses the timeline player.

## Timeline player

`src/engine/timeline/player.ts` plays `scene.steps` (compiled from a `timeline { beat … }` block — see [DSL_LANGUAGE_GUIDE §10](DSL_LANGUAGE_GUIDE.md)). Each beat diffs against the running state:

| Channel | Rule |
|---|---|
| Camera | **Sticky** — a beat with no `camera` keeps the current one. |
| Visibility (`show`/`hide`) | **Sticky** until changed. |
| Reveal effect (`with fade-in`/`pop`/`draw-on`) | **Beat-scoped** — replayed each time the beat is entered (only when animating). |
| Annotations | **Beat-scoped** — replaced each beat (always-on `annotate` block persists underneath). |

API: `player.load(scene)`, `play()`, `pause()`, `next()`, `prev()`, `restart()`, `goto(i)`. It emits `PlayerState { index, total, caption, stepName, playing }` for the UI. **`index === -1`** is the home/overview state (before any beat; `stepName` is `"Overview"`) — `prev()` from beat 0 returns there and re-fits. Auto-advance uses each beat's `hold:` (default 3.2s).

```edd
timeline story {
  beat overview "All"  { camera fit-all over 800ms; narrate: "the system" }
  beat focus  "Detail" { camera focus [db, queue] zoom 1.7 ease spring; hold: 2s
                         annotate { spotlight [db, queue] { dim: 0.7 } } }
}
```

In the app, the bottom **player bar** shows Fit / Restart / Prev / Play / Next, the step indicator, and the caption. `⤢ Fit` reframes the whole diagram at any time.

## Frame-driven playback (pure step state)

The player is a thin rAF/clock loop over **pure functions** in
`src/engine/timeline/stepState.ts` — hosts that own time (video renderers,
scrubbers, bake pipelines) call these directly and drive the exact same
semantics with no clock or DOM:

```ts
import { stepStateAt, resolveCameraDirective, mixCameras, easingByName } from "edododraw";

const state = stepStateAt(scene, i);
// { hidden, annotations, revealFx, caption, camera, effectiveCamera, autoAdvanceMs, … }
// hidden        — sticky visibility through step i (same math as the player)
// annotations   — always-on + this beat's, in render order
// effectiveCamera — the directive in force (camera is sticky across beats)

const cam = resolveCameraDirective(scene, state.effectiveCamera, { w: 1920, h: 1080 });
// concrete { cx, cy, zoom } — same fit/focus math and padding defaults as the player

// interpolate a magic-move yourself (zoom mixes in log space, like the controller):
mixCameras(fromCam, toCam, easingByName("ease-in-out")(t));
```

`index -1` is the overview (nothing hidden, always-on annotations, fit-all).
Apply a state with `renderer.applyVisibility(new Set(state.hidden))` +
`annotationLayer.render(scene, state.annotations, false)` + `renderer.applyCamera(cam)` —
or in one call via the facade: `edd.applyStepState(edd.stepState(i))`. Pair with
`{ static: true }` (no wall-clock CSS) — see
[INTEGRATION_GUIDE §6](INTEGRATION_GUIDE.md) for the full video-pipeline recipe,
including `setRevealProgress()` for host-driven draw-on.
