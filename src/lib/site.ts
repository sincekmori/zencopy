/** Absolute URL of a page on zencopy.app in the given UI language.
 *
 *  The site carries every app locale under /<code>/ (the bare root only
 *  auto-redirects by browser language); anything unknown falls back to
 *  English. Keep the set in sync with the site's LANDING_LOCALES
 *  (site/src/components/landing-copy.ts). */
const SITE_LOCALES = new Set([
  "ar",
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "he",
  "id",
  "it",
  "ja",
  "ko",
  "pl",
  "pt-br",
  "ru",
  "th",
  "tr",
  "vi",
  "zh-hans",
  "zh-hant",
]);

export function siteUrl(locale: string, path = ""): string {
  const lang = SITE_LOCALES.has(locale) ? locale : "en";
  return `https://zencopy.app/${lang}/${path}`;
}
