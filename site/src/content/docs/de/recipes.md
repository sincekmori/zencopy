---
title: Rezepte
description: Kopierfertige ai-sdk-catalog.json-Setups, vom einzelnen Anbieter bis zu Rollen über mehrere hinweg.
---

Diese Seite richtet sich an **Power-User**, die Konfigurationsdateien direkt bearbeiten.
Wenn du lieber in den Bildschirmen der App bleibst, wirst du sie nie brauchen.

Kopierfertige Ausgangspunkte für `ai-sdk-catalog.json`.
Lege die Datei ins [App-Konfigurationsverzeichnis](/de/configuration/); Änderungen gelten ab dem nächsten Auslösen.

## Ein Anbieter, ein Modell

Was die Einstellungs-UI schreibt — für die meisten die ganze Datei:

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

Die `$schema`-Zeile ist optional; Editoren, die JSON Schema verstehen, nutzen sie, um die Datei beim Tippen zu validieren und zu vervollständigen.

## Lokales Ollama — nichts verlässt dein Gerät

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

Jeder OpenAI-kompatible Endpunkt funktioniert auf dieselbe Weise — LM Studio, llama.cpp, ein Firmen-Gateway: Ändere die `baseURL` des Anbieters (und ergänze daneben `apiKey`, wenn der Endpunkt einen verlangt).
Eine Rolle ist `"provider:model"`, getrennt am ersten `:` — deshalb funktioniert `"ollama:gemma4:e4b"`, obwohl die Modell-id selbst einen Doppelpunkt enthält.

## Zwei Rollen: standardmäßig schnell, auf Wunsch schlau

Rollen entkoppeln Aktionen von Modellen.
Aktionen nennen eine Rolle (`role: smart` im Frontmatter der Aktion); welches Modell das bedeutet, wird hier entschieden — tausche es jederzeit aus, ohne Aktionen anzufassen.

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

Weiter reichen die ZenCopy-spezifischen Setups nicht.
Das Dateiformat selbst gehört zu [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — Gateways, Einstellungen pro Modell und der Rest sind dort dokumentiert, mit fertigen Konfigurationen in drei Größen unter [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
