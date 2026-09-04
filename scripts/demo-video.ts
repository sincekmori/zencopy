// The docs' demo videos, generated end to end — no screen recording per
// locale. A human records ONE template once (scripts/demo-video/template.mp4:
// the browser page being selected and copied twice, the popup appearing top
// right); everything the popup shows is then produced here: the popup is
// driven through the Tauri-mocking harness (screenshot.html) in headless
// WebKit, its window is captured as 2× frames with a transparent background
// (card, shadow, and all), and those frames become the videos — the first
// demo composited over the template from the moment its own popup appears
// (that popup is never seen: the recording covers it, shadow included), the
// rest over a plain backdrop, the popup alone.
//
// The model's answers are real once: `--record` runs the session against
// Gemini and keeps everything in scripts/demo-video/recordings/<locale>.json
// — the copied text, what was typed, each reply as text, and the model's
// responses as they streamed in. Without the flag that recording is replayed
// (the harness answers the app's model calls from it, chunk by chunk at the
// recorded times), so the same videos come out of any later run with no
// model call — and of a changed popup, since the product side is live. The
// texts in the file are the content: edit the copied text, a typed message,
// or a reply there and the next replay shows the edit.
//
// Usage: bun run demo-video [--locale <code>] [--record] [--out <root>] [--keep-work]
//        bun run demo-video --measure
// The demos (scripts/demo-video/demos.ts) are one session per locale; each
// lands at <root>/<locale>/demo/<demo>.mp4 plus a poster .jpg (default root
// site/public, what DemoVideo.astro serves). Locales default to the recorded
// ones; with --record, to those whose POPUP_RESULT_FIXTURES carry every
// string the demos type. --measure re-derives template.json (when and where
// the template's popup appears) from template.mp4 — run it after re-recording
// the template.
//
// Prerequisites: `bunx playwright install webkit`, ffmpeg/ffprobe 9 on PATH,
// and for --record GEMINI_API_KEY in the environment (`source ~/.zshrc`). A
// dev server on :1420 is reused when already running, started (and stopped)
// otherwise.
/* oxlint-disable no-await-in-loop, no-underscore-dangle -- deliberately
   sequential: frames are captured one after another, steps wait on the popup,
   and locales share the one dev server; the dunder names are Tauri's IPC
   global and the harness's driver global, spoken as they are. */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type Browser, type Page, webkit } from "playwright";
import { LOCALES } from "../src/lib/messages/index.ts";
import { extractResult, stripResultTags, wrapResult } from "../src/lib/protocol.ts";
import { POPUP_RESULT_FIXTURES, SCREENSHOT_SCENARIOS } from "../src/lib/screenshot-scenarios.ts";
import type { Exchange } from "../src/screenshot/exchange.ts";
import { DEMOS } from "./demo-video/demos.ts";

const ROOT = join(import.meta.dirname, "..");
const HERE = join(import.meta.dirname, "demo-video");
const DEV_URL = "http://localhost:1420";
const MODEL = "gemini-3.1-flash-lite";
/** The recording's frame-rate cap: a 2× PNG of the popup takes ~17 ms in
 *  WebKit, so this is what the machine actually sustains. */
const CAPTURE_FPS = 50;
/** The finished video's frame rate and quality: a docs page streams these,
 *  and every regeneration lands dozens of them in the repository, so half
 *  the capture rate and a moderate CRF (≈1 MB for a 10 s demo) rather than
 *  the capture rate itself. */
const OUTPUT_FPS = 30;
const OUTPUT_CRF = "22";
const TYPING_DELAY_MS = 90;
/** The popup's own margin around its card (`max-compact:p-2`, 8 CSS px). */
const CARD_MARGIN_CSS = 8;
const SCALE = 2;
/** Behind the popup-only demos: a plain light gray (zinc-100), a shade off
 *  the card so its border and shadow read. */
const BACKDROP = "0xF4F4F5";

// ---- CLI ------------------------------------------------------------------

const args = process.argv.slice(2);
function takeFlag(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || args[index + 1] === undefined) {
    return undefined;
  }
  const [, value] = args.splice(index, 2);
  return value;
}
function takeSwitch(flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}
const measureOnly = takeSwitch("--measure");
const recordMode = takeSwitch("--record");
const keepWork = takeSwitch("--keep-work");
const outRoot = takeFlag("--out") ?? join(ROOT, "site", "public");
const onlyLocale = takeFlag("--locale");
if (args.length > 0) {
  console.error(`unknown arguments: ${args.join(" ")}`);
  process.exit(1);
}

const TEMPLATE = join(HERE, "template.mp4");
const MANIFEST = join(HERE, "template.json");
const SOURCE = join(HERE, "source.txt");
const RECORDINGS = join(HERE, "recordings");
const popupViewport = SCREENSHOT_SCENARIOS["popup"]?.viewport;
if (popupViewport === undefined) {
  throw new Error("the popup scenario must declare its viewport");
}
const WINDOW = { w: popupViewport.width * SCALE, h: popupViewport.height * SCALE };

