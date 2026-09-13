// Headless per-locale screenshots of the app's screens, through the dev
// server and the Tauri-mocking harness (screenshot.html) — WebKit, the same
// engine as the app's webview, so fonts and layout match the real thing.
//
// Usage: bun run screenshot [scenario ...] [--out <root>] [--locale <code>]
// Scenarios default to all; each shot lands at
// <root>/<locale>/screenshots/<scenario>.png (default root: site/public, so
// the docs can reference /{locale}/screenshots/<scenario>.png) — the
// settings window's 640×792 logical at 2x unless the scenario overrides,
// light theme. Every scenario is rendered three times — as a visitor of
// unknown OS (the key chord spelled Ctrl/⌘, the neutral form the site's
// animation and OS wording fall back to), as Windows (Ctrl + C + C) and as
// macOS (⌘ + C + C; the app spells the chord off the user agent): a scenario
// flagged `os` lands three times, the neutral render as <scenario>.png and
// the others as <scenario>.ctrl.png and <scenario>.cmd.png, which the docs
// swap in for a visitor whose OS they know — even where a locale's renders
// happen to coincide (a dialog can cover the line that differs) — and one
// not flagged must render identically in every locale, or the runner fails
// naming the shot to flag.
//
// Prerequisite once: `bunx playwright install webkit`. A dev server on :1420
// is reused when already running, started (and stopped) otherwise.
/* oxlint-disable no-await-in-loop -- deliberately sequential: shots are taken
   one page at a time so the output order is deterministic and WebKit stays
   light. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, webkit } from "playwright";
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

/** The three renders: what the app reads its OS off (src/lib/platform.ts
 *  checks the user agent for "mac", and the harness may spell the modifier
 *  outright), and the file each lands in. The neutral one is the file the
 *  docs reference; the head script swaps in the other two by OS. */
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const RENDERS = [
  { os: "neutral", suffix: "", userAgent: WINDOWS_UA, params: { modifier: "Ctrl/⌘" } },
  { os: "ctrl", suffix: ".ctrl", userAgent: WINDOWS_UA, params: {} },
  {
    os: "cmd",
    suffix: ".cmd",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    params: {},
  },
] as const;

type Render = (typeof RENDERS)[number];
type Shots = Partial<Record<Render["os"], Buffer>>;

/** The verdict on one locale's renders of a scenario, and the files: the
 *  neutral render always, the OS cuts when the scenario carries the chord —
 *  a scenario that does not must render the same three times. */
function settle(shot: { name: string; os: boolean; value: string; shots: Shots }): void {
  const { name, os, value, shots } = shot;
  const neutral = shots.neutral;
  const missing = RENDERS.find((render) => shots[render.os] === undefined);
  if (neutral === undefined || missing !== undefined) {
    throw new Error(`${name}: the ${missing?.os ?? "neutral"} render is missing for ${value}`);
  }
  const differs = RENDERS.some((render) => !shots[render.os]?.equals(neutral));
  if (differs && !os) {
    throw new Error(
      `${value}/screenshots/${name}.png differs by OS — mark the scenario \`os: true\` in src/lib/screenshot-scenarios.ts`,
    );
  }
  const folder = value.toLowerCase();
  const dir = join(outRoot, folder, "screenshots");
  mkdirSync(dir, { recursive: true });
  for (const render of RENDERS) {
    const file = join(dir, `${name}${render.suffix}.png`);
    const png = shots[render.os];
    if (png !== undefined && (render.os === "neutral" || os)) {
      writeFileSync(file, png);
    } else {
      rmSync(file, { force: true });
    }
  }
  let note = "";
  if (os) {
    note = differs
      ? " (+ .ctrl.png, .cmd.png)"
      : " (+ .ctrl.png, .cmd.png — the same picture here)";
  }
  console.log(`ok ${folder}/screenshots/${name}.png${note}`);
}

/** One shot: the page loaded and settled, then captured. A load that idles
 *  out is tried once more on a fresh page — a long run has seen one hang in
 *  WebKit for no reason the dev server could name — and said so. */
async function shoot(context: BrowserContext, url: string): Promise<Buffer> {
  for (const attempt of [1, 2]) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(1200); // lazy chunks, fonts, dialog mounts
      return await page.screenshot({ caret: "hide", animations: "disabled" });
    } catch (error) {
      if (attempt === 2 || !(error instanceof Error && error.name === "TimeoutError")) {
        throw error;
      }
      console.log(`   retrying ${url} — the first load idled out`);
    } finally {
      await page.close();
    }
  }
  throw new Error(`unreachable: ${url}`);
}

const stopDevServer = await ensureDevServer();
try {
  const scenarios = Object.entries(SCREENSHOT_SCENARIOS).filter(([name]) => names.includes(name));
  for (const [name, scenario] of scenarios) {
    // A browser per scenario: a WebKit that has served a few dozen pages
    // has let a later load hang; fresh processes keep every run short.
    const browser = await webkit.launch();
    // All renders of every locale first, then the verdicts: the pictures
    // are compared byte for byte, which the same engine drawing the same
    // page makes exact (the caret and animations are held still).
    const shots = new Map<string, Shots>();
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
        const url = harnessUrl({ locale: value, ...scenario.params, ...render.params });
        shots.set(value, { ...shots.get(value), [render.os]: await shoot(context, url) });
      }
      await context.close();
    }
    await browser.close();
    for (const value of locales) {
      settle({ name, os: scenario.os === true, value, shots: shots.get(value) ?? {} });
    }
  }
} finally {
  stopDevServer();
}
console.log(`shots under ${outRoot}`);
