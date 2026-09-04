// The zero-friction setup: one free Gemini API key becomes a complete catalog
// (provider + model + default role). Shared by the first-run welcome screen
// and the AI settings, so both write byte-identical configs.

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
export const SCHEMA_URL = `https://cdn.jsdelivr.net/npm/ai-sdk-catalog@${catalogVersion}/schema.json`;

/** A complete, valid-by-construction catalog from one Gemini key — the
 *  default model, unless a caller names another Gemini one (the demo
 *  generator replays a recording against the model it was made with). */
export function geminiQuickCatalog(apiKey: string, model = GEMINI_DEFAULT_MODEL): string {
  return JSON.stringify(
    {
      $schema: SCHEMA_URL,
      providers: [{ id: "google", vendor: { apiKey: apiKey.trim() }, models: [{ id: model }] }],
      roles: { default: `google:${model}` },
    },
    undefined,
    2,
  );
}
