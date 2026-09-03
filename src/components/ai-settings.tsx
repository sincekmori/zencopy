import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Config } from "ai-sdk-catalog";
import { Check, ExternalLink, Eye, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { useLocale, useT } from "@/lib/i18n.tsx";
import { INVALID_CONFIG, NOT_CONFIGURED, REQUIRED_ROLES, testConnection } from "@/lib/llm.ts";
import { createLogger, errorMessage } from "@/lib/log.ts";
import { FREE_KEY_URL, GEMINI_DEFAULT_MODEL, SCHEMA_URL } from "@/lib/quickstart.ts";
import { siteUrl } from "@/lib/site.ts";
import { useTauriEvent } from "@/lib/use-tauri-event.ts";
import { cn } from "@/lib/utils.ts";

const log = createLogger("ai-settings");

type Provider = "openai" | "google" | "anthropic" | "openai-compatible";

/** The simple fields for one provider. Each provider keeps its own draft, so
 *  switching the picker never leaks a model or key across providers. */
interface ProviderDraft {
  baseUrl: string;
  model: string;
  apiKey: string;
}

type Drafts = Record<Provider, ProviderDraft>;

// Google leads: a free AI Studio key is the recommended zero-cost start.
const PROVIDERS: Provider[] = ["google", "openai", "anthropic", "openai-compatible"];
const VENDOR_LABELS: Record<Exclude<Provider, "openai-compatible">, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
};

function emptyDrafts(): Drafts {
  return {
    openai: { baseUrl: "", model: "", apiKey: "" },
    google: { baseUrl: "", model: "", apiKey: "" },
    anthropic: { baseUrl: "", model: "", apiKey: "" },
    "openai-compatible": { baseUrl: "", model: "", apiKey: "" },
  };
}

// Convenience only — model names age fast, so the field stays free-form and
// this list is a starting point, not a catalog.
// First entry is the default (the fallback when the model field is left empty,
// see buildJson): each provider's best speed/quality pick for a copy→popup.
// The rest are the current GA generation, ordered light to smart. Anthropic
// defaults to Sonnet 5, not the lighter Haiku: Haiku 4.5 is a non-reasoning
// tier that gives up too much quality, whereas Google's flash-lite and
// OpenAI's Luna stay sharp enough at their light tier.
const MODEL_SUGGESTIONS: Record<Provider, string[]> = {
  openai: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
  google: [GEMINI_DEFAULT_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"],
  anthropic: ["claude-sonnet-5", "claude-opus-5"],
  "openai-compatible": ["gemma4:e4b", "gpt-oss:20b"],
};

/** A single provider + roles.default — the shape the simple fields produce.
 *  Endpoint overrides (key, base URL) live in the `vendor` block; the block is
 *  omitted entirely when there is nothing to override, and its `id` defaults to
 *  the provider id ("openai-compatible" is itself a valid vendor id). The api
 *  key stays inline; this file is local-only and gitignored. An empty model
 *  field falls back to the first suggestion, so a key alone is a valid setup. */
function buildJson(selected: Provider, draft: ProviderDraft): string {
  const model = draft.model.trim() === "" ? (MODEL_SUGGESTIONS[selected][0] ?? "") : draft.model;
  const provider: Record<string, unknown> = { id: selected, models: [{ id: model }] };
  const vendor: Record<string, unknown> = {};
  if (selected === "openai-compatible" && draft.baseUrl) {
    vendor["baseURL"] = draft.baseUrl;
  }
  if (draft.apiKey) {
    vendor["apiKey"] = draft.apiKey;
  }
  if (Object.keys(vendor).length > 0) {
    provider["vendor"] = vendor;
  }
  return JSON.stringify(
    {
      $schema: SCHEMA_URL,
      providers: [provider],
      roles: { default: `${selected}:${model}` },
    },
    undefined,
    2,
  );
}

/** Why some JSON is not a valid catalog. Syntax and schema are reported
 *  separately — "invalid JSON" on a well-formed file with a wrong shape would
 *  send the user hunting for a missing comma. */
type CatalogProblem = "syntax" | "schema" | "io";

/** Parse + zod-validate catalog JSON — the same ai-sdk-catalog schema the
 *  runtime uses, so the editor and the popup can never disagree on validity.
 *  The user sees an i18n sentence only; the zod issues go to the log. Async
 *  because ai-sdk-catalog loads lazily (it drags in every provider SDK — see
 *  the @/lib/llm facade); every caller is an async flow already. */
async function checkCatalog(
  json: string,
): Promise<
  { config: Config; problem?: undefined } | { config?: undefined; problem: CatalogProblem }
> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { problem: "syntax" };
  }
  const { ConfigSchema } = await import("ai-sdk-catalog");
  let config: Config;
  try {
    config = ConfigSchema.parse(data);
  } catch (error) {
    log.warn("catalog JSON failed schema validation", error);
    return { problem: "schema" };
  }
  // The same requirement the runtime declares to createCatalog — the editor
  // must never bless a config the app will refuse.
  const missing = REQUIRED_ROLES.filter((role) => config.roles[role] === undefined);
  if (missing.length > 0) {
    log.warn(`catalog JSON is missing the required role(s): ${missing.join(", ")}`);
    return { problem: "schema" };
  }
  return { config };
}

