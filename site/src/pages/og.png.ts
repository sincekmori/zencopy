import type { APIRoute } from "astro";
import sharp from "sharp";
import { INK, MARK_GRID, SLATE, markGroup } from "../../../src/lib/brand.ts";
import { LANDING_COPY } from "../components/landing-copy.ts";

/**
 * The share card (og:image, 1200×630) for LINE / X / Slack: the mark and the
 * name on the ink, over the English tagline — the landing hero's two lines as
 * one — and a dimmer line of its own. Rendered at build time, so the card
 * follows the brand module and landing-copy.ts without a hand-kept file.
 */
const W = 1200;
const H = 630;
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";
const NAME = "ZenCopy";
const NAME_SIZE = 108;
/** The mark's box, in px; the arcs leave some room inside it. */
const MARK = 128;
const GAP = 18;
/** The line the mark and the name's capitals are centered on. */
const CENTER = 286;
const TAIL = "Talk to an AI anywhere.";

/** The name's ink width and left bearing, measured on a render of the text
 *  alone — the font is the machine's — so the pair centers exactly. */
async function inkOf(text: string): Promise<{ width: number; left: number }> {
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${NAME_SIZE * 2}"><text x="0" y="${NAME_SIZE * 1.4}" font-family="${FONT}" font-size="${NAME_SIZE}" font-weight="500" fill="#fff">${text}</text></svg>`;
  const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
  return { width: info.width, left: -(info.trimOffsetLeft ?? 0) };
}

const card = (tagline: string, name: { width: number; left: number }): string => {
  const x = (W - (MARK + GAP + name.width)) / 2;
  const mark = markGroup({
    color: SLATE,
    transform: `translate(${x} ${CENTER - MARK / 2}) scale(${MARK / MARK_GRID})`,
  });
  // Capitals are about 0.72 em tall, so their middle sits 0.36 em above the baseline.
  const baseline = CENTER + NAME_SIZE * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
${mark
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
  <text x="${x + MARK + GAP - name.left}" y="${baseline}" font-family="${FONT}" font-size="${NAME_SIZE}" font-weight="500" fill="${SLATE}">${NAME}</text>
  <text x="${W / 2}" y="440" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#A1A1AA">${tagline}</text>
  <text x="${W / 2}" y="498" text-anchor="middle" font-family="${FONT}" font-size="29" fill="#71717A">${TAIL}</text>
</svg>`;
};

export const GET: APIRoute = async () => {
  const en = LANDING_COPY.en;
  if (!en) {
    throw new Error("landing-copy.ts has no en entry");
  }
  const svg = card(en.heroTitle.replaceAll("\n", " "), await inkOf(NAME));
  const png = await sharp(Buffer.from(svg), { density: 288 }).resize(W, H).png().toBuffer();
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