// ---- ffmpeg helpers ---------------------------------------------------------

function run(command: string, commandArgs: string[]): string {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")}\n${result.stderr}`);
  }
  return result.stdout;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---- --measure: when and where the template's popup appears -----------------

interface Manifest {
  video: string;
  sha256: string;
  width: number;
  height: number;
  duration: number;
  /** Seconds into the template at which its popup appears. */
  appear: number;
  /** Where the recording's window goes, in the template's pixels. */
  popup: { x: number; y: number };
  /** The template popup's card, border included — the measurement's basis. */
  card: { x: number; y: number; w: number; h: number };
}

/** Whether `line[i..i+RUN)` is all card-interior bright. */
function brightRunAt(line: number[], i: number): boolean {
  const BRIGHT = 248;
  const RUN = 8;
  if (i + RUN > line.length) {
    return false;
  }
  for (let k = 0; k < RUN; k += 1) {
    if (line[i + k]! < BRIGHT) {
      return false;
    }
  }
  return true;
}

/** Whether a luma is the card border's (the hairline between page and card). */
function isBorder(luma: number): boolean {
  return luma >= 195 && luma <= 240;
}

/** Index of the first pixel starting a bright run (the card interior) that a
 *  border-coloured pixel precedes; -1 when none. */
function firstBrightRun(line: number[]): number {
  for (let i = 1; i < line.length; i += 1) {
    if (isBorder(line[i - 1]!) && brightRunAt(line, i)) {
      return i;
    }
  }
  return -1;
}

/** Border-coloured pixels walking outward from the interior edge, until the
 *  shadow (a luma jump > 6) begins. */
function borderWidth(lineOutward: number[]): number {
  let n = 0;
  let previous: number | undefined;
  for (const v of lineOutward) {
    if (isBorder(v) && (previous === undefined || Math.abs(v - previous) <= 6)) {
      n += 1;
      previous = v;
    } else {
      break;
    }
  }
  return n;
}

