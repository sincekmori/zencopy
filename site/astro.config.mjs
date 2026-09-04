// @ts-check
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";
import { remarkHeadingId } from "remark-custom-heading-id";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import { LANDING_LOCALES } from "./src/components/landing-copy.ts";

// A soft line break inside a paragraph renders as a space. Between English
// words that is the point; after a Japanese (or Chinese) sentence it is a
// visible gap, and the docs keep one sentence per line on purpose (Semantic
// Line Breaks). So a break is dropped wherever the character before it or
// the character after it is CJK — an ideograph, kana, or fullwidth
// punctuation, so 「回。」 followed by 「10 分」 joins too — and kept
// everywhere else (Korean spaces its words, so Hangul is deliberately not in
// the class). Prose only: code blocks, inline code, raw HTML and MDX
// expressions keep every newline they have.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF]/u;
/** @typedef {{ type: string, value?: string, children?: TextTree[] }} TextTree */
/**
 * The first (`edge` = 0) or last (`edge` = -1) character of a node's text.
 * @param {TextTree | undefined} node
 * @param {0 | -1} edge
 * @returns {string}
 */
function edgeChar(node, edge) {
  if (node === undefined) {
    return "";
  }
  if (typeof node.value === "string") {
    return node.value.at(edge) ?? "";
  }
  const children = node.children ?? [];
  return edgeChar(children.at(edge), edge);
}
/**
 * @param {TextTree} node
 * @param {TextTree | undefined} parent
 * @param {number} index
 */
function joinCjkLines(node, parent, index) {
  const { value } = node;
  if (node.type === "text" && typeof value === "string") {
    const siblings = parent?.children ?? [];
    node.value = value.replaceAll("\n", (_match, offset) => {
      const before = offset > 0 ? value[offset - 1] : edgeChar(siblings[index - 1], -1);
      const after =
        offset + 1 < value.length ? value[offset + 1] : edgeChar(siblings[index + 1], 0);
      return CJK.test(before ?? "") || CJK.test(after ?? "") ? "" : "\n";
    });
    return;
  }
  (node.children ?? []).forEach((child, childIndex) => {
    joinCjkLines(child, node, childIndex);
  });
}
/** @returns {(tree: TextTree) => void} */
const remarkJoinCjkLines = () => (tree) => {
  joinCjkLines(tree, undefined, 0);
};

// Derived from LANDING_LOCALES so the docs and the landing page share one
// locale list (code, label, lang, dir) — and one order.
const locales = Object.fromEntries(
  LANDING_LOCALES.map(({ code, label, lang, dir }) => [code, { label, lang, dir }]),
);

