// Caption lines burned into the demo videos, per locale and demo — one line
// per beat of the demo (the first demo's four: the mail as it is, the
// selection sweeping, the chord, the summary complete; scripts/demo-video.ts
// times them off the page beats and the session's own clock). `{chord}` is
// the visitor's key chord, so a captioned demo comes in two videos, the
// default with Ctrl + C + C and a `.mac` one with ⌘ + C + C, which
// DemoVideo.astro swaps in on a Mac; `{lang}` is the locale's own language
// name (日本語 on ja). A locale without an entry gets uncaptioned videos.
export const CAPTIONS: Record<string, Partial<Record<string, readonly string[]>> | undefined> = {
  en: {
    summarize: [
      "Say you've got an email.",
      "Select the text,",
      "press {chord},",
      "and there's your summary.",
    ],
  },
  ja: {
    summarize: [
      "英語のメールが届いたとします。",
      "画面の文字を選んで、",
      "{chord} を押すと",
      "{lang}の要約が表示されます。",
    ],
  },
};

/** Whether a demo's lines name the chord — and so come as two videos. */
export const namesChord = (lines: readonly string[]): boolean =>
  lines.some((line) => line.includes("{chord}"));
