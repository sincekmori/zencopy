---
title: Receitas
description: Configurações de ai-sdk-catalog.json prontas para copiar e colar, de um único provedor a roles espalhados por vários.
---

Esta página é para **usuários avançados** que editam arquivos de configuração diretamente.
Se você prefere ficar nas telas do próprio aplicativo, nunca vai precisar dela.

Pontos de partida para copiar e colar no `ai-sdk-catalog.json`.
Coloque o arquivo no [diretório de configuração do aplicativo](/pt-br/configuration/); as edições valem a partir do próximo acionamento.

## Um provedor, um modelo

O que a interface de configurações grava — o arquivo inteiro, para a maioria das pessoas:

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

A linha `$schema` é opcional; editores que entendem JSON Schema a usam para validar e completar o arquivo enquanto você digita.

## Ollama local — nada sai da sua máquina

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

Qualquer endpoint compatível com a OpenAI funciona do mesmo jeito — LM Studio, llama.cpp, um gateway corporativo: mude o `baseURL` do vendor (e adicione `apiKey` ao lado, se o endpoint exigir uma).
Um role é `"provider:model"`, separado no primeiro `:` — por isso `"ollama:gemma4:e4b"` funciona mesmo com o id do modelo contendo dois-pontos.

## Dois roles: rápido por padrão, inteligente sob demanda

Roles desacoplam os prompts dos modelos.
Os prompts nomeiam um role (`role: smart` no frontmatter do prompt); qual modelo isso significa é decidido aqui — troque a qualquer momento sem tocar nos prompts.

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

Até aqui vão as configurações específicas do ZenCopy.
O formato do arquivo em si pertence ao [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — gateways, ajustes por modelo e o restante estão documentados lá, com configurações prontas em três tamanhos em [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
