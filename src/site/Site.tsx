import { lazy, Suspense } from "react";
import { navigate, useHashRoute } from "./router.js";
import { Home } from "./pages/Home.js";
import { Gallery } from "./pages/Gallery.js";
import { Visualizations } from "./pages/Visualizations.js";
import { VizDetail } from "./pages/VizDetail.js";
import { Styles } from "./pages/Styles.js";
import { DocsPage } from "./pages/DocsPage.js";
import "./site.css";

// The playground is heavier (editor + engine) — load it lazily.
const Playground = lazy(() => import("../app/App.js"));

const NAV = [
  { route: "/", label: "Home" },
  { route: "/playground", label: "Playground" },
  { route: "/visualizations", label: "Visualizations" },
  { route: "/styles", label: "Styles" },
  { route: "/gallery", label: "Gallery" },
  { route: "/docs/language", label: "Docs" },
];

export default function Site() {
  const route = useHashRoute();
  const isPlayground = route.startsWith("/playground");

  return (
    <div className="site">
      <header className="site-nav">
        <a
          className="site-brand"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="site-logo">✎</span> EDodoDraw
        </a>
        <nav className="site-links">
          {NAV.map((n) => {
            const active = n.route === "/" ? route === "/" : route.startsWith(n.route.split("/").slice(0, 2).join("/"));
            return (
              <a
                key={n.route}
                href={`#${n.route}`}
                className={active ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(n.route);
                }}
              >
                {n.label}
              </a>
            );
          })}
          <a className="site-ext" href="https://github.com/vivmagarwal/edododraw" target="_blank" rel="noreferrer">GitHub ↗</a>
          <a className="site-ext" href="https://www.npmjs.com/package/edododraw" target="_blank" rel="noreferrer">npm ↗</a>
        </nav>
      </header>

      <main className={`site-main${isPlayground ? " full" : ""}`}>
        <Suspense fallback={<div className="site-loading">Loading…</div>}>
          <Route route={route} />
        </Suspense>
      </main>
    </div>
  );
}

function Route({ route }: { route: string }) {
  if (route === "/" || route === "") return <Home />;
  if (route.startsWith("/playground")) return <Playground />;
  if (route.startsWith("/visualizations")) {
    const type = route.split("/")[2];
    return type ? <VizDetail type={type} /> : <Visualizations />;
  }
  if (route.startsWith("/styles")) return <Styles />;
  if (route.startsWith("/gallery")) return <Gallery />;
  if (route.startsWith("/docs")) {
    const slug = route.split("/")[2];
    return <DocsPage slug={slug} />;
  }
  return <Home />;
}
