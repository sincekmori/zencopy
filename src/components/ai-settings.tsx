import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, ExternalLink, Eye, LoaderCircle } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import {
  type CatalogProblem,
  catalogProblemText,
  checkCatalog,
  editCatalog,
  readCatalog,
  writeCatalog,
} from "@/lib/catalog-file.ts";
import { useLocale, useT } from "@/lib/i18n.tsx";
import { INVALID_CONFIG, NOT_CONFIGURED, testConnection } from "@/lib/llm.ts";
import { createLogger, errorMessage } from "@/lib/log.ts";
import {
  EMPTY_FORMS,
  FORM_PROVIDERS,
  type FormProvider,
  formsOf,
  FREE_KEY_URL,
  GEMINI_DEFAULT_MODEL,
  type ProviderForm,
  type ProviderForms,
  withForm,
} from "@/lib/quickstart.ts";
import { siteUrl } from "@/lib/site.ts";
import { useTauriEvent, useWindowOpen, WINDOW_CLOSED } from "@/lib/use-tauri-event.ts";
import { cn } from "@/lib/utils.ts";

const log = createLogger("ai-settings");

const VENDOR_LABELS: Record<Exclude<FormProvider, "openai-compatible">, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
};

// Convenience only — model names age fast, so the field stays free-form and
// this list is a starting point, not a catalog.
// First entry is the default (the fallback when the model field is left empty,
// see persist): each provider's best speed/quality pick for a copy→popup.
// The rest are the current GA generation, ordered light to smart. Google's
// two are the `-latest` aliases, which Google itself moves to each new
// Flash-Lite and Flash release. Anthropic defaults to Sonnet 5.5 with Haiku
// 5.5 listed below it: Haiku 5.5 is the first Haiku that reasons (4.5 did
// not, and stayed off the list), and whether it stays sharp enough for a
// copy→popup is unmeasured.
const MODEL_SUGGESTIONS: Record<FormProvider, [string, ...string[]]> = {
  openai: ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"],
  google: [GEMINI_DEFAULT_MODEL, "gemini-flash-latest"],
  anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
  "openai-compatible": ["gemma4:e4b", "gpt-oss:20b"],
};

type TestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | { phase: "ok" }
  | { phase: "failed"; message: string };

/** The catalog JSON with every inline `apiKey` value replaced by dots — what
 *  shows through the privacy veil until the user explicitly reveals the keys,
 *  so a screen-shared or demoed settings window never leaks a credential. */
function maskSecrets(json: string): string {
  return json.replaceAll(
    /("apiKey"\s*:\s*")(?:[^"\\]|\\.)+(")/gu,
    (_match, before: string, after: string) => `${before}●●●●●●●●${after}`,
  );
}

