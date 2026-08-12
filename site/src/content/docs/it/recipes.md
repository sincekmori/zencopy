---
title: Ricette
description: Configurazioni di ai-sdk-catalog.json da copiare e incollare, da un singolo provider ai role su più provider.
---

Questa pagina è per **utenti esperti** che modificano direttamente i file di configurazione.
Se preferisci restare nelle schermate dell'app, non ti servirà mai.

Punti di partenza da copiare e incollare per `ai-sdk-catalog.json`.
Metti il file nella [directory di configurazione dell'app](/it/configuration/); le modifiche si applicano al trigger successivo.

## Un provider, un modello {#one-provider-one-model}

Ciò che scrive l'interfaccia delle impostazioni — l'intero file per la maggior parte delle persone:

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

La riga `$schema` è facoltativa; gli editor che capiscono JSON Schema la usano per validare e completare il file mentre scrivi.

## Ollama in locale — niente lascia la tua macchina {#local-ollama--nothing-leaves-your-machine}

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

Qualsiasi endpoint compatibile OpenAI funziona allo stesso modo — LM Studio, llama.cpp, un gateway aziendale: cambia il `baseURL` del vendor (e aggiungi `apiKey` accanto se l'endpoint ne richiede una).
Un role è `"provider:model"`, diviso al primo `:` — ecco perché `"ollama:gemma4:e4b"` funziona anche se l'id del modello contiene un due punti.

## Due role: veloce di default, intelligente su richiesta {#two-roles-fast-by-default-smart-on-demand}

I role disaccoppiano i prompt dai modelli.
I prompt nominano un role (`role: smart` nel frontmatter del prompt); quale modello significhi lo si decide qui — puoi cambiarlo in qualsiasi momento senza toccare i prompt.

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

Le configurazioni specifiche di ZenCopy finiscono qui.
Il formato di file in sé appartiene a [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — gateway, impostazioni per modello e il resto sono documentati lì, con configurazioni pronte in tre taglie in [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
