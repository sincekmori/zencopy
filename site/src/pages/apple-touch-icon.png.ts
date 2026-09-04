import type { APIRoute } from "astro";
import sharp from "sharp";
import { iconSvg } from "../../../src/lib/brand.ts";

/** The iOS home-screen icon: the app icon, rendered at build time. */
export const GET: APIRoute = async () => {
  const png = await sharp(Buffer.from(iconSvg()), { density: 288 })
    .resize(180, 180)
    .png()
    .toBuffer();
  return new Response(png, { headers: { "Content-Type": "image/png" } });
};
