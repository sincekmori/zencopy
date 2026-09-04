/* oxlint-disable unicorn/no-null, no-underscore-dangle -- the Tauri IPC wire
   format speaks `null` and names its global `__TAURI_INTERNALS__`; a mock
   must speak the same dialect. */
/** Dev-only screenshot harness: renders the app's windows in a plain browser
 *  by mocking the Tauri IPC layer, so per-locale screenshots can be taken
 *  headlessly (scripts/screenshot.ts) with no window automation and no OS
 *  screen-recording permission. Entry: /screenshot.html, served by
 *  `bun run dev` — this module is never imported by the app itself.
 *
 *  URL parameters:
 *  - `window`:  the window to render (`settings` | `popup` | `about`),
 *               default `settings`.
 *  - `locale`:  a concrete app locale (`ja`, `zh-Hans`, …), default `en`.
 *  - `welcome`: when present, first-run state (the welcome screen).
 *  - `store`:   JSON object merged into the mocked settings store, for
 *               anything beyond the shortcuts above.
 *  - `screenshot`: a scenario name read by the app itself
 *               (`screenshotScenario` in src/lib/screenshot.ts).
 *
 *  The driver global, `globalThis.__zencopyHarness`, is the channel for what
 *  cannot ride a URL. A driver seeds it before this module runs (Playwright's
 *  `addInitScript`) and this module completes it:
 *  - `catalog` (in): the ai-sdk-catalog config `read_catalog` hands the app,
 *               as the JSON object or its text — with a real API key in it,
 *               the popup runs real model calls (the demo recordings). Never
 *               a URL parameter: a key must not land in a URL or a log line.
 *  - `emit` (out): `emit(event, payload)` delivers a Tauri event to the app's
 *               `listen` handlers, the way Rust's `emit` would — a `capture`
 *               event with a CapturePayload is a C+C without the trigger.
 *  - `exchanges` (out): every cross-origin `fetch` the app made — the model
 *               calls — with the response as it streamed in, chunk by chunk
 *               with timings. What a demo recording keeps.
 *  - `replay` (in): recorded exchanges to serve instead of the network, in
 *               order, each chunk at its recorded time — the same demo
 *               again, without a model call.
 *
 *  Mock data is the real thing where the dev server can reach it: the
 *  pre-installed prompts and default rules come from src-tauri/, not copies.
 */

import rulesRaw from "../../src-tauri/rules.json?raw";
import promptsRs from "../../src-tauri/src/prompts.rs?raw";
import { version } from "../../package.json";
import type { Exchange } from "./exchange.ts";

// Playwright's WebKit driver crashes rendering console previews of object
// arguments — stringify everything the page logs.
for (const method of ["log", "warn", "error", "info", "debug"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]): void => {
    original(
      ...args.map((arg) => {
        if (typeof arg !== "object" || arg === null) {
          return arg;
        }
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }),
    );
  };
}

const params = new URLSearchParams(globalThis.location.search);

// ---- The mocked settings store ------------------------------------------

const storeData: Record<string, unknown> = {
  locale: params.get("locale") ?? "en",
  theme: "light",
  textSize: "standard",
};
if (!params.has("welcome")) {
  storeData["welcomeSeen"] = true;
}
const extra = params.get("store");
if (extra !== null) {
  Object.assign(storeData, JSON.parse(extra) as Record<string, unknown>);
}

// ---- Real data from src-tauri/, served by the dev server ----------------

/** The order the app lists the pre-installed prompts in: DEFAULT_PROMPTS in
 *  src-tauri/src/prompts.rs, read off its `("zencopy-…", include_str!(…))`
 *  entries — the glob below would hand the files over by name instead. */
const BUILTIN_ORDER = [...promptsRs.matchAll(/\("(zencopy-[a-z]+)", include_str!/gu)].map(
  (match) => match[1],
);

/** The pre-installed prompts, parsed from their real .md sources, in the
 *  app's order. The frontmatter dialect (plain `key: value` plus `|-`
 *  blocks) mirrors the parser in src-tauri/src/prompts.rs — that file owns
 *  the format; keep in step. */
function builtinPrompts(): Record<string, unknown>[] {
  const sources = import.meta.glob("/src-tauri/prompts/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return parsePrompts(Object.values(sources)).toSorted(
    (a, b) => BUILTIN_ORDER.indexOf(a.id) - BUILTIN_ORDER.indexOf(b.id),
  );
}

function parsePrompts(raws: string[]): { id: string; [key: string]: unknown }[] {
  return raws.map((raw) => {
    const [, front = "", ...rest] = raw.split("---\n");
    const fields: Record<string, string> = {};
    let block: string | undefined;
    for (const line of front.split("\n")) {
      const match = /^(\w+):\s*(.*)$/u.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        block = match[2] === "|-" ? match[1] : undefined;
        fields[match[1]] = block === undefined ? match[2] : "";
      } else if (block !== undefined && line.startsWith("  ")) {
        fields[block] = `${fields[block]}${fields[block] === "" ? "" : "\n"}${line.trim()}`;
      }
    }
    return {
      id: fields["id"] ?? "",
      label: fields["label"] ?? "",
      instructions: fields["instructions"] ?? "",
      prompt: rest.join("---\n").trim(),
      role: fields["role"] ?? null,
      origin: "builtin",
    };
  });
}