// https://astro.build/config
export default defineConfig({
  site: "https://zencopy.app",
  markdown: {
    // rehype plugins only run on the unified pipeline, so it is selected
    // explicitly (the top-level rehypePlugins shorthand is deprecated, and
    // Astro's default Sätteri pipeline cannot host rehype).
    processor: unified({
      // Translated pages carry the English page's heading anchors explicitly
      // (`## 見出し {#english-slug}`), so section links are locale-invariant;
      // English keeps auto-generated slugs, and starlight-links-validator
      // fails the build wherever a rename leaves a stale anchor behind.
      remarkPlugins: [remarkHeadingId, remarkJoinCjkLines],
      // External links leave the docs in a new tab; in-site navigation stays
      // in the same tab. rel guards the opener even where browsers don't
      // imply it.
      rehypePlugins: [[rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }]],
    }),
  },
  integrations: [
    starlight({
      title: "ZenCopy",
      description:
        "Instant AI. Right on your screen. A calm desktop agent that turns whatever you copy into an instant AI result.",
      logo: {
        // The brand SVGs live once, in the repo root's src/assets/ — the site
        // imports them across the project boundary instead of keeping copies.
        light: "../src/assets/zencopy-logo.svg",
        dark: "../src/assets/zencopy-logo-dark.svg",
        replacesTitle: true,
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/sincekmori/zencopy" }],
      head: [
        // Share card for LINE / X / Slack …: Starlight already emits og:title,
        // og:description, and twitter:card, but the image must be ours.
        // Regenerate public/og.png with `bun run brand` after editing og.svg.
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://zencopy.app/og.png" },
        },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "ZenCopy — Instant AI. Right on your screen.",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "https://zencopy.app/og.png" },
        },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
        // Progressive enhancement for the visitor's OS: elements marked
        // data-os-modifier show their own key (⌘ or Ctrl), elements with
        // data-os-windows / -mac / -linux (the OsText component) show their
        // own variant of a phrase, and the "os" synced tabs get pre-selected
        // on first visit (a manual choice then wins — Starlight persists it
        // under the same key). Other OSes and no-JS keep the combined
        // fallback wording and the first tab.
        {
          tag: "script",
          content: [
            "(() => {",
            "  const ua = navigator.userAgent;",
            "  const isMac = /Mac|iP(hone|ad|od)/.test(ua);",
            "  const isLinux = /Linux|X11/.test(ua) && !/Android/.test(ua);",
            "  if (!isMac && !isLinux && !/Windows/.test(ua)) return;",
            '  const tabKey = "starlight-synced-tabs__os";',
            "  try {",
            "    if (!localStorage.getItem(tabKey)) {",
            '      localStorage.setItem(tabKey, isMac ? "macOS" : isLinux ? "Linux" : "Windows");',
            "    }",
            "  } catch {",
            "    // Storage blocked (Safari with cookies off, some sandboxes): the",
            "    // tabs keep their first pane; the wording below still swaps.",
            "  }",
            "  const swap = () => {",
            '    for (const el of document.querySelectorAll("[data-os-modifier]")) {',
            '      el.textContent = isMac ? "⌘" : "Ctrl";',
            "    }",
            '    const os = isMac ? "mac" : isLinux ? "linux" : "windows";',
            '    for (const el of document.querySelectorAll("[data-os-windows]")) {',
            '      const own = el.getAttribute("data-os-" + os);',
            "      if (own) el.textContent = own;",
            "    }",
            "  };",
            '  if (document.readyState === "loading") {',
            '    document.addEventListener("DOMContentLoaded", swap);',
            "  } else {",
            "    swap();",
            "  }",
            "})();",
          ].join("\n"),
        },
        // The header selects (theme, language) are sized to the label they
        // currently show, not to their widest option — a native <select>'s
        // auto width fits the widest option, which leaves an ugly gap between
        // a short label ("日本語") and the caret when a sibling option is as
        // long as "Português (Brasil)". Measured with a hidden span in the
        // select's own font; re-measured on change (the theme label swaps in
        // place). No-JS falls back to the auto width set in custom.css.
        {
          tag: "script",
          content: [
            "(() => {",
            "  const fit = (sel) => {",
            "    const opt = sel.selectedOptions[0];",
            "    if (!opt) return;",
            "    const cs = getComputedStyle(sel);",
            '    const probe = document.createElement("span");',
            "    probe.style.font = cs.font;",
            '    probe.style.visibility = "hidden";',
            '    probe.style.position = "absolute";',
            '    probe.style.whiteSpace = "pre";',
            "    probe.textContent = opt.textContent.trim();",
            "    document.body.append(probe);",
            "    const text = probe.getBoundingClientRect().width;",
            "    probe.remove();",
            "    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);",
            '    sel.style.width = Math.ceil(text + pad) + 1 + "px";',
            "  };",
            "  const init = () => {",
            "    for (const sel of document.querySelectorAll(",
            '      "starlight-theme-select select, starlight-lang-select select",',
            "    )) {",
            "      fit(sel);",
            '      sel.addEventListener("change", () => fit(sel));',
            "    }",
            "  };",
            '  if (document.readyState === "loading") {',
            '    document.addEventListener("DOMContentLoaded", init);',
            "  } else {",
            "    init();",
            "  }",
            "})();",
          ].join("\n"),
        },
      ],
      // No root locale: every app locale lives under /<code>/, and the bare /
      // is answered by the Cloudflare Worker (worker.ts) with a 302 to the
      // locale matching the visitor's Accept-Language.
      defaultLocale: "en",
      locales,
      sidebar: [
        {
          label: "Getting started",
          translations: {
            ar: "البدء",
            de: "Erste Schritte",
            es: "Primeros pasos",
            fa: "شروع کار",
            fr: "Premiers pas",
            he: "צעדים ראשונים",
            id: "Memulai",
            it: "Per iniziare",
            ja: "はじめる",
            ko: "시작하기",
            pl: "Pierwsze kroki",
            "pt-BR": "Primeiros passos",
            ru: "Начало работы",
            th: "เริ่มต้นใช้งาน",
            tr: "Başlarken",
            vi: "Bắt đầu sử dụng",
            "zh-CN": "快速上手",
            "zh-TW": "快速上手",
          },
          slug: "getting-started",
        },
        {
          label: "Configuration",
          translations: {
            ar: "الإعدادات والتخصيص",
            de: "Konfiguration",
            es: "Configuración",
            fa: "پیکربندی",
            fr: "Configuration",
            he: "הגדרות",
            id: "Konfigurasi",
            it: "Configurazione",
            ja: "設定",
            ko: "설정",
            pl: "Konfiguracja",
            "pt-BR": "Configuração",
            ru: "Настройка",
            th: "การตั้งค่า",
            tr: "Yapılandırma",
            vi: "Cấu hình",
            "zh-CN": "配置",
            "zh-TW": "設定",
          },
          slug: "configuration",
        },
        {
          label: "FAQ",
          translations: {
            ar: "الأسئلة الشائعة",
            es: "Preguntas frecuentes",
            fa: "پرسش‌های متداول",
            he: "שאלות נפוצות",
            "pt-BR": "Perguntas frequentes",
            ru: "Частые вопросы",
            th: "คำถามที่พบบ่อย",
            tr: "SSS",
            vi: "Câu hỏi thường gặp",
            "zh-TW": "常見問題",
          },
          slug: "faq",
        },
        {
          label: "Support",
          translations: {
            ar: "الدعم",
            de: "Support",
            es: "Soporte",
            fa: "پشتیبانی",
            fr: "Assistance",
            he: "תמיכה",
            id: "Dukungan",
            it: "Supporto",
            ja: "サポート",
            ko: "지원",
            pl: "Wsparcie",
            "pt-BR": "Suporte",
            ru: "Поддержка",
            th: "การสนับสนุน",
            tr: "Destek",
            vi: "Hỗ trợ",
            "zh-CN": "支持",
            "zh-TW": "支援",
          },
          slug: "support",
        },
        // The Svelte-style wink at machine readers: the sidebar entry is
        // the page title, a first-person self-identification.
        {
          label: "Recipes",
          translations: {
            ar: "الوصفات",
            de: "Rezepte",
            es: "Recetas",
            fa: "نمونه‌های آماده",
            fr: "Recettes",
            he: "מתכונים",
            id: "Resep",
            it: "Ricette",
            ja: "設定ファイル（上級者向け）",
            ko: "레시피",
            pl: "Przepisy",
            "pt-BR": "Receitas",
            ru: "Рецепты",
            th: "สูตรสำเร็จ",
            tr: "Tarifler",
            vi: "Cấu hình mẫu",
            "zh-CN": "配置示例",
            "zh-TW": "設定範例",
          },
          slug: "recipes",
        },
        {
          label: "Are you an LLM?",
          translations: {
            ar: "هل أنت LLM؟",
            de: "Bist du ein LLM?",
            es: "¿Eres un LLM?",
            fa: "آیا شما یک LLM هستید؟",
            fr: "Êtes-vous un LLM ?",
            he: "האם אתה LLM?",
            id: "Apakah Anda LLM?",
            it: "Sei un LLM?",
            ja: "AI 向けの資料",
            ko: "혹시 LLM이신가요?",
            pl: "Czy jesteś LLM-em?",
            "pt-BR": "Você é um LLM?",
            ru: "Вы — LLM?",
            th: "คุณเป็น LLM หรือเปล่า",
            tr: "Bir LLM misin?",
            vi: "Bạn có phải là LLM không?",
            "zh-CN": "你是 LLM 吗？",
            "zh-TW": "你是 LLM 嗎？",
          },
          slug: "llms",
        },
        // Legal pages, labelled with the same words the landing footer uses
        // (LANDING_COPY.privacyLabel / termsLabel) — reachable from the docs
        // sidebar too, not only from the landing page.
        {
          label: "Privacy",
          translations: {
            ar: "الخصوصية",
            de: "Datenschutz",
            es: "Privacidad",
            fa: "حریم خصوصی",
            fr: "Confidentialité",
            he: "פרטיות",
            id: "Privasi",
            it: "Privacy",
            ja: "プライバシー",
            ko: "개인정보",
            pl: "Prywatność",
            "pt-BR": "Privacidade",
            ru: "Конфиденциальность",
            th: "ความเป็นส่วนตัว",
            tr: "Gizlilik",
            vi: "Quyền riêng tư",
            "zh-CN": "隐私",
            "zh-TW": "隱私權",
          },
          slug: "privacy",
        },
        {
          label: "Terms",
          translations: {
            ar: "الشروط",
            de: "Nutzungsbedingungen",
            es: "Términos",
            fa: "شرایط",
            fr: "Conditions",
            he: "תנאים",
            id: "Ketentuan",
            it: "Termini",
            ja: "利用条件",
            ko: "약관",
            pl: "Warunki",
            "pt-BR": "Termos",
            ru: "Условия",
            th: "ข้อกำหนด",
            tr: "Koşullar",
            vi: "Điều khoản",
            "zh-CN": "条款",
            "zh-TW": "條款",
          },
          slug: "terms",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      // The active page expands into its h2 sections in the left sidebar —
      // see src/components/Sidebar.astro.
      components: { Sidebar: "./src/components/Sidebar.astro" },
      // /llms.txt, /llms-small.txt, /llms-full.txt — generated into dist/ at
      // build time (never committed), so LLMs can read the docs as Markdown.
      plugins: [starlightLlmsTxt(), starlightLinksValidator()],
    }),
  ],
});
