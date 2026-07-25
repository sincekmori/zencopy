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
import { useEffect, useRef, useState } from "react";
import * as z from "zod";
import { QuickActionsSettings } from "@/components/quick-actions-settings.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Select } from "@/components/ui/select.tsx";
import { FIELD } from "@/components/ui/field.ts";
import {
  type ActionInfo,
  deleteAction,
  EditableOverrideSchema,
  exportActionFile,
  getRouting,
  importAction,
  importActionFromFile,
  listActions,
  ROUTABLE_KINDS,
  type RoutableKind,
  type RoutingInfo,
  type RoutingOverride,
  saveAction,
  setKindAction,
  setOverrides,
  type WhenCondition,
} from "@/lib/actions.ts";
import { useActionLabel, useLocale, useT } from "@/lib/i18n.tsx";
import { draftInstruction, INVALID_CONFIG, NOT_CONFIGURED } from "@/lib/llm.ts";
import type { Messages } from "@/lib/messages/types.ts";
import { createLogger, errorMessage } from "@/lib/log.ts";
import { TRIGGER_KEYS } from "@/lib/platform.ts";
import { cn } from "@/lib/utils.ts";
import { siteUrl } from "@/lib/site.ts";

const log = createLogger("actions-settings");

// The structured failure import_action / save_action (src-tauri) reject with.
const ActionErrorSchema = z.object({
  code: z.string(),
  detail: z.string().nullish(),
});

/** Localize an action failure; anything not shaped like an ActionError (a
 *  network error, a bug) falls back to the generic failed(reason). */
function actionErrorText(t: Messages, error: unknown): string {
  const parsed = ActionErrorSchema.safeParse(error);
  if (!parsed.success) {
    return t.actions.failed(errorMessage(error).slice(0, 200));
  }
  const detail = parsed.data.detail ?? "";
  switch (parsed.data.code) {
    case "not-an-action": {
      return t.actions.importNotAnAction;
    }
    case "no-label": {
      return t.actions.importNoLabel;
    }
    case "invalid-id": {
      return t.actions.importInvalidId(detail);
    }
    case "builtin-id": {
      return t.actions.importBuiltinId(detail);
    }
    case "id-exists": {
      return t.actions.importIdExists(detail);
    }
    case "label-exists": {
      return t.actions.labelExists(detail);
    }
    case "file-too-large": {
      return t.actions.importTooLarge;
    }
    default: {
      return t.actions.failed((detail === "" ? parsed.data.code : detail).slice(0, 200));
    }
  }
}

