import { EdodoDrawView } from "../../lib/react.js";
import { navigate, openInPlayground } from "../router.js";
import { useResolvedTheme } from "../useTheme.js";

const HERO = `scene {
  layout dag { direction: right, gap: 70 }
  ellipse    code "Your code"     { fill: yellow }
  round-rect edd  "EDodoDraw"     { fill: violet }
  rect       out  "Beautiful\\ndiagram" { fill: green }
  code --> edd "compile"
  edd  ~> out  "render"
}`;

const FEATURES = [
  { icon: "⌨️", title: "100% code → diagram", body: "A robust DSL with great error messages. Everything is text — perfect for LLMs, version control, and automation." },
  { icon: "✎", title: "Excalidraw hand-drawn look", body: "rough.js strokes + the Virgil font, embedded so it just works. 15+ shapes with that pleasant sketchy vibe." },
  { icon: "🎥", title: "Magic-move camera", body: "Focus, zoom, and pan any element with smooth spring transitions. Build guided presentations with a timeline of beats." },
  { icon: "🖍", title: "Annotations, live or in code", body: "Highlight, underline, circle, point-at, callout, spotlight — draw them in real time, then commit them back to code." },
  { icon: "➡️", title: "Animated arrows", body: "Seven flowing connector styles (flow, comet, gradient, electric…) that Excalidraw doesn't have." },
  { icon: "🧩", title: "Mermaid + plugins", body: "Import raw Mermaid and choreograph it. Register custom shapes, arrows, and annotations without touching the core." },
];

export function Home() {
  const theme = useResolvedTheme();
  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-badge">diagrams as code</div>
          <h1>
            Draw diagrams by <span className="accent">writing</span>, not dragging.
          </h1>
          <p>
            EDodoDraw is a 100% code-to-diagram engine with the Excalidraw hand-drawn soul — plus a magic-move camera,
            real-time annotations, animated arrows, and first-class Mermaid import.
          </p>
          <div className="hero-cta">
            <button className="btn primary" onClick={() => navigate("/playground")}>Open the playground</button>
            <button className="btn" onClick={() => navigate("/gallery")}>See the gallery</button>
            <a className="btn ghost" href="https://github.com/vivmagarwal/edododraw" target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
          <div className="hero-install">
            <code>npm i edododraw</code>
            <a className="hero-llms" href={`${import.meta.env.BASE_URL}llms-full.txt`} target="_blank" rel="noreferrer" title="Every doc + example in one plain-text file — paste it into any LLM">
              📄 llms-full.txt
            </a>
          </div>
        </div>
        <div className="hero-demo">
          <div className="hero-demo-canvas">
            <EdodoDrawView source={HERO} interactive grid colorScheme={theme} />
          </div>
          <button className="hero-demo-edit" onClick={() => openInPlayground(HERO)}>Edit this ↗</button>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="home-cta">
        <h2>See it, then build with it.</h2>
        <p>Explore every feature live in the gallery, read the guides, and embed EDodoDraw in your own app with one small class.</p>
        <div className="hero-cta">
          <button className="btn primary" onClick={() => navigate("/gallery")}>Live gallery</button>
          <button className="btn" onClick={() => navigate("/docs/language")}>Read the docs</button>
          <button className="btn" onClick={() => navigate("/docs/integration")}>Embed it</button>
        </div>
      </section>
    </div>
  );
}
