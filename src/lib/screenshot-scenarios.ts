/** The screenshot scenario registry — pure data, importable from both the
 *  browser side (components, via src/lib/screenshot.ts) and the node side
 *  (scripts/screenshot.ts), so a scenario name exists in exactly one place.
 *  `params` are the URL parameters a shot loads screenshot.html with;
 *  `viewport` overrides the runner's settings-window default (logical px)
 *  for other windows. Components react to the `screenshot` parameter via
 *  `screenshotScenario()`; the settings tab rides the generic `tab`
 *  parameter instead of one scenario per tab. */

/** `?screenshot=` values components react to. */
export const RULE_EDITOR_SCENARIO = "rule-editor";
export const PROMPT_EDITOR_SCENARIO = "prompt-editor";
export const PROMPT_IMPORT_SCENARIO = "prompt-import";
export const POPUP_RESULT_SCENARIO = "popup-result";

export const SCREENSHOT_SCENARIOS: Record<
  string,
  { params: Record<string, string>; viewport?: { width: number; height: number } }
> = {
  welcome: { params: { welcome: "1" } },
  "settings-ai": { params: {} },
  "settings-prompts": { params: { tab: "prompts" } },
  "settings-general": { params: { tab: "general" } },
  "new-rule": { params: { tab: "prompts", screenshot: RULE_EDITOR_SCENARIO } },
  "prompt-editor": { params: { tab: "prompts", screenshot: PROMPT_EDITOR_SCENARIO } },
  "prompt-import": { params: { tab: "prompts", screenshot: PROMPT_IMPORT_SCENARIO } },
  // The other two windows; viewports mirror tauri.conf.json minus title bars.
  about: { params: { window: "about" }, viewport: { width: 360, height: 412 } },
  popup: {
    params: { window: "popup", screenshot: POPUP_RESULT_SCENARIO },
    viewport: { width: 508, height: 620 },
  },
};

/** The popup scenario's conversation, per locale (the copied source stays
 *  English on purpose — summarizing a foreign text in your own language is
 *  the product story, and it matches the demo videos). Embedded strings, no
 *  model call; all of this tree-shakes out of production with the rest of
 *  the scenario machinery. */
export const POPUP_RESULT_SOURCE =
  "HTCPCP is an April Fools' protocol for controlling coffee pots over HTTP.";

export const POPUP_RESULT_FIXTURES: Record<
  string,
  { answer: string; question: string; reply: string }
> = {
  en: {
    answer: "A tongue-in-cheek HTTP extension for controlling coffee pots.",
    question: "One more detail, please.",
    reply: 'It also defines the 418 "I\'m a teapot" status code.',
  },
  ja: {
    answer: "コーヒーポットを制御するための、冗談仕立ての HTTP 拡張です。",
    question: "もう少し詳しく教えて。",
    reply: "418「I'm a teapot」というステータスコードも定義しています。",
  },
  "zh-Hans": {
    answer: "一个用于控制咖啡壶的恶搞 HTTP 扩展协议。",
    question: "再讲一个细节。",
    reply: "它还定义了 418「I'm a teapot」状态码。",
  },
  "zh-Hant": {
    answer: "一個用於控制咖啡壺的惡搞 HTTP 擴充協定。",
    question: "再講一個細節。",
    reply: "它還定義了 418「I'm a teapot」狀態碼。",
  },
  ko: {
    answer: "커피포트를 제어하기 위한 장난스러운 HTTP 확장입니다.",
    question: "조금 더 자세히 알려 줘.",
    reply: '418 "I\'m a teapot" 상태 코드도 정의하고 있습니다.',
  },
  es: {
    answer: "Una extensión humorística de HTTP para controlar cafeteras.",
    question: "Un detalle más, por favor.",
    reply: "También define el código de estado 418 «I'm a teapot».",
  },
  "pt-BR": {
    answer: "Uma extensão humorística do HTTP para controlar cafeteiras.",
    question: "Mais um detalhe, por favor.",
    reply: 'Ela também define o código de status 418 "I\'m a teapot".',
  },
  fr: {
    answer: "Une extension humoristique de HTTP pour piloter des cafetières.",
    question: "Un détail de plus, s'il te plaît.",
    reply: "Elle définit aussi le code d'état 418 « I'm a teapot ».",
  },
  de: {
    answer: "Eine augenzwinkernde HTTP-Erweiterung zum Steuern von Kaffeekannen.",
    question: "Noch ein Detail, bitte.",
    reply: "Sie definiert auch den Statuscode 418 „I'm a teapot“.",
  },
  it: {
    answer: "Un'estensione scherzosa di HTTP per controllare le caffettiere.",
    question: "Ancora un dettaglio, per favore.",
    reply: 'Definisce anche il codice di stato 418 "I\'m a teapot".',
  },
  pl: {
    answer: "Żartobliwe rozszerzenie HTTP do sterowania ekspresami do kawy.",
    question: "Poproszę jeszcze jeden szczegół.",
    reply: "Definiuje też kod stanu 418 „I'm a teapot”.",
  },
  ru: {
    answer: "Шуточное расширение HTTP для управления кофейниками.",
    question: "Ещё одну деталь, пожалуйста.",
    reply: "Оно также определяет код состояния 418 «I'm a teapot».",
  },
  id: {
    answer: "Ekstensi HTTP lelucon untuk mengendalikan teko kopi.",
    question: "Satu detail lagi, ya.",
    reply: 'Protokol ini juga mendefinisikan kode status 418 "I\'m a teapot".',
  },
  vi: {
    answer: "Một phần mở rộng HTTP mang tính đùa vui để điều khiển bình pha cà phê.",
    question: "Cho mình thêm một chi tiết nữa.",
    reply: 'Nó cũng định nghĩa mã trạng thái 418 "I\'m a teapot".',
  },
  th: {
    answer: "ส่วนขยาย HTTP เชิงล้อเล่นสำหรับควบคุมหม้อต้มกาแฟ",
    question: "ขอรายละเอียดอีกหนึ่งอย่าง",
    reply: 'ยังกำหนดรหัสสถานะ 418 "I\'m a teapot" ไว้ด้วย',
  },
  tr: {
    answer: "Kahve demliklerini kontrol etmek için şaka amaçlı bir HTTP uzantısı.",
    question: "Bir ayrıntı daha lütfen.",
    reply: 'Ayrıca 418 "I\'m a teapot" durum kodunu da tanımlar.',
  },
  ar: {
    answer: "امتداد HTTP ساخر للتحكم في أباريق القهوة.",
    question: "فضلًا، تفصيلة أخرى.",
    reply: "كما يعرّف رمز الحالة 418 «I'm a teapot».",
  },
  fa: {
    answer: "یک افزونهٔ شوخی‌آمیز HTTP برای کنترل قهوه‌جوش‌ها.",
    question: "یک نکته دیگر، لطفاً.",
    reply: "همچنین کد وضعیت ۴۱۸ «I'm a teapot» را تعریف می‌کند.",
  },
  he: {
    answer: "הרחבת HTTP היתולית לשליטה בקנקני קפה.",
    question: "עוד פרט אחד, בבקשה.",
    reply: 'היא גם מגדירה את קוד הסטטוס 418 "I\'m a teapot".',
  },
};