async function measureTemplate(): Promise<Manifest> {
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "frame=pts_time",
      "-of",
      "json",
      TEMPLATE,
    ]),
  ) as { streams: { width: number; height: number }[]; frames: { pts_time: string }[] };
  const stream = probe.streams[0];
  if (stream === undefined) {
    throw new Error("template.mp4 has no video stream");
  }
  const { width, height } = stream;
  const pts = probe.frames.map((frame) => Number(frame.pts_time));
  const frameBytes = width * height;
  // Gray frames stream out of ffmpeg one after another; only the first, the
  // one before the popup appears, and the last are kept.
  const decoder = spawn("ffmpeg", [
    "-v",
    "error",
    "-i",
    TEMPLATE,
    "-fps_mode",
    "passthrough",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ]);
  // The tab-bar strip in the right half: static until the card lands on it.
  const strip = { x: Math.floor(width / 2), y: 0, w: width - Math.floor(width / 2), h: 120 };
  const stripDiff = (a: Uint8Array, b: Uint8Array): number => {
    let sum = 0;
    for (let y = strip.y; y < strip.y + strip.h; y += 1) {
      const row = y * width;
      for (let x = strip.x; x < strip.x + strip.w; x += 1) {
        sum += Math.abs(a[row + x]! - b[row + x]!);
      }
    }
    return sum / (strip.w * strip.h);
  };
  let first: Uint8Array | undefined;
  let previous: Uint8Array | undefined;
  let before: Uint8Array | undefined;
  let last: Uint8Array | undefined;
  let appear = -1;
  let index = 0;
  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  for await (const chunk of decoder.stdout as AsyncIterable<Buffer>) {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    while (pending.length >= frameBytes) {
      const frame = new Uint8Array(pending.subarray(0, frameBytes));
      pending = pending.subarray(frameBytes);
      first ??= frame;
      if (appear === -1 && stripDiff(frame, first) > 8) {
        appear = index;
        before = previous;
      }
      previous = frame;
      last = frame;
      index += 1;
    }
  }
  if (first === undefined || last === undefined || before === undefined || appear === -1) {
    throw new Error("could not find the frame where the template's popup appears");
  }
  if (index !== pts.length) {
    throw new Error(`decoded ${index} frames but ffprobe listed ${pts.length}`);
  }
  // Where it landed: pixels that changed between the frame before and the
  // last frame, eroded with a 9×9 box so text and the cursor vanish and the
  // card (with its shadow band) survives; its bounding box, then a scan
  // inward along the box's median lines to the card's interior.
  const K = 9;
  const MARGIN = 12;
  const integral = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += Math.abs(last[y * width + x]! - before[y * width + x]!) > 12 ? 1 : 0;
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)]! + rowSum;
    }
  }
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y + K <= height; y += 1) {
    for (let x = Math.floor(width / 4); x + K <= width; x += 1) {
      const sum =
        integral[(y + K) * (width + 1) + (x + K)]! -
        integral[y * (width + 1) + (x + K)]! -
        integral[(y + K) * (width + 1) + x]! +
        integral[y * (width + 1) + x]!;
      if (sum === K * K) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }
  if (bottom === -1) {
    throw new Error("no popup-sized change found in the template");
  }
  top = Math.max(0, top - MARGIN);
  left = Math.max(0, left - MARGIN);
  bottom = Math.min(height - 1, bottom + K - 1 + MARGIN);
  right = Math.min(width - 1, right + K - 1 + MARGIN);
  const ym = Math.floor((top + bottom) / 2);
  const xm = Math.floor((left + right) / 2);
  const row = (y: number, from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => last[y * width + from + i]!);
  const column = (x: number, from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => last[(from + i) * width + x]!);
  const scans = {
    left: firstBrightRun(row(ym, left, right)),
    right: firstBrightRun(row(ym, left, right).toReversed()),
    top: firstBrightRun(column(xm, top, bottom)),
    bottom: firstBrightRun(column(xm, top, bottom).toReversed()),
  };
  if (Object.values(scans).some((v) => v === -1)) {
    throw new Error(`could not find the card's interior edges: ${JSON.stringify(scans)}`);
  }
  const il = left + scans.left;
  const ir = right - scans.right;
  const it = top + scans.top;
  const ib = bottom - scans.bottom;
  const border = {
    left: borderWidth(row(ym, 0, il - 1).toReversed()),
    right: borderWidth(row(ym, ir + 1, width - 1)),
    top: borderWidth(column(xm, 0, it - 1).toReversed()),
    bottom: borderWidth(column(xm, ib + 1, height - 1)),
  };
  // The card's 1 CSS px border is SCALE pixels thick in a recording at the
  // scale the overlay is rendered at — anything else is a recording at
  // another scale, which the overlay would not fit.
  if (Object.values(border).some((v) => v !== SCALE)) {
    throw new Error(
      `the template's card border is ${JSON.stringify(border)} px thick; expected ${SCALE} (a ${SCALE}× recording)`,
    );
  }
  const card = {
    x: il - border.left,
    y: it - border.top,
    w: ir + border.right - (il - border.left) + 1,
    h: ib + border.bottom - (it - border.top) + 1,
  };
  // The popup window is the card plus its margin on every side; the
  // recording's window has the same margin, so it goes where the template's
  // window was — anchored at the card's top-right corner (the app pins the
  // popup to the work area's top-right).
  const margin = CARD_MARGIN_CSS * SCALE;
  const popup = { x: card.x + card.w + margin - WINDOW.w, y: card.y - margin };
  const appearAt = pts[appear];
  const duration = pts.at(-1);
  if (appearAt === undefined || duration === undefined) {
    throw new Error("ffprobe listed no frame timestamps");
  }
  return {
    video: "template.mp4",
    sha256: sha256(TEMPLATE),
    width,
    height,
    duration,
    appear: appearAt,
    popup,
    card,
  };
}

// ---- The session: the popup, driven and captured ------------------------------

/** What `--record` keeps per locale (scripts/demo-video/recordings/), and
 *  what a later run replays. */
interface Recording {
  locale: string;
  /** When it was recorded (ISO 8601). */
  recorded: string;
  /** The catalog address that answered ("provider:model"). */
  model: string;
  /** The capture as it was handed to the popup — the copied text (`source`;
   *  `vars.text` is left out, being that text again, derived on replay as
   *  Rust derives it), the matched prompt, the template variables. A replay
   *  takes the content from here — the source and the clock the requests
   *  were stamped with — and the product side (the prompt, its label, its
   *  templates) from the app as it is now. */
  capture: Record<string, unknown>;
  /** The conversation as text, one entry per model call — what a human
   *  reads and edits: a replay types each `message` and streams each
   *  `reply`. */
  turns: Turn[];
  /** The model calls that answered, as they went over the wire — the pace
   *  and shape of each reply, and the hash of each request for telling a
   *  changed one. Attempts the SDK retried are not kept: a replay need not
   *  wait through them. */
  exchanges: RecordedExchange[];
}

/** A recorded model call: the harness's exchange with the request body
 *  reduced to its hash — enough to tell a changed request from the same
 *  one, without repeating the thread once per call. */
interface RecordedExchange extends Omit<Exchange, "body"> {
  bodySha256: string;
}

interface Turn {
  /** The demo this call happened in. */
  demo: string;
  /** The prompt that ran. */
  prompt: string;
  /** What was typed into the composer for this call; absent for a slot run. */
  message?: string | undefined;
  /** The reply as the popup shows it (the protocol's tags taken off). */
  reply: string;
  /** The tokens the call cost, as the app recorded them. */
  tokens?: unknown;
}

