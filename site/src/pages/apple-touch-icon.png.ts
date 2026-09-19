import type { APIRoute } from "astro";
import { iconSvg } from "../../../src/lib/brand.ts";
import { rasterize } from "../lib/figure.ts";

/** The iOS home-screen icon: the app icon, rendered at build time. */
export const GET: APIRoute = async () =>
  new Response(await rasterize(iconSvg(), 180, 180), { headers: { "Content-Type": "image/png" } });
