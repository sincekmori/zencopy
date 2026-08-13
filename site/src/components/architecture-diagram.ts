/** The full data-flow diagram on the docs' onboarding page, as a pure
 *  SVG-string function so every locale can pass its own labels.
 *
 *  It shows every flow in the product: the copy-twice trigger, what ZenCopy
 *  does with a capture, the single direct connection to the chosen AI, what
 *  comes back to the popup, and what is stored where. The AI box carries no
 *  location zone on purpose: the chosen AI may live on the internet, inside a
 *  company network, or on the machine itself (Ollama). Line styles carry
 *  meaning: solid lines are data flows, the dashed rounded frame is the
 *  machine boundary.
 *
 *  Layout is computed from the labels: column widths and arrow gaps grow to
 *  fit the longest label (text never wraps). The minimum sizes are calibrated
 *  to the German labels — the longest of our locales — so every locale
 *  renders at one shared size; a locale that measures longer still grows past
 *  these floors. Vertical geometry is fixed per locale.
 *
 *  RTL locales pass dir: "rtl": the topology mirrors horizontally (the screen
 *  on the right, the AI on the left, flows running right to left), the root
 *  carries direction="rtl" so mixed-script labels keep their word order, and
 *  the step badges move to the start (right) side of their labels. The brand
 *  lockup ({mark} ZenCopy) stays LTR — it is a wordmark, not prose.
 */

export type DiagramDir = "ltr" | "rtl";

export interface ArchitectureLabels {
  /** Accessible one-sentence description of the whole diagram. */
  alt: string;
  /** Zone label of the machine boundary ("your computer"). */
  pcZone: string;
  /** Title of the screen box and what a copy can carry. */
  screen: string;
  screenSub: string;
  /** Flow ①: the copy-twice trigger. */
  flowCopy: string;
  /** The three things ZenCopy does with a capture (one line each). */
  zcStep1: string;
  zcStep2: string;
  zcStep3: string;
  /** Flow ③: the outbound request, plus its two annotation lines. */
  flowSend: string;
  flowSendNote1: string;
  flowSendNote2: string;
  /** Flow ④: the streamed answer. */
  flowAnswer: string;
  /** Title of the AI box and its provider examples (one line each). */
  ai: string;
  aiLine1: string;
  aiLine2: string;
  aiLine3: string;
  aiLine4: string;
  /** Flow ⑤: showing the answer. Flow ⑦: the follow-up conversation. */
  flowShow: string;
  flowReply: string;
  /** Title of the popup box, where it appears, and the not-persisted note. */
  popup: string;
  popupSub: string;
  popupNote: string;
  /** Flows ② and ⑥: reading from and writing to local storage. */
  storageRead: string;
  storageWrite: string;
  /** Title of the storage box and its content lines (one line each). */
  storage: string;
  storageLine1: string;
  storageLine2: string;
  storageLine3: string;
  /** Notes under the storage box (logs keep no copies; nothing is sent). */
  storageNote1: string;
  storageNote2: string;
}

const TITLE_SIZE = 16;
const LINE_SIZE = 12.5;
const SUB_SIZE = 13;
const NOTE_SIZE = 11.5;
const FLOW_SIZE = 13;
const STORAGE_TITLE_SIZE = 13.5;

// Minimum column and gap widths, calibrated to the longest labels across
// all 19 locales (see architecture-labels.ts) so every locale shares one
// overall size (see the module comment).
const MIN_COL_A_W = 294;
const MIN_CENTER_W = 314;
const MIN_AI_W = 267;
const MIN_GAP1 = 287;
const MIN_GAP2 = 366;

// The ZenCopy brand mark + wordmark, measured once in the webview (icon bbox
// and bold-16px text width) and centered via these fixed offsets from the
// box's horizontal center.
const ZC_ICON_DX = -46.5;
const ZC_TEXT_DX = -23.5;
const ZC_BLOCK_W = 92;

/** East Asian wide/fullwidth ranges — such characters advance ~1 em; the rest
 *  is estimated at 0.62 em, a deliberate overestimate for proportional Latin
 *  so boxes err toward roomy, never toward clipping. */
const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

