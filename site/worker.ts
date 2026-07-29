// The zencopy.app Worker: static assets, plus server-side language
// negotiation for the bare domain. "/" used to be a client-side redirect
// page carrying `noindex` — a contentless page in the index is noise, but a
// long-lived noindex root also degrades how search engines treat links to
// the bare domain. Since the site runs on a Worker, the server CAN read
// Accept-Language: "/" answers with a 302 to the best-matching locale
// (mirroring the app's locale_from_tag in src-tauri/src/tray.rs), and the
// noindex page is gone. Every other path is served from the built assets,
// including Starlight's 404 page (`not_found_handling` in wrangler.jsonc).
import { LANDING_LOCALES } from "./src/components/landing-copy.ts";

// Every locale INCLUDING en: the old client-side picker excluded en from the
// candidates, so a visitor preferring English with a supported second
// language was sent to the second language. Here English wins when it wins.
const CODES = LANDING_LOCALES.map((entry) => entry.code);

/** The locale path segment for one language tag, or undefined. */
function pick(raw: string): string | undefined {
  const tag = raw.toLowerCase();
  if (tag.startsWith("zh")) {
    return ["hant", "tw", "hk", "mo"].some((hint) => tag.includes(hint)) ? "zh-hant" : "zh-hans";
  }
  if (tag.startsWith("pt")) {
    return "pt-br";
  }
  return CODES.find((code) => tag.startsWith(code));
}

/** Accept-Language tags in preference order (RFC 9110 q-values). */
function preferredTags(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    .toSorted((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/** The redirect target for a request to "/": first matching locale, else the
 *  x-default (/en/, which carries a visible language selector). */
export function localePathFor(acceptLanguage: string): string {
  for (const tag of preferredTags(acceptLanguage)) {
    const code = pick(tag);
    if (code !== undefined) {
      return `/${code}/`;
    }
  }
  return "/en/";
}

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const worker = {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(undefined, {
        status: 302,
        headers: {
          location: localePathFor(request.headers.get("accept-language") ?? ""),
          // The answer depends on the header, and must never be pinned to one
          // visitor's language by a cache along the way.
          vary: "accept-language",
          "cache-control": "no-store",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};

export default worker;
