# Import & Export Guide

## Mermaid import

EDodoDraw imports raw Mermaid and re-renders it in the hand-drawn style, **preserving node ids** so you can choreograph and annotate the result.

```edd
mermaid """
flowchart LR
  app[App Servers] --> otel[OTel Collector]
  otel --> prom[Prometheus]
  prom --> grafana[Grafana]
"""

timeline walkthrough {
  beat collect "Collection" {
    camera focus [app, otel] zoom 1.7        // references the mermaid ids
    annotate { point-at otel "single ingestion point" { from: s } }
  }
}
```

### How it works

`src/engine/import/mermaid.ts` wraps `@excalidraw/mermaid-to-excalidraw`. Mermaid rendering needs the browser, so import is **async and app-side**:

1. `extractMermaidBlocks(source)` pulls the `mermaid """ … """` bodies (pure string fn — unit-testable).
2. `convertMermaid(body, mode = "light")` runs the Mermaid → Excalidraw-skeleton converter and maps each element to Scene IR: vertices → pinned nodes (mermaid id preserved), arrows → edges bound by `start.id`/`end.id`. The `mode` (`"light"` | `"dark"`) is the active color scheme, so imported nodes/edges are created for that theme; the facade passes `scene.theme.mode` automatically.
3. `injectMermaid(scene, fragment)` merges the fragment into the compiled scene, so `id:::class` re-tags and timeline/annotate references resolve against the imported nodes.

Supported: flowcharts (and other mermaid graph types the converter emits as elements). The synchronous DSL compiler stays DOM-free; only the app awaits conversion.

## Export

Top toolbar, in the **export:** group (left side, by the examples picker): **SVG · PNG · JSON · Copy**. SVG/PNG/JSON are implemented in `src/engine/export.ts` (`downloadSVG`/`downloadPNG`/`downloadJSON`); **Copy** writes the `.edd` source to the clipboard directly in the app (`src/app/App.tsx`). (The top-right holds the theme toggle and the Show code / Focus-mode button.)

| Format | Notes |
|---|---|
| **SVG** | Standalone, framed to the content bbox (independent of the current camera). The hand-drawn font is **embedded as base64**, so the file renders correctly anywhere. |
| **PNG** | The SVG rasterized to a 2× canvas. |
| **JSON** | The full `Scene` IR — round-trippable, inspectable. |
| **Copy** | The `.edd` source to the clipboard. |

```ts
await downloadSVG(renderer, scene);
await downloadPNG(renderer, scene);
downloadJSON(scene);
```

Screen-space overlays (player bar, selection outlines, hidden elements) are stripped from exports; the background is the scene/theme background.
