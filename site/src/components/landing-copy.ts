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
  download: string;
  downloadNote: string;
  getStarted: string;
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
      "Copy twice, act instantly. A calm desktop agent that turns whatever you copy into an instant AI result.",
    docs: "Docs",
    heroTitle: "Copy twice,\nact instantly.",
    metaTitle: "ZenCopy — Copy twice, act instantly.",
    download: "Download",
    downloadNote: "Free · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "Get started",
    demoAria: "how it works",
    demoCaption: "Copy, then press C once more — what you copied becomes an AI result on the spot.",
    features: [
      {
        title: "Anything you can copy",
        body: "Text, rich text, images, files — screenshots and PDFs ride along to the model.",
      },
      {
        title: "Bring your own model",
        body: "OpenAI, Google, Anthropic, a corporate gateway, or local Ollama — swapped in one place.",
      },
      {
        title: "Private by design",
        body: "No account, no telemetry, no relay server. Content and keys go only where you point them.",
      },
      {
        title: "Calm by default",
        body: "Sensitive clipboard content is ignored, and an ordinary copy is never disturbed.",
      },
    ],
    philosophy: "The best tool is the one you forget is there.",
    privacyLabel: "Privacy",
    termsLabel: "Terms",
  },
  ja: {
    description:
      "コピー2回で、すぐに処理。コピーした内容を即座に AI の結果へ変える、静かな常駐デスクトップエージェント。",
    docs: "ドキュメント",
    heroTitle: "二度コピーすれば、\nすぐに動く。",
    metaTitle: "ZenCopy — 二度コピーすれば、すぐに動く。",
    download: "ダウンロード",
    downloadNote: "無料 · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "はじめる",
    demoAria: "しくみ",
    demoCaption: "コピーしたら、もう一度 C を押すだけ。その場で AI の結果になります。",
    features: [
      {
        title: "コピーできるものなら何でも",
        body: "テキスト、リッチテキスト、画像、ファイル。スクリーンショットや PDF もそのままモデルへ。",
      },
      {
        title: "モデルは自分で選ぶ",
        body: "OpenAI・Google・Anthropic・社内ゲートウェイ・ローカルの Ollama。差し替えは一箇所で。",
      },
      {
        title: "プライバシー最優先の設計",
        body: "アカウントもテレメトリも中継サーバーもなし。内容とキーは、あなたが決めた先にしか行きません。",
      },
      {
        title: "静けさがデフォルト",
        body: "機密マーク付きのクリップボードは無視。普通のコピーを妨げることは決してありません。",
      },
    ],
    philosophy: "最良の道具は、そこにあることを忘れさせる。",
    privacyLabel: "プライバシー",
    termsLabel: "利用条件",
  },
  "zh-hans": {
    description: "复制两次，立即处理。一款安静的桌面助手，把你复制的任何内容当场变成 AI 结果。",
    docs: "文档",
    heroTitle: "复制两次，\n立即处理。",
    metaTitle: "ZenCopy — 复制两次，立即处理。",
    download: "下载",
    downloadNote: "免费 · Apache-2.0 · Windows、macOS 和 Linux",
    getStarted: "开始使用",
    demoAria: "运作方式",
    demoCaption: "复制之后再按一次 C — 你复制的内容当场变成 AI 结果。",
    features: [
      {
        title: "能复制的，都能处理",
        body: "文本、富文本、图片、文件 — 截图和 PDF 也会一并交给模型。",
      },
      {
        title: "自带模型",
        body: "OpenAI、Google、Anthropic、企业网关或本地 Ollama — 在一处即可切换。",
      },
      {
        title: "为隐私而设计",
        body: "无账号、无遥测、无中转服务器。内容和密钥只去你指定的地方。",
      },
      {
        title: "默认保持安静",
        body: "敏感的剪贴板内容会被忽略，普通的复制也从不被打扰。",
      },
    ],
    philosophy: "最好的工具，是让你忘了它存在的那一个。",
    privacyLabel: "隐私",
    termsLabel: "条款",
  },
  "zh-hant": {
    description: "複製兩次，立即處理。一款沉靜的桌面代理程式，把你複製的任何內容當場化為 AI 結果。",
    docs: "文件",
    heroTitle: "複製兩次，\n立即處理。",
    metaTitle: "ZenCopy — 複製兩次，立即處理。",
    download: "下載",
    downloadNote: "免費 · Apache-2.0 · Windows、macOS 與 Linux",
    getStarted: "開始使用",
    demoAria: "運作方式",
    demoCaption: "複製之後再按一次 C——你複製的內容當場變成 AI 結果。",
    features: [
      {
        title: "能複製的都可以",
        body: "文字、格式化文字、圖片、檔案——螢幕截圖和 PDF 也會一併送給模型。",
      },
      {
        title: "自帶你的模型",
        body: "OpenAI、Google、Anthropic、企業閘道或本機 Ollama——都在同一個地方切換。",
      },
      {
        title: "從設計上保護隱私",
        body: "沒有帳號、沒有遙測、沒有中繼伺服器。內容與金鑰只會送到你指定的地方。",
      },
      {
        title: "預設保持沉靜",
        body: "機密的剪貼簿內容會被忽略，平常的複製也絕不受干擾。",
      },
    ],
    philosophy: "最好的工具，是讓你忘了它存在的那一個。",
    privacyLabel: "隱私權",
    termsLabel: "條款",
  },
  ko: {
    description:
      "두 번 복사하면, 즉시 처리. 복사한 무엇이든 그 자리에서 AI 결과로 바꿔 주는 차분한 데스크톱 에이전트.",
    docs: "문서",
    heroTitle: "두 번 복사하면,\n즉시 처리.",
    metaTitle: "ZenCopy — 두 번 복사하면, 즉시 처리.",
    download: "다운로드",
    downloadNote: "무료 · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "시작하기",
    demoAria: "작동 방식",
    demoCaption: "복사한 다음 C를 한 번 더 누르면, 복사한 내용이 그 자리에서 AI 결과가 됩니다.",
    features: [
      {
        title: "복사할 수 있는 것이라면 무엇이든",
        body: "텍스트, 서식 있는 텍스트, 이미지, 파일 — 스크린샷과 PDF도 그대로 모델에 전달됩니다.",
      },
      {
        title: "원하는 모델을 직접",
        body: "OpenAI, Google, Anthropic, 사내 게이트웨이, 로컬 Ollama — 한 곳에서 바꿔 끼웁니다.",
      },
      {
        title: "설계부터 프라이빗",
        body: "계정도, 텔레메트리도, 중계 서버도 없습니다. 내용과 키는 사용자가 지정한 곳으로만 갑니다.",
      },
      {
        title: "기본은 차분하게",
        body: "민감한 클립보드 내용은 무시되고, 평범한 복사는 절대 방해받지 않습니다.",
      },
    ],
    philosophy: "가장 좋은 도구는 있다는 것조차 잊게 되는 도구입니다.",
    privacyLabel: "개인정보",
    termsLabel: "약관",
  },
  es: {
    description:
      "Copia dos veces, actúa al instante. Un agente de escritorio sereno que convierte lo que copias en un resultado de IA inmediato.",
    docs: "Documentación",
    heroTitle: "Copia dos veces,\nactúa al instante.",
    metaTitle: "ZenCopy — Copia dos veces, actúa al instante.",
    download: "Descargar",
    downloadNote: "Gratis · Apache-2.0 · Windows, macOS y Linux",
    getStarted: "Empieza ahora",
    demoAria: "cómo funciona",
    demoCaption:
      "Copia y pulsa C una vez más — lo que copiaste se convierte en un resultado de IA al momento.",
    features: [
      {
        title: "Todo lo que puedas copiar",
        body: "Texto, texto enriquecido, imágenes, archivos — las capturas de pantalla y los PDF se envían al modelo junto con el resto.",
      },
      {
        title: "Trae tu propio modelo",
        body: "OpenAI, Google, Anthropic, una pasarela corporativa u Ollama local — se cambia en un solo lugar.",
      },
      {
        title: "Privado por diseño",
        body: "Sin cuenta, sin telemetría, sin servidor intermedio. El contenido y las claves van solo a donde tú indiques.",
      },
      {
        title: "Sereno por defecto",
        body: "El contenido sensible del portapapeles se ignora, y una copia normal nunca se ve afectada.",
      },
    ],
    philosophy: "La mejor herramienta es la que olvidas que está ahí.",
    privacyLabel: "Privacidad",
    termsLabel: "Términos",
  },
  "pt-br": {
    description:
      "Copie duas vezes, aja na hora. Um agente de desktop tranquilo que transforma o que você copia em um resultado de IA instantâneo.",
    docs: "Documentação",
    heroTitle: "Copie duas vezes,\naja na hora.",
    metaTitle: "ZenCopy — Copie duas vezes, aja na hora.",
    download: "Baixar",
    downloadNote: "Gratuito · Apache-2.0 · Windows, macOS e Linux",
    getStarted: "Começar",
    demoAria: "como funciona",
    demoCaption:
      "Copie e pressione C mais uma vez — o que você copiou vira um resultado de IA na hora.",
    features: [
      {
        title: "Tudo o que dá para copiar",
        body: "Texto, texto formatado, imagens, arquivos — capturas de tela e PDFs vão junto para o modelo.",
      },
      {
        title: "Use o modelo que quiser",
        body: "OpenAI, Google, Anthropic, um gateway corporativo ou Ollama local — trocados em um único lugar.",
      },
      {
        title: "Privado por concepção",
        body: "Sem conta, sem telemetria, sem servidor intermediário. Conteúdo e chaves vão só para onde você apontar.",
      },
      {
        title: "Tranquilo por padrão",
        body: "Conteúdo sensível da área de transferência é ignorado, e uma cópia comum nunca é afetada.",
      },
    ],
    philosophy: "A melhor ferramenta é aquela que você esquece que está ali.",
    privacyLabel: "Privacidade",
    termsLabel: "Termos",
  },
  fr: {
    description:
      "Copiez deux fois, agissez aussitôt. Un assistant de bureau serein qui transforme tout ce que vous copiez en résultat d'IA instantané.",
    docs: "Documentation",
    heroTitle: "Copiez deux fois,\nagissez aussitôt.",
    metaTitle: "ZenCopy — Copiez deux fois, agissez aussitôt.",
    download: "Télécharger",
    downloadNote: "Gratuit · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "Commencer",
    demoAria: "comment ça marche",
    demoCaption:
      "Copiez, puis appuyez une fois de plus sur C — ce que vous avez copié devient aussitôt un résultat d'IA.",
    features: [
      {
        title: "Tout ce que vous pouvez copier",
        body: "Texte, texte enrichi, images, fichiers — les captures d'écran et les PDF accompagnent le reste jusqu'au modèle.",
      },
      {
        title: "Apportez votre propre modèle",
        body: "OpenAI, Google, Anthropic, une passerelle d'entreprise ou Ollama en local — interchangeables en un seul endroit.",
      },
      {
        title: "Privé par conception",
        body: "Pas de compte, pas de télémétrie, pas de serveur relais. Contenu et clés ne vont que là où vous les envoyez.",
      },
      {
        title: "Serein par défaut",
        body: "Le contenu sensible du presse-papiers est ignoré, et un copier ordinaire n'est jamais perturbé.",
      },
    ],
    philosophy: "Le meilleur outil est celui dont on oublie la présence.",
    privacyLabel: "Confidentialité",
    termsLabel: "Conditions",
  },
  de: {
    description:
      "Zweimal kopieren, sofort handeln. Ein ruhiger Desktop-Agent, der alles, was du kopierst, in ein sofortiges KI-Ergebnis verwandelt.",
    docs: "Doku",
    heroTitle: "Zweimal kopieren,\nsofort handeln.",
    metaTitle: "ZenCopy — Zweimal kopieren, sofort handeln.",
    download: "Herunterladen",
    downloadNote: "Kostenlos · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "Loslegen",
    demoAria: "So funktioniert es",
    demoCaption:
      "Kopiere etwas und drücke noch einmal C — was du kopiert hast, wird auf der Stelle zu einem KI-Ergebnis.",
    features: [
      {
        title: "Alles, was du kopieren kannst",
        body: "Text, formatierter Text, Bilder, Dateien — Screenshots und PDFs wandern mit zum Modell.",
      },
      {
        title: "Bring dein eigenes Modell mit",
        body: "OpenAI, Google, Anthropic, ein Firmen-Gateway oder lokales Ollama — an einer Stelle ausgetauscht.",
      },
      {
        title: "Privat von Grund auf",
        body: "Kein Konto, keine Telemetrie, kein Relay-Server. Inhalte und Schlüssel gehen nur dorthin, wohin du sie schickst.",
      },
      {
        title: "Ruhig von Haus aus",
        body: "Sensible Zwischenablage-Inhalte werden ignoriert, und ein gewöhnliches Kopieren wird nie gestört.",
      },
    ],
    philosophy: "Das beste Werkzeug ist das, von dem du vergisst, dass es da ist.",
    privacyLabel: "Datenschutz",
    termsLabel: "Nutzungsbedingungen",
  },
  it: {
    description:
      "Copia due volte, agisci all'istante. Un agente desktop tranquillo che trasforma ciò che copi in un risultato IA immediato.",
    docs: "Documentazione",
    heroTitle: "Copia due volte,\nagisci all'istante.",
    metaTitle: "ZenCopy — Copia due volte, agisci all'istante.",
    download: "Scarica",
    downloadNote: "Gratuito · Apache-2.0 · Windows, macOS e Linux",
    getStarted: "Inizia",
    demoAria: "come funziona",
    demoCaption:
      "Copia, poi premi C ancora una volta — ciò che hai copiato diventa un risultato IA sul momento.",
    features: [
      {
        title: "Tutto ciò che puoi copiare",
        body: "Testo, testo formattato, immagini, file — screenshot e PDF viaggiano insieme fino al modello.",
      },
      {
        title: "Porta il tuo modello",
        body: "OpenAI, Google, Anthropic, un gateway aziendale o Ollama in locale — si cambia in un unico posto.",
      },
      {
        title: "Privato per progettazione",
        body: "Nessun account, nessuna telemetria, nessun server intermedio. Contenuti e chiavi vanno solo dove li indirizzi tu.",
      },
      {
        title: "Tranquillo per impostazione predefinita",
        body: "Il contenuto sensibile degli appunti viene ignorato, e un copia normale non viene mai disturbato.",
      },
    ],
    philosophy: "Lo strumento migliore è quello di cui dimentichi l'esistenza.",
    privacyLabel: "Privacy",
    termsLabel: "Termini",
  },
  pl: {
    description:
      "Skopiuj dwa razy, działaj od razu. Spokojny agent na komputer, który zamienia wszystko, co skopiujesz, w natychmiastowy wynik AI.",
    docs: "Dokumentacja",
    heroTitle: "Skopiuj dwa razy,\ndziałaj od razu.",
    metaTitle: "ZenCopy — Skopiuj dwa razy, działaj od razu.",
    download: "Pobierz",
    downloadNote: "Za darmo · Apache-2.0 · Windows, macOS i Linux",
    getStarted: "Zacznij teraz",
    demoAria: "jak to działa",
    demoCaption:
      "Skopiuj, a potem naciśnij C jeszcze raz — to, co skopiujesz, staje się na miejscu wynikiem AI.",
    features: [
      {
        title: "Wszystko, co da się skopiować",
        body: "Tekst, tekst sformatowany, obrazy, pliki — zrzuty ekranu i PDF-y trafiają do modelu razem z resztą.",
      },
      {
        title: "Twój własny model",
        body: "OpenAI, Google, Anthropic, brama firmowa albo lokalny Ollama — do podmiany w jednym miejscu.",
      },
      {
        title: "Prywatny z założenia",
        body: "Bez konta, bez telemetrii, bez serwera pośredniczącego. Treść i klucze trafiają tylko tam, gdzie je skierujesz.",
      },
      {
        title: "Domyślnie spokojny",
        body: "Wrażliwa zawartość schowka jest ignorowana, a zwykłe kopiowanie nigdy nie jest zakłócane.",
      },
    ],
    philosophy: "Najlepsze narzędzie to takie, o którego istnieniu zapominasz.",
    privacyLabel: "Prywatność",
    termsLabel: "Warunki",
  },
  ru: {
    description:
      "Скопируйте дважды — действуйте сразу. Спокойный настольный агент, который мгновенно превращает всё, что вы копируете, в результат ИИ.",
    docs: "Документация",
    heroTitle: "Скопируйте дважды —\nдействуйте сразу.",
    metaTitle: "ZenCopy — Скопируйте дважды — действуйте сразу.",
    download: "Скачать",
    downloadNote: "Бесплатно · Apache-2.0 · Windows, macOS и Linux",
    getStarted: "Начать",
    demoAria: "как это работает",
    demoCaption:
      "Скопируйте, затем нажмите C ещё раз — скопированное тут же превращается в результат ИИ.",
    features: [
      {
        title: "Всё, что можно скопировать",
        body: "Текст, форматированный текст, изображения, файлы — скриншоты и PDF отправляются модели вместе со всем остальным.",
      },
      {
        title: "Ваша собственная модель",
        body: "OpenAI, Google, Anthropic, корпоративный шлюз или локальная Ollama — переключаются в одном месте.",
      },
      {
        title: "Конфиденциальность по замыслу",
        body: "Ни аккаунта, ни телеметрии, ни промежуточного сервера. Содержимое и ключи идут только туда, куда вы укажете.",
      },
      {
        title: "Спокойствие по умолчанию",
        body: "Конфиденциальное содержимое буфера обмена игнорируется, а обычному копированию ничто никогда не мешает.",
      },
    ],
    philosophy: "Лучший инструмент — тот, о существовании которого вы забываете.",
    privacyLabel: "Конфиденциальность",
    termsLabel: "Условия",
  },
  id: {
    description:
      "Salin dua kali, langsung beraksi. Agen desktop yang tenang, mengubah apa pun yang kamu salin menjadi hasil AI seketika.",
    docs: "Dokumentasi",
    heroTitle: "Salin dua kali,\nlangsung beraksi.",
    metaTitle: "ZenCopy — Salin dua kali, langsung beraksi.",
    download: "Unduh",
    downloadNote: "Gratis · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "Mulai",
    demoAria: "cara kerjanya",
    demoCaption:
      "Salin, lalu tekan C sekali lagi — apa yang kamu salin menjadi hasil AI saat itu juga.",
    features: [
      {
        title: "Apa pun yang bisa kamu salin",
        body: "Teks, teks kaya, gambar, berkas — tangkapan layar dan PDF ikut terkirim ke model.",
      },
      {
        title: "Bawa modelmu sendiri",
        body: "OpenAI, Google, Anthropic, gateway perusahaan, atau Ollama lokal — diganti di satu tempat.",
      },
      {
        title: "Privat sejak dirancang",
        body: "Tanpa akun, tanpa telemetri, tanpa server perantara. Konten dan kunci hanya pergi ke tujuan yang kamu tentukan.",
      },
      {
        title: "Tenang secara bawaan",
        body: "Konten papan klip yang sensitif diabaikan, dan salinan biasa tidak pernah diganggu.",
      },
    ],
    philosophy: "Alat terbaik adalah alat yang membuatmu lupa bahwa ia ada.",
    privacyLabel: "Privasi",
    termsLabel: "Ketentuan",
  },
  vi: {
    description:
      "Sao chép hai lần, xử lý tức thì. Một trợ lý desktop tĩnh lặng biến bất cứ thứ gì bạn sao chép thành kết quả AI ngay lập tức.",
    docs: "Tài liệu",
    heroTitle: "Sao chép hai lần,\nxử lý tức thì.",
    metaTitle: "ZenCopy — Sao chép hai lần, xử lý tức thì.",
    download: "Tải về",
    downloadNote: "Miễn phí · Apache-2.0 · Windows, macOS & Linux",
    getStarted: "Bắt đầu",
    demoAria: "cách hoạt động",
    demoCaption:
      "Sao chép, rồi nhấn C thêm một lần — nội dung bạn vừa sao chép trở thành kết quả AI ngay tại chỗ.",
    features: [
      {
        title: "Bất cứ thứ gì bạn sao chép được",
        body: "Văn bản, văn bản định dạng, hình ảnh, tệp — ảnh chụp màn hình và PDF cũng được gửi kèm đến mô hình.",
      },
      {
        title: "Tự chọn mô hình của bạn",
        body: "OpenAI, Google, Anthropic, gateway công ty, hay Ollama chạy tại máy — đổi tất cả ở một nơi.",
      },
      {
        title: "Riêng tư ngay từ khâu thiết kế",
        body: "Không tài khoản, không telemetry, không máy chủ trung gian. Nội dung và khóa chỉ đi đến nơi bạn chỉ định.",
      },
      {
        title: "Tĩnh lặng theo mặc định",
        body: "Nội dung bộ nhớ tạm nhạy cảm bị bỏ qua, và một lần sao chép bình thường không bao giờ bị làm phiền.",
      },
    ],
    philosophy: "Công cụ tốt nhất là công cụ bạn quên mất rằng nó đang ở đó.",
    privacyLabel: "Quyền riêng tư",
    termsLabel: "Điều khoản",
  },
  th: {
    description: "คัดลอกสองครั้ง จัดการทันที เอเจนต์เดสก์ท็อปแสนสงบที่เปลี่ยนทุกสิ่งที่คุณคัดลอกให้เป็นผลลัพธ์ AI ในพริบตา",
    docs: "เอกสาร",
    heroTitle: "คัดลอกสองครั้ง\nจัดการทันที",
    metaTitle: "ZenCopy — คัดลอกสองครั้ง จัดการทันที",
    download: "ดาวน์โหลด",
    downloadNote: "ฟรี · Apache-2.0 · Windows, macOS และ Linux",
    getStarted: "เริ่มต้นใช้งาน",
    demoAria: "วิธีการทำงาน",
    demoCaption: "คัดลอก แล้วกด C อีกครั้ง — สิ่งที่คุณคัดลอกกลายเป็นผลลัพธ์ AI ตรงนั้นทันที",
    features: [
      {
        title: "อะไรก็ได้ที่คุณคัดลอกได้",
        body: "ข้อความ ข้อความแบบมีรูปแบบ รูปภาพ ไฟล์ — ภาพหน้าจอและ PDF ก็ถูกส่งไปให้โมเดลด้วย",
      },
      {
        title: "ใช้โมเดลของคุณเอง",
        body: "OpenAI, Google, Anthropic, เกตเวย์องค์กร หรือ Ollama ในเครื่อง — สลับได้จากที่เดียว",
      },
      {
        title: "เป็นส่วนตัวโดยการออกแบบ",
        body: "ไม่มีบัญชี ไม่มี telemetry ไม่มีเซิร์ฟเวอร์ตัวกลาง เนื้อหาและคีย์ไปเฉพาะที่ที่คุณกำหนดเท่านั้น",
      },
      {
        title: "สงบเป็นค่าเริ่มต้น",
        body: "เนื้อหาคลิปบอร์ดที่อ่อนไหวจะถูกละเว้น และการคัดลอกตามปกติจะไม่ถูกรบกวนเด็ดขาด",
      },
    ],
    philosophy: "เครื่องมือที่ดีที่สุด คือเครื่องมือที่คุณลืมไปเลยว่ามันอยู่ตรงนั้น",
    privacyLabel: "ความเป็นส่วนตัว",
    termsLabel: "ข้อกำหนด",
  },
  tr: {
    description:
      "İki kez kopyala, anında harekete geç. Kopyaladığın her şeyi anında bir AI sonucuna dönüştüren sakin bir masaüstü asistanı.",
    docs: "Belgeler",
    heroTitle: "İki kez kopyala,\nanında harekete geç.",
    metaTitle: "ZenCopy — İki kez kopyala, anında harekete geç.",
    download: "İndir",
    downloadNote: "Ücretsiz · Apache-2.0 · Windows, macOS ve Linux",
    getStarted: "Başla",
    demoAria: "nasıl çalışır",
    demoCaption:
      "Kopyala, sonra C'ye bir kez daha bas — kopyaladığın şey olduğu yerde bir AI sonucuna dönüşür.",
    features: [
      {
        title: "Kopyalayabildiğin her şey",
        body: "Metin, zengin metin, görseller, dosyalar — ekran görüntüleri ve PDF'ler de beraberinde modele gönderilir.",
      },
      {
        title: "Kendi modelini getir",
        body: "OpenAI, Google, Anthropic, kurumsal bir ağ geçidi ya da yerel Ollama — hepsi tek yerden değiştirilir.",
      },
      {
        title: "Tasarımı gereği gizli",
        body: "Hesap yok, telemetri yok, aktarma sunucusu yok. İçerik ve anahtarlar yalnızca senin gösterdiğin yere gider.",
      },
      {
        title: "Varsayılan olarak sakin",
        body: "Hassas pano içeriği yok sayılır ve sıradan bir kopyalamaya asla karışılmaz.",
      },
    ],
    philosophy: "En iyi araç, orada olduğunu unuttuğun araçtır.",
    privacyLabel: "Gizlilik",
    termsLabel: "Koşullar",
  },
  ar: {
    description:
      "انسخ مرتين، ونفّذ فورًا. وكيل سطح مكتب هادئ يحوّل كل ما تنسخه إلى نتيجة ذكاء اصطناعي فورية.",
    docs: "الوثائق",
    heroTitle: "انسخ مرتين،\nونفّذ فورًا.",
    metaTitle: "ZenCopy — انسخ مرتين، ونفّذ فورًا.",
    download: "تنزيل",
    downloadNote: "مجاني · Apache-2.0 · Windows وmacOS وLinux",
    getStarted: "ابدأ الآن",
    demoAria: "كيف يعمل",
    demoCaption: "انسخ ثم اضغط C مرة أخرى — يتحوّل ما نسخته إلى نتيجة ذكاء اصطناعي في الحال.",
    features: [
      {
        title: "كل ما يمكنك نسخه",
        body: "نص ونص منسّق وصور وملفات — لقطات الشاشة وملفات PDF تنتقل إلى النموذج أيضًا.",
      },
      {
        title: "أحضر نموذجك الخاص",
        body: "OpenAI أو Google أو Anthropic أو بوابة شركة أو Ollama المحلي — يُبدَّل من مكان واحد.",
      },
      {
        title: "خصوصية بالتصميم",
        body: "لا حساب ولا قياس عن بُعد ولا خادم وسيط. المحتوى والمفاتيح لا يذهبان إلا حيث توجّههما أنت.",
      },
      {
        title: "هادئ افتراضيًا",
        body: "محتوى الحافظة الحساس يُتجاهل، والنسخة العادية لا تُزعَج أبدًا.",
      },
    ],
    philosophy: "أفضل أداة هي التي تنسى وجودها.",
    privacyLabel: "الخصوصية",
    termsLabel: "الشروط",
  },
  fa: {
    description:
      "دو بار کپی کنید، بی‌درنگ اقدام کنید. عاملی آرام برای دسکتاپ که هر آنچه را کپی می‌کنید در دم به نتیجه‌ای از هوش مصنوعی تبدیل می‌کند.",
    docs: "مستندات",
    heroTitle: "دو بار کپی کنید،\nبی‌درنگ اقدام کنید.",
    metaTitle: "ZenCopy — دو بار کپی کنید، بی‌درنگ اقدام کنید.",
    download: "دانلود",
    downloadNote: "رایگان · Apache-2.0 · Windows، macOS و Linux",
    getStarted: "شروع کنید",
    demoAria: "طرز کار",
    demoCaption:
      "کپی کنید و یک بار دیگر C را فشار دهید — آنچه کپی کرده‌اید همان‌جا به نتیجه‌ای از هوش مصنوعی تبدیل می‌شود.",
    features: [
      {
        title: "هر چیزی که بتوان کپی کرد",
        body: "متن، متن قالب‌دار، تصویر، فایل — اسکرین‌شات‌ها و فایل‌های PDF هم همراه محتوا به مدل می‌روند.",
      },
      {
        title: "مدل خودتان را بیاورید",
        body: "OpenAI، Google، Anthropic، گیت‌وی سازمانی یا Ollama محلی — همه از یک جا قابل تعویض.",
      },
      {
        title: "حریم خصوصی در ذات طراحی",
        body: "بدون حساب کاربری، بدون تله‌متری، بدون سرور واسطه. محتوا و کلیدها فقط به جایی می‌روند که خودتان تعیین کرده‌اید.",
      },
      {
        title: "آرام به‌طور پیش‌فرض",
        body: "محتوای حساس کلیپ‌بورد نادیده گرفته می‌شود و کپی معمولی هرگز مختل نمی‌شود.",
      },
    ],
    philosophy: "بهترین ابزار آن است که فراموش کنید وجود دارد.",
    privacyLabel: "حریم خصوصی",
    termsLabel: "شرایط",
  },
  he: {
    description:
      "מעתיקים פעמיים, פועלים מיד. סוכן שולחן עבודה רגוע שהופך כל מה שאתם מעתיקים לתוצאת AI מיידית.",
    docs: "תיעוד",
    heroTitle: "מעתיקים פעמיים,\nפועלים מיד.",
    metaTitle: "ZenCopy — מעתיקים פעמיים, פועלים מיד.",
    download: "הורדה",
    downloadNote: "חינם · Apache-2.0 · Windows‏, macOS ו‑Linux",
    getStarted: "מתחילים",
    demoAria: "איך זה עובד",
    demoCaption: "מעתיקים, ואז מקישים C פעם אחת נוספת — מה שהעתקתם הופך לתוצאת AI בו במקום.",
    features: [
      {
        title: "כל מה שאפשר להעתיק",
        body: "טקסט, טקסט עשיר, תמונות, קבצים — גם צילומי מסך וקובצי PDF מגיעים יחד אל המודל.",
      },
      {
        title: "הביאו מודל משלכם",
        body: "OpenAI‏, Google‏, Anthropic, שער ארגוני או Ollama מקומי — ניתנים להחלפה במקום אחד.",
      },
      {
        title: "פרטי מעצם התכנון",
        body: "בלי חשבון, בלי טלמטריה, בלי שרת מתווך. תוכן ומפתחות הולכים רק לאן שאתם מכוונים אותם.",
      },
      {
        title: "רוגע כברירת מחדל",
        body: "ZenCopy מתעלם מתוכן לוח רגיש, והעתקה רגילה לעולם לא מופרעת.",
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
