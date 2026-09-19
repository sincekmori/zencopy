import type { APIRoute, GetStaticPaths } from "astro";
import { type Locale, LOCALES } from "../../../../../src/lib/messages/index.ts";
import { overviewPng } from "../../../lib/overview-diagram.ts";

/** One PNG per locale, at the lowercase path the docs use
 *  (/ja/diagrams/overview.png); rendered at build like og.png. */
export const getStaticPaths: GetStaticPaths = () =>
  LOCALES.map(({ value }) => ({ params: { lang: value.toLowerCase() }, props: { locale: value } }));

export const GET: APIRoute<{ locale: Locale }> = async ({ props }) =>
  new Response(await overviewPng(props.locale), { headers: { "Content-Type": "image/png" } });
