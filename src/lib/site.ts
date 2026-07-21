/** Absolute URL of a page on zencopy.app in the given UI language.
 *
 *  The site carries every app locale under /<code>/ (the bare root only
 *  auto-redirects by browser language); anything unknown falls back to
 *  English. Keep the set in sync with the site's LANDING_LOCALES
 *  (site/src/components/landing-copy.ts). */
const SITE_LOCALES = new Set([
  "en",
  "ja",
  "zh-hans",
  "zh-hant",
  "ko",
  "es",
  "pt-br",
  "fr",
  "de",
  "it",
  "pl",
  "ru",
  "id",
  "vi",
  "th",
  "tr",
  "ar",
  "fa",
  "he",
]);

export function siteUrl(locale: string, path = ""): string {
  const lang = SITE_LOCALES.has(locale) ? locale : "en";
  return `https://zencopy.app/${lang}/${path}`;
}
