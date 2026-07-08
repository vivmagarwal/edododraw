import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Site from "./site/Site.js";
import { ensureSiteFonts } from "./site/fonts.js";

ensureSiteFonts();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Site />
  </StrictMode>,
);
