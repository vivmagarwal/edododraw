import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Site from "./site/Site.js";
import { ensureSiteFonts } from "./site/fonts.js";

ensureSiteFonts();
// The saved theme is applied by an inline <head> script in index.html (before
// the stylesheet paints, so there's no flash); the playground's toggle keeps it live.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
