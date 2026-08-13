// @ts-check
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";
import { remarkHeadingId } from "remark-custom-heading-id";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import { LANDING_LOCALES } from "./src/components/landing-copy.ts";

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
      remarkPlugins: [remarkHeadingId],
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
        "Copy twice, act instantly. A calm desktop agent that turns whatever you copy into an instant AI result.",
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
          attrs: { property: "og:image:alt", content: "ZenCopy — Copy twice, act instantly." },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "https://zencopy.app/og.png" },
        },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
        // Progressive enhancement for the visitor's OS: elements marked
        // data-os-modifier show their own key (⌘ or Ctrl), and the "os"
        // synced tabs get pre-selected on first visit (a manual choice then
        // wins — Starlight persists it under the same key). Other OSes and
        // no-JS keep the combined "Ctrl/⌘" fallback and the first tab.
        {
          tag: "script",
          content: [
            "(() => {",
            "  const ua = navigator.userAgent;",
            "  const isMac = /Mac|iP(hone|ad|od)/.test(ua);",
            "  const isLinux = /Linux|X11/.test(ua) && !/Android/.test(ua);",
            "  if (!isMac && !isLinux && !/Windows/.test(ua)) return;",
            '  const tabKey = "starlight-synced-tabs__os";',
            "  if (!localStorage.getItem(tabKey)) {",
            '    localStorage.setItem(tabKey, isMac ? "macOS" : isLinux ? "Linux" : "Windows");',
            "  }",
            "  const swap = () => {",
            '    for (const el of document.querySelectorAll("[data-os-modifier]")) {',
            '      el.textContent = isMac ? "⌘" : "Ctrl";',
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
      // is a custom page that redirects by browser language
      // (src/pages/index.astro).
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
            ja: "レシピ集",
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
            ja: "あなたは LLM ですか？",
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
