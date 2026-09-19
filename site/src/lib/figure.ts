import sharp from "sharp";

/** What a figure the site draws at build is made of — the share card
 *  (og.png), the iOS icon, the docs' overview: an SVG string, its text
 *  measured and rasterized by sharp on the build machine's fonts. */

/** The type of a drawn figure: the machine's Helvetica for Latin, Hiragino
 *  Sans for CJK, and whatever the list finds after. */
export const FIGURE_FONT = "Helvetica Neue, Helvetica, Hiragino Sans, Arial, sans-serif";

/** Text as an SVG string takes it, in content or in an attribute. */
export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** A run of text's ink, off a render of it alone: its width, and how far the
 *  ink starts right of the text's origin (its left bearing; negative when
 *  the ink begins left of it). */
export async function ink(
  text: string,
  type: { size: number; weight?: number },
): Promise<{ width: number; left: number }> {
  const { size, weight = 400 } = type;
  const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${size * 2}"><text x="${size}" y="${size * 1.4}" font-family="${FIGURE_FONT}" font-size="${size}" font-weight="${weight}" fill="#000">${escapeXml(text)}</text></svg>`;
  const { info } = await sharp(Buffer.from(probe)).trim().toBuffer({ resolveWithObject: true });
  return { width: info.width, left: -(info.trimOffsetLeft ?? 0) - size };
}

/** An SVG as a PNG of `width` × `height` pixels, drawn at four times the
 *  size and brought down, so edges and type come out smooth. */
export function rasterize(
  svg: string,
  width: number,
  height: number,
): Promise<Buffer<ArrayBuffer>> {
  return sharp(Buffer.from(svg), { density: 288 }).resize(width, height).png().toBuffer();
}
