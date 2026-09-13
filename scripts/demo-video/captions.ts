// Caption lines burned into the demo videos, per locale and demo — one line
// per beat of the demo (the first demo's four: the mail as it is, the
// selection sweeping, the chord, the summary complete; scripts/demo-video.ts
// times them off the page beats and the session's own clock). `{chord}` is
// the visitor's key chord, so a captioned demo comes in two videos, the
// default with Ctrl + C + C and a `.mac` one with ⌘ + C + C, which
// DemoVideo.astro swaps in on a Mac; `{lang}` is the locale's own language
// name as Intl.DisplayNames gives it (日本語 on ja, Deutsch on de) — where
// that name does not fit the sentence as it comes (case, inflection, a
// region in brackets), the line writes the name out instead. A locale
// without an entry gets uncaptioned videos.
export const CAPTIONS: Record<string, Partial<Record<string, readonly string[]>> | undefined> = {
  ar: {
    summarize: [
      "وصلك بريد إلكتروني بالإنجليزية.",
      "حدد النص،",
      "واضغط {chord}،",
      "وسيظهر لك التلخيص بـ {lang}.",
    ],
  },
  de: {
    summarize: [
      "Du bekommst eine englische E-Mail.",
      "Markiere den Text,",
      "drücke {chord},",
      "und da ist deine Zusammenfassung auf {lang}.",
    ],
  },
  en: {
    summarize: [
      "Say you've got an email.",
      "Select the text,",
      "press {chord},",
      "and there's your summary.",
    ],
  },
  es: {
    summarize: [
      "Te llega un correo en inglés.",
      "Selecciona el texto,",
      "presiona {chord},",
      "y aparece tu resumen en español.",
    ],
  },
  fa: {
    summarize: [
      "فرض کنید یک ایمیل انگلیسی آمده.",
      "متن را انتخاب کنید،",
      "{chord} را فشار دهید،",
      "و خلاصه به زبان {lang} ظاهر می‌شود.",
    ],
  },
  fr: {
    summarize: [
      "Tu reçois un e-mail en anglais.",
      "Sélectionne le texte,",
      "appuie sur {chord},",
      "et voilà ton résumé en {lang}.",
    ],
  },
  he: {
    summarize: [
      "נניח שקיבלת אימייל באנגלית.",
      "סמן את הטקסט,",
      "לחץ על {chord},",
      "ומופיע סיכום ב-{lang}.",
    ],
  },
  id: {
    summarize: [
      "Dapat email dalam bahasa Inggris.",
      "Pilih teksnya,",
      "tekan {chord},",
      "dan ringkasan dalam bahasa {lang} muncul.",
    ],
  },
  it: {
    summarize: [
      "Ti arriva un'email in inglese.",
      "Seleziona il testo,",
      "premi {chord},",
      "ed ecco il tuo riassunto in italiano.",
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
  ko: {
    summarize: [
      "영어 이메일이 왔을 때,",
      "텍스트를 선택하고",
      "{chord}를 누르면",
      "{lang}로 요약이 나타납니다.",
    ],
  },
  pl: {
    summarize: [
      "Dostajesz maila po angielsku.",
      "Zaznacz tekst,",
      "naciśnij {chord},",
      "i masz streszczenie po polsku.",
    ],
  },
  "pt-br": {
    summarize: [
      "Você recebe um e-mail em inglês.",
      "Selecione o texto,",
      "pressione {chord},",
      "e o resumo em português aparece.",
    ],
  },
  ru: {
    summarize: [
      "Пришло письмо на английском.",
      "Выдели текст,",
      "нажми {chord},",
      "и появится пересказ на русском.",
    ],
  },
  th: {
    summarize: [
      "สมมุติว่าได้รับอีเมลภาษาอังกฤษ",
      "เลือกข้อความบนหน้าจอ",
      "กด {chord}",
      "สรุปเป็นภาษา{lang}ก็จะแสดงขึ้นมา",
    ],
  },
  tr: {
    summarize: [
      "İngilizce bir e-posta geldi diyelim.",
      "Metni seç,",
      "{chord} tuşlarına bas,",
      "ve {lang} dilinde özet karşında.",
    ],
  },
  vi: {
    summarize: [
      "Bạn nhận được email tiếng Anh.",
      "Chọn đoạn văn bản,",
      "nhấn {chord},",
      "và bản tóm tắt bằng {lang} hiện ra.",
    ],
  },
  "zh-hans": {
    summarize: ["比如收到一封英文邮件，", "选中文本，", "按下 {chord}，", "就会显示{lang}总结。"],
  },
  "zh-hant": {
    summarize: ["比如收到一封英文郵件，", "選取文字，", "按下 {chord}，", "就會顯示{lang}摘要。"],
  },
};

/** Whether a demo's lines name the chord — and so come as two videos. */
export const namesChord = (lines: readonly string[]): boolean =>
  lines.some((line) => line.includes("{chord}"));
