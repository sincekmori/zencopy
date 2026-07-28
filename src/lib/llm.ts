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

export interface ActionInput {
  role: string;
  instructions: string;
  prompt: string;
  vars: Record<string, string>;
  /** Image/file contents to send alongside the prompt (AI SDK file parts). */
  attachments?: Attachment[] | undefined;
}

/** Exactly what accurate cost math needs, in our own stable vocabulary —
 *  decoupled from the AI SDK's usage shape (which has renamed and regrown
 *  fields across majors): the totals plus the cache split that changes the
 *  unit price. Absent keys mean zero or unknown. */
export interface TokenUsage {
  in?: number;
  out?: number;
  cacheRead?: number;
  cacheWrite?: number;
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
 * Stream an action: render its Liquid templates, then stream the model's text,
 * revealing only the text between the result tags. `onChunk` receives the
 * text-so-far; the returned promise resolves with the outcome — the final
 * text (or what streamed before `signal` aborted) plus the model and token
 * facts for the usage statistics.
 */
export async function streamAction(
  action: ActionInput,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.streamAction(action, onChunk, signal);
}

/**
 * Verify the saved catalog end to end: build it fresh from disk, then probe
 * the `default` role. Config errors (missing file, bad JSON, unknown role)
 * throw with their real reason; an unreachable model throws "unreachable".
 */
export async function testConnection(): Promise<void> {
  const impl = await import("@/lib/llm-impl.ts");
  return impl.testConnection();
}

/**
 * Draft an action instruction from the user's rough description, using the
 * default role. Same failure modes as an action run (NOT_CONFIGURED,
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
