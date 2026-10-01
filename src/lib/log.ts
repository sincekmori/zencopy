// The one funnel for frontend logging. Every line lands in the same sinks as
// the Rust side (stdout in dev, the rotating platform log file in release) via
// tauri-plugin-log, tagged with the window it came from. Always log through
// this module — never `console.*` or `@tauri-apps/plugin-log` directly — so
// errors are described in full (own properties, stack, cause chain) and
// secrets or copied content can never leak into the log file.

import { getCurrentWindow } from "@tauri-apps/api/window";
import * as sink from "@tauri-apps/plugin-log";

type Level = "debug" | "info" | "warn" | "error";

const SINKS: Record<Level, (message: string) => Promise<void>> = {
  debug: sink.debug,
  info: sink.info,
  warn: sink.warn,
  error: sink.error,
};

// Originals, captured before the console forwarders are installed, so neither
// the forwarders nor the sink-failure fallback can ever recurse into us.
const NATIVE_CONSOLE = { warn: console.warn.bind(console), error: console.error.bind(console) };

/** Keys whose values must never reach the log file, wherever they appear:
 *  credentials, and request payloads that contain whatever the user copied.
 *  A net for ordinary values — an AI SDK error is not left to it (see
 *  `describeAiError`). */
const REDACTED_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "headers",
  "requestheaders",
  "responseheaders",
  "password",
  "secret",
  "token",
  "prompt",
  "messages",
  "input",
  "requestbodyvalues",
]);

/** One error's worth of detail is plenty; past this it is noise on disk. */
const MAX_DETAIL_CHARS = 4000;

function truncate(text: string): string {
  if (text.length <= MAX_DETAIL_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_DETAIL_CHARS)}… (+${text.length - MAX_DETAIL_CHARS} chars)`;
}

/** JSON with secrets redacted; falls back to String for circular values. */
function stringify(value: unknown): string {
  try {
    const json = JSON.stringify(value, (key, val: unknown) =>
      REDACTED_KEYS.has(key.toLowerCase()) ? "[redacted]" : val,
    );
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** What an AI SDK error may say about itself in the log. */
const AI_ERROR_FACTS = [
  "statusCode",
  "isRetryable",
  "reason",
  "functionality",
  "modelId",
  "modelType",
] as const;

/** Errors a failed request ends in whose message is the engine's own words. */
const PLAIN_SPOKEN = new Set(["TypeError", "AbortError", "TimeoutError"]);

/** An AI SDK error, described from a list of what is safe — never by what it
 *  holds. These errors carry what was sent and what came back: a response
 *  body that echoes the request, the chunk a schema refused, in `message` as
 *  much as in their fields (and a V8 stack opens with the message). So: the
 *  class, the status, where the request went (without its query), and the
 *  provider's own code for the failure. What the provider said in words is on
 *  screen in the popup; it stays out of the file. */
function describeAiError(error: Error, depth: number): string {
  const fields: Record<string, unknown> = { ...error };
  const facts: string[] = [];
  for (const key of AI_ERROR_FACTS) {
    const fact = fields[key];
    if (typeof fact === "string" || typeof fact === "number" || typeof fact === "boolean") {
      facts.push(`${key}=${fact}`);
    }
  }
  if (typeof fields["url"] === "string") {
    facts.push(`url=${fields["url"].split(/[?#]/u, 1)[0]}`);
  }
  const provider = isRecord(fields["data"]) ? fields["data"]["error"] : undefined;
  if (isRecord(provider)) {
    for (const key of ["type", "code"]) {
      const fact = provider[key];
      if ((typeof fact === "string" && fact.length <= 80) || typeof fact === "number") {
        facts.push(`${key}=${fact}`);
      }
    }
  }
  const parts = [facts.length > 0 ? `${error.name} (${facts.join(", ")})` : error.name];
  if (depth < 4) {
    const attempts = Array.isArray(fields["errors"]) ? fields["errors"] : [];
    for (const [index, attempt] of attempts.entries()) {
      parts.push(`attempt ${index + 1}: ${describeWithin(attempt, depth + 1)}`);
    }
    if (error.cause !== undefined) {
      parts.push(`caused by: ${describeWithin(error.cause, depth + 1)}`);
    }
  }
  return parts.join("\n");
}

/** A value inside an AI SDK error — a cause, one attempt of a retry. It is
 *  made of the same request and response, so it says as little: another AI
 *  SDK error by the same list, a schema's verdict by where it failed, the
 *  engine's own errors in their words, anything else by its name alone (a
 *  JSON parse error quotes the text it choked on). */
function describeWithin(value: unknown, depth: number): string {
  if (!(value instanceof Error)) {
    return typeof value;
  }
  if (value.name.startsWith("AI_")) {
    return describeAiError(value, depth);
  }
  const issues: unknown = (value as Error & { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    const failed = issues
      .filter((issue) => isRecord(issue))
      .map((issue) => {
        const path = Array.isArray(issue["path"]) ? issue["path"].join(".") : "";
        return `${path}: ${String(issue["code"])}`;
      });
    return `${value.name} (${failed.join("; ")})`;
  }
  return PLAIN_SPOKEN.has(value.name) ? `${value.name}: ${value.message}` : value.name;
}

function describeValue(value: unknown, depth: number): string {
  if (value instanceof Error) {
    if (value.name.startsWith("AI_")) {
      return describeAiError(value, depth);
    }
    const parts = [`${value.name}: ${value.message}`];
    // Own enumerable fields carry the interesting parts of rich errors.
    const fields = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "cause" && key !== "stack"),
    );
    if (Object.keys(fields).length > 0) {
      parts.push(stringify(fields));
    }
    if (value.stack) {
      parts.push(value.stack);
    }
    if (value.cause !== undefined && depth < 4) {
      parts.push(`caused by: ${describeValue(value.cause, depth + 1)}`);
    }
    return parts.join("\n");
  }
  if (typeof value === "string") {
    return value;
  }
  return stringify(value);
}

