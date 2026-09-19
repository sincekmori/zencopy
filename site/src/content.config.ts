import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { plainModifier } from "../../src/lib/modifier.ts";

const FRONTMATTER = z.object({ description: z.string().transform(plainModifier).optional() });

export const collections = {
  // A page's frontmatter reaches only text-only places — the meta description
  // and its Open Graph and Twitter twins, which search engines and link
  // previews read without running a script, and the llms.txt files — so a
  // description writes `{mod}` where the modifier goes, as the landing copy
  // does, and is spelled the neutral way (Ctrl/⌘, src/lib/modifier.ts) as the
  // collection loads, before anything reads it.
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: FRONTMATTER }) }),
  // UI-string overrides (src/content/i18n/<bcp47>.json). Used to rename the
  // theme picker's options to the app's own wording (システム / ライト / ダーク),
  // so the docs, the landing page, and the app all name them identically.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