/** The default rules, from the real rules.json. */
function defaultRules(): Record<string, unknown> {
  const parsed = JSON.parse(rulesRaw) as Record<string, unknown>;
  const { overrides = [], ...byKind } = parsed;
  return { by_kind: byKind, overrides };
}

// ---- The driver global ---------------------------------------------------

interface HarnessGlobal {
  /** In: the catalog `read_catalog` returns (object or JSON text). */
  catalog?: unknown;
  /** Out: deliver a Tauri event to the app's listeners; returns how many
   *  received it, so a driver can tell "nobody listens yet" from "handled". */
  emit?: (event: string, payload: unknown) => number;
  /** Out: every `record_usage` call's arguments (prompt, kind, model,
   *  tokens), so a driver can report what its real model calls cost. */
  usage?: unknown[];
  /** Out: the model calls, as they went over `fetch` (see {@link Exchange}). */
  exchanges?: Exchange[];
  /** In: recorded responses to answer the app's model calls with, in order. */
  replay?: Replay[];
}

/** What a replayed call needs of an {@link Exchange}: the response. */
type Replay = Pick<Exchange, "status" | "contentType" | "chunks">;

const harnessHost = globalThis as { __zencopyHarness?: HarnessGlobal };
const harness: HarnessGlobal = harnessHost.__zencopyHarness ?? {};
harnessHost.__zencopyHarness = harness;

/** What `read_catalog` returns: the seeded catalog, else the empty object
 *  the app reads as "nothing configured" (its Not-configured state). */
function catalogText(): string {
  if (harness.catalog === undefined) {
    return "{}";
  }
  return typeof harness.catalog === "string" ? harness.catalog : JSON.stringify(harness.catalog);
}

// ---- The model calls, recorded or replayed ------------------------------

const seconds = (since: number): number => Number(((performance.now() - since) / 1000).toFixed(3));

/** The response's body passed through as it arrives, each chunk also noted
 *  on the exchange with its arrival time. */
function recordedBody(response: Response, record: Exchange, startedAt: number): Response {
  const source = response.body;
  if (source === null) {
    return response;
  }
  const reader = source.getReader();
  const decoder = new TextDecoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = decoder.decode();
        if (tail !== "") {
          record.chunks.push([seconds(startedAt), tail]);
        }
        controller.close();
        return;
      }
      record.chunks.push([seconds(startedAt), decoder.decode(value, { stream: true })]);
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** A recorded response body, its chunks arriving at their recorded times. */
function replayedBody(take: Replay, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const timers = take.chunks.map(([at, text]) =>
        setTimeout(() => {
          controller.enqueue(encoder.encode(text));
        }, at * 1000),
      );
      // Same delay as the last chunk: timers fire in scheduling order.
      timers.push(
        setTimeout(
          () => {
            open = false;
            controller.close();
          },
          (take.chunks.at(-1)?.[0] ?? 0) * 1000,
        ),
      );
      signal.addEventListener(
        "abort",
        () => {
          for (const timer of timers) {
            clearTimeout(timer);
          }
          if (open) {
            open = false;
            controller.error(signal.reason);
          }
        },
        { once: true },
      );
    },
  });
}

// Every cross-origin fetch — the model calls; the dev server's own are left
// alone — is noted on `harness.exchanges`, and answered from `harness.replay`
// when a driver seeded one. The SDK reads `globalThis.fetch` per call, so the
// wrapper only has to be in place before the app's first call: now.
const originalFetch = globalThis.fetch.bind(globalThis);
let served = 0;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === globalThis.location.origin) {
    return originalFetch(request);
  }
  // A key travels as a header here, never in the URL — but a URL is what
  // gets written down, so make sure by construction.
  url.searchParams.delete("key");
  const record: Exchange = {
    url: url.href,
    method: request.method,
    body: await request.clone().text(),
    status: 0,
    contentType: null,
    chunks: [],
  };
  (harness.exchanges ??= []).push(record);
  const startedAt = performance.now();
  if (harness.replay !== undefined) {
    const take = harness.replay[served];
    served += 1;
    if (take === undefined) {
      throw new Error(
        `harness replay: the app made a ${served}th model call, the recording has none`,
      );
    }
    record.status = take.status;
    record.contentType = take.contentType;
    record.chunks = take.chunks;
    return new Response(replayedBody(take, request.signal), {
      status: take.status,
      headers: take.contentType === null ? {} : { "content-type": take.contentType },
    });
  }
  const response = await originalFetch(request);
  record.status = response.status;
  record.contentType = response.headers.get("content-type");
  return recordedBody(response, record, startedAt);
};