type CatalogProvider = Config["providers"][number];

/** A provider's vendor block with the string shorthand normalized to `{ id }`
 *  (the same normalization the catalog itself applies). */
function vendorBlockOf(entry: CatalogProvider): Extract<CatalogProvider["vendor"], object> {
  return (typeof entry.vendor === "string" ? { id: entry.vendor } : entry.vendor) ?? {};
}

/** Which simple-mode bucket a catalog provider belongs to. The SDK is chosen
 *  by the vendor id (falling back to the provider id), so `{ id: "ollama",
 *  vendor: { id: "openai-compatible" } }` lands in the compatible bucket. */
function bucketOf(entry: CatalogProvider): Provider | undefined {
  const kind = vendorBlockOf(entry).id ?? entry.id;
  return PROVIDERS.includes(kind as Provider) ? (kind as Provider) : undefined;
}

/** Pre-fill the simple fields from a valid config: every recognizable provider
 *  fills its own bucket (its role-referenced model first, else its first
 *  listed model), and the default role picks which bucket is selected. An
 *  `{ envVarName }` api key has no inline value to show, so its field stays
 *  empty — the advanced editor still has the real config. */
async function parseSimple(config: Config): Promise<{ provider: Provider; drafts: Drafts }> {
  const { parseRoleRef } = await import("ai-sdk-catalog");
  const drafts = emptyDrafts();
  const targets = Object.fromEntries(
    Object.entries(config.roles).map(([name, ref]) => [name, parseRoleRef(ref)]),
  );
  for (const entry of config.providers) {
    const bucket = bucketOf(entry);
    if (bucket) {
      const roleModel =
        targets["default"]?.provider === entry.id
          ? targets["default"]?.model
          : Object.values(targets).find((target) => target.provider === entry.id)?.model;
      const vendor = vendorBlockOf(entry);
      drafts[bucket] = {
        baseUrl: vendor.baseURL ?? "",
        model: roleModel ?? entry.models[0]?.id ?? "",
        apiKey: typeof vendor.apiKey === "string" ? vendor.apiKey : "",
      };
    }
  }
  const defaultEntry = config.providers.find((entry) => entry.id === targets["default"]?.provider);
  const provider = (defaultEntry && bucketOf(defaultEntry)) ?? "google";
  return { provider, drafts };
}

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
  const [selected, setSelected] = useState<Provider | "json">("google");
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [advanced, setAdvanced] = useState("");
  const [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<CatalogProblem | undefined>(undefined);
  const [test, setTest] = useState<TestState>({ phase: "idle" });
  // Whether the JSON editor shows real apiKey values. Off by default and
  // dropped again whenever the window loses focus, so keys are never on
  // screen unless the user just asked for them.
  const [revealKeys, setRevealKeys] = useState(false);
  const jsonEditor = useRef<HTMLTextAreaElement>(null);

  // The settings window hides on close instead of being destroyed, so state
  // survives — a saved confirmation or test verdict left standing would greet
  // the next open. (The invalid-config notice stays: it describes the content,
  // which is unchanged.)
  useTauriEvent("window-closed", () => {
    setSaved(false);
    setTest({ phase: "idle" });
  });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) {
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = await invoke<string>("read_catalog");
      if (!cancelled) {
        setAdvanced(raw);
        if (raw.trim()) {
          const checked = await checkCatalog(raw);
          if (cancelled) {
            return;
          }
          if (checked.problem) {
            // The file on disk doesn't validate: say so immediately, on the
            // JSON tab where the offending text is visible and fixable.
            setInvalid(checked.problem);
            setSelected("json");
          } else {
            const parsed = await parseSimple(checked.config);
            if (!cancelled) {
              setSelected(parsed.provider);
              setDrafts(parsed.drafts);
            }
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (json: string): Promise<boolean> => {
    // Validate before writing — a file the schema rejects never reaches disk,
    // so the popup can't be broken by a bad save (only by hand edits).
    const { problem } = await checkCatalog(json);
    setInvalid(problem);
    if (problem) {
      return false;
    }
    try {
      await invoke("write_catalog", { json });
      await emit("catalog-changed");
      setSaved(true);
      return true;
    } catch (error) {
      log.error("write catalog failed", error);
      setInvalid("io");
      return false;
    }
  };

  // Edits apply to the selected provider's draft only — the other buckets
  // keep whatever the user (or the file on disk) put in them.
  const editDraft = (patch: Partial<ProviderDraft>): void => {
    if (selected === "json") {
      return; // the draft fields only render on provider tabs
    }
    setSaved(false);
    setTest({ phase: "idle" });
    setDrafts((prev) => ({ ...prev, [selected]: { ...prev[selected], ...patch } }));
  };

  const pick = (next: Provider | "json"): void => {
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
  const save = (json: string): void => {
    setTest({ phase: "idle" });
    void persist(json);
  };

  const saveSimple = (provider: Provider): void => {
    const json = buildJson(provider, drafts[provider]);
    setAdvanced(json);
    save(json);
  };

  // Save what is on screen, then stream one token from the default role — the
  // whole chain (file, key, base URL, model) verified with one click.
  const runTest = (json: string): void => {
    setTest({ phase: "testing" });
    void (async () => {
      if (!(await persist(json))) {
        setTest({ phase: "idle" }); // the invalid-JSON message already explains
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
    <span className="min-w-0 text-xs text-destructive">
      {{ syntax: t.ai.invalidJson, schema: t.ai.invalidSchema, io: t.ai.saveFailed }[invalid]}
    </span>
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
  // feedback line. Only where the JSON comes from differs.
  const footer = (onSave: () => void, currentJson: () => string): React.JSX.Element => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" onClick={onSave}>
        {t.common.save}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={test.phase === "testing"}
        onClick={() => {
          runTest(currentJson());
        }}
      >
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
  const tabLabel = (tab: Provider | "json"): string => {
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
          {([...PROVIDERS, "json"] as const).map((p) => (
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
          {footer(
            () => {
              save(advanced);
            },
            () => advanced,
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {selected === "openai-compatible" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.ai.baseUrl}</span>
              <input
                className={FIELD}
                value={drafts[selected].baseUrl}
                placeholder="http://localhost:11434/v1"
                onChange={(event) => {
                  editDraft({ baseUrl: event.target.value });
                }}
              />
            </label>
          ) : undefined}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.ai.model}</span>
            <input
              className={FIELD}
              value={drafts[selected].model}
              placeholder={MODEL_SUGGESTIONS[selected][0]}
              list="model-suggestions"
              onChange={(event) => {
                editDraft({ model: event.target.value });
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
              value={drafts[selected].apiKey}
              placeholder="sk-..."
              onChange={(event) => {
                editDraft({ apiKey: event.target.value });
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
          {footer(
            () => {
              saveSimple(selected);
            },
            () => buildJson(selected, drafts[selected]),
          )}
        </div>
      )}
    </section>
  );
}
