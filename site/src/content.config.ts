import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // UI-string overrides (src/content/i18n/<bcp47>.json). Used to rename the
  // theme picker's options to the app's own wording (システム / ライト / ダーク),
  // so the docs, the landing page, and the app all name them identically.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
