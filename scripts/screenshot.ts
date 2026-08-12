// Headless per-locale screenshots of the app's screens, through the dev
// server and the Tauri-mocking harness (screenshot.html) — WebKit, the same
// engine as the app's webview, so fonts and layout match the real thing.
//
// Usage: bun run screenshot [scenario ...] [--out <root>]
// Scenarios default to all; each shot lands at
// <root>/<locale>/screenshots/<scenario>.png (default root: site/public, so
// the docs can reference /{locale}/screenshots/<scenario>.png) — the
// settings window's 640×792 logical at 2x unless the scenario overrides,
// light theme.
//
// Prerequisite once: `bunx playwright install webkit`. A dev server on :1420
// is reused when already running, started (and stopped) otherwise.
/* oxlint-disable no-await-in-loop -- deliberately sequential: the dev-server
   poll must wait between probes, and shots are taken one page at a time so
   the output order is deterministic and WebKit stays light. */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { webkit } from "playwright";
import { LOCALES } from "../src/lib/messages/index.ts";
import { SCREENSHOT_SCENARIOS } from "../src/lib/screenshot-scenarios.ts";

const DEV_URL = "http://localhost:1420";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outRoot =
  outIndex === -1 || args[outIndex + 1] === undefined
    ? join(import.meta.dirname, "..", "site", "public")
    : (args[outIndex + 1] as string);
const requested = outIndex === -1 ? args : args.toSpliced(outIndex, 2);
const names = requested.length > 0 ? requested : Object.keys(SCREENSHOT_SCENARIOS);
for (const name of names) {
  if (!(name in SCREENSHOT_SCENARIOS)) {
    console.error(
      `unknown scenario "${name}" — known: ${Object.keys(SCREENSHOT_SCENARIOS).join(", ")}`,
    );
    process.exit(1);
  }
}

async function devServerRunning(): Promise<boolean> {
  try {
    await fetch(`${DEV_URL}/screenshot.html`, { method: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

let devServer: ChildProcess | undefined;
if (await devServerRunning()) {
  console.log("reusing the running dev server");
} else {
  devServer = spawn("bun", ["run", "dev"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 40 && !(await devServerRunning()); attempt += 1) {
    await sleep(250);
  }
}

// The settings window minus its title bar; a scenario override covers other
// windows (the popup, About).
const DEFAULT_VIEWPORT = { width: 640, height: 792 };

const browser = await webkit.launch();
const scenarios = Object.entries(SCREENSHOT_SCENARIOS).filter(([name]) => names.includes(name));
for (const [name, scenario] of scenarios) {
  const context = await browser.newContext({
    viewport: scenario.viewport ?? DEFAULT_VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  for (const { value } of LOCALES) {
    const query = new URLSearchParams({ locale: value, ...scenario.params });
    const page = await context.newPage();
    await page.goto(`${DEV_URL}/screenshot.html?${query.toString()}`, {
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

await browser.close();
devServer?.kill();
console.log(`shots under ${outRoot}`);
