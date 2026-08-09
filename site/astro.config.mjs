// @ts-check
import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";
import starlightLlmsTxt from "starlight-llms-txt";

// https://astro.build/config
export default defineConfig({
  site: "https://zencopy.app",
  markdown: {
    // rehype plugins only run on the unified pipeline, so it is selected
    // explicitly (the top-level rehypePlugins shorthand is deprecated, and
    // Astro's default Sätteri pipeline cannot host rehype).
    processor: unified({
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
      // (src/pages/index.astro). Keep this list in sync with LANDING_LOCALES
      // (src/components/landing-copy.ts) and the app's locales.
      defaultLocale: "en",
      locales: {
        en: { label: "English", lang: "en" },
        ja: { label: "日本語", lang: "ja" },
        "zh-hans": { label: "简体中文", lang: "zh-CN" },
        "zh-hant": { label: "繁體中文", lang: "zh-TW" },
        ko: { label: "한국어", lang: "ko" },
        es: { label: "Español", lang: "es" },
        "pt-br": { label: "Português (Brasil)", lang: "pt-BR" },
        fr: { label: "Français", lang: "fr" },
        de: { label: "Deutsch", lang: "de" },
        it: { label: "Italiano", lang: "it" },
        pl: { label: "Polski", lang: "pl" },
        ru: { label: "Русский", lang: "ru" },
        id: { label: "Bahasa Indonesia", lang: "id" },
        vi: { label: "Tiếng Việt", lang: "vi" },
        th: { label: "ไทย", lang: "th" },
        tr: { label: "Türkçe", lang: "tr" },
        ar: { label: "العربية", lang: "ar", dir: "rtl" },
        fa: { label: "فارسی", lang: "fa", dir: "rtl" },
        he: { label: "עברית", lang: "he", dir: "rtl" },
      },
      sidebar: [
        {
          label: "Why ZenCopy?",
          translations: {
            ja: "なぜ ZenCopy？",
            "zh-CN": "为什么选 ZenCopy？",
            "zh-TW": "為什麼選 ZenCopy？",
            ko: "왜 ZenCopy인가요?",
            es: "¿Por qué ZenCopy?",
            "pt-BR": "Por que o ZenCopy?",
            fr: "Pourquoi ZenCopy ?",
            de: "Warum ZenCopy?",
            it: "Perché ZenCopy?",
            pl: "Dlaczego ZenCopy?",
            ru: "Почему ZenCopy?",
            id: "Mengapa ZenCopy?",
            vi: "Vì sao chọn ZenCopy?",
            th: "ทำไมต้อง ZenCopy?",
            tr: "Neden ZenCopy?",
            ar: "لماذا ZenCopy؟",
            fa: "چرا ZenCopy؟",
            he: "למה ZenCopy?",
          },
          slug: "why",
        },
        {
          label: "Getting started",
          translations: {
            ja: "はじめる",
            "zh-CN": "快速上手",
            "zh-TW": "快速上手",
            ko: "시작하기",
            es: "Primeros pasos",
            "pt-BR": "Primeiros passos",
            fr: "Premiers pas",
            de: "Erste Schritte",
            it: "Per iniziare",
            pl: "Pierwsze kroki",
            ru: "Начало работы",
            id: "Memulai",
            vi: "Bắt đầu sử dụng",
            th: "เริ่มต้นใช้งาน",
            tr: "Başlarken",
            ar: "البدء",
            fa: "شروع کار",
            he: "צעדים ראשונים",
          },
          slug: "getting-started",
        },
        {
          label: "Configuration",
          translations: {
            ja: "設定",
            "zh-CN": "配置",
            "zh-TW": "設定",
            ko: "설정",
            es: "Configuración",
            "pt-BR": "Configuração",
            fr: "Configuration",
            de: "Konfiguration",
            it: "Configurazione",
            pl: "Konfiguracja",
            ru: "Настройка",
            id: "Konfigurasi",
            vi: "Cấu hình",
            th: "การตั้งค่า",
            tr: "Yapılandırma",
            ar: "الإعدادات والتخصيص",
            fa: "پیکربندی",
            he: "הגדרות",
          },
          slug: "configuration",
        },
        {
          label: "Recipes",
          translations: {
            ja: "レシピ集",
            "zh-CN": "配置示例",
            "zh-TW": "設定範例",
            ko: "레시피",
            es: "Recetas",
            "pt-BR": "Receitas",
            fr: "Recettes",
            de: "Rezepte",
            it: "Ricette",
            pl: "Przepisy",
            ru: "Рецепты",
            id: "Resep",
            vi: "Cấu hình mẫu",
            th: "สูตรสำเร็จ",
            tr: "Tarifler",
            ar: "الوصفات",
            fa: "نمونه‌های آماده",
            he: "מתכונים",
          },
          slug: "recipes",
        },
        {
          label: "FAQ",
          translations: {
            "zh-TW": "常見問題",
            es: "Preguntas frecuentes",
            "pt-BR": "Perguntas frequentes",
            ru: "Частые вопросы",
            vi: "Câu hỏi thường gặp",
            th: "คำถามที่พบบ่อย",
            tr: "SSS",
            ar: "الأسئلة الشائعة",
            fa: "پرسش‌های متداول",
            he: "שאלות נפוצות",
          },
          slug: "faq",
        },
        {
          label: "Support",
          translations: {
            ja: "サポート",
            "zh-CN": "支持",
            "zh-TW": "支援",
            ko: "지원",
            es: "Soporte",
            "pt-BR": "Suporte",
            fr: "Assistance",
            de: "Support",
            it: "Supporto",
            pl: "Wsparcie",
            ru: "Поддержка",
            id: "Dukungan",
            vi: "Hỗ trợ",
            th: "การสนับสนุน",
            tr: "Destek",
            ar: "الدعم",
            fa: "پشتیبانی",
            he: "תמיכה",
          },
          slug: "support",
        },
        // The Svelte-style wink at machine readers: the sidebar entry is
        // the page title, a first-person self-identification.
        {
          label: "Are you an LLM?",
          translations: {
            ja: "あなたは LLM ですか？",
            "zh-CN": "你是 LLM 吗？",
            "zh-TW": "你是 LLM 嗎？",
            ko: "혹시 LLM이신가요?",
            es: "¿Eres un LLM?",
            "pt-BR": "Você é um LLM?",
            fr: "Êtes-vous un LLM ?",
            de: "Bist du ein LLM?",
            it: "Sei un LLM?",
            pl: "Czy jesteś LLM-em?",
            ru: "Вы — LLM?",
            id: "Apakah Anda LLM?",
            vi: "Bạn có phải là LLM không?",
            th: "คุณเป็น LLM หรือเปล่า",
            tr: "Bir LLM misin?",
            ar: "هل أنت LLM؟",
            fa: "آیا شما یک LLM هستید؟",
            he: "האם אתה LLM?",
          },
          slug: "llms",
        },
        // Legal pages, labelled with the same words the landing footer uses
        // (LANDING_COPY.privacyLabel / termsLabel) — reachable from the docs
        // sidebar too, not only from the landing page.
        {
          label: "Privacy",
          translations: {
            ja: "プライバシー",
            "zh-CN": "隐私",
            "zh-TW": "隱私權",
            ko: "개인정보",
            es: "Privacidad",
            "pt-BR": "Privacidade",
            fr: "Confidentialité",
            de: "Datenschutz",
            it: "Privacy",
            pl: "Prywatność",
            ru: "Конфиденциальность",
            id: "Privasi",
            vi: "Quyền riêng tư",
            th: "ความเป็นส่วนตัว",
            tr: "Gizlilik",
            ar: "الخصوصية",
            fa: "حریم خصوصی",
            he: "פרטיות",
          },
          slug: "privacy",
        },
        {
          label: "Terms",
          translations: {
            ja: "利用条件",
            "zh-CN": "条款",
            "zh-TW": "條款",
            ko: "약관",
            es: "Términos",
            "pt-BR": "Termos",
            fr: "Conditions",
            de: "Nutzungsbedingungen",
            it: "Termini",
            pl: "Warunki",
            ru: "Условия",
            id: "Ketentuan",
            vi: "Điều khoản",
            th: "ข้อกำหนด",
            tr: "Koşullar",
            ar: "الشروط",
            fa: "شرایط",
            he: "תנאים",
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
      plugins: [starlightLlmsTxt()],
    }),
  ],
});
