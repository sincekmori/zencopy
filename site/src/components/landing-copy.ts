/** Landing-page copy for every locale the app supports.
 *  Docs terminology per locale lives in the translated content under
 *  src/content/docs/<code>/ — this file only carries the landing strings.
 *  The order of LANDING_LOCALES is the order of the language selector. */

export interface LandingCopy {
  description: string;
  docs: string;
  /** Two lines, separated by \n. */
  heroTitle: string;
  /** Document and OG title: brand + the hero sentence on one line. */
  metaTitle: string;
  note: string;
  demoAria: string;
  demoCaption: string;
  features: { title: string; body: string }[];
  philosophy: string;
  privacyLabel: string;
  termsLabel: string;
}

export interface LandingLocale {
  /** URL path segment and app locale code (e.g. "zh-hans"). */
  code: string;
  /** Autonym shown in the language selector. */
  label: string;
  /** BCP-47 tag for <html lang> / hreflang. */
  lang: string;
  dir: "ltr" | "rtl";
}

export const LANDING_LOCALES: LandingLocale[] = [
  { code: "ar", label: "العربية", lang: "ar", dir: "rtl" },
  { code: "de", label: "Deutsch", lang: "de", dir: "ltr" },
  { code: "en", label: "English", lang: "en", dir: "ltr" },
  { code: "es", label: "Español", lang: "es", dir: "ltr" },
  { code: "fa", label: "فارسی", lang: "fa", dir: "rtl" },
  { code: "fr", label: "Français", lang: "fr", dir: "ltr" },
  { code: "he", label: "עברית", lang: "he", dir: "rtl" },
  { code: "id", label: "Bahasa Indonesia", lang: "id", dir: "ltr" },
  { code: "it", label: "Italiano", lang: "it", dir: "ltr" },
  { code: "ja", label: "日本語", lang: "ja", dir: "ltr" },
  { code: "ko", label: "한국어", lang: "ko", dir: "ltr" },
  { code: "pl", label: "Polski", lang: "pl", dir: "ltr" },
  { code: "pt-br", label: "Português (Brasil)", lang: "pt-BR", dir: "ltr" },
  { code: "ru", label: "Русский", lang: "ru", dir: "ltr" },
  { code: "th", label: "ไทย", lang: "th", dir: "ltr" },
  { code: "tr", label: "Türkçe", lang: "tr", dir: "ltr" },
  { code: "vi", label: "Tiếng Việt", lang: "vi", dir: "ltr" },
  { code: "zh-hans", label: "简体中文", lang: "zh-CN", dir: "ltr" },
  { code: "zh-hant", label: "繁體中文", lang: "zh-TW", dir: "ltr" },
];

