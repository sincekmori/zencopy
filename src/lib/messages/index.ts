// Zero-dependency, fully type-safe i18n. One file per locale, all annotated
// `: Messages` (see types.ts), so the compiler forces every language to
// provide every key. Adding a language = one new file + entries below.
//
// A window carries English and the one language it speaks: the others are
// loaded on demand (loadMessages), so three long-lived webviews do not each
// hold nineteen catalogs they never show. What is built ahead of time (the
// site's figures and labels) loads the ones it needs the same way.

import { matchLocaleTag } from "../locale-tag.ts";
import { en } from "./en.ts";
import { isolate } from "./isolate.ts";
import type { Messages } from "./types.ts";

export type { Messages } from "./types.ts";

/** Locales offered in the settings picker, labelled with their own autonym. */
export const LOCALES = [
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
] as const;

/** A supported locale code. */
export type Locale = (typeof LOCALES)[number]["value"];

export const DEFAULT_LOCALE: Locale = "en";

/** The default locale's catalog — what a window shows until its own language
 *  has loaded. */
export const DEFAULT_MESSAGES: Messages = en;

/** Each locale's catalog, fetched when first asked for (a chunk of its own).
 *  The compiler holds this to one loader per locale. */
const LOADERS: Record<Locale, () => Promise<Messages>> = {
  ar: async () => {
    const { ar } = await import("./ar.ts");
    return ar;
  },
  de: async () => {
    const { de } = await import("./de.ts");
    return de;
  },
  en: () => Promise.resolve(en),
  es: async () => {
    const { es } = await import("./es.ts");
    return es;
  },
  fa: async () => {
    const { fa } = await import("./fa.ts");
    return fa;
  },
  fr: async () => {
    const { fr } = await import("./fr.ts");
    return fr;
  },
  he: async () => {
    const { he } = await import("./he.ts");
    return he;
  },
  id: async () => {
    const { id } = await import("./id.ts");
    return id;
  },
  it: async () => {
    const { it } = await import("./it.ts");
    return it;
  },
  ja: async () => {
    const { ja } = await import("./ja.ts");
    return ja;
  },
  ko: async () => {
    const { ko } = await import("./ko.ts");
    return ko;
  },
  pl: async () => {
    const { pl } = await import("./pl.ts");
    return pl;
  },
  "pt-BR": async () => {
    const { ptBR } = await import("./pt-br.ts");
    return ptBR;
  },
  ru: async () => {
    const { ru } = await import("./ru.ts");
    return ru;
  },
  th: async () => {
    const { th } = await import("./th.ts");
    return th;
  },
  tr: async () => {
    const { tr } = await import("./tr.ts");
    return tr;
  },
  vi: async () => {
    const { vi } = await import("./vi.ts");
    return vi;
  },
  "zh-Hans": async () => {
    const { zhHans } = await import("./zh-hans.ts");
    return zhHans;
  },
  "zh-Hant": async () => {
    const { zhHant } = await import("./zh-hant.ts");
    return zhHant;
  },
};

const RTL_LOCALES = new Set<Locale>(["ar", "fa", "he"]);

/** A catalog whose messages set every argument apart from the sentence it is
 *  put into (see {@link isolate}): each function of it gets its text
 *  arguments wrapped before it runs. For the right-to-left languages, whose
 *  sentences an id, a file name or a key chord would otherwise be reordered
 *  in — done here once, so no message has to remember to. A left-to-right
 *  sentence lays those values out as they are, and is given none of the
 *  invisible characters to carry. */
function isolating<Part>(part: Part): Part {
  if (typeof part === "function") {
    const say = part as (...args: unknown[]) => string;
    const apart = (...args: unknown[]): string =>
      say(...args.map((arg) => (typeof arg === "string" ? isolate(arg) : arg)));
    return apart as Part;
  }
  if (Array.isArray(part)) {
    return part.map((item: unknown) => isolating(item)) as Part;
  }
  if (typeof part === "object" && part !== null) {
    const entries = Object.entries(part).map(([key, value]) => [key, isolating(value)]);
    return Object.fromEntries(entries) as Part;
  }
  return part;
}

/** The message catalog of a locale. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const messages = await LOADERS[locale]();
  return RTL_LOCALES.has(locale) ? isolating(messages) : messages;
}

/** The locale a code names, in any case (`zh-hans` as the site's paths spell
 *  it) — undefined for a code that is not one. */
export function localeOf(code: string): Locale | undefined {
  return LOCALES.find(({ value }) => value.toLowerCase() === code.toLowerCase())?.value;
}

/** The text direction a locale renders in — feed it to `<html dir>`. */
export function localeDir(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/** Best-matching supported locale for the OS/browser, else the default. */
export function detectLocale(): Locale {
  const codes = LOCALES.map(({ value }) => value);
  return matchLocaleTag(navigator.language, codes) ?? DEFAULT_LOCALE;
}