/** What the form shows. `id` present = an existing action; `locked` = a
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
  minChars: string;
  maxChars: string;
  action: string;
}

const NEW_RULE: RuleDraft = {
  kind: "",
  appName: "",
  execName: "",
  windowTitle: "",
  url: "",
  minChars: "",
  maxChars: "",
  action: "",
};

export function ActionsSettings(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const actionLabel = useActionLabel();
  const [actions, setActions] = useState<ActionInfo[]>([]);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  // The ✨ button: the configured model is rewriting the instruction field.
  const [drafting, setDrafting] = useState(false);
  // The effective kind → action assignments, kept in the same reload path as
  // the list so the selects and the action list never disagree.
  const [routing, setRouting] = useState<RoutingInfo>({ by_kind: {}, overrides: [] });
  const [routingError, setRoutingError] = useState<string | undefined>(undefined);
  // The override rule being added or edited, if any.
  const [rule, setRule] = useState<RuleDraft | undefined>(undefined);
  const [ruleError, setRuleError] = useState<string | undefined>(undefined);
  // Which action was just exported (transient check mark), and the import
  // panel's state.
  const [exportedId, setExportedId] = useState<string | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);

  const reload = (): void => {
    void (async () => {
      try {
        const [list, routes] = await Promise.all([listActions(), getRouting()]);
        setActions(list);
        setRouting(routes);
      } catch (error) {
        log.error("listing actions failed", error);
      }
    })();
  };

  // Load on mount, and again when the window regains focus — so actions the
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

  // Import and the editor/viewer are alternatives: opening one closes the
  // other, so exactly one panel is ever on screen and a click always has a
  // visible effect.
  const edit = (action: ActionInfo): void => {
    setFormError(undefined);
    setImportOpen(false);
    setDraft({
      id: action.id,
      label: action.label,
      instructions: action.instructions,
      prompt: action.prompt,
      role: action.role ?? "",
      locked: action.origin === "builtin",
    });
  };

  const importPanelRef = useRef<HTMLDivElement | null>(null);
  const importTextRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);

  // The editor and viewer render below the (long) actions list — opened
  // off-screen they look like a dead button. Scroll the freshly opened panel
  // into view and put the caret where typing starts. Keyed by the edited id
  // (not the draft object) so typing never re-triggers the scroll.
  const editorKey = draft && !draft.locked ? (draft.id ?? "new") : undefined;
  const viewerKey = draft?.locked ? draft.id : undefined;
  useEffect(() => {
    if (importOpen) {
      importTextRef.current?.focus({ preventScroll: true });
      importPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [importOpen]);
  useEffect(() => {
    if (editorKey !== undefined) {
      labelRef.current?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editorKey]);
  useEffect(() => {
    if (viewerKey !== undefined) {
      viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [viewerKey]);

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
          setFormError(t.actions.draftFailed);
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
    const duplicate = actions.some(
      (action) =>
        action.id !== draft.id &&
        actionLabel(action.id, action.label).trim().toLowerCase() === wanted,
    );
    if (wanted !== "" && duplicate) {
      setFormError(t.actions.labelExists(draft.label.trim()));
      return;
    }
    void (async () => {
      try {
        await saveAction({
          id: draft.id,
          label: draft.label,
          instructions: draft.instructions,
          prompt: draft.prompt.trim() === "" ? "{{ text }}" : draft.prompt,
          role: draft.role.trim() === "" ? undefined : draft.role.trim(),
        });
        setDraft(undefined);
        reload();
      } catch (error) {
        log.error("saving action failed", error);
        setFormError(actionErrorText(t, error));
      }
    })();
  };

  const remove = (action: ActionInfo): void => {
    setFormError(undefined);
    void (async () => {
      try {
        await deleteAction(action.id);
        reload();
      } catch (error) {
        log.error("deleting action failed", error);
        setFormError(t.actions.failed(errorMessage(error).slice(0, 200)));
      }
    })();
  };

  // Export = save the action's .md into Downloads, browser-download style
  // (Rust reveals the file — that reveal is the real feedback; the transient
  // check here covers the case where the reveal is disabled or slow).
  const exportFile = (id: string): void => {
    void (async () => {
      try {
        await exportActionFile(id);
        setExportedId(id);
        globalThis.setTimeout(() => {
          setExportedId((prev) => (prev === id ? undefined : prev));
        }, 1500);
      } catch (error) {
        log.error("exporting action failed", error);
        setFormError(t.actions.failed(errorMessage(error).slice(0, 200)));
      }
    })();
  };

  // One path for both import sources: pasted text and a fetched URL.
  const importFrom = (load: () => Promise<string>): void => {
    setImportError(undefined);
    setImportBusy(true);
    void (async () => {
      try {
        await importAction(await load());
        setImportOpen(false);
        setImportText("");
        reload();
      } catch (error) {
        log.error("importing action failed", error);
        setImportError(actionErrorText(t, error));
      } finally {
        setImportBusy(false);
      }
    })();
  };

  // The native-picker variant: Rust owns the dialog and the read; a null id
  // just means the picker was cancelled — no error, panel stays open.
  const importFromFile = (): void => {
    setImportError(undefined);
    setImportBusy(true);
    void (async () => {
      try {
        const id = await importActionFromFile();
        if (id !== null) {
          setImportOpen(false);
          setImportText("");
          reload();
        }
      } catch (error) {
        log.error("importing action from a file failed", error);
        setImportError(actionErrorText(t, error));
      } finally {
        setImportBusy(false);
      }
    })();
  };

  const changeRouting = (kind: RoutableKind, id: string): void => {
    setRoutingError(undefined);
    // Optimistic: the select reflects the choice instantly; reload confirms.
    setRouting((prev) => {
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
        await setKindAction(kind, id === "" ? undefined : id);
      } catch (error) {
        log.error("updating routing failed", error);
        setRoutingError(t.actions.failed(errorMessage(error).slice(0, 200)));
      } finally {
        reload();
      }
    })();
  };

  // The overrides reference on zencopy.app, in the user's language.
  const openRoutingDocs = (): void => {
    void invoke("open_url", { url: siteUrl(locale, "configuration/#routingjson") });
  };

  // Every rule mutation (add, edit, delete, reorder) writes the whole ordered
  // list — the order IS the priority, so partial updates would be a lie.
  const commitOverrides = (next: RoutingOverride[]): void => {
    setRoutingError(undefined);
    setRouting((prev) => ({ ...prev, overrides: next })); // optimistic
    void (async () => {
      try {
        await setOverrides(next);
      } catch (error) {
        log.error("saving override rules failed", error);
        setRoutingError(t.actions.failed(errorMessage(error).slice(0, 200)));
      } finally {
        reload();
      }
    })();
  };

  const moveOverride = (index: number, delta: -1 | 1): void => {
    const next = [...routing.overrides];
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
    const existing = routing.overrides[index];
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
      minChars: existing.when.min_chars?.toString() ?? "",
      maxChars: existing.when.max_chars?.toString() ?? "",
      action: existing.action,
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
    if (rule.minChars.trim() !== "") {
      when.min_chars = Number(rule.minChars);
    }
    if (rule.maxChars.trim() !== "") {
      when.max_chars = Number(rule.maxChars);
    }
    // The schema owns validity (a target action, at least one condition,
    // coherent bounds); its sentinel messages map to i18n sentences here.
    const checked = EditableOverrideSchema.safeParse({ when, action: rule.action });
    if (!checked.success) {
      const sentinel = checked.error.issues[0]?.message;
      setRuleError(
        sentinel === "bounds-order" ? t.routing.needsValidBounds : t.routing.needsCondition,
      );
      return;
    }
    const entry: RoutingOverride = checked.data;
    const next = [...routing.overrides];
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
    text: t.routing.kindText,
    rich_text: t.routing.kindRichText,
    image: t.routing.kindImage,
    files: t.routing.kindFiles,
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
      chips.push({ label: t.routing.fieldApp, value: when.app_name });
    }
    if (when.exec_name) {
      chips.push({ label: t.routing.fieldExec, value: when.exec_name });
    }
    if (when.window_title) {
      chips.push({ label: t.routing.fieldTitle, value: when.window_title });
    }
    if (when.url) {
      chips.push({ label: t.routing.fieldUrl, value: when.url });
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
            <h2 className="text-sm font-medium">{t.actions.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.actions.hint(TRIGGER_KEYS)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setImportError(undefined);
                setDraft(undefined);
                setImportOpen(true);
              }}
            >
              <Upload className="size-3.5" />
              {t.actions.import}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFormError(undefined);
                setImportOpen(false);
                setDraft({ ...NEW_DRAFT });
              }}
            >
              <Plus className="size-3.5" />
              {t.actions.add}
            </Button>
          </div>
        </div>

        {importOpen ? (
          <div
            ref={importPanelRef}
            className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4"
          >
            <p className="text-xs text-muted-foreground">{t.actions.importHint}</p>
            <textarea
              ref={importTextRef}
              className={cn(FIELD, "h-28 resize-none font-mono text-xs leading-relaxed")}
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
                {t.actions.import}
              </Button>
              <Button size="sm" variant="outline" disabled={importBusy} onClick={importFromFile}>
                {t.actions.importFromFile}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={importBusy}
                onClick={() => {
                  setImportOpen(false);
                  setImportError(undefined);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
            {importError ? <p className="text-xs text-destructive">{importError}</p> : undefined}
          </div>
        ) : undefined}

        <ul className="flex flex-col divide-y rounded-lg border">
          {actions.map((action) => (
            <li key={action.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 truncate text-sm">
                {actionLabel(action.id, action.label)}
              </span>
              <span className="ms-auto flex shrink-0 items-center gap-0.5 text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t.actions.export}
                  title={t.actions.export}
                  onClick={() => {
                    exportFile(action.id);
                  }}
                >
                  {exportedId === action.id ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                </Button>
                {/* Built-ins are immutable but readable — they double as examples. */}
                {action.origin === "builtin" ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.actions.view}
                    title={t.actions.view}
                    onClick={() => {
                      edit(action);
                    }}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.actions.edit}
                      title={t.actions.edit}
                      onClick={() => {
                        edit(action);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t.actions.remove}
                      title={t.actions.remove}
                      onClick={() => {
                        remove(action);
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

        {/* Read-only actions get a viewer, not a disabled editor — nothing on
          this surface should look like it accepts input. */}
        {draft?.locked ? (
          <div ref={viewerRef} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.actions.name}</span>
              <p className="text-sm">{actionLabel(draft.id ?? "", draft.label)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.actions.instruction}
              </span>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {draft.instructions}
              </pre>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.actions.template}
              </span>
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {draft.prompt}
              </pre>
            </div>
            {draft.role ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.actions.roleLabel}
                </span>
                <p className="text-sm">{draft.role}</p>
              </div>
            ) : undefined}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={openTemplateDocs}
            >
              {t.actions.templateDocs}
              <ExternalLink className="size-3" />
            </button>
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(undefined);
                }}
              >
                {t.popup.close}
              </Button>
            </div>
          </div>
        ) : undefined}

        {draft && !draft.locked ? (
          <div ref={editorRef} className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.actions.name}</span>
              <input
                ref={labelRef}
                className={FIELD}
                value={draft.label}
                onChange={(event) => {
                  setDraft({ ...draft, label: event.target.value });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t.actions.instruction}
              </span>
              <textarea
                className={cn(FIELD, "h-24 resize-none leading-relaxed")}
                placeholder={t.actions.instructionPlaceholder}
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
                  {t.actions.draft}
                </Button>
                <span className="text-[11px] text-muted-foreground/80">{t.actions.draftHint}</span>
              </div>
            </label>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                {t.actions.advanced}
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.actions.template}
                  </span>
                  <textarea
                    className={cn(FIELD, "h-20 resize-none font-mono text-xs leading-relaxed")}
                    spellCheck={false}
                    value={draft.prompt}
                    onChange={(event) => {
                      setDraft({ ...draft, prompt: event.target.value });
                    }}
                  />
                  <span className="text-[11px] text-muted-foreground/80">
                    {t.actions.templateHint}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={openTemplateDocs}
                  >
                    {t.actions.templateDocs}
                    <ExternalLink className="size-3" />
                  </button>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.actions.roleLabel}
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(undefined);
                  setFormError(undefined);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
          </div>
        ) : undefined}

        {formError ? <p className="text-xs text-destructive">{formError}</p> : undefined}
      </section>

      <QuickActionsSettings />

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div>
          <h2 className="text-sm font-medium">{t.routing.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t.routing.hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          {ROUTABLE_KINDS.map((kind) => {
            const assigned = routing.by_kind[kind] ?? "";
            const known = assigned === "" || actions.some((action) => action.id === assigned);
            return (
              <label key={kind} className="flex items-center justify-between gap-4">
                <span className="text-sm">{kindLabels[kind]}</span>
                <Select
                  className="w-56"
                  value={assigned}
                  onChange={(event) => {
                    changeRouting(kind, event.target.value);
                  }}
                >
                  <option value="">{t.routing.none}</option>
                  {/* An assignment pointing at a deleted action stays listed by
                    its raw id, so the state is visible instead of silently
                    showing "None". */}
                  {known ? undefined : <option value={assigned}>{assigned}</option>}
                  {actions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {actionLabel(action.id, action.label)}
                    </option>
                  ))}
                </Select>
              </label>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium">{t.routing.overridesTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.routing.overridesHint}{" "}
              <button
                type="button"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                onClick={openRoutingDocs}
              >
                {t.routing.overridesDocs}
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
            {t.routing.addOverride}
          </Button>
        </div>

        {routing.overrides.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {routing.overrides.map((entry, index) => (
              // Order is priority, so position is the only stable identity a
              // rule has — the index key is correct here, not a fallback.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index} className="flex items-center gap-2 px-3 py-2">
                <span className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label={t.routing.moveUp}
                    title={t.routing.moveUp}
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
                    aria-label={t.routing.moveDown}
                    title={t.routing.moveDown}
                    disabled={index === routing.overrides.length - 1}
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
                    {actionLabel(
                      entry.action,
                      actions.find((action) => action.id === entry.action)?.label ?? entry.action,
                    )}
                  </span>
                </span>
                <span className="ms-auto flex shrink-0 items-center gap-0.5 text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.actions.edit}
                    title={t.actions.edit}
                    onClick={() => {
                      editOverride(index);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t.actions.remove}
                    title={t.actions.remove}
                    onClick={() => {
                      commitOverrides(routing.overrides.filter((_, i) => i !== index));
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
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            {/* One field per row — app names, window titles, and URLs get
                long. Only the two character bounds share a row. */}
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.routing.fieldKind}
                </span>
                <Select
                  value={rule.kind}
                  onChange={(event) => {
                    setRule({ ...rule, kind: event.target.value });
                  }}
                >
                  <option value="">{t.routing.anyKind}</option>
                  {ROUTABLE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabels[kind]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.routing.fieldApp}
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
                  {t.routing.fieldTitle}
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
                  {t.routing.fieldUrl}
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
                  {t.routing.fieldExec}
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
              {/* Text inputs, not type="number" (its spinner renders as a
                  squashed artifact in the webview) — non-digits are stripped
                  as you type, so the field can never hold an invalid value. */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t.routing.fieldMinChars}
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
                    {t.routing.fieldMaxChars}
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
                  {t.routing.ruleAction}
                </span>
                <Select
                  value={rule.action}
                  onChange={(event) => {
                    setRule({ ...rule, action: event.target.value });
                  }}
                >
                  <option value="">—</option>
                  {actions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {actionLabel(action.id, action.label)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <span className="text-[11px] text-muted-foreground/80">{t.routing.wildcardHint}</span>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={rule.action === ""} onClick={saveRule}>
                {t.common.save}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRule(undefined);
                  setRuleError(undefined);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
            {ruleError ? <p className="text-xs text-destructive">{ruleError}</p> : undefined}
          </div>
        ) : undefined}

        {routingError ? <p className="text-xs text-destructive">{routingError}</p> : undefined}
      </section>
    </>
  );
}
