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
 *  Mock data is the real thing where the dev server can reach it: the
 *  pre-installed prompts and default rules come from src-tauri/, not copies.
 */

import rulesRaw from "../../src-tauri/rules.json?raw";
import { version } from "../../package.json";

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

/** The pre-installed prompts, parsed from their real .md sources. The
 *  frontmatter dialect (plain `key: value` plus `|-` blocks) mirrors the
 *  parser in src-tauri/src/prompts.rs — that file owns the format; keep in
 *  step. */
function builtinPrompts(): Record<string, unknown>[] {
  const sources = import.meta.glob("/src-tauri/prompts/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return Object.values(sources).map((raw) => {
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

// ---- The Tauri IPC mock -------------------------------------------------

let nextId = 0;

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
  "plugin:event|listen": () => (nextId += 1),
  "plugin:event|unlisten": () => null,
  "plugin:event|emit": () => null,
  "plugin:autostart|is_enabled": () => false,
  // Sinks, not data: the log plugin must swallow silently — an "unhandled"
  // warning for it would be forwarded to the log plugin again, and that
  // recursion has crashed the WebKit renderer — and the zoom call is a no-op
  // in a plain browser.
  "plugin:log|log": () => null,
  "plugin:webview|set_webview_zoom": () => null,
  list_prompts_ui: () => builtinPrompts(),
  get_rules_ui: () => defaultRules(),
  read_usage_stats: () => [],
  read_catalog: () => "{}",
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
  transformCallback: (fn: (payload: unknown) => void) => number;
  unregisterCallback: (id: number) => void;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const label = params.get("window") ?? "settings";
(globalThis as unknown as { __TAURI_INTERNALS__: TauriInternals }).__TAURI_INTERNALS__ = {
  metadata: {
    currentWindow: { label },
    currentWebview: { label, windowLabel: label },
  },
  transformCallback: () => (nextId += 1),
  unregisterCallback: () => undefined,
  invoke: (cmd, args = {}) => {
    const handler = handlers[cmd];
    if (handler === undefined) {
      console.warn(`tauri mock: unhandled command ${cmd}`, args);
      return Promise.resolve(null);
    }
    return Promise.resolve(handler(args));
  },
};

// The mock must exist before any app module evaluates — hence dynamic.
await import("@/main.tsx");
