---
title: الوصفات
description: إعدادات ai-sdk-catalog.json جاهزة للنسخ واللصق، من مزوّد واحد إلى أدوار موزّعة على عدة مزوّدين.
---

هذه الصفحة موجّهة إلى **المستخدمين المتقدمين** الذين يحرّرون ملفات الإعداد مباشرة.
إن كنت تفضّل البقاء داخل شاشات التطبيق نفسها، فلن تحتاج إليها أبدًا.

نقاط انطلاق جاهزة للنسخ واللصق لملف `ai-sdk-catalog.json`.
ضع الملف في [دليل إعدادات التطبيق](/ar/configuration/)؛ وتسري التعديلات عند التشغيل التالي.

## مزوّد واحد ونموذج واحد {#one-provider-one-model}

ما تكتبه واجهة الإعدادات — وهو الملف كاملًا لمعظم الناس:

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

سطر `$schema` اختياري؛ فالمحررات التي تفهم JSON Schema تستخدمه للتحقق من الملف وإكماله تلقائيًا أثناء الكتابة.

## ‏Ollama المحلي — لا شيء يغادر جهازك {#local-ollama--nothing-leaves-your-machine}

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

أي نقطة نهاية متوافقة مع OpenAI تعمل بالطريقة نفسها — LM Studio أو llama.cpp أو بوابة شركة: غيّر `baseURL` الخاص بالـ vendor (وأضف `apiKey` بجواره إن كانت نقطة النهاية تطلبه).
الدور يُكتب `"provider:model"` ويُقسم عند أول `:` — ولهذا يعمل `"ollama:gemma4:e4b"` رغم أن id النموذج يحتوي على نقطتين رأسيتين.

## دوران: سريع افتراضيًا وذكي عند الطلب {#two-roles-fast-by-default-smart-on-demand}

الأدوار تفصل الموجّهات عن النماذج.
تسمّي الموجّهات دورًا (`role: smart` في frontmatter الموجّه)؛ أما أي نموذج يعنيه ذلك فيتقرر هنا — بدّله متى شئت دون لمس الموجّهات.

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

هذا أقصى ما تصل إليه الإعدادات الخاصة بـ ZenCopy.
أما صيغة الملف نفسها فتعود إلى [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — البوابات وإعدادات كل نموذج على حدة وسواها موثّقة هناك، مع إعدادات جاهزة بثلاثة أحجام في [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