/** One session's trace: frames on disk, and where in time everything is. */
interface Session {
  /** Every captured frame's time, seconds since the capture landed;
   *  frame-<n>.png in the work directory, 1-based. */
  frames: number[];
  /** Each demo's span in that timeline, in order. */
  demos: { name: string; start: number; end: number }[];
  /** Each step's moment. */
  timeline: { at: number; demo: string; step: string }[];
  /** Each model call's demo and typed message, in call order. */
  calls: { demo: string; message?: string | undefined }[];
  exchanges: Exchange[];
  usage: { prompt?: string; model?: string; tokens?: unknown }[];
  errors: string[];
}

function frontmatterPrompt(prompts: unknown, id: string): Record<string, string> {
  const list = prompts as Record<string, string>[];
  const prompt = list.find((entry) => entry["id"] === id);
  if (prompt === undefined) {
    throw new Error(`the harness lists no prompt "${id}"`);
  }
  return prompt;
}

/** Two-digit zero padding, for the `now` template variable. */
function two(n: number): string {
  return String(n).padStart(2, "0");
}

function frameName(index: number): string {
  return `frame-${String(index + 1).padStart(5, "0")}.png`;
}

/** Load the popup, the page's errors collecting into `errors` from here on. */
async function openPopup(page: Page, locale: string, errors: string[]): Promise<void> {
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  const query = new URLSearchParams({ locale, window: "popup" });
  await page.goto(`${DEV_URL}/screenshot.html?${query.toString()}`, { waitUntil: "networkidle" });
}

/** The capture, as Rust would send it: the Summarize prompt over the source
 *  text, with the template variables a Chrome copy carries. */
