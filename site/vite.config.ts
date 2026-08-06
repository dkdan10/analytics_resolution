import { defineConfig } from "vite";

// Relative base so the same build runs from GitHub Pages and from a local
// file server on the presentation laptop.
export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
