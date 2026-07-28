import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { generateText, streamText } from "ai";
import { Config, createCatalog } from "ai-sdk-catalog";
import { ping } from "ai-sdk-ping";
import { franc } from "franc-min";
import { Liquid } from "liquidjs";
import { listActions } from "@/lib/actions.ts";
import { getUserContext } from "@/lib/settings.ts";
// Meta-prompt for the actions form: turns a rough "what I want" into a proper
// action instruction, written by the user's own configured model. A real .md
// file (like the pre-installed actions) so the formatter keeps it honest.
import DRAFT_TEMPLATE from "@/lib/draft-instruction.md?raw";
// The heavy half of @/lib/llm (see the facade there for why it is split);
// the error sentinels and the ActionInput shape live on the facade.
import {
  type ActionInput,
  EMPTY_RESULT,
  INVALID_CONFIG,
  NOT_CONFIGURED,
  TIMED_OUT,
  type StreamOutcome,
  type TokenUsage,
} from "@/lib/llm.ts";
import { createLogger } from "@/lib/log.ts";
// The system-prompt assembly and the <result> streaming protocol (pure, no
// Tauri imports — see prompt.ts for the section layout and its rationale).
import { composeInstructions, composeUserText, extractResult } from "@/lib/prompt.ts";

const log = createLogger("llm");

/** How long the stream may stay silent (before the first token, or between
 *  tokens) before the run fails with TIMED_OUT. Generous on purpose: a local
 *  model can spend a long time cold-loading and a reasoning model can think in
 *  silence before its first visible token. The ceiling only exists so a wedged
 *  connection can never spin the popup forever. */
const INACTIVITY_TIMEOUT_MS = 90_000;

/** Parse raw ai-sdk-catalog.json text and validate it against the package's
 *  zod schema. A thrown error is for the log only — the user always sees an
 *  i18n sentence, never the raw issues. */
function parseCatalog(text: string): Config {
  return Config.parse(JSON.parse(text));
}

let catalogPromise: Promise<ReturnType<typeof createCatalog>> | undefined;

// Settings broadcasts this after writing the catalog; drop the cache so the next
// run rebuilds with the new provider/model/key.
void listen("catalog-changed", () => {
  catalogPromise = undefined;
});

async function buildCatalog(): Promise<ReturnType<typeof createCatalog>> {
  // Rust is IO only (read text); all parsing and validation happens here, in
  // one zod-checked pass. API keys are inline in the file — a GUI app never
  // sees shell environment variables (launchd, not the shell, is its parent),
  // so the catalog's `{ "envVarName": … }` key form would resolve to nothing
  // here; inline strings are the only form that works in ZenCopy.
  const text = await invoke<string>("read_catalog");
  if (!text.trim()) {
    throw new Error(NOT_CONFIGURED);
  }
  let config: Config;
  try {
    config = parseCatalog(text);
  } catch (error) {
    log.error("ai-sdk-catalog.json failed validation", error);
    throw new Error(INVALID_CONFIG, { cause: error });
  }
  return createCatalog(config);
}

async function catalog(): Promise<ReturnType<typeof createCatalog>> {
  const pending = (catalogPromise ??= buildCatalog());
  try {
    return await pending;
  } catch (error) {
    // Never cache a failure: the config may be fixed (settings save, a repaired
    // file) before the next run — Retry must re-read the config from Rust
    // instead of replaying a stale rejection. Only drop the cache if it still
    // holds this failed attempt (a rebuild may already be underway).
    if (catalogPromise === pending) {
      catalogPromise = undefined;
    }
    throw error;
  }
}

/** Thrown when the connection test could not reach the model. */
const UNREACHABLE = "unreachable";

/** How long the connection test may take overall. Shorter than the action
 *  watchdog — a test is an interactive "is my config right?" check. */
const TEST_TIMEOUT_MS = 30_000;

/**
 * Verify the saved catalog end to end: build it fresh from disk, then probe
 * the `default` role with ai-sdk-ping (which aborts on the first stream event,
 * so latency and cost stay minimal). Config errors (missing file, bad JSON,
 * unknown role) throw with their real reason; an unreachable model throws
 * UNREACHABLE — ping reports reachability only, not why.
 */
export async function testConnection(): Promise<void> {
  catalogPromise = undefined; // test what is on disk right now, not a cache
  const resolved = await catalog();

  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    // A timeout is inherently a constructed promise — nothing to reuse here,
    // and ping() takes no abort signal (yet).
    // oxlint-disable-next-line promise/avoid-new
    const deadline = new Promise<never>((_resolve, reject) => {
      watchdog = setTimeout(() => {
        reject(new Error(TIMED_OUT));
      }, TEST_TIMEOUT_MS);
    });
    const reachable = await Promise.race([ping(resolved.modelForRole("default")), deadline]);
    if (!reachable) {
      throw new Error(UNREACHABLE);
    }
  } finally {
    clearTimeout(watchdog);
  }
  log.debug("connection test passed (role=default)");
}

