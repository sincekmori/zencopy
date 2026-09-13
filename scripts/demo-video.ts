// The docs' demo videos, generated end to end — no screen recording at all.
// The popup is driven through the Tauri-mocking harness (screenshot.html) in
// headless WebKit, its window is captured as 2× frames with a transparent
// background (card, shadow, and all), and those frames become the videos: the
// first demo composited over a page WebKit renders as well — the guide's
// sample email open in a plain, unbranded mail client (scripts/demo-video/
// mail.html around scripts/demo-video/source.txt, the file the guide embeds
// too), selected before the eye, the popup landing top right — and the rest
// over a plain backdrop, the popup alone.
//
// The model's answers are real once: `--record` runs the session against
// Gemini and keeps everything in scripts/demo-video/recordings/<locale>.json
// — the copied text, what was typed, each reply as text, and the model's
// responses as they streamed in. Without the flag that recording is replayed
// (the harness answers the app's model calls from it, chunk by chunk at the
// recorded times), so the same videos come out of any later run with no
// model call — and of a changed popup, since the product side is live. The
// texts in the file are the content: edit a typed message or a reply there
// and the next replay shows the edit; the copied text is source.txt's, and a
// replay refuses to run until the two agree again.
//
// Usage: bun run demo-video [--locale <code>] [--record] [--out <root>] [--keep-work]
// The demos (scripts/demo-video/demos.ts) are one session per locale; each
// lands at <root>/<locale>/demo/<demo>.mp4 plus a poster .jpg (default root
// site/public, what DemoVideo.astro serves). Locales default to the recorded
// ones; with --record, to those whose POPUP_RESULT_FIXTURES carry every
// string the demos type.
//
// Prerequisites: `bunx playwright install webkit`, ffmpeg 9 on PATH, and for
// --record GEMINI_API_KEY in the environment (`source ~/.zshrc`). A dev
// server on :1420 is reused when already running, started (and stopped)
// otherwise.
/* oxlint-disable no-await-in-loop, no-underscore-dangle -- deliberately
   sequential: frames are captured one after another, steps wait on the popup,
   and locales share the one dev server; the dunder name is Tauri's IPC
   global, spoken as it is. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { type Browser, type Locator, type Page, webkit } from "playwright";
import { extractResult, stripResultTags, wrapResult } from "../src/lib/protocol.ts";
import { GEMINI_DEFAULT_MODEL, geminiQuickCatalog } from "../src/lib/quickstart.ts";
import { POPUP_RESULT_FIXTURES, SCREENSHOT_SCENARIOS } from "../src/lib/screenshot-scenarios.ts";
import type { ModelCall } from "../src/screenshot/model-call.ts";
import { type Demo, DEMOS, FRAMES, VIDEO_SCALE } from "./demo-video/demos.ts";
import { CAPTIONS, namesChord } from "./demo-video/captions.ts";
import {
  ensureDevServer,
  harnessUrl,
  localesMatching,
  ROOT,
  seedHarness,
  takeFlag,
  takeSwitch,
} from "./harness-driver.ts";

const HERE = join(import.meta.dirname, "demo-video");
/** The frame rate, capture and output alike: a docs page streams these and
 *  every regeneration lands dozens of them in the repository, so 30 and a
 *  moderate CRF (≈1 MB for a 10 s demo). A 2× PNG of the popup takes ~17 ms
 *  in WebKit, so the capture keeps the pace; a frame identical to the one
 *  before it is kept once and shown for both. */
const FPS = 30;
const OUTPUT_CRF = "22";
const TYPING_DELAY_MS = 90;
/** Behind the popup-only demos: a plain light gray (zinc-100), a shade off
 *  the card so its border and shadow read. */
const BACKDROP = "0xF4F4F5";

// ---- CLI ------------------------------------------------------------------

const args = process.argv.slice(2);
const recordMode = takeSwitch(args, "--record");
const keepWork = takeSwitch(args, "--keep-work");
const outRoot = takeFlag(args, "--out") ?? join(ROOT, "site", "public");
const onlyLocale = takeFlag(args, "--locale");
if (args.length > 0) {
  console.error(`unknown arguments: ${args.join(" ")}`);
  process.exit(1);
}

