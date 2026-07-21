import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @tauri-apps/cli launches Vite, so the config is tuned for the Tauri dev flow:
// a fixed port, no screen clearing, and ignoring the Rust source tree.
export default defineConfig({
  // React Compiler runs as a Babel preset over the same files @vitejs/plugin-react
  // handles; it auto-memoizes components and hooks at build time so we don't need
  // to reach for useMemo / useCallback / React.memo by hand.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
