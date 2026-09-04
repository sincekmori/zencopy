import type { APIRoute } from "astro";
import { iconSvg } from "../../../src/lib/brand.ts";

/** The site favicon: the app icon, verbatim, from the brand module. */
export const GET: APIRoute = () =>
  new Response(iconSvg(), { headers: { "Content-Type": "image/svg+xml" } });