async function buildCapture(page: Page): Promise<Record<string, unknown>> {
  const prompts = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__.invoke("list_prompts_ui"),
  );
  const summarize = frontmatterPrompt(prompts, "zencopy-summarize");
  const text = readFileSync(SOURCE, "utf8");
  const now = new Date();
  return {
    kind: "text",
    source: { kind: "text", text },
    prompt_id: summarize["id"],
    label: summarize["label"],
    role: summarize["role"] ?? "default",
    instructions: summarize["instructions"],
    prompt: summarize["prompt"],
    vars: {
      text,
      markup: "",
      format: "",
      file_name: "",
      file_names: "",
      file_paths: "",
      app_name: "Google Chrome",
      exec_name: "Google Chrome",
      exec_path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      window_title: "RFC 2324: Hyper Text Coffee Pot Control Protocol (HTCPCP/1.0)",
      url: "https://www.rfc-editor.org/rfc/rfc2324.html",
      process_id: "4242",
      now: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`,
    },
    runnable: true,
  };
}

/** The capture for a replay: the product as it is now — the matched prompt,
 *  its label, its templates — around the recording's content: the copied
 *  text, and the clock the requests were stamped with (the one variable that
 *  would differ on its own and make every request look changed). */
function replayCapture(
  live: Record<string, unknown>,
  recorded: Record<string, unknown>,
): Record<string, unknown> {
  const source = recorded["source"] as { text: string };
  const liveVars = live["vars"] as Record<string, string>;
  const recordedVars = recorded["vars"] as Record<string, string>;
  return { ...live, source, vars: { ...liveVars, text: source.text, now: recordedVars["now"] } };
}

/** The capture as the recording keeps it: without `vars.text`. */
function recordedCapture(capture: Record<string, unknown>): Record<string, unknown> {
  const vars = Object.entries(capture["vars"] as Record<string, string>).filter(
    ([key]) => key !== "text",
  );
  return { ...capture, vars: Object.fromEntries(vars) };
}

/** Deliver the capture event; the popup subscribes a moment after load. */
async function deliverCapture(page: Page, capture: unknown): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const delivered = await page.evaluate(
      ([event, data]) =>
        (
          globalThis as unknown as {
            __zencopyHarness: { emit: (name: string, body: unknown) => number };
          }
        ).__zencopyHarness.emit(event, data),
      ["capture", capture] as const,
    );
    if (delivered > 0) {
      return;
    }
    await sleep(100);
  }
  throw new Error("the popup never subscribed to capture events");
}

async function runSession(job: {
  page: Page;
  locale: string;
  capture: unknown;
  /** A replay's typed messages, by call — the recording's, else the fixtures'. */
  messages?: (string | undefined)[];
  workDir: string;
  errors: string[];
}): Promise<Session> {
  const { page, locale, capture, messages, workDir, errors } = job;
  const fixture = POPUP_RESULT_FIXTURES[locale];
  if (fixture === undefined) {
    throw new Error(`POPUP_RESULT_FIXTURES has no strings for ${locale}`);
  }
  let started: number | undefined;
  const since = (): number =>
    started === undefined ? 0 : Number(((performance.now() - started) / 1000).toFixed(3));

  // The frame poller: 2× PNGs with a transparent background (the popup's
  // window is transparent; the card and its shadow carry their own alpha),
  // written as they come, each with its moment.
  const frames: number[] = [];
  const capturing = { on: false };
  let poller: Promise<void> | undefined;
  const poll = async (): Promise<void> => {
    while (capturing.on) {
      const at = performance.now();
      const png = await page.screenshot({
        type: "png",
        omitBackground: true,
        caret: "initial",
        animations: "allow",
      });
      writeFileSync(join(workDir, frameName(frames.length)), png);
      frames.push((at - (started ?? at)) / 1000);
      const spent = performance.now() - at;
      if (spent < 1000 / CAPTURE_FPS) {
        await sleep(1000 / CAPTURE_FPS - spent);
      }
    }
  };
  const headline = page.locator("div.font-semibold");
  const spinner = headline.locator("svg.lucide-loader-circle");
  const settled = async (): Promise<void> => {
    await spinner.waitFor({ timeout: 15_000 });
    const outcome = headline.locator("svg.lucide-check, svg.lucide-triangle-alert").first();
    await outcome.waitFor({ timeout: 120_000 });
    if (
      (await outcome.evaluate((node) => node.classList.contains("lucide-triangle-alert"))) === true
    ) {
      const reason = (await page.locator(".prose, p.text-destructive").last().textContent()) ?? "";
      throw new Error(`the model run failed: ${reason}`);
    }
  };
  const composer = page.locator("textarea");

  const timeline: Session["timeline"] = [];
  const calls: Session["calls"] = [];
  const demos: Session["demos"] = [];
  // What was typed since the last call settled — the next call's message.
  let typed: string | undefined;
  for (const demo of DEMOS) {
    const start = since();
    for (const step of demo.steps) {
      timeline.push({ at: since(), demo: demo.name, step: Object.values(step).join(" ") });
      switch (step.kind) {
        case "capture": {
          await deliverCapture(page, capture);
          started = performance.now();
          capturing.on = true;
          poller = poll();
          break;
        }
        case "settled": {
          await settled();
          calls.push({ demo: demo.name, message: typed });
          typed = undefined;
          break;
        }
        case "slot": {
          await page.keyboard.press(step.key);
          await page
            .locator("textarea:focus, div.font-semibold svg.lucide-loader-circle")
            .first()
            .waitFor({ timeout: 5000 });
          break;
        }
        case "press": {
          await page.keyboard.press(step.key);
          break;
        }
        case "type": {
          const text = messages?.[calls.length] ?? fixture[step.text];
          if ((await page.locator("textarea:focus").count()) === 0) {
            await composer.click();
          }
          await page.keyboard.type(text, { delay: TYPING_DELAY_MS });
          typed = text;
          break;
        }
        case "hold": {
          await sleep(step.seconds * 1000);
          break;
        }
        default: {
          step satisfies never;
        }
      }
    }
    demos.push({ name: demo.name, start, end: since() });
  }
  capturing.on = false;
  await poller;
  const harness = await page.evaluate(
    () =>
      (globalThis as unknown as { __zencopyHarness: Partial<Pick<Session, "exchanges" | "usage">> })
        .__zencopyHarness,
  );
  return {
    frames,
    demos,
    timeline,
    calls,
    exchanges: harness.exchanges ?? [],
    usage: harness.usage ?? [],
    errors,
  };
}

// ---- The transcript ---------------------------------------------------------------

/** The stream's events (the `data:` payloads), each with the moment its
 *  last byte arrived. */
function eventsOf(chunks: [number, string][]): { at: number; data: string }[] {
  const events: { at: number; data: string }[] = [];
  const push = (at: number, raw: string): void => {
    const data = raw
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (data !== "") {
      events.push({ at, data });
    }
  };
  let pending = "";
  let last = 0;
  for (const [at, text] of chunks) {
    pending += text;
    const complete = pending.split(/\r?\n\r?\n/u);
    pending = complete.pop() ?? "";
    for (const raw of complete) {
      push(at, raw);
    }
    last = at;
  }
  push(last, pending);
  return events;
}

/** What an event of Gemini's stream (the one provider the generator calls)
 *  carries of the model's text: its non-thought text parts, as the objects
 *  themselves so they can be rewritten in place. */
function textParts(event: unknown): { text: string }[] {
  const parts =
    (event as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] })
      .candidates?.[0]?.content?.parts ?? [];
  return parts.filter(
    (part): part is { text: string } => typeof part.text === "string" && part.thought !== true,
  );
}

/** The reply as the popup shows it, read off the stream's events, the
 *  protocol's result tags taken off. */
function replyOf(exchange: { chunks: [number, string][] }): string {
  let text = "";
  for (const event of eventsOf(exchange.chunks)) {
    for (const part of textParts(JSON.parse(event.data))) {
      text += part.text;
    }
  }
  if (text === "") {
    throw new Error("no text in the model's response — the transcript reads Gemini's events only");
  }
  return extractResult(text, true) ?? stripResultTags(text);
}

/** The stream again, carrying `reply` where the model's text was: the
 *  tagged reply spread over the same events in the same proportions, so it
 *  streams at the recorded pace, in the recorded shape. */
function rewritten(chunks: [number, string][], reply: string): [number, string][] {
  const events = eventsOf(chunks).map(({ at, data }) => ({
    at,
    json: JSON.parse(data) as unknown,
  }));
  const parts = events.flatMap(({ json }) => textParts(json));
  const total = parts.reduce((sum, part) => sum + part.text.length, 0);
  if (total === 0) {
    throw new Error("no text in the recorded response to rewrite");
  }
  const text = wrapResult(reply);
  let seen = 0;
  let cut = 0;
  for (const part of parts) {
    seen += part.text.length;
    const next = Math.round((text.length * seen) / total);
    part.text = text.slice(cut, next);
    cut = next;
  }
  // Back into chunks: each event re-serialized, grouped by its moment.
  const byMoment = new Map<number, string>();
  for (const { at, json } of events) {
    byMoment.set(at, `${byMoment.get(at) ?? ""}data: ${JSON.stringify(json)}\r\n\r\n`);
  }
  return [...byMoment];
}

/** The streams a replay serves: the recorded ones, each rewritten to carry
 *  the transcript's reply wherever that was edited since — the transcript
 *  is what a human edits, the stream is how it reaches the popup. */
function replayStreams(recording: Recording): RecordedExchange[] {
  const streams: RecordedExchange[] = [];
  for (const [index, exchange] of recording.exchanges.entries()) {
    const reply = recording.turns[index]?.reply;
    streams.push(
      reply === undefined || replyOf(exchange) === reply
        ? exchange
        : { ...exchange, chunks: rewritten(exchange.chunks, reply) },
    );
  }
  return streams;
}

function isSuccess(exchange: Exchange): boolean {
  return exchange.status >= 200 && exchange.status < 300;
}

/** The recording's view of the session: the calls that answered (the SDK
 *  retries a request the server refused — 408, 429, 5xx — up to twice, and
 *  a settled run may have needed that), one per settled run, and the
 *  transcript read off them. */
function recordedCalls(session: Session): { turns: Turn[]; exchanges: RecordedExchange[] } {
  const { calls, usage } = session;
  const answers = session.exchanges.filter((exchange) => isSuccess(exchange));
  if (calls.length !== answers.length || calls.length !== usage.length) {
    throw new Error(
      `${calls.length} runs settled, but ${answers.length} model calls succeeded (${session.exchanges.length} went out) and ${usage.length} usage records landed`,
    );
  }
  const turns = calls.map((call, index) => {
    const answered = answers[index];
    const record = usage[index];
    if (answered === undefined || record === undefined) {
      throw new Error("unreachable: the lengths were checked");
    }
    return {
      demo: call.demo,
      prompt: record.prompt ?? "",
      message: call.message,
      reply: replyOf(answered),
      tokens: record.tokens,
    };
  });
  return { turns, exchanges: answers.map((exchange) => withoutBody(exchange)) };
}

function withoutBody(exchange: Exchange): RecordedExchange {
  const { body, ...rest } = exchange;
  return { ...rest, bodySha256: sha256Text(body) };
}

// ---- Compositing --------------------------------------------------------------

/** The frames a demo spans, concat-demuxer style: the one on screen when the
 *  demo starts (the last captured before then), then every frame until it
 *  ends, each shown until the next arrived — the last until the end. */
function concatList(session: Session, demo: Session["demos"][number], workDir: string): string {
  const { frames } = session;
  const first = Math.max(
    0,
    frames.findLastIndex((at) => at <= demo.start),
  );
  const lines: string[] = [];
  let last = first;
  for (let index = first; index < frames.length && (frames[index] ?? 0) < demo.end; index += 1) {
    const shownFrom = Math.max(frames[index] ?? 0, demo.start);
    const shownUntil = Math.min(frames[index + 1] ?? demo.end, demo.end);
    lines.push(`file '${frameName(index)}'`, `duration ${(shownUntil - shownFrom).toFixed(4)}`);
    last = index;
  }
  lines.push(`file '${frameName(last)}'`);
  const listFile = join(workDir, `${demo.name}.txt`);
  writeFileSync(listFile, `${lines.join("\n")}\n`);
  return listFile;
}

/** The frames as an overlay stream: 2× RGBA PNGs to bt709 yuva, starting
 *  `delay` seconds into the base. */
function overlayFilter(delay: number): string {
  return `[1:v]fps=${OUTPUT_FPS},scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuva420p,setpts=PTS+${delay}/TB[ov]`;
}

/** The encode a docs page streams. */
const ENCODE = [
  "-map",
  "[v]",
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  OUTPUT_CRF,
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-movflags",
  "+faststart",
];

/** The poster: the first frame at half size, like the shots the docs embed. */
function poster(mp4: string, jpg: string, width: number): void {
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    mp4,
    "-vf",
    `select=eq(n\\,0),scale=${width}:-2`,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    jpg,
  ]);
}

/** The first demo: over the template, from the moment its popup appears; the
 *  template runs on until the demo ends (its last frame held). */
function composeOverTemplate(
  manifest: Manifest,
  span: { listFile: string; duration: number },
  out: { mp4: string; jpg: string },
): void {
  const pad = Math.max(0, manifest.appear + span.duration - manifest.duration + 1);
  const filter = [
    `[0:v]fps=${OUTPUT_FPS},tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}[base]`,
    overlayFilter(manifest.appear),
    `[base][ov]overlay=x=${manifest.popup.x}:y=${manifest.popup.y}:eof_action=endall:format=yuv420[v]`,
  ].join(";");
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    TEMPLATE,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    span.listFile,
    "-filter_complex",
    filter,
    ...ENCODE,
    out.mp4,
  ]);
  poster(out.mp4, out.jpg, Math.round(manifest.width / SCALE));
}

/** The other demos: the popup's window alone, over the backdrop. */
function composeAlone(listFile: string, out: { mp4: string; jpg: string }): void {
  const filter = [
    overlayFilter(0),
    `[0:v][ov]overlay=x=0:y=0:eof_action=endall:format=yuv420[v]`,
  ].join(";");
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${BACKDROP}:s=${WINDOW.w}x${WINDOW.h}:r=${OUTPUT_FPS}`,
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-filter_complex",
    filter,
    ...ENCODE,
    out.mp4,
  ]);
  poster(out.mp4, out.jpg, WINDOW.w / SCALE);
}

