---
title: Przepisy
description: Gotowe do skopiowania konfiguracje ai-sdk-catalog.json — od jednego dostawcy po role rozdzielone między kilku.
---

Ta strona jest dla **zaawansowanych użytkowników**, którzy edytują pliki konfiguracyjne bezpośrednio.
Jeśli wolisz pozostać przy ekranach samej aplikacji, nigdy nie będzie Ci potrzebna.

Gotowe do skopiowania punkty startowe dla `ai-sdk-catalog.json`.
Umieść plik w [katalogu konfiguracyjnym aplikacji](/pl/configuration/); zmiany obowiązują od następnego wyzwolenia.

## Jeden dostawca, jeden model

To, co zapisuje interfejs ustawień — dla większości osób to cały plik:

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

Linia `$schema` jest opcjonalna; edytory rozumiejące JSON Schema używają jej do walidacji i podpowiedzi podczas pisania.

## Lokalny Ollama — nic nie opuszcza Twojego komputera

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

Każdy punkt końcowy zgodny z OpenAI działa tak samo — LM Studio, llama.cpp, brama firmowa: zmień `baseURL` dostawcy (i dodaj obok `apiKey`, jeśli punkt końcowy go wymaga).
Rola to `"provider:model"`, dzielone na pierwszym `:` — dlatego `"ollama:gemma4:e4b"` działa, mimo że id modelu zawiera dwukropek.

## Dwie role: domyślnie szybko, na żądanie mądrzej

Role oddzielają prompty od modeli.
Prompty wskazują rolę (`role: smart` we frontmatterze promptu); to, jaki model to oznacza, rozstrzyga się tutaj — możesz go podmienić w każdej chwili, nie dotykając promptów.

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

Na tym kończą się konfiguracje specyficzne dla ZenCopy.
Sam format pliku należy do [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — bramy, ustawienia poszczególnych modeli i cała reszta są udokumentowane tam, wraz z gotowymi konfiguracjami w trzech rozmiarach w [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