function estimateWidth(text: string, fontSize: number, bold = false): number {
  let em = 0;
  for (const ch of text) {
    em += WIDE_CHAR.test(ch) ? 1 : 0.62;
  }
  return em * fontSize * (bold ? 1.05 : 1);
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function architectureDiagram(l: ArchitectureLabels, dir: DiagramDir = "ltr"): string {
  const ink = "var(--sl-color-white, #111827)";
  const line = "var(--sl-color-gray-2, #4b5563)";
  const frame = "var(--sl-color-gray-4, #9ca3af)";
  const faint = "var(--sl-color-gray-5, #c4c7cc)";

  // Column and gap widths, grown to fit the labels.
  const colAW = Math.ceil(
    Math.max(
      MIN_COL_A_W,
      estimateWidth(l.screen, TITLE_SIZE) + 28,
      estimateWidth(l.screenSub, SUB_SIZE) + 28,
      estimateWidth(l.popup, TITLE_SIZE) + 28,
      estimateWidth(l.popupSub, SUB_SIZE) + 28,
      estimateWidth(l.popupNote, NOTE_SIZE),
    ),
  );
  // ZenCopy and the storage box form one column and share one width.
  const centerW = Math.ceil(
    Math.max(
      MIN_CENTER_W,
      ZC_BLOCK_W + 28,
      estimateWidth(l.zcStep1, LINE_SIZE) + 28,
      estimateWidth(l.zcStep2, LINE_SIZE) + 28,
      estimateWidth(l.zcStep3, LINE_SIZE) + 28,
      estimateWidth(l.storage, STORAGE_TITLE_SIZE, true) + 32,
      estimateWidth(l.storageLine1, LINE_SIZE) + 32,
      estimateWidth(l.storageLine2, LINE_SIZE) + 32,
      estimateWidth(l.storageLine3, LINE_SIZE) + 32,
      estimateWidth(l.storageNote1, NOTE_SIZE),
      estimateWidth(l.storageNote2, NOTE_SIZE),
    ),
  );
  const aiW = Math.ceil(
    Math.max(
      MIN_AI_W,
      estimateWidth(l.ai, TITLE_SIZE) + 28,
      estimateWidth(l.aiLine1, LINE_SIZE) + 28,
      estimateWidth(l.aiLine2, LINE_SIZE) + 28,
      estimateWidth(l.aiLine3, LINE_SIZE) + 28,
      estimateWidth(l.aiLine4, LINE_SIZE) + 48,
    ),
  );
  const gap1 = Math.ceil(
    Math.max(
      MIN_GAP1,
      estimateWidth(l.flowCopy, FLOW_SIZE, true) + 58,
      estimateWidth(l.flowShow, FLOW_SIZE, true) + 58,
      estimateWidth(l.flowReply, FLOW_SIZE, true) + 58,
    ),
  );
  const gap2 = Math.ceil(
    Math.max(
      MIN_GAP2,
      estimateWidth(l.flowSend, FLOW_SIZE, true) + 58,
      estimateWidth(l.flowAnswer, FLOW_SIZE, true) + 58,
      estimateWidth(l.flowSendNote1, NOTE_SIZE) + 16,
      estimateWidth(l.flowSendNote2, NOTE_SIZE) + 16,
    ),
  );

  // Horizontal positions.
  const screenX = 48;
  const zcX = screenX + colAW + gap1;
  const zcRight = zcX + centerW;
  const rwX = zcX + centerW / 2;
  const writeLabelRight = rwX + 38.5 + estimateWidth(l.storageWrite, FLOW_SIZE, true);
  const pcRight = Math.max(zcRight, writeLabelRight) + 16;
  const aiX = Math.max(zcRight + gap2, pcRight + 68);
  const width = aiX + aiW + 24;
  const height = 640;

  // Emit-time mirroring: layout is computed in LTR coordinates and flipped
  // here. Anchored text keeps logical anchors — with direction="rtl" on the
  // root, "start" means the right side, so mirrored x values line up.
  const rtl = dir === "rtl";
  const mx = (x: number): number => (rtl ? width - x : x);
  const mrx = (x: number, w: number): number => (rtl ? width - x - w : x);

  const cxA = screenX + colAW / 2;
  const cxZc = zcX + centerW / 2;
  const cxAi = aiX + aiW / 2;
  const gap1Mid = (screenX + colAW + zcX) / 2;
  const gap2Mid = (zcRight + aiX) / 2;
  // Badge-label blocks beside the vertical storage arrows: the read label's
  // right edge and the write label's badge sit 16px off their lines.
  const rwReadX = rwX - 16 - estimateWidth(l.storageRead, FLOW_SIZE, true) / 2 - 11;
  const rwWriteX = rwX + 16 + 22.5 + estimateWidth(l.storageWrite, FLOW_SIZE, true) / 2 - 11;

  interface BoxSpec {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const box = ({ x, y, w, h }: BoxSpec): string =>
    `<rect x="${mrx(x, w)}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${frame}" stroke-width="1.2"/>`;
  interface FlowSpec {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  const flow = ({ x1, y1, x2, y2 }: FlowSpec): string =>
    `<line x1="${mx(x1)}" y1="${y1}" x2="${mx(x2)}" y2="${y2}" stroke="${line}" stroke-width="1.5" marker-end="url(#zc-arrow)"/>`;
  interface FlowLabelSpec {
    x: number;
    y: number;
    n: number;
    text: string;
  }
  // The step number is drawn as a circle badge, not written into the label —
  // circled-number glyphs (①②…) are CJK-specific typography, while a drawn
  // badge with a plain digit reads the same in every locale.
  const flowLabel = ({ x, y, n, text }: FlowLabelSpec): string => {
    const half = estimateWidth(text, FLOW_SIZE, true) / 2;
    const tx = rtl ? mx(x) - 11 : x + 11;
    const bx = rtl ? tx + half + 14 : tx - half - 14;
    return `<circle cx="${bx}" cy="${y - 4.5}" r="8.5" fill="none" stroke="${line}" stroke-width="1.2"/>
  <text x="${bx}" y="${y - 0.8}" font-size="11" font-weight="700" text-anchor="middle" fill="${ink}">${n}</text>
  <text x="${tx}" y="${y}" font-size="${FLOW_SIZE}" font-weight="700" text-anchor="middle" fill="${ink}">${escapeXml(text)}</text>`;
  };
  interface NoteSpec {
    x: number;
    y: number;
    text: string;
  }
  const note = ({ x, y, text }: NoteSpec): string =>
    `<text x="${mx(x)}" y="${y}" font-size="${NOTE_SIZE}" fill="${line}">${escapeXml(text)}</text>`;
  interface CenteredSpec {
    x: number;
    y: number;
    size: number;
    text: string;
    color?: string;
  }
  const centered = ({ x, y, size, text, color }: CenteredSpec): string =>
    `<text x="${mx(x)}" y="${y}" font-size="${size}" text-anchor="middle" fill="${color ?? line}">${escapeXml(text)}</text>`;

  return `<svg id="zc-arch" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif"${rtl ? ' direction="rtl"' : ""} role="img" aria-label="${escapeXml(l.alt)}">
  <defs>
    <marker id="zc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </marker>
  </defs>

  <rect x="${mrx(24, pcRight - 24)}" y="48" width="${pcRight - 24}" height="564" rx="16" fill="none" stroke="${faint}" stroke-width="1.2" stroke-dasharray="4 6"/>
  <text x="${mx(44)}" y="78" font-size="13" font-weight="700" fill="${line}">${escapeXml(l.pcZone)}</text>

  ${box({ x: screenX, y: 116, w: colAW, h: 76 })}
  ${centered({ x: cxA, y: 148, size: TITLE_SIZE, text: l.screen, color: ink })}
  ${centered({ x: cxA, y: 172, size: SUB_SIZE, text: l.screenSub })}

  ${flow({ x1: screenX + colAW, y1: 154, x2: zcX, y2: 154 })}
  ${flowLabel({ x: gap1Mid, y: 138, n: 1, text: l.flowCopy })}

  ${box({ x: zcX, y: 116, w: centerW, h: 200 })}
  <g transform="translate(${mx(cxZc) + ZC_ICON_DX} 155)" stroke="${ink}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <g transform="scale(0.75)">
      <path d="M12.22 3.39A6.5 6.5 0 0 0 3.89 11.72"/>
      <path d="M20.32 10.77A6.5 6.5 0 1 0 20.32 18.23"/>
    </g>
  </g>
  <text x="${mx(cxZc) + ZC_TEXT_DX}" y="170" font-size="${TITLE_SIZE}" font-weight="700" direction="ltr" fill="${ink}">ZenCopy</text>
  ${centered({ x: cxZc, y: 216, size: LINE_SIZE, text: l.zcStep1 })}
  ${centered({ x: cxZc, y: 240, size: LINE_SIZE, text: l.zcStep2 })}
  ${centered({ x: cxZc, y: 264, size: LINE_SIZE, text: l.zcStep3 })}

  ${flow({ x1: zcRight, y1: 180, x2: aiX, y2: 180 })}
  ${flowLabel({ x: gap2Mid, y: 164, n: 3, text: l.flowSend })}
  ${centered({ x: gap2Mid, y: 210, size: NOTE_SIZE, text: l.flowSendNote1 })}
  ${centered({ x: gap2Mid, y: 226, size: NOTE_SIZE, text: l.flowSendNote2 })}
  ${flow({ x1: aiX, y1: 252, x2: zcRight, y2: 252 })}
  ${flowLabel({ x: gap2Mid, y: 274, n: 4, text: l.flowAnswer })}

  ${box({ x: aiX, y: 116, w: aiW, h: 200 })}
  ${centered({ x: cxAi, y: 170, size: TITLE_SIZE, text: l.ai, color: ink })}
  ${centered({ x: cxAi, y: 204, size: LINE_SIZE, text: l.aiLine1 })}
  ${centered({ x: cxAi, y: 224, size: LINE_SIZE, text: l.aiLine2 })}
  ${centered({ x: cxAi, y: 244, size: LINE_SIZE, text: l.aiLine3 })}
  <rect x="${mx(cxAi) - (estimateWidth(l.aiLine4, LINE_SIZE) + 20) / 2}" y="256" width="${estimateWidth(l.aiLine4, LINE_SIZE) + 20}" height="26" rx="6" fill="none" stroke="${faint}" stroke-width="1.2" stroke-dasharray="4 6"/>
  ${centered({ x: cxAi, y: 273, size: LINE_SIZE, text: l.aiLine4 })}

  ${flow({ x1: zcX, y1: 262, x2: screenX + colAW, y2: 262 })}
  ${flowLabel({ x: gap1Mid, y: 246, n: 5, text: l.flowShow })}
  ${flow({ x1: screenX + colAW, y1: 294, x2: zcX, y2: 294 })}
  ${flowLabel({ x: gap1Mid, y: 316, n: 7, text: l.flowReply })}

  ${box({ x: screenX, y: 240, w: colAW, h: 76 })}
  ${centered({ x: cxA, y: 272, size: TITLE_SIZE, text: l.popup, color: ink })}
  ${centered({ x: cxA, y: 296, size: SUB_SIZE, text: l.popupSub })}
  ${note({ x: screenX, y: 340, text: l.popupNote })}

  ${flow({ x1: rwX - 12, y1: 420, x2: rwX - 12, y2: 316 })}
  ${flowLabel({ x: rwReadX, y: 372, n: 2, text: l.storageRead })}
  ${flow({ x1: rwX + 12, y1: 316, x2: rwX + 12, y2: 420 })}
  ${flowLabel({ x: rwWriteX, y: 372, n: 6, text: l.storageWrite })}


  ${box({ x: zcX, y: 420, w: centerW, h: 122 })}
  <text x="${mx(cxZc)}" y="448" font-size="${STORAGE_TITLE_SIZE}" font-weight="700" text-anchor="middle" fill="${ink}">${escapeXml(l.storage)}</text>
  ${centered({ x: cxZc, y: 476, size: LINE_SIZE, text: l.storageLine1 })}
  ${centered({ x: cxZc, y: 498, size: LINE_SIZE, text: l.storageLine2 })}
  ${centered({ x: cxZc, y: 520, size: LINE_SIZE, text: l.storageLine3 })}
  ${note({ x: zcX, y: 566, text: l.storageNote1 })}
  ${note({ x: zcX, y: 582, text: l.storageNote2 })}
</svg>`;
}
