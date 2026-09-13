import type { Locale } from "./messages/index.ts";

/**
 * The reader's own language, in the forms a sentence needs — so text that
 * means "the language this page is in" can be written once (the ja docs are
 * the source the others are translated from) and stay a variable, while a
 * literal 日本語 stays the literal language. Intl.DisplayNames gives one
 * standalone form only (Español, Русский, Português (Brasil)), which does
 * not fit mid-sentence in a third of our locales; these forms do. Every
 * locale must define all three — the compiler holds it to that.
 *
 * Read by the docs' PageLanguage component (`form` attribute) and by the
 * demo-video generator for the captions' `{lang}`, `{lang:in}` and
 * `{lang:into}`.
 */
export interface LanguageForms {
  /** The name as a plain noun mid-sentence: 日本語, Deutsch, español. */
  name: string;
  /** "in <language>" — the answer comes back in it: 日本語で, auf Deutsch, на русском. */
  in: string;
  /** "into <language>" — translate the text into it: 日本語に, ins Deutsche, на русский. */
  into: string;
}

const LANGUAGE_FORMS: Record<Locale, LanguageForms> = {
  ar: { name: "العربية", in: "بالعربية", into: "إلى العربية" },
  de: { name: "Deutsch", in: "auf Deutsch", into: "ins Deutsche" },
  en: { name: "English", in: "in English", into: "into English" },
  es: { name: "español", in: "en español", into: "al español" },
  fa: { name: "فارسی", in: "به فارسی", into: "به فارسی" },
  fr: { name: "français", in: "en français", into: "en français" },
  he: { name: "עברית", in: "בעברית", into: "לעברית" },
  id: { name: "bahasa Indonesia", in: "dalam bahasa Indonesia", into: "ke bahasa Indonesia" },
  it: { name: "italiano", in: "in italiano", into: "in italiano" },
  ja: { name: "日本語", in: "日本語で", into: "日本語に" },
  ko: { name: "한국어", in: "한국어로", into: "한국어로" },
  pl: { name: "polski", in: "po polsku", into: "na polski" },
  "pt-BR": { name: "português", in: "em português", into: "para o português" },
  ru: { name: "русский", in: "на русском", into: "на русский" },
  th: { name: "ภาษาไทย", in: "เป็นภาษาไทย", into: "เป็นภาษาไทย" },
  tr: { name: "Türkçe", in: "Türkçe", into: "Türkçeye" },
  vi: { name: "tiếng Việt", in: "bằng tiếng Việt", into: "sang tiếng Việt" },
  "zh-Hans": { name: "中文", in: "用中文", into: "成中文" },
  "zh-Hant": { name: "中文", in: "用中文", into: "成中文" },
};

/** The forms for a locale code in any case (`zh-hans` as the site spells it). */
export function languageForms(locale: string): LanguageForms | undefined {
  const key = (Object.keys(LANGUAGE_FORMS) as Locale[]).find(
    (code) => code.toLowerCase() === locale.toLowerCase(),
  );
  return key === undefined ? undefined : LANGUAGE_FORMS[key];
}

/** Fill `{lang}`, `{lang:in}` and `{lang:into}` in a line. */
export function fillLanguage(line: string, forms: LanguageForms): string {
  return line
    .replaceAll("{lang:into}", forms.into)
    .replaceAll("{lang:in}", forms.in)
    .replaceAll("{lang}", forms.name);
}
