import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { iconSvg } from "./src/lib/brand.ts";

/** The dev server's tab icon: the app icon from the brand module, inlined
 *  into the page on the fly. The built app has no tab, so nothing ships. */
function devFavicon(): Plugin {
  return {
    name: "zencopy:dev-favicon",
    apply: "serve",
    transformIndexHtml: () => [
      {
        tag: "link",
        injectTo: "head",
        attrs: {
          rel: "icon",
          type: "image/svg+xml",
          href: `data:image/svg+xml,${encodeURIComponent(iconSvg())}`,
        },
      },
    ],
  };
}

// @tauri-apps/cli launches Vite, so the config is tuned for the Tauri dev flow:
// a fixed port, no screen clearing, and ignoring what the Rust build writes.
export default defineConfig({
  // React Compiler runs as a Babel preset over the same files @vitejs/plugin-react
  // handles; it auto-memoizes components and hooks at build time so we don't need
  // to reach for useMemo / useCallback / React.memo by hand.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), devFavicon()],
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
      // The Rust build's output only (a churn of thousands of files). The
      // rest of src-tauri is watched: the screenshot harness imports the
      // prompts, the rules and prompts.rs as text, and an edit to one must
      // reach a running dev server like any other.
      ignored: ["**/src-tauri/target/**", "**/src-tauri/gen/**"],
    },
  },
});
