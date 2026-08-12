---
title: نمونه‌های آماده
description: پیکربندی‌های آمادهٔ ai-sdk-catalog.json برای کپی و چسباندن، از یک ارائه‌دهندهٔ تنها تا نقش‌ها روی چند ارائه‌دهنده.
---

این صفحه برای **کاربران حرفه‌ای** است که فایل‌های پیکربندی را مستقیم ویرایش می‌کنند.
اگر ترجیح می‌دهید در همان صفحه‌های خود برنامه بمانید، هرگز به آن نیازی نخواهید داشت.

نقطه‌های شروع آماده برای `ai-sdk-catalog.json` که می‌توانید کپی و بچسبانید.
فایل را در [پوشهٔ پیکربندی برنامه](/fa/configuration/) بگذارید؛ ویرایش‌ها از راه‌اندازِ بعدی اعمال می‌شوند.

## یک ارائه‌دهنده، یک مدل {#one-provider-one-model}

آنچه رابط تنظیمات می‌نویسد — برای بیشتر افراد کل فایل همین است:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/ai-sdk-catalog/schema.json",
  "providers": [
    {
      "id": "openai",
      "vendor": { "apiKey": "sk-…" },
      "models": [{ "id": "gpt-5.6-luna" }]
    }
  ],
  "roles": {
    "default": "openai:gpt-5.6-luna"
  }
}
```

خط `$schema` اختیاری است؛ ویرایشگرهایی که JSON Schema را می‌فهمند، هنگام نوشتن با آن فایل را اعتبارسنجی و تکمیل خودکار می‌کنند.

## Ollama محلی — هیچ چیزی از دستگاه شما خارج نمی‌شود {#local-ollama--nothing-leaves-your-machine}

```json
{
  "providers": [
    {
      "id": "ollama",
      "vendor": { "id": "openai-compatible", "baseURL": "http://localhost:11434/v1" },
      "models": [{ "id": "gemma4:e4b" }]
    }
  ],
  "roles": {
    "default": "ollama:gemma4:e4b"
  }
}
```

هر نقطهٔ پایانی سازگار با OpenAI هم به همین شکل کار می‌کند — ‏LM Studio، ‏llama.cpp، یک گیت‌وی سازمانی: ‏`baseURL` مربوط به vendor را عوض کنید (و اگر آن نقطهٔ پایانی کلید می‌خواهد، `apiKey` را کنارش بیفزایید).
یک نقش به شکل `"provider:model"` است و در نخستین `:` جدا می‌شود — به همین دلیل `"ollama:gemma4:e4b"` کار می‌کند، حتی با این‌که شناسهٔ مدل خودش دونقطه دارد.

## دو نقش: پیش‌فرضِ سریع، هوشمند در صورت نیاز {#two-roles-fast-by-default-smart-on-demand}

نقش‌ها پرامپت‌ها را از مدل‌ها جدا می‌کنند.
پرامپت‌ها یک نقش را نام می‌برند (`role: smart` در frontmatter پرامپت)؛ این‌که آن نقش یعنی کدام مدل، همین‌جا تعیین می‌شود — هر وقت بخواهید بدون دست زدن به پرامپت‌ها عوضش کنید.

```json
{
  "providers": [
    {
      "id": "google",
      "vendor": { "apiKey": "AIza…" },
      "models": [{ "id": "gemini-3.1-flash-lite" }]
    },
    {
      "id": "anthropic",
      "vendor": { "apiKey": "sk-ant-…" },
      "models": [{ "id": "claude-opus-4-8" }]
    }
  ],
  "roles": {
    "default": "google:gemini-3.1-flash-lite",
    "smart": "anthropic:claude-opus-4-8"
  }
}
```

پیکربندی‌های مخصوص ZenCopy تا همین‌جاست.
خود قالب فایل به [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) تعلق دارد — گیت‌وی‌ها، تنظیمات هر مدل و باقی موارد آن‌جا مستند شده‌اند، همراه با پیکربندی‌های آماده در سه اندازه در [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