// The meta-prompt is itself a Liquid template (the examples section), but its
// *content* documents the `{{ … }}` variables literally — so this instance
// uses square-bracket delimiters (`[% %]` tags, `[[ ]]` output) and leaves
// `{{ }}` untouched. Bracket pairs chosen to share no prefix with each other.
const metaLiquid = new Liquid({
  tagDelimiterLeft: "[%",
  tagDelimiterRight: "%]",
  outputDelimiterLeft: "[[",
  outputDelimiterRight: "]]",
});

/** The pre-installed actions, as few-shot examples for drafting — the house
 *  style, straight from the running app (single source; no build-time copy).
 *  Drafting still works if the list can't be read; the examples just help. */
async function builtinExamples(): Promise<{ label: string; instructions: string }[]> {
  try {
    const actions = await listActions();
    return actions.filter((action) => action.origin === "builtin");
  } catch (error) {
    log.warn("reading built-in actions for draft examples failed", error);
    return [];
  }
}

/**
 * Draft an action instruction from the user's rough description, using the
 * default role. Same failure modes as an action run (NOT_CONFIGURED,
 * INVALID_CONFIG, EMPTY_RESULT); bounded like the connection test.
 */
export async function draftInstruction(description: string): Promise<string> {
  const [resolved, builtins] = await Promise.all([catalog(), builtinExamples()]);
  const instructions = await metaLiquid.parseAndRender(DRAFT_TEMPLATE, { builtins });
  // No result-tag protocol here, on purpose: with it, the model weaves "wrap
  // the output in tags" into the drafted instruction itself. The tolerant
  // extraction still strips tags if a model adds them anyway.
  const { text } = await generateText({
    model: resolved.modelForRole("default"),
    instructions,
    prompt: description,
    abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
  const drafted = extractResult(text, true) ?? text.trim();
  if (!drafted) {
    throw new Error(EMPTY_RESULT);
  }
  return drafted;
}

const liquid = new Liquid();

// `{{ locale | language_name }}` → "Japanese": prompts read better with the
// English language name than a BCP 47 tag, and Intl.DisplayNames knows them
// all. Registered here so every action template gets it.
const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
liquid.registerFilter("language_name", (code: unknown): string => {
  try {
    return languageNames.of(String(code)) ?? String(code);
  } catch {
    return String(code); // not a valid language tag — pass it through
  }
});

// `{{ text | language_of }}` → "Japanese": which language a text is written in,
// via franc (trigram statistics — no network, no model). Lets a template
// *branch* on the input's language, so direction decisions happen in Liquid,
// deterministically, instead of being delegated to the model mid-prompt.
// Returns "" when detection is unsure — templates treat that as "no match".
const MACRO_LANGUAGES: Record<string, string> = {
  cmn: "zh", // franc reports Mandarin; align with the "zh" the UI would use
};
liquid.registerFilter("language_of", (value: unknown): string => {
  const code = franc(String(value));
  if (code === "und") {
    return "";
  }
  try {
    return languageNames.of(MACRO_LANGUAGES[code] ?? code) ?? "";
  } catch {
    return "";
  }
});

/**
 * Stream an action: render its Liquid templates, then stream the model's text,
 * revealing only the text between the result tags. `onChunk` receives the
 * text-so-far; the returned promise resolves with the final text (or what
 * streamed before `signal` aborted).
 */
export async function streamAction(
  action: ActionInput,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  const attachments = action.attachments ?? [];
  const binaries = attachments.filter((file) => !file.media_type.startsWith("text/"));
  const texts = attachments.filter((file) => file.media_type.startsWith("text/"));

  // Text files ARE text: their content becomes {{ text }}, exactly as if it
  // had been copied — one meaning for templates, language detection, and the
  // model alike. Several files in one capture join with separators; their
  // paths are listed separately below.
  const vars = { ...action.vars };
  if (texts.length > 0 && !vars["text"]) {
    vars["text"] = texts.map((file) => file.data).join("\n\n---\n\n");
  }

  const [instructions, prompt, userContext] = await Promise.all([
    liquid.parseAndRender(action.instructions, vars),
    liquid.parseAndRender(action.prompt, vars),
    // Read fresh per run, so a just-saved profile applies without any event
    // plumbing (a settings-store read is one cheap IPC round trip).
    getUserContext(),
  ]);
  const resolved = await catalog();

  // One signal reaches the SDK, fed by two sources: the caller's Stop and the
  // inactivity watchdog. `timedOut` remembers which one fired — the caller's
  // `signal` keeps meaning "the user stopped this on purpose".
  const aborter = new AbortController();
  let timedOut = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const feedWatchdog = (): void => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      timedOut = true;
      aborter.abort();
    }, INACTIVITY_TIMEOUT_MS);
  };
  const forwardStop = (): void => {
    aborter.abort();
  };
  if (signal.aborted) {
    aborter.abort();
  } else {
    signal.addEventListener("abort", forwardStop, { once: true });
  }

  // A plain text capture is a bare prompt; binary attachments ride as AI SDK
  // file parts on a single user message (text files already travel inside the
  // prompt, via {{ text }}). Their path list joins the text part via
  // composeUserText's <attached_files> section.
  const attachedPaths = attachments
    .map((file) => file.path)
    .filter((path): path is string => typeof path === "string");
  const request =
    attachments.length > 0
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: composeUserText(prompt, attachedPaths) },
                ...binaries.map((file) => ({
                  type: "file" as const,
                  data: file.data,
                  mediaType: file.media_type,
                  filename: file.name,
                })),
              ],
            },
          ],
        }
      : { prompt };

  // AI SDK only throws stream-stopping errors (e.g. network) from the iterator;
  // others (API errors) go to `onError` and the stream just ends. Capture them
  // so we surface the real reason instead of silently rendering nothing.
  let streamError: unknown;
  const stream = streamText({
    model: resolved.modelForRole(action.role),
    instructions: composeInstructions(instructions, userContext),
    ...request,
    abortSignal: aborter.signal,
    onError: ({ error }) => {
      streamError = error;
    },
  });
  const { textStream } = stream;
  // The catalog address that serves this run — the fact cost math needs
  // (roles are indirection; the statistics record what they resolved to).
  const modelRef = (resolved.roles[action.role] ?? resolved.roles["default"])?.key;
  // The SDK settles `usage` when the stream ends; an aborted stream may
  // reject it or leave it hanging, so cap the wait and settle for "unknown".
  // The mapping to our own field names is the schema firewall: when the SDK
  // renames usage fields again, only these lines change.
  const harvestTokens = async (): Promise<TokenUsage | undefined> => {
    try {
      // oxlint-disable-next-line promise/avoid-new -- a timer has no promise form
      const deadline = new Promise<undefined>((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 2000);
      });
      const usage = await Promise.race([stream.usage, deadline]);
      if (!usage) {
        return undefined;
      }
      const tokens: TokenUsage = {};
      if (usage.inputTokens !== undefined) {
        tokens.in = usage.inputTokens;
      }
      if (usage.outputTokens !== undefined) {
        tokens.out = usage.outputTokens;
      }
      if (usage.inputTokenDetails.cacheReadTokens) {
        tokens.cacheRead = usage.inputTokenDetails.cacheReadTokens;
      }
      if (usage.inputTokenDetails.cacheWriteTokens) {
        tokens.cacheWrite = usage.inputTokenDetails.cacheWriteTokens;
      }
      return tokens.in === undefined && tokens.out === undefined ? undefined : tokens;
    } catch {
      return undefined; // aborted or failed stream — the cost stays unknown
    }
  };

  let raw = "";
  let iteratorError: unknown;
  let iteratorThrew = false;
  const startedAt = Date.now();
  try {
    feedWatchdog(); // arm for the first token (covers connect + model latency)
    for await (const delta of textStream) {
      feedWatchdog();
      raw += delta;
      const result = extractResult(raw, false);
      if (result !== undefined) {
        onChunk(result);
      }
    }
  } catch (error) {
    // Triaged below together with the quiet-failure cases (an aborted or
    // failed stream can also just end, depending on the provider).
    iteratorError = error;
    iteratorThrew = true;
  } finally {
    clearTimeout(watchdog);
    signal.removeEventListener("abort", forwardStop);
  }

  const elapsed = `${Date.now() - startedAt}ms`;
  if (signal.aborted) {
    log.debug(`run stopped by the user after ${elapsed} (role=${action.role})`);
    // Stopped — keep what we have (and whatever tokens the provider reported).
    return {
      text: extractResult(raw, true) ?? raw.trim(),
      model: modelRef,
      tokens: await harvestTokens(),
    };
  }
  if (streamError) {
    throw streamError instanceof Error
      ? streamError
      : new Error(String(streamError), { cause: streamError });
  }
  if (timedOut) {
    log.warn(
      `run timed out after ${elapsed} of silence (role=${action.role}, ${raw.length} chars received)`,
    );
    throw new Error(TIMED_OUT);
  }
  if (iteratorThrew) {
    throw iteratorError instanceof Error
      ? iteratorError
      : new Error(String(iteratorError), { cause: iteratorError });
  }

  // If the model never opened a result tag, fall back to the whole output (and
  // reveal it now, since nothing streamed). A finished stream with nothing in
  // it is an error, never a silent "success".
  const tagged = extractResult(raw, true);
  if (tagged === undefined && raw.trim()) {
    log.warn(
      `model ignored the result-tag protocol; falling back to the full output (role=${action.role})`,
    );
  }
  const result = tagged ?? raw.trim();
  if (!result) {
    throw new Error(EMPTY_RESULT);
  }
  log.debug(`run finished in ${elapsed} (role=${action.role}, ${result.length} chars)`);
  onChunk(result);
  return { text: result, model: modelRef, tokens: await harvestTokens() };
}
