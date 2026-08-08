// The actions API, shared by the popup's switcher and the settings editor.
// Thin wrappers over the Rust commands; all file handling stays in Rust.
// Routing shapes follow the settings.ts convention: zod schemas are the
// single source of truth, the TS types are inferred from them.

import { invoke } from "@tauri-apps/api/core";
import * as z from "zod";
import { createLogger } from "@/lib/log.ts";

const log = createLogger("actions");

/** An action as listed by Rust (`list_actions_ui`), sorted by label.
 *  `instructions` is the system prompt and `prompt` the user prompt body
 *  (both Liquid templates); "builtin" ships with the app and is immutable,
 *  "custom" is a local file. */
const ActionInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.string().nullable(),
  instructions: z.string(),
  prompt: z.string(),
  origin: z.enum(["builtin", "custom"]),
});
export type ActionInfo = z.infer<typeof ActionInfoSchema>;

export async function listActions(): Promise<ActionInfo[]> {
  const raw = await invoke<ActionInfo[]>("list_actions_ui");
  const parsed = z.array(ActionInfoSchema).safeParse(raw);
  if (!parsed.success) {
    log.warn("list_actions_ui returned an unexpected shape; using it as-is", parsed.error);
    return raw;
  }
  return parsed.data;
}

/** Create or update a custom action file; returns the id (derived from the
 *  label when omitted). Built-ins are immutable and cannot be targeted. */
export function saveAction(input: {
  id?: string | undefined;
  label: string;
  instructions: string;
  prompt: string;
  role?: string | undefined;
}): Promise<string> {
  return invoke<string>("save_action", {
    id: input.id,
    label: input.label,
    instructions: input.instructions,
    prompt: input.prompt,
    role: input.role,
  });
}

/** Delete a custom action. */
export function deleteAction(id: string): Promise<void> {
  return invoke("delete_action", { id });
}

/** Export the action as a .md file into Downloads (revealed in the file
 *  manager, browser-download style); resolves to the written path. */
export function exportActionFile(id: string): Promise<string> {
  return invoke<string>("export_action_file", { id });
}

/** Install a shared action from its .md text; returns the id. */
export function importAction(text: string): Promise<string> {
  return invoke<string>("import_action", { text });
}

/** Pick a local .md file with the native dialog and install it as an action;
 *  resolves to the id, or null when the user cancels the picker. */
export function importActionFromFile(): Promise<string | null> {
  return invoke<string | null>("import_action_from_file");
}

/** The capture kinds routing can assign (mirrors Rust's ROUTABLE_KINDS). */
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

/** A higher-priority routing rule: if `when` matches, `action` runs. */
const RoutingOverrideSchema = z.object({
  when: WhenConditionSchema,
  action: z.string(),
});
export type RoutingOverride = z.infer<typeof RoutingOverrideSchema>;

/** What the rule editor may save, beyond a structurally valid override:
 *  a target action, at least one condition (an empty `when` would shadow all
 *  routing), and coherent character bounds. Rules already in routing.json are
 *  deliberately looser — hand-edited files are the power-user escape hatch.
 *  The refinement messages are sentinels the editor maps to i18n sentences. */
export const EditableOverrideSchema = RoutingOverrideSchema.extend({
  action: z.string().min(1),
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

/** Effective routing (`get_routing_ui`): which action each capture kind runs,
 *  plus the ordered overrides list (evaluated first — first match wins). */
const RoutingInfoSchema = z.object({
  by_kind: z.record(z.string(), z.string()),
  overrides: z.array(RoutingOverrideSchema),
});
export type RoutingInfo = z.infer<typeof RoutingInfoSchema>;

export async function getRouting(): Promise<RoutingInfo> {
  const raw = await invoke<RoutingInfo>("get_routing_ui");
  const parsed = RoutingInfoSchema.safeParse(raw);
  if (!parsed.success) {
    // Rust serialized something this schema no longer matches — a version
    // skew bug. Warn and render the raw data rather than blanking the UI.
    log.warn("get_routing_ui returned an unexpected shape; using it as-is", parsed.error);
    return raw;
  }
  return parsed.data;
}

/** Route captures of `kind` to an action (undefined clears the assignment —
 *  an omitted key reaches Rust as `None`). */
export function setKindAction(kind: RoutableKind, id: string | undefined): Promise<void> {
  return invoke("set_kind_action", { kind, id });
}

/** Replace the whole overrides list; array order is the priority. */
export function setOverrides(overrides: RoutingOverride[]): Promise<void> {
  return invoke("set_overrides", { overrides });
}
