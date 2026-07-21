// Renders every committed raster/derived brand asset from the SVG sources in
// the repo root's src/assets/ (the single home of the brand; see memo.md §6).
// Run `bun run brand` after editing any of those SVGs — the outputs are
// committed, so the site build itself stays raster-free.
// Build-time script (runs under Bun), so a Node builtin is fine here.
// oxlint-disable-next-line import/no-nodejs-modules
import { copyFile } from "node:fs/promises";
import sharp from "sharp";

const rasterJobs = [
  // Social-share card (og.svg is the one site-owned SVG source).
  { src: "src/assets/og.svg", out: "public/og.png", width: 1200, height: 630 },
  // iOS home-screen icon.
  {
    src: "../src/assets/zencopy-icon.svg",
    out: "public/apple-touch-icon.png",
    width: 180,
    height: 180,
  },
  // System tray / menu-bar icon (white glyph; macOS re-tints it as a
  // template image). Embedded into the app via include_image! in lib.rs.
  {
    src: "../src/assets/zencopy-tray.svg",
    out: "../src-tauri/icons/tray.png",
    width: 128,
    height: 128,
  },
];

await Promise.all([
  ...rasterJobs.map(async ({ src, out, width, height }) => {
    await sharp(src, { density: 288 }).resize(width, height).png().toFile(out);
    console.log(`wrote ${out} (${width}x${height})`);
  }),
  // The site favicon is the app icon, verbatim — copied so public/ needs no
  // hand-maintained duplicate.
  (async () => {
    await copyFile("../src/assets/zencopy-icon.svg", "public/favicon.svg");
    console.log("wrote public/favicon.svg (copy of src/assets/zencopy-icon.svg)");
  })(),
]);
