# Design notes (historical — NOT documentation)

> ⚠️ These are the original design explorations written *before* the engine was
> built. They are **more ambitious than what shipped** and are **not accurate**
> as documentation. They are kept only as an engineering record of the reasoning
> and trade-offs behind the design.
>
> **The single source of truth for how EDodoDraw actually works is `docs/`**,
> published at **https://vivmagarwal.github.io/edododraw/**. If anything here
> conflicts with `docs/`, `docs/` (and the site) win.

| File | What it explored |
|---|---|
| `DSL_SPEC_SYNTHESIS.md` | The full `.edd` language design (a superset of what was implemented). |
| `CAMERA_DESIGN.md` | The magic-move camera + timeline design. |
| `ANNOTATION_DESIGN.md` | The scripted + real-time annotation design. |

To see what's really implemented, read the guides in [`../docs/`](../docs/) or the live site.
