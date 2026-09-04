// Headless per-locale screenshots of the app's screens, through the dev
// server and the Tauri-mocking harness (screenshot.html) — WebKit, the same
// engine as the app's webview, so fonts and layout match the real thing.
//
// Usage: bun run screenshot [scenario ...] [--out <root>] [--locale <code>]
// Scenarios default to all; each shot lands at
// <root>/<locale>/screenshots/<scenario>.png (default root: site/public, so
// the docs can reference /{locale}/screenshots/<scenario>.png) — the
// settings window's 640×792 logical at 2x unless the scenario overrides,
// light theme.
//
// Prerequisite once: `bunx playwright install webkit`. A dev server on :1420
// is reused when already running, started (and stopped) otherwise.
/* oxlint-disable no-await-in-loop -- deliberately sequential: shots are taken
   one page at a time so the output order is deterministic and WebKit stays
   light. */
import { mkdirSync } from "node:fs";
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

const stopDevServer = await ensureDevServer();
const browser = await webkit.launch();
try {
  const scenarios = Object.entries(SCREENSHOT_SCENARIOS).filter(([name]) => names.includes(name));
  for (const [name, scenario] of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport ?? DEFAULT_VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
      colorScheme: "light",
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
      const dir = join(outRoot, value.toLowerCase(), "screenshots");
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${name}.png`) });
      await page.close();
      console.log(`ok ${value.toLowerCase()}/screenshots/${name}.png`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  stopDevServer();
}
console.log(`shots under ${outRoot}`);
