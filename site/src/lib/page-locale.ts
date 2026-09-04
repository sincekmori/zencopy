/** The page's Starlight locale (the path segment, `zh-hans`) and language
 *  tag (`zh-CN`) — or English for a render outside a Starlight route:
 *  starlight-llms-txt builds llms-full.txt that way, where `starlightRoute`
 *  does not exist, and packs the English docs anyway. */
export function pageLocale(locals: App.Locals): { locale: string; lang: string } {
  try {
    const { locale, lang } = locals.starlightRoute;
    return { locale: locale ?? "en", lang };
  } catch {
    return { locale: "en", lang: "en" };
  }
}
