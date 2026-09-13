// Headless per-locale screenshots of the app's screens, through the dev
// server and the Tauri-mocking harness (screenshot.html) — WebKit, the same
// engine as the app's webview, so fonts and layout match the real thing.
//
// Usage: bun run screenshot [scenario ...] [--out <root>] [--locale <code>]
// Scenarios default to all; each shot lands at
// <root>/<locale>/screenshots/<scenario>.png (default root: site/public, so
// the docs can reference /{locale}/screenshots/<scenario>.png) — the
// settings window's 640×792 logical at 2x unless the scenario overrides,
// light theme. Every scenario is rendered as Windows and as macOS (the app
// spells the key chord off the user agent): a scenario flagged `os` lands
// twice, the macOS render as <scenario>.mac.png, which the docs swap in on a
// Mac — even where a locale's two renders happen to coincide (a dialog can
// cover the line that differs) — and one not flagged must render identically
// in every locale, or the runner fails naming the shot to flag.
//
// Prerequisite once: `bunx playwright install webkit`. A dev server on :1420
// is reused when already running, started (and stopped) otherwise.
/* oxlint-disable no-await-in-loop -- deliberately sequential: shots are taken
   one page at a time so the output order is deterministic and WebKit stays
   light. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { webkit } from "playwright";
import { SCREENSHOT_SCENARIOS } from "../src/lib/screenshot-scenarios.ts";
import {
  DEVICE_SCALE,
  ensureDevServer,
  harnessUrl,
  localesMatching,
  ROOT,
  seedHarness,
  takeFlag,
} from "./harness-driver.ts";

const args = process.argv.slice(2);
const outRoot = takeFlag(args, "--out") ?? join(ROOT, "site", "public");
const locales = localesMatching(takeFlag(args, "--locale"));
const names = args.length > 0 ? args : Object.keys(SCREENSHOT_SCENARIOS);
for (const name of names) {
  if (!(name in SCREENSHOT_SCENARIOS)) {
    console.error(
      `unknown scenario "${name}" — known: ${Object.keys(SCREENSHOT_SCENARIOS).join(", ")}`,
    );
    process.exit(1);
  }
}

// The settings window minus its title bar; a scenario override covers other
// windows (the popup, About).
const DEFAULT_VIEWPORT = { width: 640, height: 792 };

/** The two OS renders: what the app reads its OS off (src/lib/platform.ts
 *  checks the user agent for "mac"), and the file each lands in. */
const RENDERS = [
  {
    os: "windows",
    suffix: "",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  },
  {
    os: "mac",
    suffix: ".mac",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  },
] as const;

const stopDevServer = await ensureDevServer();
const browser = await webkit.launch();
try {
  const scenarios = Object.entries(SCREENSHOT_SCENARIOS).filter(([name]) => names.includes(name));
  for (const [name, scenario] of scenarios) {
    // Both renders of every locale first, then the verdicts: the pictures
    // are compared byte for byte, which the same engine drawing the same
    // page makes exact (the caret and animations are held still).
    const shots = new Map<string, Partial<Record<(typeof RENDERS)[number]["os"], Buffer>>>();
    for (const render of RENDERS) {
      const context = await browser.newContext({
        viewport: scenario.viewport ?? DEFAULT_VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE,
        colorScheme: "light",
        userAgent: render.userAgent,
      });
      if (scenario.catalog !== undefined) {
        await seedHarness(context, { catalog: scenario.catalog });
      }
      for (const value of locales) {
        const page = await context.newPage();
        await page.goto(harnessUrl({ locale: value, ...scenario.params }), {
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(1200); // lazy chunks, fonts, dialog mounts
        const shot = await page.screenshot({ caret: "hide", animations: "disabled" });
        shots.set(value, { ...shots.get(value), [render.os]: shot });
        await page.close();
      }
      await context.close();
    }
    for (const value of locales) {
      const pair = shots.get(value);
      if (pair?.windows === undefined || pair.mac === undefined) {
        throw new Error(`${name}: a render is missing for ${value}`);
      }
      const differs = !pair.windows.equals(pair.mac);
      if (differs && scenario.os !== true) {
        throw new Error(
          `${value}/screenshots/${name}.png differs between Windows and macOS — mark the scenario \`os: true\` in src/lib/screenshot-scenarios.ts`,
        );
      }
      const folder = value.toLowerCase();
      const dir = join(outRoot, folder, "screenshots");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.png`), pair.windows);
      const mac = join(dir, `${name}.mac.png`);
      if (scenario.os === true) {
        writeFileSync(mac, pair.mac);
      } else {
        rmSync(mac, { force: true });
      }
      let note = "";
      if (scenario.os === true) {
        note = differs ? " (+ .mac.png)" : " (+ .mac.png, the same picture here)";
      }
      console.log(`ok ${folder}/screenshots/${name}.png${note}`);
    }
  }
} finally {
  await browser.close();
  stopDevServer();
}
console.log(`shots under ${outRoot}`);
