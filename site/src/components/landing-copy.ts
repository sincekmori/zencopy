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
  { code: "en", label: "English", lang: "en", dir: "ltr" },
  { code: "ja", label: "日本語", lang: "ja", dir: "ltr" },
  { code: "zh-hans", label: "简体中文", lang: "zh-CN", dir: "ltr" },
  { code: "zh-hant", label: "繁體中文", lang: "zh-TW", dir: "ltr" },
  { code: "ko", label: "한국어", lang: "ko", dir: "ltr" },
  { code: "es", label: "Español", lang: "es", dir: "ltr" },
  { code: "pt-br", label: "Português (Brasil)", lang: "pt-BR", dir: "ltr" },
  { code: "fr", label: "Français", lang: "fr", dir: "ltr" },
  { code: "de", label: "Deutsch", lang: "de", dir: "ltr" },
  { code: "it", label: "Italiano", lang: "it", dir: "ltr" },
  { code: "pl", label: "Polski", lang: "pl", dir: "ltr" },
  { code: "ru", label: "Русский", lang: "ru", dir: "ltr" },
  { code: "id", label: "Bahasa Indonesia", lang: "id", dir: "ltr" },
  { code: "vi", label: "Tiếng Việt", lang: "vi", dir: "ltr" },
  { code: "th", label: "ไทย", lang: "th", dir: "ltr" },
  { code: "tr", label: "Türkçe", lang: "tr", dir: "ltr" },
  { code: "ar", label: "العربية", lang: "ar", dir: "rtl" },
  { code: "fa", label: "فارسی", lang: "fa", dir: "rtl" },
  { code: "he", label: "עברית", lang: "he", dir: "rtl" },
];

