---
title: מתכונים
description: תצורות ai-sdk-catalog.json מוכנות להעתקה-הדבקה, מספק יחיד ועד roles על פני כמה ספקים.
---

הדף הזה מיועד ל**משתמשים מתקדמים** שעורכים קובצי תצורה ישירות.
אם אתם מעדיפים להישאר במסכים של האפליקציה עצמה, לעולם לא תזדקקו לו.

נקודות פתיחה להעתקה-הדבקה עבור `ai-sdk-catalog.json`.
שימו את הקובץ ב[תיקיית התצורה של האפליקציה](/he/configuration/); עריכות נכנסות לתוקף בטריגר הבא.

## ספק אחד, מודל אחד

מה שממשק ההגדרות כותב — הקובץ כולו עבור רוב האנשים:

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

שורת ה‑`$schema` אופציונלית; עורכים שמבינים JSON Schema משתמשים בה כדי לאמת ולהשלים את הקובץ תוך כדי הקלדה.

## Ollama מקומי — שום דבר לא עוזב את המחשב

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

כל נקודת קצה תואמת OpenAI עובדת באותו אופן — LM Studio‏, llama.cpp, שער ארגוני: שנו את ה‑`baseURL` של הספק (והוסיפו לידו `apiKey` אם נקודת הקצה דורשת אחד).
‏role הוא `"provider:model"`, מפוצל ב‑`:` הראשון — ולכן `"ollama:gemma4:e4b"` עובד למרות שמזהה המודל מכיל נקודתיים.

## שני roles: מהיר כברירת מחדל, חכם לפי דרישה

‏roles מנתקים את הקשר בין פעולות למודלים.
פעולות נוקבות בשם של role‏ (`role: smart` ב‑frontmatter של הפעולה); איזה מודל זה אומר בפועל מוכרע כאן — החליפו אותו בכל עת בלי לגעת בפעולות.

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

עד כאן התצורות הייחודיות ל‑ZenCopy.
פורמט הקובץ עצמו שייך ל‑[ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — שערים, הגדרות לכל מודל וכל השאר מתועדים שם, עם תצורות מוכנות בשלושה גדלים ב‑[`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
