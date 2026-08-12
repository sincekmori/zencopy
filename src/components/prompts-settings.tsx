import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod";
import { QuickPromptsSettings } from "@/components/quick-prompts-settings.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/alert-dialog.tsx";
import { FormDialog } from "@/components/ui/dialog.tsx";
import { Select } from "@/components/ui/select.tsx";
import { FIELD } from "@/components/ui/field.ts";
import {
  type PromptInfo,
  deletePrompt,
  EditableOverrideSchema,
  exportPromptFile,
  getRules,
  importPrompt,
  importPromptFromFile,
  listPrompts,
  ROUTABLE_KINDS,
  type RoutableKind,
  type RulesInfo,
  type RulesOverride,
  savePrompt,
  setKindPrompt,
  setOverrides,
  type WhenCondition,
} from "@/lib/prompts.ts";
import { usePromptLabel, useLocale, useT } from "@/lib/i18n.tsx";
import { draftInstruction, INVALID_CONFIG, NOT_CONFIGURED } from "@/lib/llm.ts";
import type { Messages } from "@/lib/messages/types.ts";
import { createLogger, errorMessage } from "@/lib/log.ts";
import { TRIGGER_KEYS } from "@/lib/platform.ts";
import { cn } from "@/lib/utils.ts";
import { siteUrl } from "@/lib/site.ts";

const log = createLogger("prompts-settings");

// The structured failure import_prompt / save_prompt (src-tauri) reject with.
const PromptErrorSchema = z.object({
  code: z.string(),
  detail: z.string().nullish(),
});

/** Localize an prompt failure; anything not shaped like an PromptError (a
 *  network error, a bug) falls back to the generic failed(reason). */
function promptErrorText(t: Messages, error: unknown): string {
  const parsed = PromptErrorSchema.safeParse(error);
  if (!parsed.success) {
    return t.prompts.failed(errorMessage(error).slice(0, 200));
  }
  const detail = parsed.data.detail ?? "";
  switch (parsed.data.code) {
    case "not-an-prompt": {
      return t.prompts.importNotAPrompt;
    }
    case "no-label": {
      return t.prompts.importNoLabel;
    }
    case "invalid-id": {
      return t.prompts.importInvalidId(detail);
    }
    case "builtin-id": {
      return t.prompts.importBuiltinId(detail);
    }
    case "reserved-id": {
      return t.prompts.importReservedId(detail);
    }
    case "id-exists": {
      return t.prompts.importIdExists(detail);
    }
    case "label-exists": {
      return t.prompts.labelExists(detail);
    }
    case "file-too-large": {
      return t.prompts.importTooLarge;
    }
    default: {
      return t.prompts.failed((detail === "" ? parsed.data.code : detail).slice(0, 200));
    }
  }
}

/** What the form shows. `id` present = an existing prompt; `locked` = a
 *  built-in opened read-only (they are immutable, but worth reading — they
 *  double as examples). */
interface Draft {
  id?: string;
  label: string;
  instructions: string;
  prompt: string;
  role: string;
  locked?: boolean;
}

const NEW_DRAFT: Draft = { label: "", instructions: "", prompt: "{{ text }}", role: "" };

/** The rule editor's draft — all fields as text so typing is unconstrained;
 *  `index` present = editing an existing rule, absent = adding a new one. */
interface RuleDraft {
  index?: number;
  kind: string;
  appName: string;
  execName: string;
  windowTitle: string;
  url: string;
  fileName: string;
  minChars: string;
  maxChars: string;
  prompt: string;
}

const NEW_RULE: RuleDraft = {
  kind: "",
  appName: "",
  execName: "",
  windowTitle: "",
  url: "",
  fileName: "",
  minChars: "",
  maxChars: "",
  prompt: "",
};