// ---- Main ----------------------------------------------------------------------

if (measureOnly) {
  const manifest = await measureTemplate();
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, undefined, 2)}\n`);
  console.log(
    `template.json: popup appears at ${manifest.appear}s, window at (${manifest.popup.x}, ${manifest.popup.y}), card ${manifest.card.w}×${manifest.card.h}`,
  );
  process.exit(0);
}

const apiKey = process.env["GEMINI_API_KEY"];
if (recordMode && (apiKey === undefined || apiKey === "")) {
  console.error("--record needs GEMINI_API_KEY in the environment (source ~/.zshrc)");
  process.exit(1);
}
if (!existsSync(MANIFEST)) {
  console.error(
    "scripts/demo-video/template.json is missing — run `bun run demo-video --measure` first",
  );
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
if (manifest.sha256 !== sha256(TEMPLATE)) {
  console.error(
    "template.mp4 changed since template.json was measured — run `bun run demo-video --measure`",
  );
  process.exit(1);
}

const recordingFile = (locale: string): string => join(RECORDINGS, `${locale.toLowerCase()}.json`);
const locales = LOCALES.map((entry) => entry.value).filter(
  (value) => onlyLocale === undefined || value.toLowerCase() === onlyLocale.toLowerCase(),
);
if (locales.length === 0) {
  console.error(
    `unknown locale "${onlyLocale}" — known: ${LOCALES.map((entry) => entry.value).join(", ")}`,
  );
  process.exit(1);
}
// What a locale needs before its session can run: the strings the demos
// type, for a recording; the recording itself, for a replay.
const typed = new Set(
  DEMOS.flatMap((demo) => demo.steps).flatMap((step) => (step.kind === "type" ? [step.text] : [])),
);
const recordable = (locale: string): boolean => {
  const fixture = POPUP_RESULT_FIXTURES[locale];
  return fixture !== undefined && [...typed].every((key) => fixture[key] !== undefined);
};
const skipped = locales.filter((locale) =>
  recordMode ? !recordable(locale) : !existsSync(recordingFile(locale)),
);
if (skipped.length > 0) {
  const list = skipped.join(", ");
  const why = recordMode
    ? `POPUP_RESULT_FIXTURES must carry ${[...typed].join(" and ")} for it first`
    : "record one with --record";
  if (onlyLocale !== undefined) {
    console.error(`${recordMode ? "cannot record" : "no recording for"} ${list} — ${why}`);
    process.exit(1);
  }
  console.log(`skipped ${list} — ${why}`);
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
// Its own process group, so stopping it also stops the vite it spawns.
const stopDevServer = (): void => {
  if (devServer?.pid !== undefined) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // already gone
    }
    devServer = undefined;
  }
};
process.on("SIGINT", () => {
  stopDevServer();
  process.exit(130);
});

const workRoot = join(ROOT, "scratch", "demo-video");
const failures: string[] = [];

/** One locale: the session, recorded or replayed, cut into its videos.
 *  Throws on any failure. */
async function generateOne(browser: Browser, locale: string): Promise<void> {
  const folder = locale.toLowerCase();
  const workDir = join(workRoot, folder);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const outDir = join(outRoot, folder, "demo");
  mkdirSync(outDir, { recursive: true });
  const recording = recordMode
    ? undefined
    : (JSON.parse(readFileSync(recordingFile(locale), "utf8")) as Recording);
  // The catalog: the real key for a recording; a replay's calls never leave
  // the page, so a placeholder — and the model the recording names, so the
  // requests are the recorded ones even after MODEL moves on.
  const [provider = "google", model = MODEL] = (recording?.model ?? `google:${MODEL}`).split(":");
  const key = recording === undefined ? apiKey : undefined;
  const catalog = {
    providers: [{ id: provider, vendor: { apiKey: key ?? "replay" }, models: [{ id: model }] }],
    roles: { default: `${provider}:${model}` },
  };
  const context = await browser.newContext({
    viewport: popupViewport,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
  });
  // The catalog rides a page global, never a URL: it holds the key.
  await context.addInitScript(
    (seed: unknown) => {
      (globalThis as { __zencopyHarness?: unknown }).__zencopyHarness = seed;
    },
    { catalog, ...(recording === undefined ? {} : { replay: replayStreams(recording) }) },
  );
  const startedAt = performance.now();
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    await openPopup(page, locale, errors);
    const live = await buildCapture(page);
    const capture = recording === undefined ? live : replayCapture(live, recording.capture);
    const session = await runSession({
      page,
      locale,
      capture,
      messages: recording?.turns.map((turn) => turn.message),
      workDir,
      errors,
    });
    session.demos.forEach((demo, index) => {
      const listFile = concatList(session, demo, workDir);
      const out = { mp4: join(outDir, `${demo.name}.mp4`), jpg: join(outDir, `${demo.name}.jpg`) };
      if (index === 0) {
        composeOverTemplate(manifest, { listFile, duration: demo.end - demo.start }, out);
      } else {
        composeAlone(listFile, out);
      }
      console.log(`ok ${folder}/demo/${demo.name}.mp4 (${(demo.end - demo.start).toFixed(1)}s)`);
    });
    // The recording, or how far the replayed session strayed from it: a
    // request that no longer matches means the prompt or its context changed
    // since — the reply shown is still the recorded one.
    let drift: number[] = [];
    if (recording === undefined) {
      const { turns, exchanges } = recordedCalls(session);
      const kept: Recording = {
        locale,
        recorded: new Date().toISOString(),
        model: session.usage[0]?.model ?? `google:${MODEL}`,
        capture: recordedCapture(capture as Record<string, unknown>),
        turns,
        exchanges,
      };
      const text = `${JSON.stringify(kept, undefined, 2)}\n`;
      if (apiKey !== undefined && text.includes(apiKey)) {
        throw new Error("the recording would carry the API key — not written");
      }
      mkdirSync(RECORDINGS, { recursive: true });
      writeFileSync(recordingFile(locale), text);
      console.log(`   recorded ${turns.length} turns to ${recordingFile(locale)}`);
    } else {
      drift = session.exchanges.flatMap((exchange, index) =>
        sha256Text(exchange.body) === recording.exchanges[index]?.bodySha256 ? [] : [index + 1],
      );
      if (drift.length > 0) {
        console.log(
          `   note: model call ${drift.join(", ")} sent a request the recording (${recording.recorded}) never saw — a prompt changed since, or the copied text, a message, or an earlier reply was edited in it; the replies shown are the recorded ones (re-record with --record to have the model answer the new request)`,
        );
      }
    }
    writeFileSync(
      join(workDir, "report.json"),
      `${JSON.stringify({ locale: folder, mode: recording === undefined ? "record" : "replay", ...session, frames: session.frames.length, exchanges: undefined, drift }, undefined, 2)}\n`,
    );
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.log(`   ${folder}: ${session.frames.length} frames, ${seconds}s`);
    if (session.errors.length > 0) {
      console.log(`   page errors: ${session.errors.join(" | ")}`);
    }
    if (!keepWork) {
      rmSync(workDir, { recursive: true, force: true });
    }
  } finally {
    await context.close();
  }
}

async function generateAll(browser: Browser): Promise<void> {
  for (const locale of locales.filter((entry) => !skipped.includes(entry))) {
    try {
      await generateOne(browser, locale);
    } catch (error) {
      failures.push(`${locale}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`FAILED ${locale} — work kept at ${join(workRoot, locale.toLowerCase())}`);
    }
  }
}

try {
  if (await devServerRunning()) {
    console.log("reusing the running dev server");
  } else {
    devServer = spawn("bun", ["run", "dev"], { cwd: ROOT, stdio: "ignore", detached: true });
    for (let attempt = 0; attempt < 80 && !(await devServerRunning()); attempt += 1) {
      await sleep(250);
    }
  }
  const browser = await webkit.launch();
  try {
    await generateAll(browser);
  } finally {
    await browser.close();
  }
} finally {
  stopDevServer();
}
if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`videos under ${outRoot}`);