const SOURCE = join(HERE, "source.txt");
const MAIL_TEMPLATE = join(HERE, "mail.html");
const RECORDINGS = join(HERE, "recordings");
const popupViewport = SCREENSHOT_SCENARIOS["popup"]?.viewport;
if (popupViewport?.width !== FRAMES.popup.width || popupViewport.height !== FRAMES.popup.height) {
  throw new Error(
    "the popup frame in scripts/demo-video/demos.ts must be the popup scenario's viewport (src/lib/screenshot-scenarios.ts)",
  );
}
const WINDOW = { w: FRAMES.popup.width * VIDEO_SCALE, h: FRAMES.popup.height * VIDEO_SCALE };

// ---- ffmpeg ---------------------------------------------------------------------

const execFileAsync = promisify(execFile);

/** Run ffmpeg quietly; fails with what it said. */
async function ffmpeg(ffmpegArgs: string[]): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-v", "error", "-y", ...ffmpegArgs], { maxBuffer: 1 << 24 });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(`ffmpeg ${ffmpegArgs.join(" ")}\n${stderr}`, { cause: error });
  }
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** A captured moment: when (seconds into its timeline), and the file that
 *  shows it — one file for a run of identical frames. */
interface Frame {
  at: number;
  file: string;
}

/** A concat-demuxer list: each file shown for its duration, a run of the
 *  same file as one entry. The demuxer times an entry by the next one's
 *  start, and ffmpeg gives the stream's last frame the length of the gap
 *  before it (which the fps filter then holds it for), so the picture the
 *  list ends on is listed twice more, a frame apart: its hold is the
 *  entry's, and the stream ends a frame after it. */
function concatLines(entries: { file: string; duration: number }[]): string {
  const merged: { file: string; duration: number }[] = [];
  for (const entry of entries) {
    const last = merged.at(-1);
    if (last?.file === entry.file) {
      last.duration += entry.duration;
    } else {
      merged.push({ ...entry });
    }
  }
  const tail = merged.at(-1);
  if (tail === undefined) {
    return "";
  }
  const frame = 1 / FPS;
  tail.duration = Math.max(frame, tail.duration - frame);
  const lines = [
    ...merged,
    { file: tail.file, duration: frame },
    { file: tail.file, duration: frame },
  ].flatMap(({ file, duration }) => [`file '${file}'`, `duration ${duration.toFixed(4)}`]);
  return `${lines.join("\n")}\n`;
}

// ---- The page: the mail the first demo copies, rendered and selected ------------

/** The frame the page stage is filmed in (CSS px; ×VIDEO_SCALE in pixels).
 *  Landscape: the mail on the left, the popup on the right, so the copy and
 *  its answer are seen side by side. */
const PAGE = FRAMES.page;
/** The page's own beats before the popup: the mail as it is, the selection
 *  sweeping over it, the mail selected — then the popup appears. The still
 *  is long enough to read the first caption over it (see cuesOf). */
const PAGE_BEATS = { still: 2, select: 1.4, selected: 0.4 };
/** Seconds into the video at which the popup appears. */
const APPEAR = PAGE_BEATS.still + PAGE_BEATS.select + PAGE_BEATS.selected;
/** Where the popup window lands: the frame's top-right corner (the app pins
 *  the popup to the work area's top-right; the window's own margin keeps the
 *  card off the edges). */
const POPUP_AT = { x: PAGE.width * VIDEO_SCALE - WINDOW.w, y: 0 };
/** The mail's subject: the reading pane's heading, the inbox row's, and the
 *  window title the capture carries. */
const SUBJECT = "Updated proposal and review date";

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** The source's paragraphs: blank lines separate them, and the lines of one
 *  are one sentence each. */
function paragraphsOf(source: string): string[] {
  return source
    .trim()
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.split("\n").join(" "));
}

/** The sample email as a page: scripts/demo-video/mail.html with the mail's
 *  own parts filled in — the subject, the inbox row's preview (the opening,
 *  greeting and sign-off skipped, cut at a word), the body. */
function mailPage(source: string): string {
  const paragraphs = paragraphsOf(source);
  const opening = paragraphs
    .filter((paragraph) => !paragraph.endsWith(","))
    .join(" ")
    .slice(0, 64);
  const cut = opening.lastIndexOf(" ");
  const snippet = cut === -1 ? opening : opening.slice(0, cut);
  return readFileSync(MAIL_TEMPLATE, "utf8")
    .replaceAll("{{subject}}", escapeHtml(SUBJECT))
    .replaceAll("{{snippet}}", escapeHtml(snippet))
    .replaceAll(
      "{{paragraphs}}",
      paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(""),
    );
}