export function PromptsSettings(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const promptLabel = usePromptLabel();
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // The ✨ button: the configured model is rewriting the instruction field.
  const [drafting, setDrafting] = useState(false);
  // The effective kind → prompt assignments, kept in the same reload path as
  // the list so the selects and the prompt list never disagree.
  const [rules, setRules] = useState<RulesInfo>({ by_kind: {}, overrides: [] });
  const [rulesError, setRulesError] = useState<string | undefined>(undefined);
  // The override rule being added or edited, if any.
  const [rule, setRule] = useState<RuleDraft | undefined>(undefined);
  const [ruleError, setRuleError] = useState<string | undefined>(undefined);
  // Which prompt was just exported (transient check mark), and the import
  // dialog's state.
  const [exportedId, setExportedId] = useState<string | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);

  const reload = (): void => {
    void (async () => {
      try {
        const [list, routes] = await Promise.all([listPrompts(), getRules()]);
        setPrompts(list);
        setRules(routes);
      } catch (error) {
        log.error("listing prompts failed", error);
      }
    })();
  };

  // Load on mount, and again when the window regains focus — so prompts the
  // user edits as files on disk show up without reopening the window.
  useEffect(() => {
    reload();
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) {
          reload();
        }
      });
      if (cancelled) {
        un();
      } else {
        unlisten = un;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const closeViewer = (): void => {
    setDraft(undefined);
  };

  const closeEditor = (): void => {
    setDraft(undefined);
    setFormError(undefined);
  };

  const closeRule = (): void => {
    setRule(undefined);
    setRuleError(undefined);
  };

  const edit = (prompt: PromptInfo): void => {
    setFormError(undefined);
    setDraft({
      id: prompt.id,
      label: prompt.label,
      instructions: prompt.instructions,
      prompt: prompt.prompt,
      role: prompt.role ?? "",
      locked: prompt.origin === "builtin",
    });
  };

  // The template guide on zencopy.app, in the user's language.
  const openTemplateDocs = (): void => {
    void invoke("open_url", { url: siteUrl(locale, "configuration/") });
  };

  // Turn whatever is in the instruction field (a rough "what I want", any
  // language) into a proper instruction, written by the user's own model —
  // no external chatbot, no copy-paste round trip. The result is editable,
  // and clicking again refines it further.
  const draftWithAi = (): void => {
    if (!draft || draft.instructions.trim() === "" || drafting) {
      return;
    }
    setFormError(undefined);
    setDrafting(true);
    void (async () => {
      try {
        const instructions = await draftInstruction(draft.instructions);
        setDraft((prev) => (prev ? { ...prev, instructions } : prev));
      } catch (error) {
        log.error("drafting an instruction failed", error);
        const reason = errorMessage(error);
        if (reason === NOT_CONFIGURED) {
          setFormError(t.ai.notConfigured);
        } else if (reason === INVALID_CONFIG) {
          setFormError(t.ai.invalidConfig);
        } else {
          setFormError(t.prompts.draftFailed);
        }
      } finally {
        setDrafting(false);
      }
    })();
  };

  const save = (): void => {
    if (!draft) {
      return;
    }
    setFormError(undefined);
    // Labels are the only identity users ever see, so they must be unique.
    // Rust enforces this against the stored (English) labels; this extra pass
    // also catches collisions with a built-in's *localized* display name
    // ("翻訳"), which only the frontend can resolve.
    const wanted = draft.label.trim().toLowerCase();
    const duplicate = prompts.some(
      (prompt) =>
        prompt.id !== draft.id &&
        promptLabel(prompt.id, prompt.label).trim().toLowerCase() === wanted,
    );
    if (wanted !== "" && duplicate) {
      setFormError(t.prompts.labelExists(draft.label.trim()));
      return;
    }
    void (async () => {
      try {
        await savePrompt({
          id: draft.id,
          label: draft.label,
          instructions: draft.instructions,
          prompt: draft.prompt.trim() === "" ? "{{ text }}" : draft.prompt,
          role: draft.role.trim() === "" ? undefined : draft.role.trim(),
        });
        setDraft(undefined);
        reload();
      } catch (error) {
        log.error("saving prompt failed", error);
        setFormError(promptErrorText(t, error));
      }
    })();
  };

  // Deleting a prompt destroys an authored .md with no undo — ask first.
  const [deleting, setDeleting] = useState<PromptInfo | undefined>(undefined);

  const remove = (prompt: PromptInfo): void => {
    setFormError(undefined);
    void (async () => {
      try {
        await deletePrompt(prompt.id);
        reload();
      } catch (error) {
        log.error("deleting prompt failed", error);
        setFormError(t.prompts.failed(errorMessage(error).slice(0, 200)));
      }
    })();
  };

  // Export = save the prompt's .md into Downloads, browser-download style
  // (Rust reveals the file — that reveal is the real feedback; the transient
  // check here covers the case where the reveal is disabled or slow).
  const exportFile = (id: string): void => {
    void (async () => {
      try {
        await exportPromptFile(id);
        setExportedId(id);
        globalThis.setTimeout(() => {
          setExportedId((prev) => (prev === id ? undefined : prev));
        }, 1500);
      } catch (error) {
        log.error("exporting prompt failed", error);
        setFormError(t.prompts.failed(errorMessage(error).slice(0, 200)));
      }
    })();
  };

  // One path for both import sources: pasted text and a fetched URL.
  const closeImport = (): void => {
    setImportOpen(false);
    setImportError(undefined);
  };

  const importFrom = (load: () => Promise<string>): void => {
    setImportError(undefined);
    setImportBusy(true);
    void (async () => {
      try {
        await importPrompt(await load());
        setImportOpen(false);
        setImportText("");
        reload();
      } catch (error) {
        log.error("importing prompt failed", error);
        setImportError(promptErrorText(t, error));
      } finally {
        setImportBusy(false);
      }
    })();
  };

  // The native-picker variant: Rust owns the dialog and the read; a null id
  // just means the picker was cancelled — no error, the dialog stays open.
  const importFromFile = (): void => {
    setImportError(undefined);
    setImportBusy(true);
    void (async () => {
      try {
        const id = await importPromptFromFile();
        if (id !== null) {
          setImportOpen(false);
          setImportText("");
          reload();
        }
      } catch (error) {
        log.error("importing prompt from a file failed", error);
        setImportError(promptErrorText(t, error));
      } finally {
        setImportBusy(false);
      }
    })();
  };

  const changeRules = (kind: RoutableKind, id: string): void => {
    setRulesError(undefined);
    // Optimistic: the select reflects the choice instantly; reload confirms.
    setRules((prev) => {
      const byKind = { ...prev.by_kind };
      if (id === "") {
        delete byKind[kind];
      } else {
        byKind[kind] = id;
      }
      return { ...prev, by_kind: byKind };
    });
    void (async () => {
      try {
        await setKindPrompt(kind, id === "" ? undefined : id);
      } catch (error) {
        log.error("updating rules failed", error);
        setRulesError(t.prompts.failed(errorMessage(error).slice(0, 200)));
      } finally {
        reload();
      }
    })();
  };

  // The overrides reference on zencopy.app, in the user's language.
  const openRulesDocs = (): void => {
    void invoke("open_url", { url: siteUrl(locale, "configuration/#rulesjson") });
  };

  // Every rule mutation (add, edit, delete, reorder) writes the whole ordered
  // list — the order IS the priority, so partial updates would be a lie.
  const commitOverrides = (next: RulesOverride[]): void => {
    setRulesError(undefined);
    setRules((prev) => ({ ...prev, overrides: next })); // optimistic
    void (async () => {
      try {
        await setOverrides(next);
      } catch (error) {
        log.error("saving override rules failed", error);
        setRulesError(t.prompts.failed(errorMessage(error).slice(0, 200)));
      } finally {
        reload();
      }
    })();
  };

  const moveOverride = (index: number, delta: -1 | 1): void => {
    const next = [...rules.overrides];
    const target = index + delta;
    const moved = next[index];
    if (!moved || target < 0 || target >= next.length) {
      return;
    }
    next.splice(index, 1);
    next.splice(target, 0, moved);
    commitOverrides(next);
  };

  const editOverride = (index: number): void => {
    const existing = rules.overrides[index];
    if (!existing) {
      return;
    }
    setRuleError(undefined);
    setRule({
      index,
      kind: existing.when.kind ?? "",
      appName: existing.when.app_name ?? "",
      execName: existing.when.exec_name ?? "",
      windowTitle: existing.when.window_title ?? "",
      url: existing.when.url ?? "",
      fileName: existing.when.file_name ?? "",
      minChars: existing.when.min_chars?.toString() ?? "",
      maxChars: existing.when.max_chars?.toString() ?? "",
      prompt: existing.prompt,
    });
  };

  const saveRule = (): void => {
    if (!rule) {
      return;
    }
    const when: WhenCondition = {};
    if (rule.kind) {
      when.kind = rule.kind;
    }
    if (rule.appName.trim()) {
      when.app_name = rule.appName.trim();
    }
    if (rule.execName.trim()) {
      when.exec_name = rule.execName.trim();
    }
    if (rule.windowTitle.trim()) {
      when.window_title = rule.windowTitle.trim();
    }
    if (rule.url.trim()) {
      when.url = rule.url.trim();
    }
    if (rule.fileName.trim()) {
      when.file_name = rule.fileName.trim();
    }
    if (rule.minChars.trim() !== "") {
      when.min_chars = Number(rule.minChars);
    }
    if (rule.maxChars.trim() !== "") {
      when.max_chars = Number(rule.maxChars);
    }
    // The schema owns validity (a target prompt, at least one condition,
    // coherent bounds); its sentinel messages map to i18n sentences here.
    const checked = EditableOverrideSchema.safeParse({ when, prompt: rule.prompt });
    if (!checked.success) {
      const sentinel = checked.error.issues[0]?.message;
      setRuleError(sentinel === "bounds-order" ? t.rules.needsValidBounds : t.rules.needsCondition);
      return;
    }
    const entry: RulesOverride = checked.data;
    const next = [...rules.overrides];
    if (rule.index === undefined) {
      next.push(entry);
    } else {
      next[rule.index] = entry;
    }
    setRule(undefined);
    setRuleError(undefined);
    commitOverrides(next);
  };

  const kindLabels: Record<RoutableKind, string> = {
    text: t.rules.kindText,
    image: t.rules.kindImage,
    files: t.rules.kindFiles,
  };

  // A rule's conditions as compact chips; the numeric bounds read as ≥ / ≤,
  // which needs no translation.
  const ruleChips = (when: WhenCondition): { label?: string; value: string }[] => {
    const chips: { label?: string; value: string }[] = [];
    if (when.kind) {
      chips.push({
        value: (ROUTABLE_KINDS as readonly string[]).includes(when.kind)
          ? kindLabels[when.kind as RoutableKind]
          : when.kind,
      });
    }
    if (when.app_name) {
      chips.push({ label: t.rules.fieldApp, value: when.app_name });
    }
    if (when.exec_name) {
      chips.push({ label: t.rules.fieldExec, value: when.exec_name });
    }
    if (when.window_title) {
      chips.push({ label: t.rules.fieldTitle, value: when.window_title });
    }
    if (when.url) {
      chips.push({ label: t.rules.fieldUrl, value: when.url });
    }
    if (when.file_name) {
      chips.push({ label: t.rules.fieldFile, value: when.file_name });
    }
    if (when.min_chars !== undefined) {
      chips.push({ value: `≥ ${when.min_chars}` });
    }
    if (when.max_chars !== undefined) {
      chips.push({ value: `≤ ${when.max_chars}` });
    }
    return chips;
  };

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">{t.prompts.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.prompts.hint(TRIGGER_KEYS)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportError(undefined);
                setImportOpen(true);
              }}
            >
              <Upload className="size-3.5" />
              {t.prompts.import}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFormError(undefined);
                setDraft({ ...NEW_DRAFT });
              }}
            >
              <Plus className="size-3.5" />
              {t.prompts.add}
            </Button>
          </div>
        </div>

        <FormDialog open={importOpen} title={t.prompts.import} onClose={closeImport}>
          <p className="text-xs text-muted-foreground">{t.prompts.importHint}</p>
          <textarea
            className={cn(FIELD, "h-72 resize-none font-mono text-xs leading-relaxed")}
            spellCheck={false}
            placeholder="---"
            value={importText}
            onChange={(event) => {
              setImportError(undefined);
              setImportText(event.target.value);
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              disabled={importBusy || importText.trim() === ""}
              onClick={() => {
                importFrom(() => Promise.resolve(importText));
              }}
            >
              {importBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : undefined}
              {t.prompts.import}
            </Button>
            <Button size="sm" variant="outline" disabled={importBusy} onClick={importFromFile}>
              {t.prompts.importFromFile}
            </Button>
            <Button size="sm" variant="ghost" disabled={importBusy} onClick={closeImport}>
              {t.common.cancel}
            </Button>
          </div>
          {importError ? <p className="text-xs text-destructive">{importError}</p> : undefined}
        </FormDialog>

        <ul className="flex flex-col divide-y rounded-lg border">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 truncate text-sm">
                {promptLabel(prompt.id, prompt.label)}
              </span>
              <span className="ms-auto flex shrink-0 items-center gap-0.5 text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.prompts.export}
                  title={t.prompts.export}
                  onClick={() => {
                    exportFile(prompt.id);
                  }}
                >
                  {exportedId === prompt.id ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                </Button>
                {/* Built-ins are immutable but readable — they double as examples. */}
                {prompt.origin === "builtin" ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.prompts.view}
                    title={t.prompts.view}
                    onClick={() => {
                      edit(prompt);
                    }}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.prompts.edit}
                      title={t.prompts.edit}
                      onClick={() => {
                        edit(prompt);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.prompts.remove}
                      title={t.prompts.remove}
                      onClick={() => {
                        setDeleting(prompt);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* Read-only prompts get a viewer, not a disabled editor — nothing on
          this surface should look like it accepts input. Its title is the
          prompt's own name. */}
        {draft?.locked ? (
          <FormDialog open title={promptLabel(draft.id ?? "", draft.label)} onClose={closeViewer}>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.prompts.instruction}
              </span>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {draft.instructions}
              </pre>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.prompts.template}
              </span>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {draft.prompt}
              </pre>
            </div>
            {draft.role ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.prompts.roleLabel}
                </span>
                <p className="text-sm">{draft.role}</p>
              </div>
            ) : undefined}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={openTemplateDocs}
            >
              {t.prompts.templateDocs}
              <ExternalLink className="size-3" />
            </button>
            <div>
              <Button size="sm" variant="ghost" onClick={closeViewer}>
                {t.popup.close}
              </Button>
            </div>
          </FormDialog>
        ) : undefined}

        {draft && !draft.locked ? (
          <FormDialog
            open
            title={draft.id === undefined ? t.prompts.add : t.prompts.edit}
            onClose={closeEditor}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.prompts.name}</span>
              <input
                className={FIELD}
                value={draft.label}
                onChange={(event) => {
                  setDraft({ ...draft, label: event.target.value });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.prompts.instruction}
              </span>
              <textarea
                className={cn(FIELD, "h-40 resize-none leading-relaxed")}
                placeholder={t.prompts.instructionPlaceholder}
                value={draft.instructions}
                onChange={(event) => {
                  setDraft({ ...draft, instructions: event.target.value });
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={draft.instructions.trim() === "" || drafting}
                  onClick={draftWithAi}
                >
                  {drafting ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {t.prompts.draft}
                </Button>
                <span className="text-[11px] text-muted-foreground/80">{t.prompts.draftHint}</span>
              </div>
            </label>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                {t.prompts.advanced}
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.prompts.template}
                  </span>
                  <textarea
                    className={cn(FIELD, "h-32 resize-none font-mono text-xs leading-relaxed")}
                    spellCheck={false}
                    value={draft.prompt}
                    onChange={(event) => {
                      setDraft({ ...draft, prompt: event.target.value });
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground/80">
                    {t.prompts.templateHint}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={openTemplateDocs}
                  >
                    {t.prompts.templateDocs}
                    <ExternalLink className="size-3" />
                  </button>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.prompts.roleLabel}
                  </span>
                  <input
                    className={FIELD}
                    placeholder="default"
                    value={draft.role}
                    onChange={(event) => {
                      setDraft({ ...draft, role: event.target.value });
                    }}
                  />
                </label>
              </div>
            </details>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={draft.label.trim() === ""} onClick={save}>
                {t.common.save}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeEditor}>
                {t.common.cancel}
              </Button>
            </div>
            {formError ? <p className="text-xs text-destructive">{formError}</p> : undefined}
          </FormDialog>
        ) : undefined}

        {/* Errors from list actions (a failed delete) — form errors show
            inside their dialog. */}
        {formError && !draft ? <p className="text-xs text-destructive">{formError}</p> : undefined}
      </section>

      <QuickPromptsSettings />

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div>
          <h2 className="text-sm font-medium">{t.rules.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.rules.hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          {ROUTABLE_KINDS.map((kind) => {
            const assigned = rules.by_kind[kind] ?? "";
            const known = assigned === "" || prompts.some((prompt) => prompt.id === assigned);
            return (
              <label key={kind} className="flex items-center justify-between gap-4">
                <span className="text-sm">{kindLabels[kind]}</span>
                <Select
                  className="w-56"
                  value={assigned}
                  onChange={(event) => {
                    changeRules(kind, event.target.value);
                  }}
                >
                  <option value="">{t.rules.none}</option>
                  {/* An assignment pointing at a deleted prompt stays listed by
                    its raw id, so the state is visible instead of silently
                    showing "None". */}
                  {known ? undefined : <option value={assigned}>{assigned}</option>}
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {promptLabel(prompt.id, prompt.label)}
                    </option>
                  ))}
                </Select>
              </label>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium">{t.rules.overridesTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.rules.overridesHint}{" "}
              <button
                type="button"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                onClick={openRulesDocs}
              >
                {t.rules.overridesDocs}
                <ExternalLink className="size-3" />
              </button>
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setRuleError(undefined);
              setRule({ ...NEW_RULE });
            }}
          >
            <Plus className="size-3.5" />
            {t.rules.addOverride}
          </Button>
        </div>

        {rules.overrides.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {rules.overrides.map((entry, index) => (
              // Order is priority, so position is the only stable identity a
              // rule has — the index key is correct here, not a fallback.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index} className="flex items-center gap-2 px-3 py-2">
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={t.rules.moveUp}
                    title={t.rules.moveUp}
                    disabled={index === 0}
                    className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                    onClick={() => {
                      moveOverride(index, -1);
                    }}
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.rules.moveDown}
                    title={t.rules.moveDown}
                    disabled={index === rules.overrides.length - 1}
                    className="text-muted-foreground/50 hover:text-foreground disabled:opacity-25"
                    onClick={() => {
                      moveOverride(index, 1);
                    }}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
                  {ruleChips(entry.when).map((chip) => (
                    <span
                      key={`${chip.label ?? ""}:${chip.value}`}
                      className="rounded-md border bg-muted/40 px-1.5 py-0.5"
                    >
                      {chip.label ? (
                        <span className="text-muted-foreground/70">{chip.label} </span>
                      ) : undefined}
                      {chip.value}
                    </span>
                  ))}
                  <span className="text-muted-foreground/60">→</span>
                  <span className="truncate font-medium">
                    {promptLabel(
                      entry.prompt,
                      prompts.find((prompt) => prompt.id === entry.prompt)?.label ?? entry.prompt,
                    )}
                  </span>
                </span>
                <span className="ms-auto flex shrink-0 items-center gap-0.5 text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.prompts.edit}
                    title={t.prompts.edit}
                    onClick={() => {
                      editOverride(index);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.prompts.remove}
                    title={t.prompts.remove}
                    onClick={() => {
                      commitOverrides(rules.overrides.filter((_, i) => i !== index));
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : undefined}

        {rule ? (
          <FormDialog
            open
            title={rule.index === undefined ? t.rules.addOverride : t.rules.edit}
            onClose={closeRule}
          >
            {/* One field per row — app names, window titles, and URLs get
                long. Only the two character bounds share a row. */}
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldKind}
                </span>
                <Select
                  value={rule.kind}
                  onChange={(event) => {
                    setRule({ ...rule, kind: event.target.value });
                  }}
                >
                  <option value="">{t.rules.anyKind}</option>
                  {/* A rule carrying a kind we no longer know stays listed by
                    its raw value, so the state is visible instead of silently
                    showing as blank (same convention as the assignment list). */}
                  {rule.kind && !(ROUTABLE_KINDS as readonly string[]).includes(rule.kind) ? (
                    <option value={rule.kind}>{rule.kind}</option>
                  ) : undefined}
                  {ROUTABLE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabels[kind]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldApp}
                </span>
                <input
                  className={FIELD}
                  placeholder="Slack"
                  value={rule.appName}
                  onChange={(event) => {
                    setRule({ ...rule, appName: event.target.value });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldTitle}
                </span>
                <input
                  className={FIELD}
                  placeholder="*Pull Request*"
                  value={rule.windowTitle}
                  onChange={(event) => {
                    setRule({ ...rule, windowTitle: event.target.value });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldUrl}
                </span>
                <input
                  className={FIELD}
                  placeholder="*github.com*"
                  value={rule.url}
                  onChange={(event) => {
                    setRule({ ...rule, url: event.target.value });
                  }}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldExec}
                </span>
                <input
                  className={FIELD}
                  placeholder="chrome.exe"
                  value={rule.execName}
                  onChange={(event) => {
                    setRule({ ...rule, execName: event.target.value });
                  }}
                />
              </label>
              {/* File-copy rules: every copied file's name must match, so a
                  PDF prompt never fires on a mixed selection. Matching is
                  case-insensitive — `*.pdf` catches `Scan.PDF`. */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.fieldFile}
                </span>
                <input
                  className={FIELD}
                  placeholder="*.pdf"
                  value={rule.fileName}
                  onChange={(event) => {
                    setRule({ ...rule, fileName: event.target.value });
                  }}
                />
              </label>
              {/* Text inputs, not type="number" (its spinner renders as a
                  squashed artifact in the webview) — non-digits are stripped
                  as you type, so the field can never hold an invalid value. */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.rules.fieldMinChars}
                  </span>
                  <input
                    className={FIELD}
                    inputMode="numeric"
                    value={rule.minChars}
                    onChange={(event) => {
                      setRule({ ...rule, minChars: event.target.value.replaceAll(/\D+/gu, "") });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.rules.fieldMaxChars}
                  </span>
                  <input
                    className={FIELD}
                    inputMode="numeric"
                    value={rule.maxChars}
                    onChange={(event) => {
                      setRule({ ...rule, maxChars: event.target.value.replaceAll(/\D+/gu, "") });
                    }}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.rules.rulePrompt}
                </span>
                <Select
                  value={rule.prompt}
                  onChange={(event) => {
                    setRule({ ...rule, prompt: event.target.value });
                  }}
                >
                  <option value="">—</option>
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {promptLabel(prompt.id, prompt.label)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <span className="text-[11px] text-muted-foreground/80">{t.rules.wildcardHint}</span>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={rule.prompt === ""} onClick={saveRule}>
                {t.common.save}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeRule}>
                {t.common.cancel}
              </Button>
            </div>
            {ruleError ? <p className="text-xs text-destructive">{ruleError}</p> : undefined}
          </FormDialog>
        ) : undefined}

        {rulesError ? <p className="text-xs text-destructive">{rulesError}</p> : undefined}
      </section>

      {deleting ? (
        <ConfirmDialog
          open
          title={t.prompts.remove}
          description={t.prompts.removeConfirm(promptLabel(deleting.id, deleting.label))}
          confirmLabel={t.prompts.remove}
          cancelLabel={t.common.cancel}
          destructive
          onConfirm={() => {
            remove(deleting);
            setDeleting(undefined);
          }}
          onCancel={() => {
            setDeleting(undefined);
          }}
        />
      ) : undefined}
    </>
  );
}
