// The simple setup: a provider, a model and a key in three fields, written
// into ai-sdk-catalog.json. Shared by the first-run welcome screen (one free
// Gemini key becomes a complete catalog) and the AI settings' provider tabs,
// so both write the same config for the same fields.

import type { Config, Provider, RoleRef, RoleTarget, VendorBlock } from "ai-sdk-catalog";
import { version as catalogVersion } from "ai-sdk-catalog/package.json";

/** Google AI Studio hands out free-tier Gemini keys — the cheapest possible
 *  way to try ZenCopy, and the default the welcome screen suggests. */
export const FREE_KEY_URL = "https://aistudio.google.com/api-keys";

// Google's newest flash-lite — the fastest, cheapest Gemini tier, so it fits a
// free-tier key's rate limits best. (gemini-3.5-flash is heavier; offered as the
// step-up suggestion in AI settings.)
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";

// Editors that understand `$schema` validate and autocomplete the file; pin the
// URL to the installed ai-sdk-catalog so the hints always match the runtime.
const SCHEMA_URL = `https://cdn.jsdelivr.net/npm/ai-sdk-catalog@${catalogVersion}/schema.json`;

/** The providers that have a simple form. Google leads: a free AI Studio key
 *  is the recommended zero-cost start. */
export const FORM_PROVIDERS = ["google", "openai", "anthropic", "openai-compatible"] as const;
export type FormProvider = (typeof FORM_PROVIDERS)[number];

