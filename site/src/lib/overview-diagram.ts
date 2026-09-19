import { INK, MARK_GRID, SLATE, markGroup } from "../../../src/lib/brand.ts";
import { type Locale, localeDir, messages } from "../../../src/lib/messages/index.ts";
import { escapeXml, FIGURE_FONT, ink, rasterize } from "./figure.ts";

/** The pre-installed prompts' own labels, off their .md frontmatter — what
 *  the app shows where a locale's messages name no label (English). */
const PROMPT_FILES = import.meta.glob("../../../src-tauri/prompts/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string | undefined>;

/**
 * ZenCopy at a glance, the figure the guide shows where it lists what the
 * app can do: what goes in on one side (a mail, a chat, a screen, a file,
 * and whatever else you copy — five boxes),
 * ZenCopy in the middle, and what comes out on the other — the five prompts
 * under their in-app names, five boxes again. The last box of each side
 * carries the same small word under its name, "anything": anything in,
 * anything asked. Drawn from the labels below at build time
 * and rasterized by the endpoint (site/src/pages/[lang]/diagrams/
 * overview.png.ts), the way og.png is, so there is no picture to keep
 * by hand and a locale gets the figure the moment its labels exist. The
 * prompt names are the app's own (messages/<locale>.ts), never a second
 * translation; the chips size themselves to the labels' ink, measured on the
 * build machine's fonts, so no language has to fit a box; and a right-to-left
 * locale reads the figure right to left — the inputs on the right, the
 * answers on the left, the arrows with them. Light theme only, like every
 * picture and video of the docs.
 */
interface OverviewLabels {
  /** What goes in: a mail, a chat, a screen, a file, whatever you copy. */
  inputs: [string, string, string, string, string];
  /** The small word under the last box of each side: anything. */
  anything: string;
}

// Every locale, held complete by the compiler as language-forms.ts is; a
// translation of the guide brings its entry here with it.
const OVERVIEW_LABELS: Record<Locale, OverviewLabels> = {
  ar: {
    inputs: ["بريد إلكتروني", "محادثة", "شاشة", "ملف", "أي نص منسوخ"],
    anything: "أي شيء",
  },
  de: {
    inputs: ["E-Mail", "Chat", "Bildschirm", "Datei", "Kopierter Text"],
    anything: "Alles",
  },
  en: {
    inputs: ["Mail", "Chat", "Screen", "File", "Whatever you copy"],
    anything: "anything",
  },
  es: {
    inputs: ["Correo", "Chat", "Pantalla", "Archivo", "Texto copiado"],
    anything: "Cualquier cosa",
  },
  fa: {
    inputs: ["ایمیل", "چت", "صفحه", "فایل", "متن کپی‌شده"],
    anything: "هر چیزی",
  },
  fr: {
    inputs: ["E-mail", "Chat", "Écran", "Fichier", "Texte copié"],
    anything: "N'importe quoi",
  },
  he: {
    inputs: ["דוא״ל", "צ'אט", "מסך", "קובץ", "טקסט מועתק"],
    anything: "כל דבר",
  },
  id: {
    inputs: ["Email", "Pesan chat", "Layar", "Berkas", "Teks tersalin"],
    anything: "Apa saja",
  },
  it: {
    inputs: ["E-mail", "Chat", "Schermo", "File", "Testo copiato"],
    anything: "Qualsiasi cosa",
  },
  ja: {
    inputs: ["メール", "チャット", "画面", "ファイル", "コピーできるもの"],
    anything: "何でも",
  },
  ko: {
    inputs: ["이메일", "채팅", "화면", "파일", "복사한 내용"],
    anything: "무엇이든",
  },
  pl: {
    inputs: ["E-mail", "Czat", "Ekran", "Plik", "Skopiowany tekst"],
    anything: "Cokolwiek",
  },
  "pt-BR": {
    inputs: ["E-mail", "Chat", "Tela", "Arquivo", "Texto copiado"],
    anything: "Qualquer coisa",
  },
  ru: {
    inputs: ["Почта", "Чат", "Экран", "Файл", "Скопированное"],
    anything: "Что угодно",
  },
  th: {
    inputs: ["อีเมล", "แชท", "หน้าจอ", "ไฟล์", "ข้อความที่คัดลอก"],
    anything: "อะไรก็ได้",
  },
  tr: {
    inputs: ["E-posta", "Sohbet", "Ekran", "Dosya", "Kopyalanan metin"],
    anything: "Her şey",
  },
  vi: {
    inputs: ["Email", "Tin nhắn", "Màn hình", "Tệp", "Văn bản đã chép"],
    anything: "Bất kỳ điều gì",
  },
  "zh-Hans": {
    inputs: ["邮件", "聊天", "屏幕", "文件", "已复制内容"],
    anything: "任何内容",
  },
  "zh-Hant": {
    inputs: ["郵件", "聊天", "螢幕", "檔案", "已複製內容"],
    anything: "任何內容",
  },
};

/** The figure is at least this wide on the page, in CSS px, and grows with
 *  a locale's longest label so the boxes keep their text size and the
 *  arrows their span; the PNG is rendered at 2×. */
const MIN_WIDTH = 640;
/** The arrows' horizontal run between a box and the card. */
const ARROW = 80;

/** The five prompts in the guide's order: their ids in the app's messages
 *  and the files they are embedded from. */
const PROMPTS = [
  ["zencopy-summarize", "summarize"],
  ["zencopy-explain", "explain"],
  ["zencopy-translate", "translate"],
  ["zencopy-polish", "polish"],
  ["zencopy-custom", "custom"],
] as const;

/** A prompt's name as the app shows it in `locale`: the locale's label, else
 *  the prompt file's own (i18n.tsx does the same). */
function promptName(locale: Locale, [id, file]: (typeof PROMPTS)[number]): string {
  const own = messages[locale].prompts.builtinLabels[id];
  if (own !== undefined) {
    return own;
  }
  const source = PROMPT_FILES[`../../../src-tauri/prompts/${file}.md`];
  const label = source === undefined ? undefined : /^label: (.+)$/mu.exec(source)?.[1];
  if (label === undefined) {
    throw new Error(`src-tauri/prompts/${file}.md has no label line`);
  }
  return label;
}

/** The figure's dimensions in CSS px — one width for every box, from the
 *  labels' ink, and the figure as wide as the boxes, the card and the arrows
 *  need (never narrower than MIN_WIDTH) — and the prompts' names in the
 *  locale, measured once: the component that embeds the figure asks for the
 *  width, and the endpoint that draws it asks again. */
export function overviewGeometry(locale: Locale): Promise<Geometry> {
  let geometry = GEOMETRY.get(locale);
  if (geometry === undefined) {
    geometry = measure(locale);
    GEOMETRY.set(locale, geometry);
  }
  return geometry;
}
interface Geometry {
  width: number;
  height: number;
  boxW: number;
  /** The five prompts' names in the locale, in the guide's order. */
  prompts: string[];
}
const GEOMETRY = new Map<Locale, Promise<Geometry>>();

async function measure(locale: Locale): Promise<Geometry> {
  const labels = OVERVIEW_LABELS[locale];
  const prompts = PROMPTS.map((prompt) => promptName(locale, prompt));
  const inks = await Promise.all([
    ...labels.inputs.map((text) => ink(text, { size: LABEL })),
    ...prompts.map((text) => ink(text, { size: LABEL })),
    ink(labels.anything, { size: SMALL }),
  ]);
  const boxW = Math.max(96, ...inks.map((run) => run.width)) + CHIP_PAD * 2;
  const width = Math.max(MIN_WIDTH, PAD * 2 + boxW * 2 + ARROW * 2 + CARD_W);
  const height = CHIP_H * 5 + CHIP_GAP * 4 + PAD * 2;
  return { width, height, boxW, prompts };
}
const LABEL = 15;
const SMALL = 12;
const PAD = 24;
/** One height for every box, two lines fitting inside it. */
const CHIP_H = 44;
const CHIP_GAP = 12;
const CHIP_PAD = 18;
const CARD_W = 128;
const CARD_H = 96;
const MARK = 36;
const GRAY = "#71717A";
const LINE = "#A1A1AA";
const BORDER = "#D4D4D8";

interface Chip {
  cx: number;
  cy: number;
  width: number;
  label: string;
  /** A second, smaller line under the label. */
  sub?: string | undefined;
}

interface Point {
  x: number;
  y: number;
}

interface Text extends Point {
  size: number;
  fill: string;
  content: string;
  weight?: number | undefined;
}

/** The figure's geometry for one reading direction: `x` mirrors a
 *  left-to-right coordinate for a right-to-left locale, and `text` sets the
 *  direction the labels are laid out in. */
class Layout {
  private readonly rtl: boolean;
  private readonly width: number;

  constructor(dir: "ltr" | "rtl", width: number) {
    this.rtl = dir === "rtl";
    this.width = width;
  }

  x(ltr: number): number {
    return this.rtl ? this.width - ltr : ltr;
  }

  /** A rounded label box centered on (cx, cy). */
  chip({ cx, cy, width, label, sub }: Chip): string {
    const x = this.x(cx) - width / 2;
    const y = cy - CHIP_H / 2;
    const labelY = sub === undefined ? cy + LABEL * 0.35 : y + 4 + LABEL;
    const subLine =
      sub === undefined
        ? ""
        : `\n  ${this.text({ x: this.x(cx), y: y + CHIP_H - 8, size: SMALL, fill: GRAY, content: sub })}`;
    return `  <rect x="${x}" y="${y}" width="${width}" height="${CHIP_H}" rx="8" fill="#fff" stroke="${BORDER}"/>
  ${this.text({ x: this.x(cx), y: labelY, size: LABEL, fill: INK, content: label })}${subLine}`;
  }

  /** An arrow between two left-to-right points, which leaves and arrives
   *  horizontally, mirrored with the rest. */
  arrow(from: Point, to: Point): string {
    const a = { x: this.x(from.x), y: from.y };
    const b = { x: this.x(to.x), y: to.y };
    const xm = (a.x + b.x) / 2;
    return `  <path d="M ${a.x} ${a.y} C ${xm} ${a.y}, ${xm} ${b.y}, ${b.x} ${b.y}" fill="none" stroke="${LINE}" stroke-width="1.5" marker-end="url(#head)"/>`;
  }

  text({ x, y, size, fill, content, weight = 400 }: Text): string {
    const dir = this.rtl ? ' direction="rtl"' : "";
    return `<text x="${x}" y="${y}" text-anchor="middle"${dir} font-family="${FIGURE_FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(content)}</text>`;
  }
}

/** The center of row `i`: five rows of one height, stacked from the top
 *  padding down — which is what the figure's height is made of. */
const rowY = (i: number): number => PAD + CHIP_H / 2 + i * (CHIP_H + CHIP_GAP);

async function overviewSvg(
  locale: Locale,
): Promise<{ svg: string; width: number; height: number }> {
  const labels = OVERVIEW_LABELS[locale];
  // One width for every box, so the two sides mirror each other exactly.
  const { width: W, height: H, boxW, prompts } = await overviewGeometry(locale);
  const cy = H / 2;
  const inX = PAD + boxW / 2;
  const outX = W - PAD - boxW / 2;
  const cardX = W / 2 - CARD_W / 2;
  const layout = new Layout(localeDir(locale), W);

  const mark = markGroup({
    color: INK,
    transform: `translate(${W / 2 - MARK / 2} ${cy - CARD_H / 2 + 14}) scale(${MARK / MARK_GRID})`,
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <marker id="head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M 0 0 L 8 4 L 0 8 z" fill="${LINE}"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="#fff"/>
${labels.inputs.map((_, i) => layout.arrow({ x: PAD + boxW, y: rowY(i) }, { x: cardX - 2, y: cy })).join("\n")}
${prompts.map((_, i) => layout.arrow({ x: cardX + CARD_W, y: cy }, { x: W - PAD - boxW - 2, y: rowY(i) })).join("\n")}
${labels.inputs.map((label, i) => layout.chip({ cx: inX, cy: rowY(i), width: boxW, label, sub: i === 4 ? labels.anything : undefined })).join("\n")}
${prompts.map((label, i) => layout.chip({ cx: outX, cy: rowY(i), width: boxW, label, sub: i === 4 ? labels.anything : undefined })).join("\n")}
  <rect x="${cardX}" y="${cy - CARD_H / 2}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="${SLATE}"/>
${mark
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
  ${layout.text({ x: W / 2, y: cy + CARD_H / 2 - 16, size: LABEL, fill: INK, content: "ZenCopy", weight: 500 })}
</svg>`;
  return { svg, width: W, height: H };
}

/** The figure as a 2× PNG. */
export async function overviewPng(locale: Locale): Promise<Buffer<ArrayBuffer>> {
  const { svg, width, height } = await overviewSvg(locale);
  return rasterize(svg, width * 2, height * 2);
}
