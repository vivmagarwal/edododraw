import { defineConfig } from "vite";
import { isAbsolute } from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * Library build: bundles our own code into ESM entries and externalises every
 * dependency (react, roughjs, dagre, mermaid) so consumers resolve them via
 * their own package manager. Types are emitted separately by `tsc -p
 * tsconfig.lib.json`. Output → dist-lib/.
 */
export default defineConfig({
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    minify: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/lib/index.ts", import.meta.url)),
        react: fileURLToPath(new URL("./src/lib/react.tsx", import.meta.url)),
      },
      formats: ["es"],
    },
    rollupOptions: {
      // Externalise all bare (node_modules) imports; bundle only our own code.
      external: (id) => !id.startsWith(".") && !isAbsolute(id),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
