// Zero-dependency, fully type-safe i18n. One file per locale, all annotated
// `: Messages` (see types.ts), so the compiler forces every language to
// provide every key. Adding a language = one new file + entries below.

import { ar } from "./ar.ts";
import { de } from "./de.ts";
import { en } from "./en.ts";
import { es } from "./es.ts";
import { fa } from "./fa.ts";
import { fr } from "./fr.ts";
import { he } from "./he.ts";
import { id } from "./id.ts";
import { it } from "./it.ts";
import { ja } from "./ja.ts";
import { ko } from "./ko.ts";
import { pl } from "./pl.ts";
import { ptBR } from "./pt-br.ts";
import { ru } from "./ru.ts";
import { th } from "./th.ts";
import { tr } from "./tr.ts";
import { vi } from "./vi.ts";
import { zhHans } from "./zh-hans.ts";
import { zhHant } from "./zh-hant.ts";

export type { Messages } from "./types.ts";

export const messages = {
  ar,
  de,
  en,
  es,
  fa,
  fr,
  he,
  id,
  it,
  ja,
  ko,
  pl,
  "pt-BR": ptBR,
  ru,
  th,
  tr,
  vi,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
};

/** A supported locale code (the keys of `messages`). */
export type Locale = keyof typeof messages;

export const DEFAULT_LOCALE: Locale = "en";

/** Locales offered in the settings picker, labelled with their own autonym. */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fa", label: "فارسی" },
  { value: "fr", label: "Français" },
  { value: "he", label: "עברית" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "pl", label: "Polski" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ru", label: "Русский" },
  { value: "th", label: "ไทย" },
  { value: "tr", label: "Türkçe" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "zh-Hant", label: "繁體中文" },
];

const RTL_LOCALES = new Set<Locale>(["ar", "fa", "he"]);

/** The text direction a locale renders in — feed it to `<html dir>`. */
export function localeDir(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/** Best-matching supported locale for the OS/browser, else the default. */
export function detectLocale(): Locale {
  const lang = navigator.language.toLowerCase();
  // Chinese needs the script, not just the language: Traditional for
  // Taiwan / Hong Kong / Macau (or an explicit Hant), Simplified otherwise.
  if (lang.startsWith("zh")) {
    return /hant|tw|hk|mo/u.test(lang) ? "zh-Hant" : "zh-Hans";
  }
  // Any Portuguese lands on the (Brazilian) translation we ship.
  if (lang.startsWith("pt")) {
    return "pt-BR";
  }
  const codes = Object.keys(messages) as Locale[];
  return codes.find((code) => lang.startsWith(code.toLowerCase())) ?? DEFAULT_LOCALE;
}
