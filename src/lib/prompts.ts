// The prompts API, shared by the popup's switcher and the settings editor.
// Thin wrappers over the Rust commands; all file handling stays in Rust.
// Rules shapes follow the settings.ts convention: zod schemas are the
// single source of truth, the TS types are inferred from them.

import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";
import { createLogger } from "@/lib/log.ts";

const log = createLogger("prompts");

/** An prompt as listed by Rust (`list_prompts_ui`), sorted by label.
 *  `instructions` is the system prompt and `prompt` the user prompt body
 *  (both Liquid templates); "builtin" ships with the app and is immutable,
 *  "custom" is a local file. */
const PromptInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string().nullable(),
  instructions: z.string(),
  prompt: z.string(),
  origin: z.enum(["builtin", "custom"]),
});
export type PromptInfo = z.infer<typeof PromptInfoSchema>;

export async function listPrompts(): Promise<PromptInfo[]> {
  const raw = await invoke<PromptInfo[]>("list_prompts_ui");
  const parsed = z.array(PromptInfoSchema).safeParse(raw);
  if (!parsed.success) {
    log.warn("list_prompts_ui returned an unexpected shape; using it as-is", parsed.error);
    return raw;
  }
  return parsed.data;
}

/** Create or update a custom prompt file; returns the id (derived from the
 *  label when omitted). Built-ins are immutable and cannot be targeted. */
export function savePrompt(input: {
  id?: string | undefined;
  label: string;
  instructions: string;
  prompt: string;
  role?: string | undefined;
}): Promise<string> {
  return invoke<string>("save_prompt", {
    id: input.id,
    label: input.label,
    instructions: input.instructions,
    prompt: input.prompt,
    role: input.role,
  });
}

/** Delete a custom prompt. */
export function deletePrompt(id: string): Promise<void> {
  return invoke("delete_prompt", { id });
}

/** Export the prompt as a .md file into Downloads (revealed in the file
 *  manager, browser-download style); resolves to the written path. */
export function exportPromptFile(id: string): Promise<string> {
  return invoke<string>("export_prompt_file", { id });
}

/** Install a shared prompt from its .md text; returns the id. */
export function importPrompt(text: string): Promise<string> {
  return invoke<string>("import_prompt", { text });
}

/** Pick a local .md file with the native dialog and install it as an prompt;
 *  resolves to the id, or null when the user cancels the picker. */
export function importPromptFromFile(): Promise<string | null> {
  return invoke<string | null>("import_prompt_from_file");
}

/** The capture kinds rules can assign (mirrors Rust's ROUTABLE_KINDS). */
export const ROUTABLE_KINDS = ["text", "image", "files"] as const;
export type RoutableKind = (typeof ROUTABLE_KINDS)[number];

/** An override's `when` condition: every present field must match (AND).
 *  String fields support `*` wildcards; names mirror the template variables.
 *  `file_name` matches every copied file's base name, case-insensitively
 *  (`*.pdf`), and only ever matches `files` captures. */
const WhenConditionSchema = z.object({
  kind: z.string().optional(),
  app_name: z.string().optional(),
  exec_name: z.string().optional(),
  window_title: z.string().optional(),
  url: z.string().optional(),
  file_name: z.string().optional(),
  min_chars: z.int().nonnegative().optional(),
  max_chars: z.int().nonnegative().optional(),
});
export type WhenCondition = z.infer<typeof WhenConditionSchema>;

/** A higher-priority rules rule: if `when` matches, `prompt` runs. */
const RulesOverrideSchema = z.object({
  when: WhenConditionSchema,
  prompt: z.string(),
});
export type RulesOverride = z.infer<typeof RulesOverrideSchema>;

/** What the rule editor may save, beyond a structurally valid override:
 *  a target prompt, at least one condition (an empty `when` would shadow all
 *  rules), and coherent character bounds. Rules already in rules.json are
 *  deliberately looser — hand-edited files are the power-user escape hatch.
 *  The refinement messages are sentinels the editor maps to i18n sentences. */
export const EditableOverrideSchema = RulesOverrideSchema.extend({
  prompt: z.string().min(1),
})
  .refine((rule) => Object.values(rule.when).some((value) => value !== undefined), {
    error: "needs-condition",
  })
  .refine(
    (rule) =>
      rule.when.min_chars === undefined ||
      rule.when.max_chars === undefined ||
      rule.when.min_chars <= rule.when.max_chars,
    { error: "bounds-order" },
  );

/** Effective rules (`get_rules_ui`): which prompt each capture kind runs,
 *  plus the ordered overrides list (evaluated first — first match wins). */
const RulesInfoSchema = z.object({
  by_kind: z.record(z.string(), z.string()),
  overrides: z.array(RulesOverrideSchema),
});
export type RulesInfo = z.infer<typeof RulesInfoSchema>;

export async function getRules(): Promise<RulesInfo> {
  const raw = await invoke<RulesInfo>("get_rules_ui");
  const parsed = RulesInfoSchema.safeParse(raw);
  if (!parsed.success) {
    // Rust serialized something this schema no longer matches — a version
    // skew bug. Warn and render the raw data rather than blanking the UI.
    log.warn("get_rules_ui returned an unexpected shape; using it as-is", parsed.error);
    return raw;
  }
  return parsed.data;
}

/** Route captures of `kind` to an prompt (undefined clears the assignment —
 *  an omitted key reaches Rust as `None`). */
export function setKindPrompt(kind: RoutableKind, id: string | undefined): Promise<void> {
  return invoke("set_kind_prompt", { kind, id });
}

/** Replace the whole overrides list; array order is the priority. */
export function setOverrides(overrides: RulesOverride[]): Promise<void> {
  return invoke("set_overrides", { overrides });
}
