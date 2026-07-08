<h1 align="center">✎ EDodoDraw</h1>
<p align="center"><i>Diagrams as code — with the Excalidraw hand-drawn soul.</i></p>

EDodoDraw turns a small, LLM-friendly text language into beautiful hand-drawn diagrams, then lets you **choreograph** them (magic-move camera, step-by-step presentations) and **annotate** them (highlights, arrows, callouts) — in code *or* live, with everything round-trippable back to code.

```edd
scene {
  layout dag { direction: down }
  ellipse    hello "Hello 👋"                 { fill: yellow }
  rect       idea  "Diagrams as CODE"         { fill: blue }
  round-rect vibe  "…with the Excalidraw vibe" { fill: green }
  hello --> idea --> vibe
  vibe  ~> hello "loop"        // ~>  == an animated flowing arrow
}
```

## Why it exists

Excalidraw is a joy to draw *by hand*. EDodoDraw is a joy to drive *by code* — while keeping the same pleasant look. It is built from the ground up (no Excalidraw runtime baggage), reusing only the good primitives: rough.js for strokes, dagre for layout, the Virgil/Excalifont hand-drawn font, and `@excalidraw/mermaid-to-excalidraw` for import.

## Features

- **100% code → diagram.** The primary goal. A robust DSL (`lexer → parser → compiler`) with great error messages.
- **First-class Mermaid.** Paste `mermaid """ … """`; ids are preserved so you can choreograph and annotate imported diagrams.
- **Magic-move camera.** `camera focus [db, cache] zoom 1.7` — smooth, interruptible, spring-eased. Pan/zoom by mouse too.
- **Timeline presentations.** A `timeline` of `beat`s turns a static diagram into a guided walkthrough.
- **Annotations, scripted + live.** Highlight / underline / box / circle / point-at / callout / spotlight. Draw them with the toolbar, then **commit to code**.
- **More animated arrows** than Excalidraw: flow, dash-march, draw-on, comet, gradient-flow, electric, pulse.
- **15+ hand-drawn shapes** + a **plugin registry** to add your own without touching the core.
- **Export** to self-contained SVG (font embedded), PNG, or JSON.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5273
npm test
```

Open the app, pick an example (Welcome · Flowchart · Architecture · Animated Arrows · Mermaid), and edit the code on the left — the diagram updates live.

## Docs

Start with **[docs/DSL_LANGUAGE_GUIDE.md](docs/DSL_LANGUAGE_GUIDE.md)**. Architecture and feature guides are in [`docs/`](docs/); AI-agent guidance is in [CLAUDE.md](CLAUDE.md).

## License

The bundled fonts (Virgil, Excalifont) are under the SIL Open Font License. See `public/fonts/`.
