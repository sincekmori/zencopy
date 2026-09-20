/** The mail the guide's reader tries first and the first demo copies: one
 *  in a language they do not read — English, and for English readers
 *  Japanese — so every locale's demo shows a foreign mail coming back as a
 *  summary in the reader's own language. Each mail is a file beside this one
 *  (source.en.txt, source.ja.txt): blank lines separate its paragraphs, and
 *  the lines of a paragraph are one sentence each. The mail in the video and
 *  the mail on the guide's page (site/src/components/SampleEmail.astro) are
 *  one file — this module says which one a locale reads and how its text is
 *  shown; the generator reads the file from disk and the site imports it. */
export const MAILS = {
  en: { subject: "Updated proposal and review date", from: "Partner team", between: " " },
  ja: { subject: "提案書の更新とレビュー日程について", from: "Partner team", between: "" },
} as const;
/** A language a mail is written in — its file's suffix. */
export type MailLang = keyof typeof MAILS;

/** The mail a locale's reader gets, by the app's code or the site's
 *  lowercase one: the English mail, or the Japanese one for English. */
export function mailLangFor(locale: string): MailLang {
  return locale.toLowerCase() === "en" ? "ja" : "en";
}

/** A mail's paragraphs as a page shows them: each one's lines joined the way
 *  the language joins sentences (a space, or nothing). */
export function paragraphsOf(body: string, lang: MailLang): string[] {
  return body
    .trim()
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.split("\n").join(MAILS[lang].between));
}
