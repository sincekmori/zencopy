// What the two drivers of the screenshot harness share — `bun run screenshot`
// (scripts/screenshot.ts) and `bun run demo-video` (scripts/demo-video.ts):
// the CLI flag syntax, the dev server the harness is served by (the run's
// own, in this process), the locale filter, the harness page's URL, and the
// seed of its driver global.
/* oxlint-disable no-underscore-dangle -- the dunder name is the harness's
   driver global, spoken as it is. */
import { join } from "node:path";
import type { BrowserContext } from "playwright";
import { createServer } from "vite";
import { LOCALES } from "../src/lib/messages/index.ts";

/** The repository root. */
export const ROOT = join(import.meta.dirname, "..");
/** Where the run's dev server starts looking for a free port — past the
 *  app's own :1420, which a `tauri dev` beside the run keeps. */
const FIRST_PORT = 1430;
/** The address the run's dev server listens on, spelled out. Under
 *  `localhost` two runs can hold the same port number at once — one on ::1,
 *  one on 127.0.0.1, neither seeing the other as taken — and a browser sent
 *  to `localhost` reaches whichever answers first: the other run's server,
 *  with the other run's files. */
const LOOPBACK = "127.0.0.1";
/** The served harness's origin, while a run serves one. */
let origin: string | undefined;

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
 *  see src/screenshot/harness.ts), on the server {@link serveHarness}
 *  started. */
export function harnessUrl(params: Record<string, string>): string {
  if (origin === undefined) {
    throw new Error("the harness is not being served — serveHarness() comes first");
  }
  return `${origin}/screenshot.html?${new URLSearchParams(params).toString()}`;
}

/** Serve the harness for this run: a Vite dev server of its own, in this
 *  process, on {@link LOOPBACK}'s first free port from {@link FIRST_PORT}.
 *  Never a server that happens to be running: one that has served the
 *  harness before holds its modules — the prompts and rules among them — as
 *  they were then, and whatever answers on the app's port may be another
 *  project altogether. It watches nothing and pushes nothing to the page, so
 *  a file saved in the middle of a run cannot reload a page about to be
 *  shot. It ends with the process; the returned function closes it sooner. */
export async function serveHarness(): Promise<() => Promise<void>> {
  const server = await createServer({
    root: ROOT,
    logLevel: "error",
    // oxlint-disable-next-line unicorn/no-null -- Vite's own spelling of "watch nothing"
    server: { host: LOOPBACK, port: FIRST_PORT, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  const [local] = server.resolvedUrls?.local ?? [];
  if (local === undefined) {
    await server.close();
    throw new Error("the harness's dev server has no local address");
  }
  ({ origin } = new URL(local));
  return async () => {
    origin = undefined;
    await server.close();
  };
}

/** Seed the harness's driver global (`globalThis.__zencopyHarness`) before
 *  the page's own scripts run — the channel for what must not ride a URL:
 *  a catalog holding an API key, a replay. */
export async function seedHarness(context: BrowserContext, seed: unknown): Promise<void> {
  await context.addInitScript((value: unknown) => {
    (globalThis as { __zencopyHarness?: unknown }).__zencopyHarness = value;
  }, seed);
}