// ---- The Tauri IPC mock -------------------------------------------------

let nextId = 0;

/** The callbacks `transformCallback` was handed, by the id it returned —
 *  what a real Tauri keeps as `window._<id>` so Rust can call back into the
 *  page. Kept here so events can reach the app's `listen` handlers. */
const callbacks = new Map<number, (payload: unknown) => void>();

/** The live `listen` subscriptions: listener id → event name and the
 *  callback id to hand the event to. `unlisten` removes by listener id, in
 *  both places the API does it (the plugin-internals map and the command). */
const listeners = new Map<number, { event: string; handler: number }>();

/** Deliver an event the way Rust's `emit` reaches the page: every listener of
 *  that name gets the `{ event, id, payload }` record `listen` handlers read
 *  (`id` is the listener's own, what `once` unlistens with). */
function emit(event: string, payload: unknown): number {
  let delivered = 0;
  for (const [id, listener] of listeners) {
    const receive = listener.event === event ? callbacks.get(listener.handler) : undefined;
    if (receive !== undefined) {
      receive({ event, id, payload });
      delivered += 1;
    }
  }
  return delivered;
}
harness.emit = emit;

/** Handlers by command — only what the app actually invokes; an unhandled
 *  command warns below, which is the signal to extend this map. */
const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  "plugin:store|load": () => 1,
  "plugin:store|get": (args) => {
    const value = storeData[args["key"] as string];
    return [value === undefined ? null : value, value !== undefined];
  },
  "plugin:store|set": (args) => {
    storeData[args["key"] as string] = args["value"];
    return null;
  },
  "plugin:event|listen": (args) => {
    nextId += 1;
    listeners.set(nextId, { event: args["event"] as string, handler: args["handler"] as number });
    return nextId;
  },
  "plugin:event|unlisten": (args) => {
    listeners.delete(args["eventId"] as number);
    return null;
  },
  // A frontend emit reaches this same page in Tauri too (the windows
  // broadcast settings changes to each other, themselves included).
  "plugin:event|emit": (args) => {
    emit(args["event"] as string, args["payload"]);
    return null;
  },
  "plugin:autostart|is_enabled": () => false,
  // Sinks, not data: the log plugin must swallow silently — an "unhandled"
  // warning for it would be forwarded to the log plugin again, and that
  // recursion has crashed the WebKit renderer — and the zoom call is a no-op
  // in a plain browser.
  "plugin:log|log": () => null,
  "plugin:webview|set_webview_zoom": () => null,
  // What a real prompt run touches besides the model: the usage ledger
  // append is kept for the driver's report, the copied-result clipboard
  // write has no one to see it here, and the popup's hide-on-dismiss has no
  // window to hide.
  record_usage: (args) => {
    (harness.usage ??= []).push(args);
    return null;
  },
  "plugin:clipboard-manager|write_text": () => null,
  "plugin:window|hide": () => null,
  // The updater's "is an update on offer?" read: none, ever, here.
  update_state: () => null,
  list_prompts_ui: () => builtinPrompts(),
  get_rules_ui: () => defaultRules(),
  read_usage_stats: () => [],
  read_catalog: () => catalogText(),
  app_info: () => ({
    name: "ZenCopy",
    version,
    os: "macOS",
    copyright: `© ${new Date().getFullYear()} Shinsuke Mori`,
  }),
};

interface TauriInternals {
  metadata: {
    currentWindow: { label: string };
    currentWebview: { label: string; windowLabel: string };
  };
  transformCallback: (fn: (payload: unknown) => void, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const label = params.get("window") ?? "settings";
(globalThis as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__ = {
  metadata: {
    currentWindow: { label },
    currentWebview: { label, windowLabel: label },
  },
  transformCallback: (fn, once = false) => {
    nextId += 1;
    const id = nextId;
    callbacks.set(id, (payload) => {
      if (once) {
        callbacks.delete(id);
      }
      fn(payload);
    });
    return id;
  },
  unregisterCallback: (id) => {
    callbacks.delete(id);
  },
  invoke: (cmd, args = {}) => {
    const handler = handlers[cmd];
    if (handler === undefined) {
      console.warn(`tauri mock: unhandled command ${cmd}`, args);
      return Promise.resolve(null);
    }
    return Promise.resolve(handler(args));
  },
};

// The event plugin's own global: `unlisten` calls this before the command
// (the API keeps its listener map page-side), and without it every unlisten
// — StrictMode's mount-unmount-mount included — rejects with a TypeError.
(
  globalThis as unknown as {
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: (event: string, id: number) => void };
  }
).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: (_event, id) => {
    listeners.delete(id);
  },
};

// The mock must exist before any app module evaluates — hence dynamic.
await import("@/main.tsx");
