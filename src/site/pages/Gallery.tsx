import { CATEGORIES, DEMOS } from "../demos.js";
import { DemoCard } from "../DemoCard.js";

export function Gallery() {
  return (
    <div className="page gallery">
      <div className="page-head">
        <h1>Live gallery</h1>
        <p>Every feature, running live. Pan and zoom any diagram, press Play on the presentations, or open a demo in the playground to edit it.</p>
      </div>
      {CATEGORIES.map((cat) => {
        const demos = DEMOS.filter((d) => d.category === cat);
        if (!demos.length) return null;
        return (
          <section key={cat} className="gallery-section">
            <h2 id={cat.replace(/\s+/g, "-").toLowerCase()}>{cat}</h2>
            <div className="demo-grid">
              {demos.map((d) => (
                <DemoCard key={d.id} demo={d} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
