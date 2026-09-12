/** The site's default locale — what a render outside a Starlight route is
 *  in, and what a page falls back to for an asset its locale lacks. */
export const DEFAULT_LOCALE = "en";

/** The page's Starlight locale (the path segment, `zh-hans`) and language
 *  tag (`zh-CN`) — or the default for a render outside a Starlight route:
 *  starlight-llms-txt builds llms-full.txt that way, where `starlightRoute`
 *  does not exist, and packs the English docs anyway. */
export function pageLocale(locals: App.Locals): { locale: string; lang: string } {
  try {
    const { locale, lang } = locals.starlightRoute;
    return { locale: locale ?? DEFAULT_LOCALE, lang };
  } catch {
    return { locale: DEFAULT_LOCALE, lang: DEFAULT_LOCALE };
  }
}