export const LANDING_COPY: Record<string, LandingCopy> = {
  ar: {
    description:
      "رسائل بريد بلغة أجنبية، محادثات طويلة، شاشات أخطاء مبهمة. حدد النص واضغط {mod} + C + C لتحصل على ذكاء اصطناعي فوري على شاشتك مباشرة. تلخيص، شرح، ترجمة، وتنقيح. مجاني تمامًا، وما تنسخه لا يصل إلا إلى الذكاء الاصطناعي الذي ربطته.",
    docs: "الوثائق",
    heroTitle: "ذكاء اصطناعي فوري.\nعلى شاشتك مباشرة.",
    metaTitle: "ZenCopy — ذكاء اصطناعي فوري. على شاشتك مباشرة.",
    note: "مجاني · مفتوح المصدر · Windows وmacOS وLinux",
    demoAria: "كيف يعمل",
    demoCaption:
      "حدد رسالة بريد إلكتروني بالإنجليزية واضغط {mod} + C + C. سيظهر ملخص باللغة العربية على الفور. هذا مجرد نموذج مما يمكن لـ ZenCopy فعله.",
    features: [
      {
        title: "شرح، ترجمة، تنقيح.",
        body: "شرح للمصطلحات، ترجمة للقطات الشاشة، صياغة منقحة لرسائل الدردشة والبريد. أي شيء يمكنك نسخه.",
      },
      {
        title: "كل ما عليك تعلّمه هو {mod} + C + C.",
        body: "اضبط الإعدادات مرة واحدة في البداية، ثم اضغط {mod} + C + C متى احتجت إليها. في المتصفح أو في Slack، على الشاشة نفسها التي تعمل عليها.",
      },
      {
        title: "مجاني تمامًا.",
        body: "تطبيق ZenCopy مجاني، والذكاء الاصطناعي مجاني أيضًا مع باقة Gemini المجانية. وإن كان لديك مفتاح API لـ GPT أو Claude، يمكنك التبديل إليه في أي وقت.",
      },
      {
        title: "لا يصل إلا إلى الذكاء الاصطناعي الخاص بك.",
        body: "ما تنسخه يُرسل مباشرةً إلى الذكاء الاصطناعي الذي ربطته. لا يملك ZenCopy خوادم خاصة به، ولأنه مفتوح المصدر، يمكن لأي شخص التحقق من ذلك.",
      },
    ],
    philosophy: "أفضل أداة هي التي تنسى وجودها.",
    privacyLabel: "الخصوصية",
    termsLabel: "الشروط",
  },
  de: {
    description:
      "E-Mails in fremden Sprachen, lange Threads, kryptische Fehlermeldungen. Markieren, {mod} + C + C drücken – und schon ist KI da, direkt auf dem Bildschirm. Zusammenfassungen, Erklärungen, Übersetzungen, Feinschliff. Komplett kostenlos, und das Kopierte erreicht nur die verbundene KI.",
    docs: "Doku",
    heroTitle: "Sofort KI.\nDirekt auf dem Bildschirm.",
    metaTitle: "ZenCopy — Sofort KI. Direkt auf dem Bildschirm.",
    note: "Kostenlos · Open Source · Windows, macOS & Linux",
    demoAria: "So funktioniert es",
    demoCaption:
      "Eine englische E-Mail auswählen und {mod} + C + C drücken. Sofort erscheint eine deutsche Zusammenfassung. Nur eine der Möglichkeiten mit ZenCopy.",
    features: [
      {
        title: "Erklären. Übersetzen. Überarbeiten.",
        body: "Ein Fachbegriff erklärt, ein Screenshot übersetzt, ein Chat oder eine E-Mail überarbeitet. Alles, was sich kopieren lässt.",
      },
      {
        title: "Mehr als {mod} + C + C gibt es nicht zu lernen.",
        body: "Einmal einrichten, danach einfach {mod} + C + C drücken, wann immer nötig. Im Browser oder in Slack, direkt auf dem aktuellen Bildschirm.",
      },
      {
        title: "Komplett kostenlos.",
        body: "ZenCopy ist kostenlos und die KI auch: mit der Gratis-Stufe von Gemini. Wer einen API-Key für GPT oder Claude hat, kann jederzeit wechseln.",
      },
      {
        title: "Erreicht nur Ihre KI.",
        body: "Was Sie kopieren, geht direkt an die verbundene KI. ZenCopy betreibt keine eigenen Server und ist Open Source – der Code liegt für jeden offen.",
      },
    ],
    philosophy: "Das beste Werkzeug ist das, von dem du vergisst, dass es da ist.",
    privacyLabel: "Datenschutz",
    termsLabel: "Nutzungsbedingungen",
  },
  en: {
    description:
      "Emails in another language, long threads, cryptic error screens. Select, press {mod} + C + C, and there it is: instant AI, right on your screen. Summaries, explanations, translations, polished drafts. Completely free, and what you copy reaches only the AI you connected.",
    docs: "Docs",
    heroTitle: "Instant AI.\nRight on your screen.",
    metaTitle: "ZenCopy — Instant AI. Right on your screen.",
    note: "Free · Open source · Windows, macOS & Linux",
    demoAria: "how it works",
    demoCaption:
      "Select an email and press {mod} + C + C. A summary appears right away. Just one of the things ZenCopy can do.",
    features: [
      {
        title: "Explain. Translate. Polish.",
        body: "A term explained, a screenshot translated, a chat message or an email polished. Anything you can copy.",
      },
      {
        title: "All you learn is {mod} + C + C.",
        body: "Set it up once. From then on, press {mod} + C + C whenever you need it. In your browser or in Slack, right on the screen you're on.",
      },
      {
        title: "Completely free.",
        body: "ZenCopy is free, and so is the AI: Gemini's free tier. Have an API key for GPT or Claude? Switch to it anytime.",
      },
      {
        title: "Only your AI gets it.",
        body: "What you copy goes straight to the AI you connected. ZenCopy has no server of its own, and it is open source, so anyone can check.",
      },
    ],
    philosophy: "The best tool is the one you forget is there.",
    privacyLabel: "Privacy",
    termsLabel: "Terms",
  },
  es: {
    description:
      "Correos en otros idiomas, hilos interminables, crípticas pantallas de error. Selecciona, pulsa {mod} + C + C y listo: IA al instante, directo en tu pantalla. Resúmenes, explicaciones, traducciones y textos pulidos. Totalmente gratis, y lo que copias solo llega a la IA que conectaste.",
    docs: "Documentación",
    heroTitle: "IA al instante.\nDirecto en tu pantalla.",
    metaTitle: "ZenCopy — IA al instante. Directo en tu pantalla.",
    note: "Gratis · Código abierto · Windows, macOS y Linux",
    demoAria: "cómo funciona",
    demoCaption:
      "Selecciona un correo en inglés y pulsa {mod} + C + C. Aparece al instante un resumen en español. Es solo una de las cosas que ZenCopy puede hacer.",
    features: [
      {
        title: "Explicar. Traducir. Pulir.",
        body: "Un término explicado, una captura traducida, un mensaje de chat o un correo pulido. Todo lo que puedas copiar.",
      },
      {
        title: "Solo tienes que aprender {mod} + C + C.",
        body: "Configúralo una sola vez. A partir de ahí, pulsa {mod} + C + C cuando lo necesites. En el navegador o en Slack, justo en la pantalla en la que estás.",
      },
      {
        title: "Completamente gratis.",
        body: "ZenCopy es gratis y la IA también, con el plan gratuito de Gemini. ¿Tienes una clave de API para GPT o Claude? Cambia a ella cuando quieras.",
      },
      {
        title: "Solo llega a tu IA.",
        body: "Lo que copias va directo a la IA que hayas conectado. ZenCopy no tiene servidores propios y es de código abierto, así que cualquiera puede comprobarlo.",
      },
    ],
    philosophy: "La mejor herramienta es la que olvidas que está ahí.",
    privacyLabel: "Privacidad",
    termsLabel: "Términos",
  },
  fa: {
    description:
      "ایمیل‌هایی به زبان دیگر، گفتگوهای طولانی، پیام‌های خطای مبهم. متن را انتخاب کنید، {mod} + C + C را بزنید و تمام: هوش مصنوعی فوری، درست روی صفحه شما. خلاصه‌سازی، توضیح، ترجمه و ویرایش. کاملاً رایگان، و آنچه کپی می‌کنید فقط به هوش مصنوعی متصل‌شده می‌رسد.",
    docs: "مستندات",
    heroTitle: "هوش مصنوعی فوری.\nدرست روی صفحه شما.",
    metaTitle: "ZenCopy — هوش مصنوعی فوری. درست روی صفحه شما.",
    note: "رایگان · متن‌باز · Windows، macOS و Linux",
    demoAria: "طرز کار",
    demoCaption:
      "یک ایمیل انگلیسی را انتخاب کنید و {mod} + C + C را فشار دهید. بلافاصله خلاصه‌ای به فارسی ظاهر می‌شود. این فقط یکی از کارهایی است که ZenCopy انجام می‌دهد.",
    features: [
      {
        title: "توضیح، ترجمه، ویرایش.",
        body: "توضیح یک اصطلاح، ترجمه اسکرین‌شات، ویرایش پیام چت یا ایمیل. هر چیزی که بتوان کپی کرد.",
      },
      {
        title: "تنها چیزی که باید یاد بگیرید: {mod} + C + C.",
        body: "تنظیمات فقط یک‌بار انجام می‌شود. پس از آن، هر زمان نیاز داشتید {mod} + C + C را بزنید. در مرورگر یا در Slack، درست روی همان صفحه‌ای که هستید.",
      },
      {
        title: "کاملاً رایگان.",
        body: "ZenCopy رایگان است و هوش مصنوعی هم همین‌طور، با طرح رایگان Gemini. اگر کلید API برای GPT یا Claude دارید، هر زمان بخواهید می‌توانید به آن جابه‌جا شوید.",
      },
      {
        title: "فقط به هوش مصنوعی شما می‌رسد.",
        body: "آنچه کپی می‌کنید مستقیماً به هوش مصنوعی متصل‌شده ارسال می‌شود. ZenCopy هیچ سروری از خود ندارد و متن‌باز است، بنابراین هر کسی می‌تواند آن را بررسی کند.",
      },
    ],
    philosophy: "بهترین ابزار آن است که فراموش کنید وجود دارد.",
    privacyLabel: "حریم خصوصی",
    termsLabel: "شرایط",
  },
  fr: {
    description:
      "E-mails en langue étrangère, longs fils de discussion, messages d'erreur obscurs. Sélectionnez, appuyez sur {mod} + C + C et l'IA apparaît instantanément sur votre écran. Résumés, explications, traductions, textes peaufinés. Entièrement gratuit, et ce que vous copiez n'est transmis qu'à votre IA.",
    docs: "Documentation",
    heroTitle: "L'IA instantanée.\nDirectement sur votre écran.",
    metaTitle: "ZenCopy — L'IA instantanée. Directement sur votre écran.",
    note: "Gratuit · Open source · Windows, macOS & Linux",
    demoAria: "comment ça marche",
    demoCaption:
      "Sélectionnez un e-mail en anglais et appuyez sur {mod} + C + C. Un résumé en français s'affiche immédiatement. Ce n'est qu'un aperçu de ce que peut faire ZenCopy.",
    features: [
      {
        title: "Expliquer. Traduire. Peaufiner.",
        body: "Un terme expliqué, une capture d'écran traduite, un message ou un e-mail peaufiné. Tout ce qui se copie.",
      },
      {
        title: "Il suffit de retenir {mod} + C + C.",
        body: "Une configuration unique. Ensuite, appuyez sur {mod} + C + C dès que vous en avez besoin. Dans votre navigateur ou dans Slack, directement sur l'écran où vous travaillez.",
      },
      {
        title: "Totalement gratuit.",
        body: "ZenCopy est gratuit, et l'IA aussi grâce à l'offre gratuite de Gemini. Vous avez une clé API pour GPT ou Claude ? Basculez dessus à tout moment.",
      },
      {
        title: "Seule votre IA le reçoit.",
        body: "Ce que vous copiez est envoyé directement à l'IA connectée. ZenCopy ne dispose d'aucun serveur et le projet est open source : tout le monde peut vérifier.",
      },
    ],
    philosophy: "Le meilleur outil est celui dont on oublie la présence.",
    privacyLabel: "Confidentialité",
    termsLabel: "Conditions",
  },
  he: {
    description:
      "מיילים בשפה זרה, שרשורים ארוכים, מסכי שגיאה מסתוריים. מסמנים, לוחצים על {mod} + C + C, והנה זה: AI מיידי, ישר על המסך שלך. סיכומים, הסברים, תרגומים וטיוטות מלוטשות. חינם לחלוטין, ומה שמועתק מגיע אך ורק ל-AI שחיברתם.",
    docs: "תיעוד",
    heroTitle: "‏AI מיידי.\nישירות על המסך שלך.",
    metaTitle: "ZenCopy — ‏AI מיידי. ישירות על המסך שלך.",
    note: "חינם · קוד פתוח · Windows‏, macOS ו‑Linux",
    demoAria: "איך זה עובד",
    demoCaption:
      "בוחרים מייל באנגלית ולוחצים על {mod} + C + C. סיכום בעברית מופיע מיד. זו רק אחת מהיכולות של ZenCopy.",
    features: [
      {
        title: "הסבר. תרגום. ליטוש.",
        body: "הסבר למונח מקצועי, תרגום צילום מסך, ניסוח מלוטש להודעה או למייל. כל מה שאפשר להעתיק.",
      },
      {
        title: "כל מה שצריך לזכור זה {mod} + C + C.",
        body: "מגדירים פעם אחת בלבד. מעכשיו, לוחצים על {mod} + C + C בכל פעם שצריך. בדפדפן או ב-Slack, ישר על המסך שבו אתם נמצאים.",
      },
      {
        title: "חינם לחלוטין.",
        body: "תוכנת ZenCopy חינמית לגמרי, וכך גם ה-AI: השכבה החינמית של Gemini. יש לכם מפתח API עבור GPT או Claude? אפשר לעבור אליו בכל רגע.",
      },
      {
        title: "מגיע רק ל-AI שלך.",
        body: "מה שאתם מעתיקים נשלח ישירות ל-AI שחיברתם. ל-ZenCopy אין שרתים משלה, ומכיוון שמדובר בקוד פתוח, כל אחד יכול לוודא זאת.",
      },
    ],
    philosophy: "הכלי הטוב ביותר הוא זה ששוכחים שהוא בכלל שם.",
    privacyLabel: "פרטיות",
    termsLabel: "תנאים",
  },
  id: {
    description:
      "Email berbahasa asing, utas panjang, layar eror yang membingungkan. Pilih, tekan {mod} + C + C, dan AI seketika hadir langsung di layar Anda. Ringkasan, penjelasan, terjemahan, draf rapi. Sepenuhnya gratis, dan apa yang disalin hanya sampai ke AI yang Anda hubungkan.",
    docs: "Dokumentasi",
    heroTitle: "AI seketika.\nLangsung di layar Anda.",
    metaTitle: "ZenCopy — AI seketika. Langsung di layar Anda.",
    note: "Gratis · Sumber terbuka · Windows, macOS & Linux",
    demoAria: "cara kerjanya",
    demoCaption:
      "Pilih email berbahasa Inggris lalu tekan {mod} + C + C. Ringkasan dalam bahasa Indonesia langsung muncul seketika. Ini baru satu dari sekian banyak kemampuan ZenCopy.",
    features: [
      {
        title: "Jelaskan. Terjemahkan. Rapikan.",
        body: "Penjelasan istilah, terjemahan tangkapan layar, atau polesan untuk pesan obrolan dan email. Apa pun yang bisa disalin.",
      },
      {
        title: "Cukup ingat {mod} + C + C.",
        body: "Atur sekali di awal. Setelah itu, tekan {mod} + C + C kapan pun dibutuhkan. Di peramban atau di Slack, langsung di layar tempat Anda bekerja.",
      },
      {
        title: "Sepenuhnya gratis.",
        body: "ZenCopy gratis, begitu juga AI-nya berkat paket gratis Gemini. Punya kunci API untuk GPT atau Claude? Anda bisa beralih kapan saja.",
      },
      {
        title: "Hanya diterima oleh AI Anda.",
        body: "Teks yang disalin langsung dikirim ke AI yang Anda hubungkan. ZenCopy tidak memiliki server sendiri, dan sifatnya sumber terbuka sehingga siapa pun bisa memeriksanya.",
      },
    ],
    philosophy: "Alat terbaik adalah alat yang membuatmu lupa bahwa ia ada.",
    privacyLabel: "Privasi",
    termsLabel: "Ketentuan",
  },
  it: {
    description:
      "Email in lingue straniere, thread infiniti, schermate di errore incomprensibili. Seleziona, premi {mod} + C + C ed ecco un'IA all'istante, direttamente sul tuo schermo. Riassunti, spiegazioni, traduzioni e testi rifiniti. Completamente gratis, e ciò che copi raggiunge solo l'IA che hai collegato.",
    docs: "Documentazione",
    heroTitle: "IA all'istante.\nDirettamente sul tuo schermo.",
    metaTitle: "ZenCopy — IA all'istante. Direttamente sul tuo schermo.",
    note: "Gratuito · Open source · Windows, macOS e Linux",
    demoAria: "come funziona",
    demoCaption:
      "Seleziona un'email in inglese e premi {mod} + C + C. Un riassunto in italiano compare all'istante. È solo una delle cose che ZenCopy sa fare.",
    features: [
      {
        title: "Spiega. Traduci. Rifinisci.",
        body: "Un termine spiegato, uno screenshot tradotto, un messaggio o un'email rifinita. Tutto ciò che puoi copiare.",
      },
      {
        title: "Tutto ciò che serve è {mod} + C + C.",
        body: "Configuralo una volta sola. Poi premi {mod} + C + C ogni volta che ti serve. Nel browser o su Slack, direttamente sullo schermo su cui ti trovi.",
      },
      {
        title: "Completamente gratuito.",
        body: "ZenCopy è gratis, e lo è anche l'IA grazie al piano free di Gemini. Hai una chiave API per GPT o Claude? Puoi passare a loro in qualsiasi momento.",
      },
      {
        title: "Arriva solo alla tua IA.",
        body: "Ciò che copi va dritto all'IA che hai collegato. ZenCopy non ha server propri ed è open source, quindi chiunque può verificarlo.",
      },
    ],
    philosophy: "Lo strumento migliore è quello di cui dimentichi l'esistenza.",
    privacyLabel: "Privacy",
    termsLabel: "Termini",
  },
  ja: {
    description:
      "外国語のメールも、長いスレッドも、謎のエラー画面も。選んで {mod} + C + C、今いる画面にすぐ AI。要約、解説、翻訳、清書。完全に無料で、コピーした内容はあなたがつないだ AI にしか届きません。",
    docs: "ドキュメント",
    heroTitle: "今いる画面に、\nすぐ AI。",
    metaTitle: "ZenCopy — 今いる画面に、すぐ AI。",
    note: "無料 · オープンソース · Windows, macOS & Linux",
    demoAria: "しくみ",
    demoCaption:
      "英語のメールを選んで {mod} + C + C。すぐに日本語の要約が表示されます。ZenCopy でできることの、ひとつです。",
    features: [
      {
        title: "解説も、翻訳も、清書も。",
        body: "専門用語の解説、スクリーンショットの翻訳、チャットやメールの清書。コピーできるものなら、何でも。",
      },
      {
        title: "覚えるのは {mod} + C + C だけ。",
        body: "設定は最初に一度。あとは使いたいときに {mod} + C + C するだけ。ブラウザでも Slack でも、今いる画面でそのまま使えます。",
      },
      {
        title: "完全に無料。",
        body: "ZenCopy は無料。AI は無料の Gemini が使えます。GPT や Claude の API キーがあれば、そちらにも切り替えられます。",
      },
      {
        title: "届くのは、あなたの AI だけ。",
        body: "コピーした内容は、あなたがつないだ AI へ直接送られます。ZenCopy 側にサーバーはありません。オープンソースなので、中身は誰でも確かめられます。",
      },
    ],
    philosophy: "最良の道具は、そこにあることを忘れさせる。",
    privacyLabel: "プライバシー",
    termsLabel: "利用条件",
  },
  ko: {
    description:
      "외국어 이메일, 긴 스레드, 난해한 오류 화면도. 선택하고 {mod} + C + C, 지금 있는 화면에 바로 AI. 요약, 설명, 번역, 다듬기까지. 완전히 무료이며, 복사한 내용은 연결한 AI에만 전달됩니다.",
    docs: "문서",
    heroTitle: "지금 있는 화면에,\n바로 AI.",
    metaTitle: "ZenCopy — 지금 있는 화면에, 바로 AI.",
    note: "무료 · 오픈 소스 · Windows, macOS & Linux",
    demoAria: "작동 방식",
    demoCaption:
      "영어 이메일을 선택하고 {mod} + C + C. 곧바로 한국어 요약이 나타납니다. ZenCopy로 할 수 있는 일 중 하나입니다.",
    features: [
      {
        title: "설명도, 번역도, 다듬기도.",
        body: "전문 용어 설명, 스크린샷 번역, 메신저나 이메일 다듬기까지. 복사할 수 있는 것이라면 무엇이든.",
      },
      {
        title: "기억할 것은 {mod} + C + C뿐.",
        body: "설정은 처음에 한 번. 필요할 때마다 {mod} + C + C만 누르면 됩니다. 브라우저든 Slack이든, 지금 보고 있는 화면에서 그대로 쓸 수 있습니다.",
      },
      {
        title: "완전 무료.",
        body: "ZenCopy는 무료입니다. AI 역시 Gemini 무료 플랜으로 이용할 수 있습니다. GPT나 Claude의 API 키가 있다면 언제든 전환할 수 있습니다.",
      },
      {
        title: "전달되는 곳은 오직 연결한 AI뿐.",
        body: "복사한 내용은 연결한 AI로 직접 전송됩니다. ZenCopy에는 자체 서버가 없습니다. 오픈 소스이므로 누구나 안을 들여다보고 확인할 수 있습니다.",
      },
    ],
    philosophy: "가장 좋은 도구는 있다는 것조차 잊게 되는 도구입니다.",
    privacyLabel: "개인정보",
    termsLabel: "약관",
  },
  pl: {
    description:
      "Maile w obcym języku, tasiemcowe wątki, tajemnicze błędy na ekranie. Zaznacz, wciśnij {mod} + C + C i gotowe: błyskawiczne AI bezpośrednio na Twoim ekranie. Podsumowania, wyjaśnienia, tłumaczenia, dopracowane teksty. Całkowicie za darmo, a kopiowana treść trafia wyłącznie do połączonego AI.",
    docs: "Dokumentacja",
    heroTitle: "Błyskawiczne AI.\nProsto na Twoim ekranie.",
    metaTitle: "ZenCopy — Błyskawiczne AI. Prosto na Twoim ekranie.",
    note: "Za darmo · Open source · Windows, macOS i Linux",
    demoAria: "jak to działa",
    demoCaption:
      "Zaznacz angielskiego maila i wciśnij {mod} + C + C. Od razu pojawi się podsumowanie po polsku. To tylko jedna z możliwości ZenCopy.",
    features: [
      {
        title: "Wyjaśnij. Przetłumacz. Dopracuj.",
        body: "Wyjaśniony termin, przetłumaczony zrzut ekranu, dopracowana wiadomość lub e-mail. Wszystko, co możesz skopiować.",
      },
      {
        title: "Wystarczy zapamiętać {mod} + C + C.",
        body: "Konfigurujesz raz. Potem wciskasz {mod} + C + C za każdym razem, gdy tego potrzebujesz. W przeglądarce czy na Slacku, bezpośrednio na aktywnym ekranie.",
      },
      {
        title: "Całkowicie za darmo.",
        body: "ZenCopy nic nie kosztuje, podobnie jak AI dzięki bezpłatnemu pakietowi Gemini. Masz klucz API do GPT lub Claude? Możesz się na nie przełączyć w dowolnej chwili.",
      },
      {
        title: "Trafia wyłącznie do Twojego AI.",
        body: "To, co kopiujesz, trafia prosto do podłączonego AI. ZenCopy nie ma własnych serwerów i jest oprogramowaniem open source, więc każdy może to sprawdzić.",
      },
    ],
    philosophy: "Najlepsze narzędzie to takie, o którego istnieniu zapominasz.",
    privacyLabel: "Prywatność",
    termsLabel: "Warunki",
  },
  "pt-br": {
    description:
      "E-mails em outro idioma, conversas longas, telas de erro indecifráveis. Selecione, pressione {mod} + C + C e pronto: IA na hora, direto na sua tela. Resumos, explicações, traduções e textos aprimorados. Totalmente gratuito, e o conteúdo copiado vai apenas para a IA que você conectou.",
    docs: "Documentação",
    heroTitle: "IA na hora.\nDireto na sua tela.",
    metaTitle: "ZenCopy — IA na hora. Direto na sua tela.",
    note: "Gratuito · Código aberto · Windows, macOS e Linux",
    demoAria: "como funciona",
    demoCaption:
      "Selecione um e-mail em inglês e pressione {mod} + C + C. Um resumo em português aparece na hora. Essa é apenas uma das coisas que o ZenCopy pode fazer.",
    features: [
      {
        title: "Explicar. Traduzir. Aprimorar.",
        body: "Um termo explicado, uma captura de tela traduzida, uma mensagem ou um e-mail aprimorado. Tudo o que puder ser copiado.",
      },
      {
        title: "Tudo o que você precisa aprender é {mod} + C + C.",
        body: "Configure uma única vez. A partir daí, pressione {mod} + C + C sempre que precisar. No navegador ou no Slack, direto na tela em que você estiver.",
      },
      {
        title: "Totalmente gratuito.",
        body: "O ZenCopy é gratuito, e a IA também: com o plano grátis do Gemini. Tem uma chave de API do GPT ou Claude? Troque quando quiser.",
      },
      {
        title: "Só a sua IA recebe.",
        body: "O que você copia vai direto para a IA conectada. O ZenCopy não tem servidores próprios e é de código aberto, então qualquer pessoa pode conferir.",
      },
    ],
    philosophy: "A melhor ferramenta é aquela que você esquece que está ali.",
    privacyLabel: "Privacidade",
    termsLabel: "Termos",
  },
  ru: {
    description:
      "Письма на иностранном языке, длинные переписки, непонятные экраны с ошибками. Выделите текст, нажмите {mod} + C + C — и мгновенный ИИ прямо на вашем экране. Краткие выжимки, объяснения, переводы и отредактированные тексты. Полностью бесплатно, а скопированное попадает только в подключённый вами ИИ.",
    docs: "Документация",
    heroTitle: "Мгновенный ИИ.\nПрямо на вашем экране.",
    metaTitle: "ZenCopy — Мгновенный ИИ. Прямо на вашем экране.",
    note: "Бесплатно · Открытый исходный код · Windows, macOS и Linux",
    demoAria: "как это работает",
    demoCaption:
      "Выделите письмо на английском и нажмите {mod} + C + C. Краткий пересказ на русском языке появится моментально. Это лишь одна из возможностей ZenCopy.",
    features: [
      {
        title: "Объяснение. Перевод. Редактура.",
        body: "Объяснить незнакомый термин, перевести скриншот, отредактировать сообщение или письмо. Всё, что можно скопировать.",
      },
      {
        title: "Всё, что нужно запомнить, — {mod} + C + C.",
        body: "Настройте один раз. Дальше просто нажимайте {mod} + C + C при необходимости. В браузере или в Slack — прямо на том экране, где вы находитесь.",
      },
      {
        title: "Полностью бесплатно.",
        body: "ZenCopy бесплатен, и ИИ тоже — на бесплатном тарифе Gemini. Есть API-ключ от GPT или Claude? Переключитесь на них в любой момент.",
      },
      {
        title: "Получает только ваш ИИ.",
        body: "Скопированное отправляется напрямую в подключённый вами ИИ. У ZenCopy нет собственных серверов, а открытый исходный код позволяет любому в этом убедиться.",
      },
    ],
    philosophy: "Лучший инструмент — тот, о существовании которого вы забываете.",
    privacyLabel: "Конфиденциальность",
    termsLabel: "Условия",
  },
  th: {
    description:
      "อีเมลภาษาต่างประเทศ เธรดยาวเหยียด หน้าจอแจ้งเตือนข้อผิดพลาดที่เข้าใจยาก เพียงเลือกแล้วกด {mod} + C + C ก็เรียกใช้ AI ทันใจได้บนหน้าจอของคุณ สรุปความ อธิบาย แปล ขัดเกลาเนื้อหา ใช้งานได้ฟรีทั้งหมด และสิ่งที่คัดลอกจะส่งตรงไปยัง AI ที่คุณเชื่อมต่อไว้เท่านั้น",
    docs: "เอกสาร",
    heroTitle: "AI ทันใจ\nบนหน้าจอที่คุณใช้งาน",
    metaTitle: "ZenCopy — AI ทันใจ บนหน้าจอที่คุณใช้งาน",
    note: "ฟรี · โอเพ่นซอร์ส · Windows, macOS และ Linux",
    demoAria: "วิธีการทำงาน",
    demoCaption:
      "เลือกอีเมลภาษาอังกฤษแล้วกด {mod} + C + C สรุปภาษาไทยจะแสดงขึ้นมาทันที นี่เป็นเพียงหนึ่งในสิ่งมากมายที่ ZenCopy ทำได้",
    features: [
      {
        title: "อธิบาย แปล ขัดเกลา",
        body: "อธิบายคำศัพท์เฉพาะทาง แปลภาพถ่ายหน้าจอ หรือขัดเกลาข้อความแช็ตและอีเมล อะไรก็ตามที่คุณคัดลอกได้",
      },
      {
        title: "จำแค่ {mod} + C + C ก็พอ",
        body: "ตั้งค่าเพียงครั้งเดียว จากนั้นกด {mod} + C + C เมื่อใดก็ตามที่ต้องการ ไม่ว่าจะอยู่ในเบราว์เซอร์หรือ Slack ก็ใช้งานบนหน้าจอเดิมได้ทันที",
      },
      {
        title: "ใช้งานได้ฟรีโดยสมบูรณ์",
        body: "ZenCopy ใช้งานได้ฟรี เช่นเดียวกับ AI ผ่านแพ็กเกจฟรีของ Gemini หากมีคีย์ API ของ GPT หรือ Claude ก็สลับไปใช้งานได้ตลอดเวลา",
      },
      {
        title: "ส่งตรงถึง AI ของคุณเท่านั้น",
        body: "สิ่งที่คุณคัดลอกจะถูกส่งตรงไปยัง AI ที่คุณเชื่อมต่อไว้ ZenCopy ไม่มีเซิร์ฟเวอร์ของตัวเอง และเป็นโอเพนซอร์สที่ใครก็สามารถตรวจสอบได้",
      },
    ],
    philosophy: "เครื่องมือที่ดีที่สุด คือเครื่องมือที่คุณลืมไปเลยว่ามันอยู่ตรงนั้น",
    privacyLabel: "ความเป็นส่วนตัว",
    termsLabel: "ข้อกำหนด",
  },
  tr: {
    description:
      "Yabancı dilde e-postalar, uzayıp giden yazışmalar, karmaşık hata ekranları. Seçin, {mod} + C + C tuşlarına basın; doğrudan ekranınızda anlık AI hazır. Özetler, açıklamalar, çeviriler, düzenlenmiş metinler. Tamamen ücretsizdir ve kopyaladığınız içerik sadece bağladığınız AI servisine ulaşır.",
    docs: "Belgeler",
    heroTitle: "Anlık AI.\nDoğrudan ekranınızda.",
    metaTitle: "ZenCopy — Anlık AI. Doğrudan ekranınızda.",
    note: "Ücretsiz · Açık kaynak · Windows, macOS ve Linux",
    demoAria: "nasıl çalışır",
    demoCaption:
      "İngilizce bir e-postayı seçin ve {mod} + C + C tuşlarına basın. Türkçe özet anında ekrana gelir. Bu, ZenCopy ile yapabileceklerinizden sadece biri.",
    features: [
      {
        title: "Açıkla. Çevir. İyileştir.",
        body: "Bir terimin açıklaması, ekran görüntüsünün çevirisi, mesaj veya e-postanın iyileştirilmiş hali. Kopyalayabildiğiniz her şey.",
      },
      {
        title: "Öğrenmeniz gereken tek şey: {mod} + C + C.",
        body: "Bir kez ayarlayın. Sonrasında ne zaman gerekirse {mod} + C + C tuşlarına basın. Tarayıcıda veya Slack'te, doğrudan çalıştığınız ekranda.",
      },
      {
        title: "Tamamen ücretsiz.",
        body: "ZenCopy ücretsizdir; Gemini'ın ücretsiz planı sayesinde AI da öyle. GPT veya Claude API anahtarınız mı var? Dilediğiniz an geçiş yapabilirsiniz.",
      },
      {
        title: "Yalnızca bağladığınız AI görür.",
        body: "Kopyaladığınız içerik doğrudan bağladığınız AI servisine iletilir. ZenCopy'nin kendi sunucusu yoktur ve açık kaynaklıdır; dileyen herkes inceleyebilir.",
      },
    ],
    philosophy: "En iyi araç, orada olduğunu unuttuğun araçtır.",
    privacyLabel: "Gizlilik",
    termsLabel: "Koşullar",
  },
  vi: {
    description:
      "Email tiếng nước ngoài, luồng trao đổi dài, thông báo lỗi khó hiểu. Chọn nội dung, nhấn {mod} + C + C và AI tức thời xuất hiện ngay trên màn hình của bạn. Tóm tắt, giải thích, dịch thuật, trau chuốt câu từ. Hoàn toàn miễn phí, và nội dung sao chép chỉ gửi tới AI bạn đã kết nối.",
    docs: "Tài liệu",
    heroTitle: "AI tức thời.\nNgay trên màn hình của bạn.",
    metaTitle: "ZenCopy — AI tức thời. Ngay trên màn hình của bạn.",
    note: "Miễn phí · Mã nguồn mở · Windows, macOS & Linux",
    demoAria: "cách hoạt động",
    demoCaption:
      "Chọn một email tiếng Anh rồi nhấn {mod} + C + C. Bản tóm tắt bằng tiếng Việt sẽ xuất hiện ngay lập tức. Đây chỉ là một trong những điều ZenCopy có thể làm.",
    features: [
      {
        title: "Giải thích. Dịch. Trau chuốt.",
        body: "Giải thích thuật ngữ, dịch ảnh chụp màn hình, trau chuốt tin nhắn hay email. Bất cứ thứ gì bạn có thể sao chép.",
      },
      {
        title: "Chỉ cần nhớ {mod} + C + C.",
        body: "Thiết lập một lần duy nhất. Từ đó về sau, chỉ cần nhấn {mod} + C + C mỗi khi cần. Trong trình duyệt hay trên Slack, ngay trên màn hình bạn đang xem.",
      },
      {
        title: "Hoàn toàn miễn phí.",
        body: "ZenCopy hoàn toàn miễn phí, và AI cũng vậy với gói miễn phí của Gemini. Bạn có khóa API của GPT hoặc Claude? Có thể chuyển đổi bất cứ lúc nào.",
      },
      {
        title: "Chỉ AI của bạn nhận được.",
        body: "Nội dung bạn sao chép được gửi thẳng tới AI bạn đã kết nối. ZenCopy không có máy chủ riêng và là mã nguồn mở, ai cũng có thể kiểm tra.",
      },
    ],
    philosophy: "Công cụ tốt nhất là công cụ bạn quên mất rằng nó đang ở đó.",
    privacyLabel: "Quyền riêng tư",
    termsLabel: "Điều khoản",
  },
  "zh-hans": {
    description:
      "外语邮件、冗长讨论串、晦涩的报错界面。划选内容，按下 {mod} + C + C，当前屏幕，AI 立现。总结、解释、翻译、润色。完全免费，复制的内容仅直达你连接的 AI。",
    docs: "文档",
    heroTitle: "当前屏幕，\nAI 立现。",
    metaTitle: "ZenCopy — 当前屏幕，AI 立现。",
    note: "免费 · 开源 · Windows、macOS 和 Linux",
    demoAria: "运作方式",
    demoCaption:
      "划选一封英文邮件并按下 {mod} + C + C，中文总结即刻呈现。这只是 ZenCopy 的本领之一。",
    features: [
      {
        title: "解释、翻译、润色。",
        body: "解释生僻术语，翻译屏幕截图，润色聊天消息或邮件。凡能复制，皆可处理。",
      },
      {
        title: "只需记住 {mod} + C + C。",
        body: "一次配置，随处可用。需要时轻按 {mod} + C + C，无论在浏览器还是 Slack 中，直接在当前屏幕即刻响应。",
      },
      {
        title: "完全免费。",
        body: "ZenCopy 完全免费，搭配 Gemini 免费额度，AI 同样零成本。手头有 GPT 或 Claude 的 API 密钥？随时随心切换。",
      },
      {
        title: "数据只直达你的 AI。",
        body: "复制的内容直接发送给你连接的 AI。ZenCopy 没有自己的服务器，且完全开源，任何人皆可查验。",
      },
    ],
    philosophy: "最好的工具，是让你忘了它存在的那一个。",
    privacyLabel: "隐私",
    termsLabel: "条款",
  },
  "zh-hant": {
    description:
      "外語信件、冗長討論串、晦澀的錯誤畫面。選取內容，按下 {mod} + C + C，當前螢幕，AI 立現。摘要、解說、翻譯、潤飾。完全免費，複製的內容僅直達您串接的 AI。",
    docs: "文件",
    heroTitle: "當前螢幕，\nAI 立現。",
    metaTitle: "ZenCopy — 當前螢幕，AI 立現。",
    note: "免費 · 開源 · Windows、macOS 與 Linux",
    demoAria: "運作方式",
    demoCaption:
      "選取一封英文信件並按下 {mod} + C + C，中文摘要隨即呈現。這只是 ZenCopy 能做到的其中一件事。",
    features: [
      {
        title: "解說、翻譯、潤飾。",
        body: "專業術語解說、螢幕截圖翻譯、聊天訊息或信件潤飾。凡能複製，皆可處理。",
      },
      {
        title: "只需記住 {mod} + C + C。",
        body: "設定只需一次。之後每當需要，按一下 {mod} + C + C 即可。無論在瀏覽器或 Slack，直接在當前螢幕使用。",
      },
      {
        title: "完全免費。",
        body: "ZenCopy 完全免費，搭配 Gemini 的免費方案，AI 同樣零負擔。若有 GPT 或 Claude 的 API 金鑰，亦可隨時切換。",
      },
      {
        title: "資料只直達您的 AI。",
        body: "複製的內容直接傳送至您串接的 AI。ZenCopy 沒有自己的伺服器，且程式碼完全開源，任何人皆可檢驗。",
      },
    ],
    philosophy: "最好的工具，是讓你忘了它存在的那一個。",
    privacyLabel: "隱私權",
    termsLabel: "條款",
  },
};