export function AiSettings(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  // One row of tabs: the four simple-form providers plus "JSON", the raw
  // catalog editor — a peer, not a separate "mode", so the eye never has to
  // travel to a second switch.
  const [selected, setSelected] = useState<FormProvider | "json">("google");
  const [forms, setForms] = useState<ProviderForms>(EMPTY_FORMS);
  const [advanced, setAdvanced] = useState("");
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<CatalogProblem | undefined>(undefined);
  const [test, setTest] = useState<TestState>({ phase: "idle" });
  // Whether the JSON editor shows real apiKey values. Off by default and
  // dropped again whenever the window loses focus, so keys are never on
  // screen unless the user just asked for them.
  const [revealKeys, setRevealKeys] = useState(false);
  const jsonEditor = useRef<HTMLTextAreaElement>(null);
  // The file's text as it was last read or written here — what the next read
  // is held against, to tell a change on disk.
  const onDisk = useRef<string | undefined>(undefined);
  // Whether the screen holds edits the file does not: those are the user's
  // to save or abandon, and a change on disk does not replace them.
  const edited = useRef(false);
  // A read of the file in flight. Opening the window asks for one twice (it
  // opens, and it takes focus), and one answer serves both.
  const reading = useRef(false);

  // The settings window hides on close instead of being destroyed, so state
  // survives — a saved confirmation or test verdict left standing would greet
  // the next open. (The invalid-config notice stays: it describes the content,
  // which is unchanged.)
  useTauriEvent(WINDOW_CLOSED, () => {
    setSaved(false);
    setTest({ phase: "idle" });
  });

  // Put what the file holds on screen. A file the app cannot run opens on the
  // JSON tab, where the offending text is visible and fixable — and so does
  // one whose default provider has no form (another vendor, a gateway),
  // rather than an empty form that looks like nothing is set up.
  const show = async (text: string): Promise<void> => {
    const firstLook = onDisk.current === undefined;
    const checked = await checkCatalog(text);
    onDisk.current = text;
    edited.current = false;
    setAdvanced(text);
    setInvalid(checked?.problem);
    if (checked?.config) {
      const filled = formsOf(checked.config);
      setForms(filled.forms);
      if (firstLook) {
        setSelected(filled.selected ?? "json");
      }
    } else if (checked) {
      setSelected("json");
    }
  };

  // Follow the file: read when the window opens — never at startup, when it
  // is created hidden and validating would load the provider SDKs into a
  // window nobody has opened — and again whenever it regains focus, so a
  // hand edit shows up without reopening anything.
  const refresh = async (): Promise<void> => {
    const text = await readCatalog();
    const known = onDisk.current;
    if (text !== known && !(edited.current && known !== undefined)) {
      await show(text);
    }
  };
  const follow = useEffectEvent((): void => {
    if (reading.current) {
      return;
    }
    reading.current = true;
    void (async () => {
      try {
        await refresh();
      } catch (error) {
        log.error("reading the catalog failed", error);
      }
      reading.current = false;
    })();
  });

  const open = useWindowOpen();
  useEffect(() => {
    if (open) {
      follow();
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) {
          follow();
        } else {
          setRevealKeys(false);
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

  // A provider tab's fields as they are saved: an empty model field means
  // the provider's first suggestion, so a key alone is a valid setup.
  const formToSave = (provider: FormProvider): ProviderForm => {
    const form = forms[provider];
    return { ...form, model: form.model.trim() || MODEL_SUGGESTIONS[provider][0] };
  };

  /** Save what the current tab holds — the JSON tab's text as it stands, a
   *  provider tab's fields written into the config the file holds now, so
   *  everything else in it survives. Whether it reached the disk. */
  const persist = async (): Promise<boolean> => {
    const written =
      selected === "json"
        ? await writeCatalog(advanced)
        : await editCatalog((config) => withForm(config, selected, formToSave(selected)));
    setInvalid(written.problem);
    if (written.problem) {
      // The file itself is what the app cannot run: a form does not write
      // over it. The JSON tab shows it, to be seen and fixed there.
      if (written.unreadable !== undefined) {
        onDisk.current = written.unreadable;
        setAdvanced(written.unreadable);
        setSelected("json");
      }
      return false;
    }
    // Every tab now shows what was saved, whichever one saved it.
    onDisk.current = written.json;
    edited.current = false;
    setAdvanced(written.json);
    setForms(formsOf(written.config).forms);
    setSaved(true);
    return true;
  };

  // Edits apply to the selected provider's form only — the others keep
  // whatever the user (or the file on disk) put in them.
  const editForm = (patch: Partial<ProviderForm>): void => {
    if (selected === "json") {
      return; // the form fields only render on provider tabs
    }
    edited.current = true;
    setSaved(false);
    setTest({ phase: "idle" });
    setForms((prev) => ({ ...prev, [selected]: { ...prev[selected], ...patch } }));
  };

  const pick = (next: FormProvider | "json"): void => {
    setSaved(false);
    setInvalid(undefined);
    setTest({ phase: "idle" });
    // Leaving the JSON tab always drops the veil again (editor blur covers
    // this too, but only if the programmatic focus after reveal succeeded).
    setRevealKeys(false);
    setSelected(next);
  };

  // Plain save (as opposed to runTest, which also persists): drop any stale
  // test verdict first, or it would keep suppressing the "saved" message.
  const save = (): void => {
    setTest({ phase: "idle" });
    void persist();
  };

  // Save what is on screen, then stream one token from the default role — the
  // whole chain (file, key, base URL, model) verified with one click.
  const runTest = (): void => {
    setTest({ phase: "testing" });
    void (async () => {
      if (!(await persist())) {
        setTest({ phase: "idle" }); // the invalid-config message already explains
        return;
      }
      try {
        await testConnection();
        setTest({ phase: "ok" });
      } catch (error) {
        // Full detail goes to the log; the user gets a human sentence — never
        // a raw provider error.
        log.error("connection test failed", error);
        const reason = errorMessage(error);
        let message = t.ai.testUnreachable;
        if (reason === NOT_CONFIGURED) {
          message = t.ai.notConfigured;
        } else if (reason === INVALID_CONFIG) {
          message = t.ai.invalidConfig;
        }
        setTest({ phase: "failed", message });
      }
    })();
  };

  const invalidNotice = invalid ? (
    <span className="min-w-0 text-xs text-destructive">{catalogProblemText(t, invalid)}</span>
  ) : undefined;

  const testFeedback = (
    <>
      {test.phase === "ok" ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" />
          {t.ai.testOk}
        </span>
      ) : undefined}
      {test.phase === "failed" ? (
        <span className="min-w-0 text-xs wrap-break-word text-destructive">{test.message}</span>
      ) : undefined}
    </>
  );

  // One footer for every tab — Save, Test (with spinner), and the shared
  // feedback line. Only what is written differs (persist).
  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={save}>
        {t.common.save}
      </Button>
      <Button size="sm" variant="outline" disabled={test.phase === "testing"} onClick={runTest}>
        {test.phase === "testing" ? <LoaderCircle className="size-3.5 animate-spin" /> : undefined}
        {t.ai.test}
      </Button>
      {saved && test.phase === "idle" ? (
        <span className="text-xs text-muted-foreground">{t.common.saved}</span>
      ) : undefined}
      {invalidNotice}
      {testFeedback}
    </div>
  );

  // "JSON" is a format name, not prose — the same in every language.
  const tabLabel = (tab: FormProvider | "json"): string => {
    if (tab === "json") {
      return "JSON";
    }
    if (tab === "openai-compatible") {
      return t.ai.providerCompatible;
    }
    return VENDOR_LABELS[tab];
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-sm font-medium">{t.ai.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.ai.hint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t.ai.provider}</span>
        <div className="inline-flex w-fit flex-wrap rounded-lg border bg-muted/40 p-1">
          {([...FORM_PROVIDERS, "json"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                pick(p);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                selected === p
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tabLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {selected === "json" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t.ai.advancedHint}{" "}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                // Our own Recipes page (copy-paste setups); it links on to the
                // full ai-sdk-catalog schema for the rest.
                void invoke("open_url", { url: siteUrl(locale, "recipes/") });
              }}
            >
              {t.ai.examplesLink}
              <ExternalLink className="size-3" />
            </button>
          </p>
          {(() => {
            // Guarded only when the JSON actually contains an inline key.
            // While veiled the editor is not a textarea at all — one click on
            // the veil is the sole way in, so it can never look editable
            // without being editable.
            const masked = maskSecrets(advanced);
            const hasSecrets = masked !== advanced;
            if (hasSecrets && !revealKeys) {
              return (
                <button
                  type="button"
                  className={cn(
                    FIELD,
                    "group relative block h-56 cursor-pointer overflow-hidden p-0 text-start",
                  )}
                  aria-label={t.ai.revealKeys}
                  onClick={() => {
                    setRevealKeys(true);
                    requestAnimationFrame(() => {
                      jsonEditor.current?.focus();
                    });
                  }}
                >
                  <pre
                    aria-hidden="true"
                    className="h-full overflow-hidden px-3 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
                  >
                    {masked}
                  </pre>
                  <span className="absolute inset-0 flex items-center justify-center bg-background/45 backdrop-blur-[1.5px] transition-colors group-hover:bg-background/25">
                    <Eye className="size-6 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </span>
                </button>
              );
            }
            return (
              <textarea
                ref={jsonEditor}
                className={cn(FIELD, "block h-56 resize-none font-mono text-xs leading-relaxed")}
                spellCheck={false}
                value={advanced}
                onChange={(event) => {
                  edited.current = true;
                  setSaved(false);
                  setTest({ phase: "idle" });
                  setAdvanced(event.target.value);
                }}
                // The reveal lasts exactly as long as the editor has focus:
                // click anywhere else — another provider tab, another settings
                // section, another window — and the veil is back.
                onBlur={() => {
                  setRevealKeys(false);
                }}
              />
            );
          })()}
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">{t.ai.disclosure}</p>
          {footer}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {selected === "openai-compatible" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.ai.baseUrl}</span>
              <input
                className={FIELD}
                value={forms[selected].baseUrl}
                placeholder="http://localhost:11434/v1"
                onChange={(event) => {
                  editForm({ baseUrl: event.target.value });
                }}
              />
            </label>
          ) : undefined}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.ai.model}</span>
            <input
              className={FIELD}
              value={forms[selected].model}
              placeholder={MODEL_SUGGESTIONS[selected][0]}
              list="model-suggestions"
              onChange={(event) => {
                editForm({ model: event.target.value });
              }}
            />
            <datalist id="model-suggestions">
              {MODEL_SUGGESTIONS[selected].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.ai.apiKey}</span>
            <input
              className={FIELD}
              type="password"
              value={forms[selected].apiKey}
              onChange={(event) => {
                editForm({ apiKey: event.target.value });
              }}
            />
            <span className="text-[11px] text-muted-foreground/80">{t.ai.apiKeyHint}</span>
            {selected === "google" ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  void invoke("open_url", { url: FREE_KEY_URL });
                }}
              >
                {t.ai.freeKeyLink}
                <ExternalLink className="size-3" />
              </button>
            ) : undefined}
          </label>

          <p className="text-[11px] leading-relaxed text-muted-foreground/80">{t.ai.disclosure}</p>
          {footer}
        </div>
      )}
    </section>
  );
}
