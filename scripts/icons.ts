// Renders src-tauri/icons/ from src/lib/brand.ts: the app icon set Tauri
// bundles and embeds (`tauri icon`, from the icon SVG) and the tray glyph
// (tray.png, `include_image!` in lib.rs — `tauri icon --png 128` of the tray
// SVG, so one renderer draws every Tauri-side icon). The directory is not
// committed: `bun run build` runs this first and `tauri dev` runs it before
// the dev server, so the Rust build always embeds the brand as the module
// draws it, and nothing else has to be kept in step.
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { iconSvg, traySvg } from "../src/lib/brand.ts";

const ROOT = join(import.meta.dirname, "..");
const ICONS = join(ROOT, "src-tauri", "icons");
const run = promisify(execFile);
// The Tauri CLI through the bun that runs this script (a package bin, so no
// PATH assumptions on any OS).
const tauri = async (args: string[]): Promise<void> => {
  await run(process.execPath, ["tauri", ...args], { cwd: ROOT });
};

const work = await mkdtemp(join(tmpdir(), "zencopy-icons-"));
try {
  const icon = join(work, "icon.svg");
  const tray = join(work, "tray.svg");
  await Promise.all([writeFile(icon, iconSvg()), writeFile(tray, traySvg())]);
  await rm(ICONS, { recursive: true, force: true });
  await tauri(["icon", icon, "-o", ICONS]);
  // The mobile sets are not ours to ship.
  await Promise.all(
    ["android", "ios"].map((dir) => rm(join(ICONS, dir), { recursive: true, force: true })),
  );
  await tauri(["icon", tray, "-o", join(work, "tray"), "--png", "128"]);
  await copyFile(join(work, "tray", "128x128.png"), join(ICONS, "tray.png"));
  console.log(`wrote ${relative(ROOT, ICONS)}/ (the app icon set and tray.png)`);
} finally {
  await rm(work, { recursive: true, force: true });
}
