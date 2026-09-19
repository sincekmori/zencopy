// Caption lines burned into the demo videos, per locale and demo — one line
// per beat of the demo (the first demo's four: the mail as it is, the
// selection sweeping, the chord, the summary complete; scripts/demo-video.ts
// times them off the page beats and the session's own clock). The chord is
// shown, not spelled: its line writes `{keys}` where the keys go, kept
// verbatim, with the locale's own words around it ("{keys} を押すと"), and
// the generator draws the hero animation's keycaps there, in the line — the
// modifier pressed and held, C tapped twice, released as the popup lands
// (src/assets/hero-demo.css, a video frame at a time). The modifier the
// keycap reads is the visitor's, which is why a demo with the keys comes in
// three cuts: the default reading Ctrl/⌘ (for a visitor whose OS the page
// cannot tell), `.ctrl` reading Ctrl and `.cmd` reading ⌘, which
// DemoVideo.astro swaps in by OS. `{lang}`, `{lang:in}` and `{lang:into}`
// are the viewer's language in the form the sentence needs (日本語 / 日本語で
// / 日本語に), from src/lib/language-forms.ts — so a literal 日本語 in a line
// would mean Japanese. A locale without an entry gets uncaptioned videos.

/** Where the keys go in the chord's line: drawn there — never words. */
export const KEYS = "{keys}";

/** The four beats' lines of a page-stage demo: the mail as it is, the
 *  selection sweeping and settling, the chord (its line writes the keys), the
 *  summary complete — held to that shape by the compiler, for every locale. */
export type PageCaptions = readonly [
  still: string,
  select: string,
  chord: `${string}${typeof KEYS}${string}`,
  done: string,
];

export const CAPTIONS: Record<string, Partial<Record<string, PageCaptions>> | undefined> = {
  ar: {
    summarize: [
      "لديك بريد إلكتروني بالإنجليزية.",
      "حدد النص،",
      "واضغط {keys}،",
      "وسيظهر لك التلخيص {lang:in}.",
    ],
  },
  de: {
    summarize: [
      "Du hast eine englische E-Mail.",
      "Markiere den Text,",
      "drücke {keys},",
      "und da ist deine Zusammenfassung {lang:in}.",
    ],
  },
  en: {
    summarize: [
      "Say you have an email.",
      "Select the text,",
      "press {keys},",
      "and there's your summary.",
    ],
  },
  es: {
    summarize: [
      "Tienes un correo en inglés.",
      "Selecciona el texto,",
      "presiona {keys},",
      "y aparece tu resumen {lang:in}.",
    ],
  },
  fa: {
    summarize: [
      "فرض کنید یک ایمیل انگلیسی دارید.",
      "متن را انتخاب کنید،",
      "{keys} را فشار دهید،",
      "و خلاصه {lang:in} ظاهر می‌شود.",
    ],
  },
  fr: {
    summarize: [
      "Tu as un e-mail en anglais.",
      "Sélectionne le texte,",
      "appuie sur {keys},",
      "et voilà ton résumé {lang:in}.",
    ],
  },
  he: {
    summarize: [
      "נניח שיש לך אימייל באנגלית.",
      "סמן את הטקסט,",
      "לחץ על {keys},",
      "ומופיע סיכום {lang:in}.",
    ],
  },
  id: {
    summarize: [
      "Ada email dalam bahasa Inggris.",
      "Pilih teksnya,",
      "tekan {keys},",
      "dan ringkasan {lang:in} muncul.",
    ],
  },
  it: {
    summarize: [
      "Hai un'email in inglese.",
      "Seleziona il testo,",
      "premi {keys},",
      "ed ecco il tuo riassunto {lang:in}.",
    ],
  },
  ja: {
    summarize: [
      "英語のメールがあるとします。",
      "画面の文字を選んで、",
      "{keys} を押すと",
      "{lang}の要約が表示されます。",
    ],
  },
  ko: {
    summarize: [
      "영어 이메일이 있을 때,",
      "텍스트를 선택하고",
      "{keys}를 누르면",
      "{lang:in} 요약이 나타납니다.",
    ],
  },
  pl: {
    summarize: [
      "Masz maila po angielsku.",
      "Zaznacz tekst,",
      "naciśnij {keys},",
      "i masz streszczenie {lang:in}.",
    ],
  },
  "pt-br": {
    summarize: [
      "Você tem um e-mail em inglês.",
      "Selecione o texto,",
      "pressione {keys},",
      "e o resumo {lang:in} aparece.",
    ],
  },
  ru: {
    summarize: [
      "У тебя письмо на английском.",
      "Выдели текст,",
      "нажми {keys},",
      "и появится пересказ {lang:in}.",
    ],
  },
  th: {
    summarize: [
      "สมมุติว่ามีอีเมลภาษาอังกฤษ",
      "เลือกข้อความบนหน้าจอ",
      "กด {keys}",
      "สรุป{lang:in}ก็จะแสดงขึ้นมา",
    ],
  },
  tr: {
    summarize: [
      "İngilizce bir e-posta var diyelim.",
      "Metni seç,",
      "{keys} tuşlarına bas,",
      "ve {lang} özet karşında.",
    ],
  },
  vi: {
    summarize: [
      "Bạn có một email tiếng Anh.",
      "Chọn đoạn văn bản,",
      "nhấn {keys},",
      "và bản tóm tắt {lang:in} hiện ra.",
    ],
  },
  "zh-hans": {
    summarize: ["比如有一封英文邮件，", "选中文本，", "按下 {keys}，", "就会显示{lang}总结。"],
  },
  "zh-hant": {
    summarize: ["比如有一封英文郵件，", "選取文字，", "按下 {keys}，", "就會顯示{lang}摘要。"],
  },
};
