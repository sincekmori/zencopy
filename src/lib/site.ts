import type { Locale } from "@/lib/messages/index.ts";

/** Absolute URL of a page on zencopy.app in the given UI language.
 *
 *  The site carries every app locale under /<code>/, the code in lower case
 *  (`pt-br`, `zh-hans`); the bare root only auto-redirects by browser
 *  language. */
export function siteUrl(locale: Locale, path = ""): string {
  return `https://zencopy.app/${locale.toLowerCase()}/${path}`;
}
