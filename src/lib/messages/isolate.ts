/**
 * A stretch of text set apart from the direction of the sentence around it:
 * an id, a file name, a label, a version, a key chord. Dropped into a
 * right-to-left sentence as it is, such a value is reordered where it meets
 * the sentence's own characters — `zencopy-` shows as `-zencopy`,
 * `2024-report.pdf` as `report.pdf-2024`. Wrapped in a first-strong isolate
 * (U+2068 … U+2069), it is laid out by its own first letter and leaves the
 * sentence as it was. For the right-to-left locales' messages: the loader
 * wraps every argument a message is given (`isolating` in index.ts), and a
 * message wraps what it spells out itself — `.md`, a version with its `v`.
 */
export function isolate(text: string | number): string {
  return `\u2068${text}\u2069`;
}
