// What was typed into a number field, as plain ASCII — for every field that
// takes an amount or a count, whichever keyboard typed it.

/** The zeros of the scripts a keyboard of one of our locales may type digits
 *  in instead of ASCII's — Arabic-Indic, Persian, Thai, and the full-width
 *  digits of a Japanese or Chinese input method — as code points: a digit's
 *  value is its distance from its script's zero. */
const DIGIT_ZEROS = ["٠", "۰", "๐", "０"].map((zero) => zero.codePointAt(0) ?? 0);

/** Each digit of one of those scripts as its ASCII one; the rest as it is. */
function asciiDigits(raw: string): string {
  return raw.replaceAll(/\p{Nd}/gu, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((start) => code >= start && code <= start + 9);
    return zero === undefined ? digit : String(code - zero);
  });
}

/** A whole number as typed: its digits, and nothing else. */
export function integerText(raw: string): string {
  return asciiDigits(raw).replaceAll(/\D+/gu, "");
}

/** A decimal as typed: its digits, a decimal comma (or its Arabic and
 *  full-width kin) as the dot, and nothing else — with one dot at most, the
 *  first. So `0,50` is fifty cents, not fifty dollars. */
export function decimalText(raw: string): string {
  const plain = asciiDigits(raw)
    .replaceAll(/[,٫，．]/gu, ".")
    .replaceAll(/[^0-9.]/gu, "");
  const [whole = "", ...fraction] = plain.split(".");
  return fraction.length === 0 ? whole : `${whole}.${fraction.join("")}`;
}
