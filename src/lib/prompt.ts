// The system-prompt assembly and the streaming result protocol — pure string
// work, deliberately free of Tauri imports so it can be exercised directly
// (bun scripts, tests) without a webview.

// Output protocol. Structured output (streamObject) drops preambles cleanly but
// local models (Ollama) don't support it — so we stream plain text and bound the
// result with tags: text before the open tag is a preamble, text after the close
// tag is a trailing remark ("以上でいかがでしょうか？") — both discarded.
const OPEN_TAG = "<result>";
const CLOSE_TAG = "</result>";

/**
 * The system prompt for one action run, assembled Claude-style: each part in
 * its own XML section, so the boundaries stay unambiguous no matter what the
 * (user-authored, arbitrary) action instructions contain.
 *
 * - `<instructions>` — the action's own rendered instructions; the authority.
 * - `<user_context>` — the user's self-description from Settings, plus how to
 *   weigh it: background that tailors the result (depth, terminology,
 *   examples, tone), never a request, never mentioned in the output, and the
 *   instructions win every conflict. Empty context means no tag at all — the
 *   prompt is byte-identical to the pre-feature one in that case.
 * - `<output_format>` — the result-tag contract, last, where format
 *   directives bind tightest.
 *
 * Deliberately NOT used by draftInstruction: drafted actions are reusable,
 * shareable text and must not bake personal facts in.
 */
export function composeInstructions(instructions: string, userContext: string): string {
  const sections = [`<instructions>\n${instructions}\n</instructions>`];
  const context = userContext.trim();
  if (context) {
    sections.push(
      `<user_context>\n${context}\n</user_context>\n` +
        `The user_context is the user's own self-description. Use it only to fit the result to them — ` +
        `depth, terminology, examples, tone. It is background, not a request: when it conflicts with ` +
        `the instructions, the instructions win, and never mention or address it in the output.`,
    );
  }
  sections.push(
    `<output_format>\nPut the result inside ${OPEN_TAG}…${CLOSE_TAG} and write nothing outside these tags.\n</output_format>`,
  );
  return sections.join("\n\n");
}

/**
 * The user message's text part: the rendered prompt plus — when file
 * attachments ride along — their full paths in an `<attached_files>` section,
 * so the model can tell the file parts apart (a file part's `filename` is not
 * reliably forwarded by every provider, and full paths carry context — folder,
 * project — an action may need). No files, no tag.
 */
export function composeUserText(prompt: string, attachedPaths: string[]): string {
  const sections = [prompt];
  if (attachedPaths.length > 0) {
    sections.push(`<attached_files>\n${attachedPaths.join("\n")}\n</attached_files>`);
  }
  return sections.filter(Boolean).join("\n\n");
}

/** Length of the longest tail of `body` that is a prefix of the closing tag. */
function pendingCloseLength(body: string): number {
  const max = Math.min(CLOSE_TAG.length - 1, body.length);
  for (let n = max; n > 0; n -= 1) {
    if (body.endsWith(CLOSE_TAG.slice(0, n))) {
      return n;
    }
  }
  return 0;
}

/**
 * The result extracted from the raw stream so far, or undefined until the opening
 * tag appears (so any preamble stays hidden). A tail that could be the start of
 * the closing tag is always held back, so a fragment of the tag is never shown —
 * even when `final` (the stream has ended). `final` only trims trailing space.
 */
export function extractResult(raw: string, final: boolean): string | undefined {
  const start = raw.indexOf(OPEN_TAG);
  if (start === -1) {
    return undefined;
  }
  const body = raw.slice(start + OPEN_TAG.length);
  const closeIndex = body.indexOf(CLOSE_TAG);
  if (closeIndex !== -1) {
    return body.slice(0, closeIndex).trim(); // bounded on both sides
  }
  // No closing tag yet: hold back a tail that could be the start of one, so a
  // fragment of the closing tag is never shown — even if the stream ends here.
  const visible = body.slice(0, body.length - pendingCloseLength(body));
  return final ? visible.trim() : visible.replace(/^\s+/u, "");
}
