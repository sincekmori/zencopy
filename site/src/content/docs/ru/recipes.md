---
title: Рецепты
description: Готовые к копированию конфигурации ai-sdk-catalog.json — от одного провайдера до ролей, распределённых между несколькими.
---

Эта страница — для **опытных пользователей**, которые редактируют файлы конфигурации напрямую.
Если вы предпочитаете оставаться в экранах самого приложения, она вам никогда не понадобится.

Готовые отправные точки для `ai-sdk-catalog.json` — просто скопируйте и вставьте.
Положите файл в [каталог конфигурации приложения](/ru/configuration/); правки применяются при следующем срабатывании.

## Один провайдер, одна модель

То, что записывает интерфейс настроек, — для большинства это и есть весь файл:

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

Строка `$schema` необязательна; редакторы, понимающие JSON Schema, используют её для проверки и автодополнения файла по мере ввода.

## Локальная Ollama — ничего не покидает компьютер

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

Любая OpenAI-совместимая конечная точка работает так же — LM Studio, llama.cpp, корпоративный шлюз: измените `baseURL` у vendor (и добавьте рядом `apiKey`, если конечная точка его требует).
Роль записывается как `"provider:model"` и разделяется по первому `:` — поэтому `"ollama:gemma4:e4b"` работает, хотя id модели содержит двоеточие.

## Две роли: быстрая по умолчанию, умная по запросу

Роли отделяют промпты от моделей.
Промпт называет роль (`role: smart` в его frontmatter); какая модель за ней стоит, решается здесь — меняйте её в любой момент, не трогая промпты.

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

На этом специфика ZenCopy заканчивается.
Сам формат файла принадлежит [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — шлюзы, настройки отдельных моделей и всё остальное описаны там, а готовые конфигурации трёх размеров лежат в [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