export const LANDING_COPY: Record<string, LandingCopy> = {
  en: {
    description:
      "A calm resident agent that summons an AI conversation on top of any app. The signal: copy twice. The first answer starts from what you copied — the rest is a conversation.",
    docs: "Docs",
    heroTitle: "Copy twice,\nact instantly.",
    metaTitle: "ZenCopy — Copy twice, act instantly.",
    note: "Free · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "how it works",
    demoCaption:
      "Copy, then press C once more. The AI's answer appears on the spot — and the conversation continues right there.",
    features: [
      {
        title: "No hunting for your AI",
        body: "In the browser or in Slack, the AI appears over whatever you are looking at.",
      },
      {
        title: "Anything you can copy",
        body: "Text, images, files. You can even talk to a screenshot.",
      },
      {
        title: "Bring your own model",
        body: "OpenAI, Google, Anthropic, a corporate gateway, or local Ollama — swapped in one place.",
      },
      {
        title: "Private by design",
        body: "No account, no telemetry, no relay server. Content and keys go only where you point them.",
      },
    ],
    philosophy: "The best tool is the one you forget is there.",
    privacyLabel: "Privacy",
    termsLabel: "Terms",
  },
  ja: {
    description:
      "どのアプリの上でも、すぐに AI との会話を呼び出せる静かな常駐エージェント。合図はコピー 2 回。最初の答えはコピーした内容から自動で、続きはそのまま会話で。",
    docs: "ドキュメント",
    heroTitle: "二度コピー、\nすぐ実行。",
    metaTitle: "ZenCopy — 二度コピー、すぐ実行。",
    note: "無料 · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "しくみ",
    demoCaption:
      "コピーしたら、もう一度 C。AI の答えがその場に現れて、そのまま会話を続けられます。",
    features: [
      {
        title: "AI を探しに行かない",
        body: "ブラウザでも Slack でも、いま見ている画面の上に AI が現れます。",
      },
      {
        title: "コピーできるものなら何でも",
        body: "テキスト、画像、ファイル。スクリーンショットと会話することもできます。",
      },
      {
        title: "モデルは自分で選ぶ",
        body: "OpenAI・Google・Anthropic・社内ゲートウェイ・ローカルの Ollama。差し替えは一箇所で。",
      },
      {
        title: "プライバシー最優先の設計",
        body: "アカウントもテレメトリも中継サーバーもなし。内容とキーは、あなたが決めた先にしか行きません。",
      },
    ],
    philosophy: "最良の道具は、そこにあることを忘れさせる。",
    privacyLabel: "プライバシー",
    termsLabel: "利用条件",
  },
  "zh-hans": {
    description:
      "一款安静的常驻助手，在任何应用之上随时唤出与 AI 的对话。信号是复制两次。第一条回答从你复制的内容自动开始 — 接下来就是一场对话。",
    docs: "文档",
    heroTitle: "复制两次，\n立即处理。",
    metaTitle: "ZenCopy — 复制两次，立即处理。",
    note: "免费 · Apache-2.0 · Windows、macOS 和 Linux",
    demoAria: "运作方式",
    demoCaption: "复制之后再按一次 C。AI 的回答当场出现 — 对话就在原地继续。",
    features: [
      {
        title: "不用再去找 AI",
        body: "在浏览器里也好，在 Slack 里也好，AI 就出现在你正看着的画面上。",
      },
      {
        title: "能复制的，都能处理",
        body: "文本、图片、文件。你甚至可以和一张截图对话。",
      },
      {
        title: "自带模型",
        body: "OpenAI、Google、Anthropic、企业网关或本地 Ollama — 在一处即可切换。",
      },
      {
        title: "为隐私而设计",
        body: "无账号、无遥测、无中转服务器。内容和密钥只去你指定的地方。",
      },
    ],
    philosophy: "最好的工具，是让你忘了它存在的那一个。",
    privacyLabel: "隐私",
    termsLabel: "条款",
  },
  "zh-hant": {
    description:
      "一款沉靜的常駐代理程式，在任何應用程式之上隨時喚出與 AI 的對話。訊號是複製兩次。第一個回答由你複製的內容自動開始——接下來就是一場對話。",
    docs: "文件",
    heroTitle: "複製兩次，\n立即處理。",
    metaTitle: "ZenCopy — 複製兩次，立即處理。",
    note: "免費 · Apache-2.0 · Windows、macOS 與 Linux",
    demoAria: "運作方式",
    demoCaption: "複製之後再按一次 C。AI 的回答當場出現——對話就在原地繼續。",
    features: [
      {
        title: "不必再去找 AI",
        body: "在瀏覽器或 Slack 裡，AI 都會出現在你正看著的畫面上。",
      },
      {
        title: "能複製的都可以",
        body: "文字、圖片、檔案。你甚至可以和一張螢幕截圖對話。",
      },
      {
        title: "自帶你的模型",
        body: "OpenAI、Google、Anthropic、企業閘道或本機 Ollama——都在同一個地方切換。",
      },
      {
        title: "從設計上保護隱私",
        body: "沒有帳號、沒有遙測、沒有中繼伺服器。內容與金鑰只會送到你指定的地方。",
      },
    ],
    philosophy: "最好的工具，是讓你忘了它存在的那一個。",
    privacyLabel: "隱私權",
    termsLabel: "條款",
  },
  ko: {
    description:
      "어떤 앱 위에서든 곧바로 AI와의 대화를 불러내는 차분한 상주 에이전트. 신호는 복사 두 번. 첫 답은 복사한 내용에서 자동으로 시작되고, 그다음은 그대로 대화입니다.",
    docs: "문서",
    heroTitle: "두 번 복사하면,\n즉시 처리.",
    metaTitle: "ZenCopy — 두 번 복사하면, 즉시 처리.",
    note: "무료 · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "작동 방식",
    demoCaption:
      "복사한 다음 C를 한 번 더. AI의 답이 그 자리에 나타나고, 대화는 거기서 그대로 이어집니다.",
    features: [
      {
        title: "AI를 찾아다니지 않아도",
        body: "브라우저에서든 Slack에서든, 지금 보고 있는 화면 위에 AI가 나타납니다.",
      },
      {
        title: "복사할 수 있는 것이라면 무엇이든",
        body: "텍스트, 이미지, 파일. 스크린샷과 대화할 수도 있습니다.",
      },
      {
        title: "원하는 모델을 직접",
        body: "OpenAI, Google, Anthropic, 사내 게이트웨이, 로컬 Ollama — 한 곳에서 바꿔 끼웁니다.",
      },
      {
        title: "설계부터 프라이빗",
        body: "계정도, 텔레메트리도, 중계 서버도 없습니다. 내용과 키는 사용자가 지정한 곳으로만 갑니다.",
      },
    ],
    philosophy: "가장 좋은 도구는 있다는 것조차 잊게 되는 도구입니다.",
    privacyLabel: "개인정보",
    termsLabel: "약관",
  },
  es: {
    description:
      "Un agente residente y sereno que invoca una conversación con la IA sobre cualquier aplicación. La señal: copiar dos veces. La primera respuesta parte de lo que copiaste — el resto es una conversación.",
    docs: "Documentación",
    heroTitle: "Copia dos veces,\nactúa al instante.",
    metaTitle: "ZenCopy — Copia dos veces, actúa al instante.",
    note: "Gratis · Apache-2.0 · Windows, macOS y Linux",
    demoAria: "cómo funciona",
    demoCaption:
      "Copia y pulsa C una vez más. La respuesta de la IA aparece en el acto — y la conversación continúa ahí mismo.",
    features: [
      {
        title: "Sin ir a buscar a tu IA",
        body: "En el navegador o en Slack, la IA aparece sobre lo que estés mirando.",
      },
      {
        title: "Todo lo que puedas copiar",
        body: "Texto, imágenes, archivos. Hasta puedes hablar con una captura de pantalla.",
      },
      {
        title: "Trae tu propio modelo",
        body: "OpenAI, Google, Anthropic, una pasarela corporativa u Ollama local — se cambia en un solo lugar.",
      },
      {
        title: "Privado por diseño",
        body: "Sin cuenta, sin telemetría, sin servidor intermedio. El contenido y las claves van solo a donde tú indiques.",
      },
    ],
    philosophy: "La mejor herramienta es la que olvidas que está ahí.",
    privacyLabel: "Privacidad",
    termsLabel: "Términos",
  },
  "pt-br": {
    description:
      "Um agente residente e tranquilo que invoca uma conversa com a IA por cima de qualquer aplicativo. O sinal: copiar duas vezes. A primeira resposta parte do que você copiou — o resto é conversa.",
    docs: "Documentação",
    heroTitle: "Copie duas vezes,\naja na hora.",
    metaTitle: "ZenCopy — Copie duas vezes, aja na hora.",
    note: "Gratuito · Apache-2.0 · Windows, macOS e Linux",
    demoAria: "como funciona",
    demoCaption:
      "Copie e pressione C mais uma vez. A resposta da IA aparece na hora — e a conversa continua ali mesmo.",
    features: [
      {
        title: "Sem ir atrás da sua IA",
        body: "No navegador ou no Slack, a IA aparece por cima do que você está vendo.",
      },
      {
        title: "Tudo o que dá para copiar",
        body: "Texto, imagens, arquivos. Dá até para conversar com uma captura de tela.",
      },
      {
        title: "Use o modelo que quiser",
        body: "OpenAI, Google, Anthropic, um gateway corporativo ou Ollama local — trocados em um único lugar.",
      },
      {
        title: "Privado por concepção",
        body: "Sem conta, sem telemetria, sem servidor intermediário. Conteúdo e chaves vão só para onde você apontar.",
      },
    ],
    philosophy: "A melhor ferramenta é aquela que você esquece que está ali.",
    privacyLabel: "Privacidade",
    termsLabel: "Termos",
  },
  fr: {
    description:
      "Un agent résident et serein qui invoque une conversation avec l'IA par-dessus n'importe quelle application. Le signal : copier deux fois. La première réponse part de ce que vous avez copié — la suite est une conversation.",
    docs: "Documentation",
    heroTitle: "Copiez deux fois,\nagissez aussitôt.",
    metaTitle: "ZenCopy — Copiez deux fois, agissez aussitôt.",
    note: "Gratuit · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "comment ça marche",
    demoCaption:
      "Copiez, puis appuyez une fois de plus sur C. La réponse de l'IA apparaît sur-le-champ — et la conversation se poursuit au même endroit.",
    features: [
      {
        title: "Plus besoin d'aller chercher votre IA",
        body: "Dans le navigateur ou dans Slack, l'IA apparaît par-dessus ce que vous regardez.",
      },
      {
        title: "Tout ce que vous pouvez copier",
        body: "Texte, images, fichiers. Vous pouvez même parler à une capture d'écran.",
      },
      {
        title: "Apportez votre propre modèle",
        body: "OpenAI, Google, Anthropic, une passerelle d'entreprise ou Ollama en local — interchangeables en un seul endroit.",
      },
      {
        title: "Privé par conception",
        body: "Pas de compte, pas de télémétrie, pas de serveur relais. Contenu et clés ne vont que là où vous les envoyez.",
      },
    ],
    philosophy: "Le meilleur outil est celui dont on oublie la présence.",
    privacyLabel: "Confidentialité",
    termsLabel: "Conditions",
  },
  de: {
    description:
      "Ein ruhiger, ständig bereiter Agent, der über jeder App ein KI-Gespräch herbeiruft. Das Signal: zweimal kopieren. Die erste Antwort entsteht aus dem, was du kopiert hast — der Rest ist ein Gespräch.",
    docs: "Doku",
    heroTitle: "Zweimal kopieren,\nsofort handeln.",
    metaTitle: "ZenCopy — Zweimal kopieren, sofort handeln.",
    note: "Kostenlos · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "So funktioniert es",
    demoCaption:
      "Kopiere etwas und drücke noch einmal C. Die Antwort der KI erscheint auf der Stelle — und das Gespräch geht genau dort weiter.",
    features: [
      {
        title: "Keine Suche nach deiner KI",
        body: "Im Browser oder in Slack — die KI erscheint über dem, was du gerade ansiehst.",
      },
      {
        title: "Alles, was du kopieren kannst",
        body: "Text, Bilder, Dateien. Du kannst sogar mit einem Screenshot reden.",
      },
      {
        title: "Bring dein eigenes Modell mit",
        body: "OpenAI, Google, Anthropic, ein Firmen-Gateway oder lokales Ollama — an einer Stelle ausgetauscht.",
      },
      {
        title: "Privat von Grund auf",
        body: "Kein Konto, keine Telemetrie, kein Relay-Server. Inhalte und Schlüssel gehen nur dorthin, wohin du sie schickst.",
      },
    ],
    philosophy: "Das beste Werkzeug ist das, von dem du vergisst, dass es da ist.",
    privacyLabel: "Datenschutz",
    termsLabel: "Nutzungsbedingungen",
  },
  it: {
    description:
      "Un agente residente e tranquillo che evoca una conversazione con l'IA sopra qualsiasi app. Il segnale: copiare due volte. La prima risposta parte da ciò che hai copiato — il resto è una conversazione.",
    docs: "Documentazione",
    heroTitle: "Copia due volte,\nagisci all'istante.",
    metaTitle: "ZenCopy — Copia due volte, agisci all'istante.",
    note: "Gratuito · Apache-2.0 · Windows, macOS e Linux",
    demoAria: "come funziona",
    demoCaption:
      "Copia, poi premi C ancora una volta. La risposta dell'IA appare sul posto — e la conversazione continua lì.",
    features: [
      {
        title: "Niente più caccia alla tua IA",
        body: "Nel browser o su Slack, l'IA appare sopra ciò che stai guardando.",
      },
      {
        title: "Tutto ciò che puoi copiare",
        body: "Testo, immagini, file. Puoi persino parlare con uno screenshot.",
      },
      {
        title: "Porta il tuo modello",
        body: "OpenAI, Google, Anthropic, un gateway aziendale o Ollama in locale — si cambia in un unico posto.",
      },
      {
        title: "Privato per progettazione",
        body: "Nessun account, nessuna telemetria, nessun server intermedio. Contenuti e chiavi vanno solo dove li indirizzi tu.",
      },
    ],
    philosophy: "Lo strumento migliore è quello di cui dimentichi l'esistenza.",
    privacyLabel: "Privacy",
    termsLabel: "Termini",
  },
  pl: {
    description:
      "Spokojny agent działający w tle, który przywołuje rozmowę z AI nad dowolną aplikacją. Sygnał: skopiuj dwa razy. Pierwsza odpowiedź powstaje z tego, co skopiujesz — reszta to już rozmowa.",
    docs: "Dokumentacja",
    heroTitle: "Skopiuj dwa razy,\ndziałaj od razu.",
    metaTitle: "ZenCopy — Skopiuj dwa razy, działaj od razu.",
    note: "Za darmo · Apache-2.0 · Windows, macOS i Linux",
    demoAria: "jak to działa",
    demoCaption:
      "Skopiuj, a potem naciśnij C jeszcze raz. Odpowiedź AI pojawia się na miejscu — a rozmowa toczy się dalej właśnie tam.",
    features: [
      {
        title: "Żadnego szukania AI",
        body: "W przeglądarce czy na Slacku — AI pojawia się nad tym, na co właśnie patrzysz.",
      },
      {
        title: "Wszystko, co da się skopiować",
        body: "Tekst, obrazy, pliki. Możesz porozmawiać nawet ze zrzutem ekranu.",
      },
      {
        title: "Twój własny model",
        body: "OpenAI, Google, Anthropic, brama firmowa albo lokalny Ollama — do podmiany w jednym miejscu.",
      },
      {
        title: "Prywatny z założenia",
        body: "Bez konta, bez telemetrii, bez serwera pośredniczącego. Treść i klucze trafiają tylko tam, gdzie je skierujesz.",
      },
    ],
    philosophy: "Najlepsze narzędzie to takie, o którego istnieniu zapominasz.",
    privacyLabel: "Prywatność",
    termsLabel: "Warunki",
  },
  ru: {
    description:
      "Спокойный агент, живущий в фоне и вызывающий разговор с ИИ поверх любого приложения. Сигнал — скопировать дважды. Первый ответ начинается с того, что вы скопировали, а дальше — обычный разговор.",
    docs: "Документация",
    heroTitle: "Скопируйте дважды —\nдействуйте сразу.",
    metaTitle: "ZenCopy — Скопируйте дважды — действуйте сразу.",
    note: "Бесплатно · Apache-2.0 · Windows, macOS и Linux",
    demoAria: "как это работает",
    demoCaption:
      "Скопируйте, затем нажмите C ещё раз. Ответ ИИ появляется на месте — и разговор продолжается прямо там.",
    features: [
      {
        title: "Не нужно искать свой ИИ",
        body: "В браузере или в Slack — ИИ появляется поверх того, на что вы смотрите.",
      },
      {
        title: "Всё, что можно скопировать",
        body: "Текст, изображения, файлы. Можно поговорить даже со скриншотом.",
      },
      {
        title: "Ваша собственная модель",
        body: "OpenAI, Google, Anthropic, корпоративный шлюз или локальная Ollama — переключаются в одном месте.",
      },
      {
        title: "Конфиденциальность по замыслу",
        body: "Ни аккаунта, ни телеметрии, ни промежуточного сервера. Содержимое и ключи идут только туда, куда вы укажете.",
      },
    ],
    philosophy: "Лучший инструмент — тот, о существовании которого вы забываете.",
    privacyLabel: "Конфиденциальность",
    termsLabel: "Условия",
  },
  id: {
    description:
      "Agen tenang yang selalu siaga, memanggil percakapan AI di atas aplikasi apa pun. Sinyalnya: salin dua kali. Jawaban pertama berangkat dari apa yang kamu salin — selebihnya adalah percakapan.",
    docs: "Dokumentasi",
    heroTitle: "Salin dua kali,\nlangsung beraksi.",
    metaTitle: "ZenCopy — Salin dua kali, langsung beraksi.",
    note: "Gratis · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "cara kerjanya",
    demoCaption:
      "Salin, lalu tekan C sekali lagi. Jawaban AI muncul saat itu juga — dan percakapan berlanjut di tempat yang sama.",
    features: [
      {
        title: "Tak perlu mencari AI-mu",
        body: "Di browser maupun di Slack, AI muncul di atas apa pun yang sedang kamu lihat.",
      },
      {
        title: "Apa pun yang bisa kamu salin",
        body: "Teks, gambar, berkas. Kamu bahkan bisa mengobrol dengan tangkapan layar.",
      },
      {
        title: "Bawa modelmu sendiri",
        body: "OpenAI, Google, Anthropic, gateway perusahaan, atau Ollama lokal — diganti di satu tempat.",
      },
      {
        title: "Privat sejak dirancang",
        body: "Tanpa akun, tanpa telemetri, tanpa server perantara. Konten dan kunci hanya pergi ke tujuan yang kamu tentukan.",
      },
    ],
    philosophy: "Alat terbaik adalah alat yang membuatmu lupa bahwa ia ada.",
    privacyLabel: "Privasi",
    termsLabel: "Ketentuan",
  },
  vi: {
    description:
      "Một trợ lý thường trực tĩnh lặng, triệu hồi cuộc trò chuyện với AI ngay trên bất kỳ ứng dụng nào. Tín hiệu là sao chép hai lần. Câu trả lời đầu tiên tự bắt đầu từ nội dung bạn sao chép — phần còn lại là một cuộc trò chuyện.",
    docs: "Tài liệu",
    heroTitle: "Sao chép hai lần,\nxử lý tức thì.",
    metaTitle: "ZenCopy — Sao chép hai lần, xử lý tức thì.",
    note: "Miễn phí · Apache-2.0 · Windows, macOS & Linux",
    demoAria: "cách hoạt động",
    demoCaption:
      "Sao chép, rồi nhấn C thêm một lần. Câu trả lời của AI hiện ra ngay tại chỗ — và cuộc trò chuyện tiếp tục ngay ở đó.",
    features: [
      {
        title: "Không phải đi tìm AI",
        body: "Trong trình duyệt hay trong Slack, AI hiện ra ngay trên thứ bạn đang nhìn.",
      },
      {
        title: "Bất cứ thứ gì bạn sao chép được",
        body: "Văn bản, hình ảnh, tệp. Bạn thậm chí có thể trò chuyện với một ảnh chụp màn hình.",
      },
      {
        title: "Tự chọn mô hình của bạn",
        body: "OpenAI, Google, Anthropic, gateway công ty, hay Ollama chạy tại máy — đổi tất cả ở một nơi.",
      },
      {
        title: "Riêng tư ngay từ khâu thiết kế",
        body: "Không tài khoản, không telemetry, không máy chủ trung gian. Nội dung và khóa chỉ đi đến nơi bạn chỉ định.",
      },
    ],
    philosophy: "Công cụ tốt nhất là công cụ bạn quên mất rằng nó đang ở đó.",
    privacyLabel: "Quyền riêng tư",
    termsLabel: "Điều khoản",
  },
  th: {
    description:
      "เอเจนต์ประจำเครื่องแสนสงบที่เรียกบทสนทนากับ AI ขึ้นมาบนแอปใดก็ได้ สัญญาณคือการคัดลอกสองครั้ง คำตอบแรกเริ่มจากสิ่งที่คุณคัดลอกโดยอัตโนมัติ — ที่เหลือคือการสนทนา",
    docs: "เอกสาร",
    heroTitle: "คัดลอกสองครั้ง\nจัดการทันที",
    metaTitle: "ZenCopy — คัดลอกสองครั้ง จัดการทันที",
    note: "ฟรี · Apache-2.0 · Windows, macOS และ Linux",
    demoAria: "วิธีการทำงาน",
    demoCaption: "คัดลอก แล้วกด C อีกครั้ง คำตอบของ AI ปรากฏขึ้นตรงนั้นทันที — และสนทนาต่อได้ตรงนั้นเลย",
    features: [
      {
        title: "ไม่ต้องไปตามหา AI",
        body: "ไม่ว่าในเบราว์เซอร์หรือใน Slack AI จะปรากฏขึ้นบนสิ่งที่คุณกำลังดูอยู่",
      },
      {
        title: "อะไรก็ได้ที่คุณคัดลอกได้",
        body: "ข้อความ รูปภาพ ไฟล์ คุณคุยกับภาพหน้าจอได้ด้วยซ้ำ",
      },
      {
        title: "ใช้โมเดลของคุณเอง",
        body: "OpenAI, Google, Anthropic, เกตเวย์องค์กร หรือ Ollama ในเครื่อง — สลับได้จากที่เดียว",
      },
      {
        title: "เป็นส่วนตัวโดยการออกแบบ",
        body: "ไม่มีบัญชี ไม่มี telemetry ไม่มีเซิร์ฟเวอร์ตัวกลาง เนื้อหาและคีย์ไปเฉพาะที่ที่คุณกำหนดเท่านั้น",
      },
    ],
    philosophy: "เครื่องมือที่ดีที่สุด คือเครื่องมือที่คุณลืมไปเลยว่ามันอยู่ตรงนั้น",
    privacyLabel: "ความเป็นส่วนตัว",
    termsLabel: "ข้อกำหนด",
  },
  tr: {
    description:
      "Arka planda sessizce bekleyen ve her uygulamanın üzerinde bir AI sohbeti çağıran sakin bir asistan. İşaret: iki kez kopyala. İlk yanıt kopyaladığın şeyden yola çıkar — gerisi bir sohbet.",
    docs: "Belgeler",
    heroTitle: "İki kez kopyala,\nanında harekete geç.",
    metaTitle: "ZenCopy — İki kez kopyala, anında harekete geç.",
    note: "Ücretsiz · Apache-2.0 · Windows, macOS ve Linux",
    demoAria: "nasıl çalışır",
    demoCaption:
      "Kopyala, sonra C'ye bir kez daha bas. AI'ın yanıtı olduğu yerde belirir — ve sohbet tam orada devam eder.",
    features: [
      {
        title: "AI'ını aramak yok",
        body: "Tarayıcıda ya da Slack'te — AI, baktığın şeyin üzerinde belirir.",
      },
      {
        title: "Kopyalayabildiğin her şey",
        body: "Metin, görseller, dosyalar. Bir ekran görüntüsüyle bile konuşabilirsin.",
      },
      {
        title: "Kendi modelini getir",
        body: "OpenAI, Google, Anthropic, kurumsal bir ağ geçidi ya da yerel Ollama — hepsi tek yerden değiştirilir.",
      },
      {
        title: "Tasarımı gereği gizli",
        body: "Hesap yok, telemetri yok, aktarma sunucusu yok. İçerik ve anahtarlar yalnızca senin gösterdiğin yere gider.",
      },
    ],
    philosophy: "En iyi araç, orada olduğunu unuttuğun araçtır.",
    privacyLabel: "Gizlilik",
    termsLabel: "Koşullar",
  },
  ar: {
    description:
      "وكيل مقيم هادئ يستدعي محادثة ذكاء اصطناعي فوق أي تطبيق. الإشارة: انسخ مرتين. الإجابة الأولى تنطلق مما نسخته — والباقي محادثة.",
    docs: "الوثائق",
    heroTitle: "انسخ مرتين،\nونفّذ فورًا.",
    metaTitle: "ZenCopy — انسخ مرتين، ونفّذ فورًا.",
    note: "مجاني · Apache-2.0 · Windows وmacOS وLinux",
    demoAria: "كيف يعمل",
    demoCaption:
      "انسخ ثم اضغط C مرة أخرى. تظهر إجابة الذكاء الاصطناعي في مكانها — وتستمر المحادثة هناك مباشرة.",
    features: [
      {
        title: "لا بحث عن الذكاء الاصطناعي",
        body: "في المتصفح أو في Slack، يظهر الذكاء الاصطناعي فوق ما تنظر إليه الآن.",
      },
      {
        title: "كل ما يمكنك نسخه",
        body: "نص وصور وملفات. يمكنك حتى أن تتحدث إلى لقطة شاشة.",
      },
      {
        title: "أحضر نموذجك الخاص",
        body: "OpenAI أو Google أو Anthropic أو بوابة شركة أو Ollama المحلي — يُبدَّل من مكان واحد.",
      },
      {
        title: "خصوصية بالتصميم",
        body: "لا حساب ولا قياس عن بُعد ولا خادم وسيط. المحتوى والمفاتيح لا يذهبان إلا حيث توجّههما أنت.",
      },
    ],
    philosophy: "أفضل أداة هي التي تنسى وجودها.",
    privacyLabel: "الخصوصية",
    termsLabel: "الشروط",
  },
  fa: {
    description:
      "عاملی مقیم و آرام که روی هر برنامه‌ای گفتگو با هوش مصنوعی را احضار می‌کند. علامت: دو بار کپی. پاسخ نخست از همان چیزی که کپی کرده‌اید آغاز می‌شود — باقی‌اش یک گفتگو است.",
    docs: "مستندات",
    heroTitle: "دو بار کپی کنید،\nبی‌درنگ اقدام کنید.",
    metaTitle: "ZenCopy — دو بار کپی کنید، بی‌درنگ اقدام کنید.",
    note: "رایگان · Apache-2.0 · Windows، macOS و Linux",
    demoAria: "طرز کار",
    demoCaption:
      "کپی کنید و یک بار دیگر C را فشار دهید. پاسخ هوش مصنوعی همان‌جا ظاهر می‌شود — و گفتگو همان‌جا ادامه می‌یابد.",
    features: [
      {
        title: "دنبال هوش مصنوعی نگردید",
        body: "در مرورگر یا در Slack، هوش مصنوعی روی همان چیزی ظاهر می‌شود که به آن نگاه می‌کنید.",
      },
      {
        title: "هر چیزی که بتوان کپی کرد",
        body: "متن، تصویر، فایل. حتی می‌توانید با یک اسکرین‌شات گفتگو کنید.",
      },
      {
        title: "مدل خودتان را بیاورید",
        body: "OpenAI، Google، Anthropic، گیت‌وی سازمانی یا Ollama محلی — همه از یک جا قابل تعویض.",
      },
      {
        title: "حریم خصوصی در ذات طراحی",
        body: "بدون حساب کاربری، بدون تله‌متری، بدون سرور واسطه. محتوا و کلیدها فقط به جایی می‌روند که خودتان تعیین کرده‌اید.",
      },
    ],
    philosophy: "بهترین ابزار آن است که فراموش کنید وجود دارد.",
    privacyLabel: "حریم خصوصی",
    termsLabel: "شرایط",
  },
  he: {
    description:
      "סוכן רקע רגוע שמזמן שיחה עם AI מעל כל אפליקציה. האות: מעתיקים פעמיים. התשובה הראשונה מתחילה ממה שהעתקתם — וכל השאר הוא שיחה.",
    docs: "תיעוד",
    heroTitle: "מעתיקים פעמיים,\nפועלים מיד.",
    metaTitle: "ZenCopy — מעתיקים פעמיים, פועלים מיד.",
    note: "חינם · Apache-2.0 · Windows‏, macOS ו‑Linux",
    demoAria: "איך זה עובד",
    demoCaption:
      "מעתיקים, ואז מקישים C פעם אחת נוספת. תשובת ה‑AI מופיעה בו במקום — והשיחה ממשיכה ממש שם.",
    features: [
      {
        title: "בלי לחפש את ה‑AI",
        body: "בדפדפן או ב‑Slack, ה‑AI מופיע מעל מה שאתם מסתכלים עליו עכשיו.",
      },
      {
        title: "כל מה שאפשר להעתיק",
        body: "טקסט, תמונות, קבצים. אפשר אפילו לדבר עם צילום מסך.",
      },
      {
        title: "הביאו מודל משלכם",
        body: "OpenAI‏, Google‏, Anthropic, שער ארגוני או Ollama מקומי — ניתנים להחלפה במקום אחד.",
      },
      {
        title: "פרטי מעצם התכנון",
        body: "בלי חשבון, בלי טלמטריה, בלי שרת מתווך. תוכן ומפתחות הולכים רק לאן שאתם מכוונים אותם.",
      },
    ],
    philosophy: "הכלי הטוב ביותר הוא זה ששוכחים שהוא בכלל שם.",
    privacyLabel: "פרטיות",
    termsLabel: "תנאים",
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
  en: { system: "System", light: "Light", dark: "Dark" },
  ja: { system: "システム", light: "ライト", dark: "ダーク" },
  "zh-hans": { system: "跟随系统", light: "浅色", dark: "深色" },
  "zh-hant": { system: "跟隨系統", light: "淺色", dark: "深色" },
  ko: { system: "시스템", light: "라이트", dark: "다크" },
  es: { system: "Sistema", light: "Claro", dark: "Oscuro" },
  "pt-br": { system: "Sistema", light: "Claro", dark: "Escuro" },
  fr: { system: "Système", light: "Clair", dark: "Sombre" },
  de: { system: "System", light: "Hell", dark: "Dunkel" },
  it: { system: "Sistema", light: "Chiaro", dark: "Scuro" },
  pl: { system: "Systemowy", light: "Jasny", dark: "Ciemny" },
  ru: { system: "Системная", light: "Светлая", dark: "Тёмная" },
  id: { system: "Sistem", light: "Terang", dark: "Gelap" },
  vi: { system: "Hệ thống", light: "Sáng", dark: "Tối" },
  th: { system: "ตามระบบ", light: "สว่าง", dark: "มืด" },
  tr: { system: "Sistem", light: "Açık", dark: "Koyu" },
  ar: { system: "النظام", light: "فاتح", dark: "داكن" },
  fa: { system: "سیستم", light: "روشن", dark: "تیره" },
  he: { system: "מערכת", light: "בהיר", dark: "כהה" },
};
