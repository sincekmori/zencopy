// Which language a text is written in — for the translate prompt's
// direction, through the `language_of` filter. Pure string work, free of
// Tauri imports, so a bun script can exercise it on real copies.
//
// Two things made the plain trigram guess wrong on real copies. A copy
// carries more than its prose — a page's share buttons and links at the top,
// a technical article's code blocks — and franc judges whichever script has
// the most letters in the first 2048 characters, so a Japanese article read
// as English behind its link addresses and as Spanish behind its code. So the
// sample is the prose alone, and a script that belongs to one language
// settles the question before franc's statistics do.
import { franc } from "franc-min";

/** How much of a text franc reads to name its language (its MAX_LENGTH).
 *  The cleaned sample is cut to it, so every rule below judges the same
 *  stretch of prose. */
const SAMPLE = 2048;

/** franc names a language more narrowly than the UI's tags do. */
const FRANC_TAGS: Record<string, string> = {
  cmn: "zh", // Mandarin
  arb: "ar", // Standard Arabic
};

/** The prose of a Markdown copy: fenced and inline code, a link's or an
 *  image's address (its text stays), bare addresses and leftover tags are
 *  set aside — none of them is written in the language of the text. */
function prose(text: string): string {
  return text
    .replaceAll(/```[\s\S]*?(?:```|$)/gu, " ")
    .replaceAll(/`[^`\n]*`/gu, " ")
    .replaceAll(/\]\([^)]*\)/gu, "]")
    .replaceAll(/https?:\/\/\S+/gu, " ")
    .replaceAll(/<[^>\n]+>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * The BCP 47 tag of the language `text` is written in, or "" when nothing
 * can be told (no letters, or statistics that match nothing).
 *
 * A script that is written for one language names it when most of the
 * sample's letters are in it — the vote franc also takes, over the prose
 * alone: kana with the Han they come with is Japanese, Han without kana is
 * Chinese, Hangul Korean, Thai Thai, Hebrew Hebrew (a script franc-min does
 * not know). Japanese prose keeps kana above half of its kana and Han (news
 * and technical articles measured at 0.6–0.7), while a Chinese text quotes a
 * Japanese title at most, so kana must be a quarter of the two. Every other
 * script goes to franc, whose trigrams tell the Latin, Cyrillic and
 * Arabic-script languages apart.
 */
export function languageOf(text: string): string {
  const sample = prose(text).slice(0, SAMPLE);
  const count = (script: RegExp): number => sample.match(script)?.length ?? 0;
  const letters = count(/\p{L}/gu);
  if (letters === 0) {
    return "";
  }
  const most = (n: number): boolean => n * 2 > letters;
  const kana = count(/\p{Script=Hiragana}|\p{Script=Katakana}/gu);
  const han = count(/\p{Script=Han}/gu);
  if (most(kana + han) && kana * 4 >= kana + han) {
    return "ja";
  }
  if (most(han)) {
    return "zh";
  }
  if (most(count(/\p{Script=Hangul}/gu))) {
    return "ko";
  }
  if (most(count(/\p{Script=Thai}/gu))) {
    return "th";
  }
  if (most(count(/\p{Script=Hebrew}/gu))) {
    return "he";
  }
  const code = franc(sample);
  if (code === "und") {
    return "";
  }
  return FRANC_TAGS[code] ?? code;
}