/** Theme-select labels, reused verbatim from the app's settings
 *  (optionSystem / optionLight / optionDark) so the landing, the docs, and
 *  the app all name the three theme choices identically. */
export interface ThemeLabels {
  system: string;
  light: string;
  dark: string;
}

export const THEME_LABELS: Record<string, ThemeLabels> = {
  ar: { system: "النظام", light: "فاتح", dark: "داكن" },
  de: { system: "System", light: "Hell", dark: "Dunkel" },
  en: { system: "System", light: "Light", dark: "Dark" },
  es: { system: "Sistema", light: "Claro", dark: "Oscuro" },
  fa: { system: "سیستم", light: "روشن", dark: "تیره" },
  fr: { system: "Système", light: "Clair", dark: "Sombre" },
  he: { system: "מערכת", light: "בהיר", dark: "כהה" },
  id: { system: "Sistem", light: "Terang", dark: "Gelap" },
  it: { system: "Sistema", light: "Chiaro", dark: "Scuro" },
  ja: { system: "システム", light: "ライト", dark: "ダーク" },
  ko: { system: "시스템", light: "라이트", dark: "다크" },
  pl: { system: "Systemowy", light: "Jasny", dark: "Ciemny" },
  "pt-br": { system: "Sistema", light: "Claro", dark: "Escuro" },
  ru: { system: "Системная", light: "Светлая", dark: "Тёмная" },
  th: { system: "ตามระบบ", light: "สว่าง", dark: "มืด" },
  tr: { system: "Sistem", light: "Açık", dark: "Koyu" },
  vi: { system: "Hệ thống", light: "Sáng", dark: "Tối" },
  "zh-hans": { system: "跟随系统", light: "浅色", dark: "深色" },
  "zh-hant": { system: "跟隨系統", light: "淺色", dark: "深色" },
};
