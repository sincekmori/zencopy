---
title: 配置示例
description: 可直接复制粘贴的 ai-sdk-catalog.json 配置，从单个提供商到跨多家提供商的 role。
---

本页面向直接编辑配置文件的**进阶用户**。
如果你更愿意留在应用自己的界面里，就永远用不到它。

以下是 `ai-sdk-catalog.json` 的可复制粘贴起步配置。
把文件放进[应用配置目录](/zh-hans/configuration/)；编辑在下一次触发时生效。

## 一个提供商，一个模型 {#one-provider-one-model}

设置界面写出的就是这种形式 — 对大多数人来说，整个文件就是这样：

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

`$schema` 这一行是可选的；认识 JSON Schema 的编辑器会用它在你输入时校验并自动补全这个文件。

## 本地 Ollama — 内容不出你的电脑 {#local-ollama--nothing-leaves-your-machine}

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

任何 OpenAI 兼容端点都是同样的用法 — LM Studio、llama.cpp、企业网关：改掉 vendor 的 `baseURL` 即可（如果端点需要密钥，在旁边加上 `apiKey`）。
role 的写法是 `"provider:model"`，在第一个 `:` 处拆分 — 所以即使模型 id 里含有冒号，`"ollama:gemma4:e4b"` 也能正常工作。

## 两个 role：默认求快，需要时求强 {#two-roles-fast-by-default-smart-on-demand}

role 把提示词和模型解耦。
提示词只写 role 的名字（在提示词的 frontmatter 里写 `role: smart`）；这个名字对应哪个模型在这里决定 — 随时可换，提示词一个字都不用改。

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

ZenCopy 特有的配置到此为止。
文件格式本身属于 [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — 网关、按模型的设置及其余内容都在那里有文档，[`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples) 里有三种规模的现成配置。
