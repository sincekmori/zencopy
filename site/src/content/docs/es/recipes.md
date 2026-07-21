---
title: Recetas
description: Configuraciones de ai-sdk-catalog.json listas para copiar y pegar, desde un solo proveedor hasta roles repartidos entre varios.
---

Esta página es para **usuarios avanzados** que editan archivos de configuración directamente.
Si prefieres quedarte en las pantallas de la propia aplicación, nunca la necesitarás.

Puntos de partida para copiar y pegar en `ai-sdk-catalog.json`.
Coloca el archivo en el [directorio de configuración de la aplicación](/es/configuration/); las ediciones se aplican desde el siguiente disparo.

## Un proveedor, un modelo

Lo que escribe la interfaz de ajustes — el archivo completo para la mayoría de la gente:

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

La línea `$schema` es opcional; los editores que entienden JSON Schema la usan para validar y autocompletar el archivo mientras escribes.

## Ollama local — nada sale de tu máquina

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

Cualquier endpoint compatible con OpenAI funciona de la misma manera — LM Studio, llama.cpp, una pasarela corporativa: cambia el `baseURL` del vendor (y añade `apiKey` a su lado si el endpoint lo pide).
Un rol es `"provider:model"`, dividido en el primer `:` — por eso `"ollama:gemma4:e4b"` funciona aunque el id del modelo contenga dos puntos.

## Dos roles: rápido por defecto, inteligente bajo demanda

Los roles desacoplan las acciones de los modelos.
Las acciones nombran un rol (`role: smart` en el frontmatter de la acción); qué modelo significa eso se decide aquí — cámbialo cuando quieras sin tocar las acciones.

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

Hasta aquí llegan las configuraciones específicas de ZenCopy.
El formato de archivo en sí pertenece a [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — las pasarelas, los ajustes por modelo y todo lo demás están documentados allí, con configuraciones listas en tres tamaños en [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
