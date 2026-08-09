---
title: 設定範例
description: 可直接複製貼上的 ai-sdk-catalog.json 設定，從單一供應商到跨多個供應商的 role。
---

這一頁是給直接編輯設定檔的**進階使用者**看的。
如果你偏好只在應用程式的畫面裡操作，永遠都用不到它。

以下是 `ai-sdk-catalog.json` 可直接複製貼上的起手式。
把檔案放進[應用程式設定目錄](/zh-hant/configuration/)；編輯會在下一次觸發時生效。

## 單一供應商、單一模型

設定 UI 寫出的格式——對多數人來說，整個檔案就是這樣：

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

`$schema` 這一行可有可無；理解 JSON Schema 的編輯器會用它在你輸入時驗證並自動完成。

## 本機 Ollama——什麼都不離開你的電腦

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

任何 OpenAI 相容端點都能用同樣的方式設定——LM Studio、llama.cpp、企業閘道：改掉 vendor 的 `baseURL`（若端點需要，再在旁邊加上 `apiKey`）即可。
role 的值是 `"provider:model"`，以第一個 `:` 分割——這就是為什麼即使模型 id 本身含有冒號，`"ollama:gemma4:e4b"` 也能運作。

## 兩個 role：預設求快，需要時求聰明

role 把提示詞與模型脫鉤。
提示詞只指定 role 的名稱（在提示詞的 frontmatter 裡寫 `role: smart`）；那代表哪個模型則在這裡決定——隨時可以更換，完全不必動到提示詞。

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

ZenCopy 專屬的設定就到此為止。
檔案格式本身屬於 [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme)——閘道、各模型的個別設定等其他內容都在那裡有說明，[`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples) 也備有三種規模的現成設定。