/** Everything worth knowing about a thrown value, as loggable text: message,
 *  own properties (redacted), stack, and the full cause chain — and of an AI
 *  SDK error, only what is safe to keep. */
function describeError(value: unknown): string {
  return truncate(describeValue(value, 0));
}

/** The short human-readable message of a thrown value, for UI display —
 *  `describeError` is the full version for logs. Providers and SDKs
 *  occasionally throw non-Error objects; `String` would render those as
 *  "[object Object]". */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

const windowLabel = getCurrentWindow().label;

function emit(level: Level, message: string, detail?: unknown): void {
  const text = detail === undefined ? message : `${message} — ${describeError(detail)}`;
  void (async () => {
    try {
      await SINKS[level](`[${windowLabel}] ${text}`);
    } catch (error) {
      // The log pipeline itself failed (e.g. the backend is shutting down);
      // the native console is the last resort, never this module again.
      NATIVE_CONSOLE.error("log sink failed", error, text);
    }
  })();
}

interface Logger {
  debug: (message: string, detail?: unknown) => void;
  info: (message: string, detail?: unknown) => void;
  warn: (message: string, detail?: unknown) => void;
  error: (message: string, detail?: unknown) => void;
}

/** A logger for one area of the app (e.g. `createLogger("popup")`). `detail`
 *  accepts anything thrown or otherwise interesting; it is described in full
 *  and redacted before it reaches the file. */
export function createLogger(scope: string): Logger {
  const at =
    (level: Level) =>
    (message: string, detail?: unknown): void => {
      emit(level, `${scope}: ${message}`, detail);
    };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
  };
}

let installed = false;

/** Route everything that would otherwise die in the webview console into the
 *  log file: uncaught errors, unhandled promise rejections, and library
 *  `console.warn` / `console.error` calls. Called once per window at startup. */
export function installGlobalErrorLogging(): void {
  if (installed) {
    return;
  }
  installed = true;

  const log = createLogger("uncaught");
  globalThis.addEventListener("error", (event) => {
    const where = event.filename ? ` at ${event.filename}:${event.lineno}` : "";
    log.error(`uncaught error${where}`, event.error ?? event.message);
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    log.error("unhandled promise rejection", event.reason);
  });

  for (const level of ["warn", "error"] as const) {
    console[level] = (...args: unknown[]): void => {
      NATIVE_CONSOLE[level](...args);
      emit(level, `console: ${args.map((arg) => describeError(arg)).join(" ")}`);
    };
  }
}