/** Two animation frames on: what the page was just told to show is drawn.
 *  A screenshot straight after a selection change could still catch the
 *  frame before it — and the sweep's last picture is held for the rest of
 *  the video. */
async function painted(page: Page): Promise<void> {
  // waitForFunction tries its predicate once at once, then on each animation
  // frame — so counting the calls is counting frames.
  await page.evaluate(() => {
    (globalThis as { __frames?: number }).__frames = 0;
  });
  await page.waitForFunction(() => {
    const seen = globalThis as { __frames?: number };
    seen.__frames = (seen.__frames ?? 0) + 1;
    return seen.__frames > 2;
  });
}

function pageFrameName(index: number): string {
  return `page-${String(index + 1).padStart(5, "0")}.png`;
}

/** Render the page's frames up to the moment the popup appears, into `dir`
 *  — one file per distinct picture: the still and the selected mail are one
 *  frame each, however long they hold. Once per run — the page is the same
 *  for every locale. */
async function renderPage(browser: Browser, dir: string): Promise<Frame[]> {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: PAGE,
    deviceScaleFactor: VIDEO_SCALE,
    colorScheme: "light",
  });
  try {
    const page = await context.newPage();
    await page.setContent(mailPage(readFileSync(SOURCE, "utf8")));
    const frames: Frame[] = [];
    let shown: { fraction: number; file: string } | undefined;
    while (frames.length / FPS < APPEAR) {
      const at = frames.length / FPS;
      const fraction = Math.min(1, Math.max(0, (at - PAGE_BEATS.still) / PAGE_BEATS.select));
      if (shown === undefined || shown.fraction !== fraction) {
        await page.evaluate((f) => {
          (globalThis as { select?: (fraction: number) => void }).select?.(f);
        }, fraction);
        await painted(page);
        shown = { fraction, file: pageFrameName(frames.length) };
        writeFileSync(join(dir, shown.file), await page.screenshot({ type: "png", caret: "hide" }));
      }
      frames.push({ at, file: shown.file });
    }
    return frames;
  } finally {
    await context.close();
  }
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
  exchanges: RecordedCall[];
}

/** A recorded model call: the harness's record with the request body
 *  reduced to its hash — enough to tell a changed request from the same
 *  one, without repeating the thread once per call. */
