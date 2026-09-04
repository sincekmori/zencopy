// What the two drivers of the screenshot harness share — `bun run screenshot`
// (scripts/screenshot.ts) and `bun run demo-video` (scripts/demo-video.ts):
// the CLI flag syntax, the dev server on :1420 the harness is served by
// (reused when one is running, started and stopped otherwise), the locale
// filter, the harness page's URL, and the seed of its driver global.
/* oxlint-disable no-await-in-loop, no-underscore-dangle -- the dev-server
   poll must wait between probes; the dunder name is the harness's driver
   global, spoken as it is. */
import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { BrowserContext } from "playwright";
import { LOCALES } from "../src/lib/messages/index.ts";

/** The repository root. */
export const ROOT = join(import.meta.dirname, "..");
const DEV_URL = "http://localhost:1420";
/** The device pixel ratio the shots and frames are taken at: 2×, what the
 *  app's webview renders at on the displays the docs are read on. */
export const DEVICE_SCALE = 2;

/** Consume a `--flag value` pair from `args`, returning the value. */
export function takeFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || args[index + 1] === undefined) {
    return undefined;
  }
  const [, value] = args.splice(index, 2);
  return value;
}

/** Consume a bare `--flag` from `args`, returning whether it was there. */
export function takeSwitch(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

/** The app locales a `--locale` filter selects — all of them without one;
 *  a code the app does not know is fatal. */
export function localesMatching(only: string | undefined): string[] {
  const all = LOCALES.map((entry) => entry.value);
  const matching = all.filter(
    (value) => only === undefined || value.toLowerCase() === only.toLowerCase(),
  );
  if (matching.length === 0) {
    console.error(`unknown locale "${only}" — known: ${all.join(", ")}`);
    process.exit(1);
  }
  return matching;
}

/** The harness page for `params` (`window`, `locale`, `screenshot`, … —
 *  see src/screenshot/harness.ts). */
export function harnessUrl(params: Record<string, string>): string {
  return `${DEV_URL}/screenshot.html?${new URLSearchParams(params).toString()}`;
}

async function devServerRunning(): Promise<boolean> {
  try {
    await fetch(`${DEV_URL}/screenshot.html`, { method: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

/** The dev server the harness is served by: reused when one is running,
 *  started otherwise — in its own process group, so stopping it (the
 *  returned function, and Ctrl-C) also stops the vite it spawns. */
export async function ensureDevServer(): Promise<() => void> {
  if (await devServerRunning()) {
    console.log("reusing the running dev server");
    return () => {
      // Not ours to stop.
    };
  }
  const server: ChildProcess = spawn("bun", ["run", "dev"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  const stop = (): void => {
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  };
  process.on("SIGINT", () => {
    stop();
    process.exit(130);
  });
  for (let attempt = 0; attempt < 80 && !(await devServerRunning()); attempt += 1) {
    await sleep(250);
  }
  return stop;
}

/** Seed the harness's driver global (`globalThis.__zencopyHarness`) before
 *  the page's own scripts run — the channel for what must not ride a URL:
 *  a catalog holding an API key, a replay. */
export async function seedHarness(context: BrowserContext, seed: unknown): Promise<void> {
  await context.addInitScript((value: unknown) => {
    (globalThis as { __zencopyHarness?: unknown }).__zencopyHarness = value;
  }, seed);
}
