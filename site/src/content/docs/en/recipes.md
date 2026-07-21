---
title: Recipes
description: Copy-paste ai-sdk-catalog.json setups, from a single provider to roles across several.
---

This page is for **power users** who edit config files directly.
If you prefer to stay inside the app's own screens, you will never need it.

Copy-paste starting points for `ai-sdk-catalog.json`.
Put the file in the [app config dir](/en/configuration/#config-files-for-power-users); edits apply on the next trigger.

## One provider, one model

What the settings UI writes — the whole file for most people:

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

The `$schema` line is optional; editors that understand JSON Schema use it to validate and autocomplete the file as you type.

## Local Ollama — nothing leaves your machine

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

Any OpenAI-compatible endpoint works the same way — LM Studio, llama.cpp, a corporate gateway: change the vendor's `baseURL` (and add `apiKey` next to it if the endpoint wants one).
A role is `"provider:model"`, split at the first `:` — which is why `"ollama:gemma4:e4b"` works even though the model id contains a colon.

## Two roles: fast by default, smart on demand

Roles decouple actions from models.
Actions name a role (`role: smart` in the action's frontmatter); which model that means is decided here — swap it any time without touching actions.

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

That is as far as ZenCopy-specific setups go.
The file format itself belongs to [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — gateways, per-model settings, and the rest are documented there, with ready-made configs at three sizes in [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
