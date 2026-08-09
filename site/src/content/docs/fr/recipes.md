---
title: Recettes
description: Des configurations ai-sdk-catalog.json à copier-coller, du fournisseur unique aux roles répartis sur plusieurs.
---

Cette page s'adresse aux **utilisateurs avancés** qui éditent directement les fichiers de configuration.
Si vous préférez rester dans les écrans de l'application, vous n'en aurez jamais besoin.

Des points de départ à copier-coller pour `ai-sdk-catalog.json`.
Placez le fichier dans le [répertoire de configuration de l'application](/fr/configuration/) ; les modifications s'appliquent au déclenchement suivant.

## Un fournisseur, un modèle

Ce que l'interface des réglages écrit — le fichier complet pour la plupart des gens :

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

La ligne `$schema` est facultative ; les éditeurs qui comprennent JSON Schema s'en servent pour valider et compléter le fichier pendant la saisie.

## Ollama en local — rien ne quitte votre machine

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

N'importe quel point d'accès compatible OpenAI fonctionne de la même façon — LM Studio, llama.cpp, une passerelle d'entreprise : changez le `baseURL` du vendor (et ajoutez `apiKey` à côté si le point d'accès en demande une).
Un role s'écrit `"provider:model"`, découpé au premier `:` — c'est pourquoi `"ollama:gemma4:e4b"` fonctionne même si l'id du modèle contient un deux-points.

## Deux roles : rapide par défaut, intelligent à la demande

Les roles découplent les prompts des modèles.
Les prompts nomment un role (`role: smart` dans le frontmatter du prompt) ; le modèle que cela désigne se décide ici — changez-le quand vous voulez sans toucher aux prompts.

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

Les configurations propres à ZenCopy s'arrêtent là.
Le format de fichier lui-même appartient à [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — les passerelles, les réglages par modèle et le reste y sont documentés, avec des configurations prêtes à l'emploi en trois tailles dans [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
