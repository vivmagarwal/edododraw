import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command }) => ({
  // Relative base so the built SPA works on GitHub Pages under /edododraw/
  // (and anywhere else); dev serves from root.
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@engine": fileURLToPath(new URL("./src/engine", import.meta.url)),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    watch: {
      // never watch the reference clones (excalidraw/mermaid source we vendored for study)
      ignored: ["**/reference/**"],
    },
  },
  optimizeDeps: {
    // restrict the dep scanner to our own entry so it does not crawl the
    // reference/ clones (which import packages we haven't installed).
    entries: ["index.html"],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
}));
