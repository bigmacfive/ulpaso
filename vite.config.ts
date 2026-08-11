import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  plugins: [solid()],
  resolve: {
    conditions: ["solid"],
    alias: { "~": fileURLToPath(new URL("src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@codemirror/")) return "editor-codemirror";
          if (id.includes("node_modules/highlight.js/")) return "editor-highlight";
          if (id.includes("node_modules/prosekit/") || id.includes("node_modules/prosemirror-")) {
            return "editor-prosemirror";
          }
        },
      },
      onwarn(warning, warn) {
        const isBundledClientDirective = warning.code === "MODULE_LEVEL_DIRECTIVE"
          && warning.message.includes('"use client"')
          && warning.id?.includes("node_modules/");
        if (isBundledClientDirective) return;
        warn(warning);
      },
    },
  },
});