interface RecordedCall extends Omit<ModelCall, "body"> {
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

/** The moments a page-stage demo's captions start, seconds into its video
 *  — the mail as it is, the selection sweeping, the chord (the mail selected,
 *  the popup a beat away), the summary complete — the beats captions.ts
 *  holds one line each for. Popup-stage demos carry none. */
function cuesOf(session: Session, demo: Session["demos"][number]): number[] | undefined {
  if (demo.stage !== "page") {
    return undefined;
  }
  const steps = session.timeline.filter((entry) => entry.demo === demo.name);
  const settled = steps.findIndex((entry) => entry.step === "settled");
  const after = steps[settled + 1];
  if (settled === -1 || after === undefined) {
    throw new Error(`${demo.name}: no step follows "settled" to time the summary's caption by`);
  }
  const done = after.at - demo.start;
  return [0, PAGE_BEATS.still, PAGE_BEATS.still + PAGE_BEATS.select, APPEAR + done].map((seconds) =>
    Number(seconds.toFixed(2)),
  );
}

/** One session's trace: frames on disk, and where in time everything is. */
interface Session {
  /** Every captured moment, seconds since the capture landed, and its file
   *  in the work directory. */
  frames: Frame[];
  /** Each demo's span in that timeline, in order, and what it plays over. */
  demos: { name: string; stage: Demo["stage"]; start: number; end: number }[];
  /** Each step's moment. */
  timeline: { at: number; demo: string; step: string }[];
  /** Each settled run's demo and typed message, in order. */
  runs: { demo: string; message?: string | undefined }[];
  /** The model calls, as they went over `fetch`. */
  exchanges: ModelCall[];
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
  await page.goto(harnessUrl({ locale, window: "popup" }), { waitUntil: "networkidle" });
}

/** The capture, as Rust would send it: the Summarize prompt over the source
 *  text, with the template variables a mail client's copy carries. */
async function buildCapture(page: Page, text: string): Promise<Record<string, unknown>> {
  const prompts = await page.evaluate(() =>
    (
      globalThis as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__.invoke("list_prompts_ui"),
  );
  const summarize = frontmatterPrompt(prompts, "zencopy-summarize");
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
      app_name: "Mail",
      exec_name: "Mail",
      exec_path: "",
      window_title: SUBJECT,
      url: "",
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
  // each with its moment — written when the picture changed, else noted as
  // the previous file shown a moment longer.
  const frames: Frame[] = [];
  const capturing = { on: false };
  let poller: Promise<void> | undefined;
  const poll = async (): Promise<void> => {
    let previous: { png: Buffer; file: string } | undefined;
    let written = 0;
    while (capturing.on) {
      const at = performance.now();
      const png = await page.screenshot({
        type: "png",
        omitBackground: true,
        caret: "initial",
        animations: "allow",
      });
      if (previous === undefined || !png.equals(previous.png)) {
        previous = { png, file: frameName(written) };
        written += 1;
        writeFileSync(join(workDir, previous.file), png);
      }
      frames.push({ at: (at - (started ?? at)) / 1000, file: previous.file });
      const spent = performance.now() - at;
      if (spent < 1000 / FPS) {
        await sleep(1000 / FPS - spent);
      }
    }
  };
  // The popup's state, read off its headline (`data-run-state`, see
  // popup.tsx) — not off the glyphs that show it.
  const inState = (...states: string[]): Locator =>
    page.locator(states.map((state) => `[data-run-state="${state}"]`).join(", ")).first();
  const settled = async (): Promise<void> => {
    await inState("running").waitFor({ timeout: 15_000 });
    // A demo's reply is a few seconds of streaming; this is a ceiling for a
    // recording's network, not a wait anyone should sit through.
    const outcome = inState("done", "failed", "setup");
    await outcome.waitFor({ timeout: 45_000 });
    const state = await outcome.getAttribute("data-run-state");
    if (state !== "done") {
      const reason = (await page.locator("[data-turn-status]").last().textContent()) ?? "";
      throw new Error(`the run ended in the popup's ${state} state: ${reason}`);
    }
  };
  const composer = page.locator("textarea");

  const timeline: Session["timeline"] = [];
  const runs: Session["runs"] = [];
  const demos: Session["demos"] = [];
  // What was typed since the last run settled — the next run's message.
  let typed: string | undefined;
  const perform = async (): Promise<void> => {
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
            runs.push({ demo: demo.name, message: typed });
            typed = undefined;
            break;
          }
          case "slot": {
            await page.keyboard.press(step.key);
            await page
              .locator('textarea:focus, [data-run-state="running"]')
              .first()
              .waitFor({ timeout: 5000 });
            break;
          }
          case "press": {
            await page.keyboard.press(step.key);
            break;
          }
          case "type": {
            const text = messages?.[runs.length] ?? fixture[step.text];
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
      demos.push({ name: demo.name, stage: demo.stage, start, end: since() });
    }
  };
  try {
    await perform();
  } finally {
    // Whatever ended the session, the poller ends with it: a frame in
    // flight completes (the context is still open here), and nothing is
    // left to reject later.
    capturing.on = false;
    await poller?.catch((error: unknown) => {
      errors.push(`poller: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  const harness = await page.evaluate(
    () =>
      (globalThis as unknown as { __zencopyHarness: Partial<Pick<Session, "exchanges" | "usage">> })
        .__zencopyHarness,
  );
  return {
    frames,
    demos,
    timeline,
    runs,
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
function replyOf(call: { chunks: [number, string][] }): string {
  let text = "";
  for (const event of eventsOf(call.chunks)) {
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
function replayStreams(recording: Recording): RecordedCall[] {
  const streams: RecordedCall[] = [];
  for (const [index, call] of recording.exchanges.entries()) {
    const reply = recording.turns[index]?.reply;
    streams.push(
      reply === undefined || replyOf(call) === reply
        ? call
        : { ...call, chunks: rewritten(call.chunks, reply) },
    );
  }
  return streams;
}

function isSuccess(call: ModelCall): boolean {
  return call.status >= 200 && call.status < 300;
}

/** The recording's view of the session: the calls that answered (the SDK
 *  retries a request the server refused — 408, 429, 5xx — up to twice, and
 *  a settled run may have needed that), one per settled run, and the
 *  transcript read off them. */
function recordedCalls(session: Session): { turns: Turn[]; exchanges: RecordedCall[] } {
  const { runs, usage } = session;
  const answers = session.exchanges.filter((call) => isSuccess(call));
  if (runs.length !== answers.length || runs.length !== usage.length) {
    throw new Error(
      `${runs.length} runs settled, but ${answers.length} model calls succeeded (${session.exchanges.length} went out) and ${usage.length} usage records landed`,
    );
  }
  const turns = runs.map((run, index) => {
    const answered = answers[index];
    const record = usage[index];
    if (answered === undefined || record === undefined) {
      throw new Error("unreachable: the lengths were checked");
    }
    return {
      demo: run.demo,
      prompt: record.prompt ?? "",
      message: run.message,
      reply: replyOf(answered),
      tokens: record.tokens,
    };
  });
  return { turns, exchanges: answers.map((call) => withoutBody(call)) };
}

function withoutBody(call: ModelCall): RecordedCall {
  const { body, ...rest } = call;
  return { ...rest, bodySha256: sha256Text(body) };
}

// ---- Compositing --------------------------------------------------------------

/** A demo's slice of the session as a concat list: its frames, and how long
 *  the video runs. */
interface Span {
  listFile: string;
  duration: number;
}

interface Output {
  mp4: string;
  /** The poster — the default video's; a `.mac` variant has none of its own. */
  jpg?: string;
}

/** The frames a demo spans, concat-demuxer style: the one on screen when the
 *  demo starts (the last captured before then), then every frame until it
 *  ends, each shown until the next arrived — the last until the end. */
function concatList(session: Session, demo: Session["demos"][number], workDir: string): Span {
  const { frames } = session;
  const first = Math.max(
    0,
    frames.findLastIndex((frame) => frame.at <= demo.start),
  );
  const entries: { file: string; duration: number }[] = [];
  for (let index = first; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame === undefined || frame.at >= demo.end) {
      break;
    }
    const shownFrom = Math.max(frame.at, demo.start);
    const shownUntil = Math.min(frames[index + 1]?.at ?? demo.end, demo.end);
    entries.push({ file: frame.file, duration: shownUntil - shownFrom });
  }
  const listFile = join(workDir, `${demo.name}.txt`);
  writeFileSync(listFile, concatLines(entries));
  return { listFile, duration: entries.reduce((sum, entry) => sum + entry.duration, 0) };
}

// ---- Captions: lines rendered by WebKit, laid over the video in turn ------------

/** How a caption sits on the frame, in CSS px of the page stage: the type
 *  size and the room under it (above where a player draws its controls). */
const CAPTION = { size: PAGE.width * 0.026, bottom: PAGE.height * 0.13 };

/** The locale's own name for its language, for `{lang}`. */
function languageName(locale: string): string {
  return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
}

/** A demo's videos: the default one, and a `.mac` one when its lines name
 *  the chord. */
interface Variant {
  suffix: "" | ".mac";
  chord: string;
}
const VARIANTS: Variant[] = [
  { suffix: "", chord: "Ctrl + C + C" },
  { suffix: ".mac", chord: "⌘ + C + C" },
];
function variantsOf(lines: readonly string[] | undefined): Variant[] {
  return lines !== undefined && namesChord(lines) ? VARIANTS : VARIANTS.slice(0, 1);
}

/** Render a demo's caption lines for one variant as 2× PNGs with alpha —
 *  WebKit sets the type, in the site's font stack, so every script the
 *  docs come in (and ⌘) is drawn as the page would draw it. */
async function renderCaptions(job: {
  browser: Browser;
  locale: string;
  lines: readonly string[];
  variant: Variant;
  dir: string;
}): Promise<string[]> {
  const { browser, locale, lines, variant, dir } = job;
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: PAGE,
    deviceScaleFactor: VIDEO_SCALE,
    colorScheme: "light",
  });
  try {
    const page = await context.newPage();
    const files: string[] = [];
    for (const [index, line] of lines.entries()) {
      const text = line
        .replaceAll("{chord}", variant.chord)
        .replaceAll("{lang}", languageName(locale));
      await page.setContent(
        `<!doctype html><html lang="${locale}"><body style="margin:0;background:transparent"><div id="caption" dir="auto" style="position:absolute;left:0;top:0;display:inline-block;max-width:${PAGE.width * 0.88}px;padding:0.3em 0.8em;border-radius:0.5em;background:rgb(0 0 0 / 0.68);color:#fff;font:500 ${CAPTION.size}px/1.5 system-ui,-apple-system,'Segoe UI','Hiragino Sans','Yu Gothic UI',sans-serif;text-align:center">${escapeHtml(text)}</div></body></html>`,
      );
      await painted(page);
      const file = join(dir, `caption${variant.suffix}-${index + 1}.png`);
      writeFileSync(
        file,
        await page.locator("#caption").screenshot({ type: "png", omitBackground: true }),
      );
      files.push(file);
    }
    return files;
  } finally {
    await context.close();
  }
}

/** The caption overlays as filter steps, from the composited stream `[m]`
 *  to `[cap]`: inputs 2 onward (after the two concat lists), one per line,
 *  each shown from its moment to the next one's (the last to the end),
 *  centered, CAPTION.bottom above the frame's bottom edge. */
function captionSteps(moments: number[]): string[] {
  const bottom = Math.round(CAPTION.bottom * VIDEO_SCALE);
  return moments.map((at, index) => {
    const next = moments[index + 1];
    const enable = next === undefined ? `gte(t,${at})` : `between(t,${at},${next})`;
    const label = index === moments.length - 1 ? "cap" : `m${index + 1}`;
    const input = index === 0 ? "m" : `m${index}`;
    return `[${input}][${2 + index}:v]overlay=x=(W-w)/2:y=H-${bottom}-h:enable='${enable}'[${label}]`;
  });
}

/** The frames as an overlay stream: 2× RGBA PNGs to bt709 yuva, starting
 *  `delay` seconds into the base. */
function overlayFilter(delay: number): string {
  return `[1:v]fps=${FPS},scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuva420p,setpts=PTS+${delay}/TB[ov]`;
}

/** The poster, off the composited stream `[pv]`: the frame 0.2 s before
 *  the video ends — the demo's closing hold, the answer on screen, which is
 *  what a page should show before anyone presses play — at half size, like
 *  the shots the docs embed. */
function posterFilter(end: number, width: number): string {
  return `[pv]select='gte(t,${Math.max(0, end - 0.2).toFixed(3)})',scale=${width}:-2[p]`;
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

/** One ffmpeg run per demo: the composited stream `[v]` to the docs' encode
 *  as the mp4, and its poster frame `[p]` as the jpg. */
async function compose(inputs: string[], filter: string, out: Output): Promise<void> {
  await ffmpeg([
    ...inputs,
    "-filter_complex",
    filter,
    ...ENCODE,
    out.mp4,
    ...(out.jpg === undefined ? [] : ["-map", "[p]", "-frames:v", "1", "-q:v", "2", out.jpg]),
  ]);
}

/** The first demo: over the page — its frames until the popup appears, then
 *  its last frame held for the rest of the demo (and a second more, so the
 *  overlay is what ends the video). */
async function composeOverPage(
  mail: { dir: string; frames: Frame[] },
  span: Span,
  out: Output & { captions?: { files: string[]; moments: number[] } | undefined },
): Promise<void> {
  const { captions } = out;
  const entries = mail.frames.map((frame, index) => ({
    file: join(mail.dir, frame.file),
    duration: (mail.frames[index + 1]?.at ?? APPEAR) - frame.at,
  }));
  const last = entries.at(-1);
  if (last === undefined) {
    throw new Error("the page has no frames");
  }
  const baseList = `${span.listFile}.page.txt`;
  writeFileSync(
    baseList,
    concatLines([...entries, { file: last.file, duration: span.duration + 1 }]),
  );
  // The base, the popup over it, the captions over that in turn, then the
  // stream the encode takes — split once more for the poster when this is
  // the video that has one.
  const topmost = captions === undefined ? "m" : "cap";
  const filter = [
    `[0:v]fps=${FPS}[base]`,
    overlayFilter(APPEAR),
    `[base][ov]overlay=x=${POPUP_AT.x}:y=${POPUP_AT.y}:eof_action=endall:format=yuv420[m]`,
    ...(captions === undefined ? [] : captionSteps(captions.moments)),
    out.jpg === undefined ? `[${topmost}]null[v]` : `[${topmost}]split[v][pv]`,
    ...(out.jpg === undefined ? [] : [posterFilter(APPEAR + span.duration, PAGE.width)]),
  ].join(";");
  await compose(
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      baseList,
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      span.listFile,
      ...(captions?.files ?? []).flatMap((file) => ["-i", file]),
    ],
    filter,
    out,
  );
}

/** The other demos: the popup's window alone, over the backdrop. */
async function composeAlone(span: Span, out: Output): Promise<void> {
  const filter = [
    overlayFilter(0),
    `[0:v][ov]overlay=x=0:y=0:eof_action=endall:format=yuv420,split[v][pv]`,
    posterFilter(span.duration, WINDOW.w / VIDEO_SCALE),
  ].join(";");
  await compose(
    [
      "-f",
      "lavfi",
      "-i",
      `color=c=${BACKDROP}:s=${WINDOW.w}x${WINDOW.h}:r=${FPS}`,
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      span.listFile,
    ],
    filter,
    out,
  );
}

// ---- Main ----------------------------------------------------------------------

const apiKey = process.env["GEMINI_API_KEY"];
if (recordMode && (apiKey === undefined || apiKey === "")) {
  console.error("--record needs GEMINI_API_KEY in the environment (source ~/.zshrc)");
  process.exit(1);
}
const recordingFile = (locale: string): string => join(RECORDINGS, `${locale.toLowerCase()}.json`);
const locales = localesMatching(onlyLocale);
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

const workRoot = join(ROOT, "scratch", "demo-video");
const failures: string[] = [];

/** One locale: the session, recorded or replayed, cut into its videos.
 *  Throws on any failure — the work directory stays, its report.json naming
 *  what stopped it. */
async function generateOne(
  browser: Browser,
  mail: { dir: string; frames: Frame[] },
  locale: string,
): Promise<void> {
  const folder = locale.toLowerCase();
  const workDir = join(workRoot, folder);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const outDir = join(outRoot, folder, "demo");
  mkdirSync(outDir, { recursive: true });
  const recording = recordMode
    ? undefined
    : (JSON.parse(readFileSync(recordingFile(locale), "utf8")) as Recording);
  const mode = recording === undefined ? "record" : "replay";
  const source = readFileSync(SOURCE, "utf8");
  if (recording !== undefined) {
    // One mail: the page behind the first demo is rendered from the file,
    // the popup shows the recording's copy of it, and the video must not
    // show two texts.
    const recordedText = (recording.capture["source"] as { text?: unknown }).text;
    if (recordedText !== source) {
      throw new Error(
        `scripts/demo-video/source.txt is not the mail ${recordingFile(locale)} was recorded with — re-record with --record, or put the recorded text back in the file`,
      );
    }
  }
  // The catalog: the real key for a recording; a replay's calls never leave
  // the page, so a placeholder — and the model the recording names, so the
  // requests are the recorded ones even after the default moves on.
  const [provider = "google", model = GEMINI_DEFAULT_MODEL] = (
    recording?.model ?? `google:${GEMINI_DEFAULT_MODEL}`
  ).split(":");
  if (provider !== "google") {
    throw new Error(
      `${recordingFile(locale)} was recorded against ${provider} — the generator speaks Gemini only`,
    );
  }
  const key = recording === undefined ? apiKey : undefined;
  const catalog = geminiQuickCatalog(key ?? "replay", model);
  const context = await browser.newContext({
    viewport: popupViewport,
    deviceScaleFactor: VIDEO_SCALE,
    colorScheme: "light",
  });
  // The catalog rides the harness's global, never a URL: it holds the key.
  await seedHarness(context, {
    catalog,
    ...(recording === undefined ? {} : { replay: replayStreams(recording) }),
  });
  const startedAt = performance.now();
  const errors: string[] = [];
  try {
    const page = await context.newPage();
    await openPopup(page, locale, errors);
    const live = await buildCapture(page, source);
    const capture = recording === undefined ? live : replayCapture(live, recording.capture);
    const session = await runSession({
      page,
      locale,
      capture,
      messages: recording?.turns.map((turn) => turn.message),
      workDir,
      errors,
    });
    // The encodes are independent: one ffmpeg each, side by side — a
    // captioned demo once per variant, the poster from the default one.
    await Promise.all(
      session.demos.flatMap((demo) => {
        const span = concatList(session, demo, workDir);
        const lines = CAPTIONS[folder]?.[demo.name];
        const moments = lines === undefined ? undefined : cuesOf(session, demo);
        if (lines !== undefined && moments === undefined) {
          throw new Error(
            `${demo.name} has captions in captions.ts, but only the page-stage demo can carry them`,
          );
        }
        if (lines !== undefined && moments !== undefined && lines.length !== moments.length) {
          throw new Error(
            `${folder}/${demo.name}: ${lines.length} caption lines for ${moments.length} beats`,
          );
        }
        return variantsOf(lines).map(async (variant, index) => {
          const out: Output = {
            mp4: join(outDir, `${demo.name}${variant.suffix}.mp4`),
            ...(index === 0 ? { jpg: join(outDir, `${demo.name}.jpg`) } : {}),
          };
          const captions =
            lines === undefined || moments === undefined
              ? undefined
              : {
                  files: await renderCaptions({
                    browser,
                    locale: folder,
                    lines,
                    variant,
                    dir: join(workDir, "captions"),
                  }),
                  moments,
                };
          await (demo.stage === "page"
            ? composeOverPage(mail, span, { ...out, captions })
            : composeAlone(span, out));
          console.log(
            `ok ${folder}/demo/${demo.name}${variant.suffix}.mp4 (${span.duration.toFixed(1)}s)`,
          );
        });
      }),
    );
    // The recording, or how far the replayed session strayed from it: a
    // request that no longer matches means the prompt or its context changed
    // since — the reply shown is still the recorded one — and fewer calls
    // than recorded means the demos themselves changed.
    let drift: number[] = [];
    if (recording === undefined) {
      const { turns, exchanges } = recordedCalls(session);
      const kept: Recording = {
        locale,
        recorded: new Date().toISOString(),
        model: session.usage[0]?.model ?? `google:${GEMINI_DEFAULT_MODEL}`,
        capture: recordedCapture(capture),
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
      drift = session.exchanges.flatMap((call, index) =>
        sha256Text(call.body) === recording.exchanges[index]?.bodySha256 ? [] : [index + 1],
      );
      if (drift.length > 0) {
        console.log(
          `   note: model call ${drift.join(", ")} sent a request the recording (${recording.recorded}) never saw — a prompt changed since, or a message or an earlier reply was edited in it; the replies shown are the recorded ones (re-record with --record to have the model answer the new request)`,
        );
      }
      if (session.exchanges.length < recording.exchanges.length) {
        console.log(
          `   note: the recording (${recording.recorded}) holds ${recording.exchanges.length} model calls and this session made ${session.exchanges.length} — the demos changed since; re-record with --record`,
        );
      }
    }
    writeFileSync(
      join(workDir, "report.json"),
      `${JSON.stringify({ locale: folder, mode, ...session, frames: session.frames.length, exchanges: undefined, drift }, undefined, 2)}\n`,
    );
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    console.log(`   ${folder}: ${session.frames.length} frames, ${seconds}s`);
    if (session.errors.length > 0) {
      console.log(`   page errors: ${session.errors.join(" | ")}`);
    }
    if (!keepWork) {
      rmSync(workDir, { recursive: true, force: true });
    }
  } catch (error) {
    // The failed locale's work stays; the report says what stopped it.
    writeFileSync(
      join(workDir, "report.json"),
      `${JSON.stringify({ locale: folder, mode, failed: error instanceof Error ? error.message : String(error), errors }, undefined, 2)}\n`,
    );
    throw error;
  } finally {
    await context.close();
  }
}

async function generateAll(
  browser: Browser,
  mail: { dir: string; frames: Frame[] },
): Promise<void> {
  for (const locale of locales.filter((entry) => !skipped.includes(entry))) {
    try {
      await generateOne(browser, mail, locale);
    } catch (error) {
      failures.push(`${locale}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`FAILED ${locale} — work kept at ${join(workRoot, locale.toLowerCase())}`);
    }
  }
}

const stopDevServer = await ensureDevServer();
try {
  const browser = await webkit.launch();
  const pageDir = join(workRoot, "page");
  try {
    const mail = { dir: pageDir, frames: await renderPage(browser, pageDir) };
    await generateAll(browser, mail);
  } finally {
    await browser.close();
    if (!keepWork) {
      rmSync(pageDir, { recursive: true, force: true });
    }
  }
} finally {
  stopDevServer();
}
if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`videos under ${outRoot}`);