/** The simple fields for one provider. */
export interface ProviderForm {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** Each provider keeps its own form, so switching the picker never leaks a
 *  model or key across providers. */
export type ProviderForms = Record<FormProvider, ProviderForm>;

/** Every provider's form, each as `fill` makes it. */
function formsWith(fill: (provider: FormProvider) => ProviderForm): ProviderForms {
  return {
    google: fill("google"),
    openai: fill("openai"),
    anthropic: fill("anthropic"),
    "openai-compatible": fill("openai-compatible"),
  };
}

const EMPTY_FORM: ProviderForm = { baseUrl: "", model: "", apiKey: "" };

/** The forms before any config has filled them. */
export const EMPTY_FORMS: ProviderForms = formsWith(() => EMPTY_FORM);

/** A provider's vendor block with the string shorthand normalized to `{ id }`
 *  (the same normalization the catalog itself applies). */
function vendorBlockOf(entry: Provider): VendorBlock {
  return (typeof entry.vendor === "string" ? { id: entry.vendor } : entry.vendor) ?? {};
}

/** Which form a catalog provider belongs to, if any. The SDK is chosen by the
 *  vendor id (falling back to the provider id), so `{ id: "ollama", vendor:
 *  { id: "openai-compatible" } }` is the compatible form's. A provider behind
 *  a gateway has no form: its endpoint and key are the gateway's. */
function formOf(entry: Provider): FormProvider | undefined {
  if (entry.gateway) {
    return undefined;
  }
  const kind = vendorBlockOf(entry).id ?? entry.id;
  return FORM_PROVIDERS.find((provider) => provider === kind);
}

/** A role's target. The string shorthand splits at the first `:`, so model
 *  ids may contain colons (`ollama:gemma4:e4b`). */
function targetOf(ref: RoleRef | undefined): RoleTarget {
  if (typeof ref !== "string") {
    return ref ?? { provider: "", model: "" };
  }
  const colon = ref.indexOf(":");
  return { provider: ref.slice(0, colon), model: ref.slice(colon + 1) };
}

/** The provider a form reads from and writes to: the one the default role
 *  runs on when it is of that kind, else the first of that kind. */
function entryFor(config: Config, provider: FormProvider): Provider | undefined {
  const ofKind = config.providers.filter((entry) => formOf(entry) === provider);
  const running = targetOf(config.roles["default"]).provider;
  return ofKind.find((entry) => entry.id === running) ?? ofKind[0];
}

/** The forms as a config fills them, and the one the default role runs on —
 *  `undefined` when that provider has no form (another vendor, a gateway),
 *  which is the raw editor's to show. Each form takes its provider's
 *  role-referenced model first, else its first listed one. An `{ envVarName }`
 *  API key has no inline value to show, so its field stays empty. */
export function formsOf(config: Config): {
  selected: FormProvider | undefined;
  forms: ProviderForms;
} {
  const targets = Object.values(config.roles).map((ref) => targetOf(ref));
  const running = targetOf(config.roles["default"]);
  const runningEntry = config.providers.find((entry) => entry.id === running.provider);
  const formFor = (provider: FormProvider): ProviderForm => {
    const entry = entryFor(config, provider);
    if (!entry) {
      return EMPTY_FORM;
    }
    const vendor = vendorBlockOf(entry);
    const referenced = [running, ...targets].find((target) => target.provider === entry.id);
    return {
      baseUrl: vendor.baseURL ?? "",
      model: referenced?.model ?? entry.models[0]?.id ?? "",
      apiKey: typeof vendor.apiKey === "string" ? vendor.apiKey : "",
    };
  };
  return { selected: runningEntry && formOf(runningEntry), forms: formsWith(formFor) };
}

/** A config with one form written into it: that provider's model, key and
 *  base URL, and the default role pointed at them. Everything else the config
 *  holds — other providers, other roles, a model's cost and settings — stays
 *  as it is; with no config to write into, the form alone makes a complete
 *  one. The form names its model (a caller whose field may be left empty
 *  fills in its default first, so a key alone is a valid setup). The key
 *  stays inline: the file is local-only.
 *
 *  An empty key field removes an inline key and leaves an `{ envVarName }`
 *  one, which the field never showed. Models the provider already lists stay
 *  listed: a past run's cost is priced from them. */
export function withForm(
  config: Config | undefined,
  provider: FormProvider,
  form: ProviderForm,
): Config {
  const model = form.model.trim();
  const current = config && entryFor(config, provider);
  const vendor = { ...(current && vendorBlockOf(current)) };
  const apiKey = form.apiKey.trim();
  if (apiKey) {
    vendor.apiKey = apiKey;
  } else if (typeof vendor.apiKey === "string") {
    delete vendor.apiKey;
  }
  // Only the compatible form has the field; another provider's base URL is
  // the raw editor's to set, and not this form's to drop.
  if (provider === "openai-compatible") {
    const baseURL = form.baseUrl.trim();
    if (baseURL) {
      vendor.baseURL = baseURL;
    } else {
      delete vendor.baseURL;
    }
  }
  const models = current?.models ?? [];
  const entry: Provider = {
    ...current,
    id: current?.id ?? provider,
    vendor,
    models: models.some((listed) => listed.id === model) ? models : [...models, { id: model }],
  };
  // The block is left out entirely when there is nothing to override.
  if (Object.keys(vendor).length === 0) {
    delete entry.vendor;
  }
  const others = config?.providers ?? [];
  return {
    $schema: SCHEMA_URL,
    ...config,
    providers: current
      ? others.map((listed) => (listed === current ? entry : listed))
      : [...others, entry],
    roles: { ...config?.roles, default: `${entry.id}:${model}` },
  };
}

/** A config running on Gemini with one key: the config given, with that
 *  written into it, or a complete, valid-by-construction one when there is
 *  none — on the default model, unless a caller names another Gemini one. */
export function withGeminiKey(
  config: Config | undefined,
  apiKey: string,
  model = GEMINI_DEFAULT_MODEL,
): Config {
  return withForm(config, "google", { baseUrl: "", model, apiKey });
}

/** {@link withGeminiKey}'s fresh config as the file's text (the demo generator
 *  names the model: it replays a recording against the one it was made
 *  with). */
export function geminiQuickCatalog(apiKey: string, model?: string): string {
  return catalogJson(withGeminiKey(undefined, apiKey, model));
}

/** A config as the text the file holds. */
export function catalogJson(config: Config): string {
  return JSON.stringify(config, undefined, 2);
}
