/**
 * The locale a BCP 47 tag asks for, out of the ones on offer — `undefined`
 * when none of them is that language. The language subtag decides, whole: a
 * tag that merely starts like one of ours (`kok` for `ko`, `arn` for `ar`) is
 * another language. Codes are matched whatever their case and come back as
 * `codes` spells them.
 *
 * One definition for the app's language detection (messages/index.ts) and
 * the site's negotiation of "/" (site/worker.ts); `locale_from_tag` in
 * src-tauri/src/tray.rs mirrors it — keep them in step.
 */
export function matchLocaleTag<Code extends string>(
  tag: string,
  codes: readonly Code[],
): Code | undefined {
  const [language = "", ...rest] = tag.toLowerCase().split(/[-_]/u);
  const offered = (wanted: string): Code | undefined =>
    codes.find((code) => code.toLowerCase() === wanted);
  // Chinese needs the script, not just the language: the one the tag names,
  // else Traditional for Taiwan / Hong Kong / Macau and Simplified everywhere
  // else.
  if (language === "zh") {
    const traditional =
      !rest.includes("hans") && rest.some((subtag) => ["hant", "tw", "hk", "mo"].includes(subtag));
    return offered(traditional ? "zh-hant" : "zh-hans");
  }
  // Any Portuguese lands on the (Brazilian) translation we ship.
  if (language === "pt") {
    return offered("pt-br");
  }
  return offered(language);
}
