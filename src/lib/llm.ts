import type { Attachment } from "@/lib/capture.ts";

/** Thrown when no LLM provider has been set up yet (first run). The popup shows a
 *  friendly prompt and opens settings instead of a raw error. */
export const NOT_CONFIGURED = "not-configured";

/** Thrown when ai-sdk-catalog.json exists but does not parse — bad JSON or a
 *  shape the zod schema rejects. The user gets a "fix it in settings" message;
 *  the full validation error (with paths) goes to the log. */
export const INVALID_CONFIG = "invalid-config";

/** Thrown when the stream stayed silent past the inactivity timeout — the model
 *  (or the connection) never responded, or stopped mid-stream. */
export const TIMED_OUT = "timed-out";

/** Thrown when the model finished successfully but produced nothing (an empty
 *  or whitespace-only result). Surfaced as an error — a check mark next to an
 *  empty body would read as "success with no output". */
export const EMPTY_RESULT = "empty-result";

/** The catalog roles ZenCopy itself depends on: every prompt without a
 *  frontmatter role runs as `default`, and the connection test pings it.
 *  The single definition feeds both the runtime catalog (createCatalog's
 *  `requiredRoles`) and the settings editor's validation, so "valid in the
 *  editor" and "valid at run time" can never disagree. */
export const REQUIRED_ROLES = ["default"] as const;

/** One turn of an prompt thread: the follow-up question that produced the
 *  reply (`text` is partial while the turn still streams). The first turn
 *  has no `question` — its question is the prompt's rendered prompt itself —
 *  except in a Custom thread, where the user's typed instruction is the first
 *  turn's question and travels inside the first user message. Shared with
 *  the popup, whose thread state is exactly this shape. */
export interface Exchange {
  question?: string | undefined;
  /** The assistant's extracted reply (the result-tag body). */
  text: string;
}

export interface PromptInput {
  role: string;
  instructions: string;
  prompt: string;
  vars: Record<string, string>;
  /** Image/file contents to send alongside the prompt (AI SDK file parts). */
  attachments?: Attachment[] | undefined;
  /** Continue the thread instead of starting one: the completed exchanges so
   *  far plus the new question. The first user message is rebuilt from
   *  `prompt`/`attachments` exactly as on the first run, so the model sees
   *  the whole conversation. With no exchanges yet, the question is a Custom
   *  run's opening instruction and becomes part of that first message. */
  followUp?: { turns: Exchange[]; question: string } | undefined;
}

/** Token counts as BILLING BUCKETS, named exactly like models.dev's cost
 *  fields (input/output/cache_read/cache_write, the community model-price
 *  database) — so cost is the plain dot product of this object with a price
 *  entry. `input` is therefore the NON-cached input (each token lands in
 *  exactly one bucket); OTel's inclusive `gen_ai.usage.input_tokens` stays
 *  derivable as input + cache_read + cache_write. Mapped once here at the
 *  edge from the AI SDK's evolving usage shape (which has renamed fields
 *  across majors). Absent keys mean zero or unknown. */
export interface TokenUsage {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

/** A finished (or stopped) run: the text, plus the settled facts the usage
 *  statistics record — which catalog model ("provider:model") served it and
 *  what it cost in tokens. Both absent when the run never reached a model. */
export interface StreamOutcome {
  text: string;
  model?: string | undefined;
  tokens?: TokenUsage | undefined;
}

// This module is a thin facade: the AI SDK with its eleven providers, Liquid,
// and franc together dominate the bundle (~half of it), yet they are needed
// only at these user-initiated, network-bound moments. Loading them behind a
// dynamic import keeps them out of every window's startup parse; the import
// cost is noise next to the LLM round trip (and the popup warms it on mount).

/**
 * Stream an prompt: render its Liquid templates, then stream the model's text,
 * revealing only the text between the result tags. `onChunk` receives the
 * text-so-far; the returned promise resolves with the outcome — the final
 * text (or what streamed before `signal` aborted) plus the model and token
 * facts for the usage statistics.
 */
export async function streamPrompt(
  input: PromptInput,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.streamPrompt(input, onChunk, signal);
}

/**
 * Verify the saved catalog end to end: build it fresh from disk, then probe
 * the `default` role. Config errors (missing file, bad JSON, unknown role)
 * throw with their real reason; an unreachable model throws "unreachable".
 */
/** Price per 1M tokens for every cataloged model ("provider:model" -> buckets
 *  matching {@link TokenUsage}); empty when the config is missing or broken. */
export async function modelCosts(): Promise<Record<string, TokenUsage>> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.modelCosts();
}

export async function testConnection(): Promise<void> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.testConnection();
}

/**
 * Draft an prompt instruction from the user's rough description, using the
 * default role. Same failure modes as an prompt run (NOT_CONFIGURED,
 * INVALID_CONFIG, EMPTY_RESULT).
 */
export async function draftInstruction(description: string): Promise<string> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.draftInstruction(description);
}

/** Load the heavy implementation ahead of need — the popup calls this on
 *  mount, off the first paint, so the first C+C never pays the module load. */
export function warmUp(): void {
  void import("@/lib/llm-impl.ts");
}
