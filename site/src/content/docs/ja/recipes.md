---
title: レシピ集
description: ai-sdk-catalog.json のコピペ例。1 プロバイダー構成から、複数プロバイダーの role 使い分けまで。
---

このページは、設定ファイルを直接編集する**上級者向け**です。
[設定画面の AI タブ](/ja/configuration/#ai)だけで使いたい方には必要ありません。

`ai-sdk-catalog.json` のコピペ用スターターです。
ファイルは[アプリ設定ディレクトリ](/ja/configuration/#config-files-for-power-users)に置きます。手で編集した内容は、ZenCopy を再起動するか、設定画面の AI タブ（JSON）でいちど保存すると反映されます。

## 1 プロバイダー・1 モデル {#one-provider-one-model}

設定 UI が書くのと同じ形。ほとんどの人はこれで全部です:

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

`$schema` の行は省略できます。JSON Schema を理解するエディタなら、この行があると入力中に検証と補完が効きます。

## ローカル Ollama（何も端末の外に出ない） {#local-ollama--nothing-leaves-your-machine}

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

OpenAI 互換エンドポイントなら何でも同じ書き方です。LM Studio、llama.cpp、ゲートウェイのいずれも vendor の `baseURL` を変えるだけです（必要なら隣に `apiKey` を足します）。
role の `"provider:model"` は最初の `:` で分割されるので、モデル ID にコロンを含む `"ollama:gemma4:e4b"` もそのまま書けます。

## role を 2 つ: 普段は速く、要所は賢く {#two-roles-fast-by-default-smart-on-demand}

role はプロンプトとモデルを疎結合にします。
プロンプトは role 名だけを持ち（フロントマターに `role: smart`）、それがどのモデルを意味するかはここで決めます。プロンプトに触れずにいつでも差し替えられます。

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
      "models": [{ "id": "claude-opus-5" }]
    }
  ],
  "roles": {
    "default": "google:gemini-3.1-flash-lite",
    "smart": "anthropic:claude-opus-5"
  }
}
```

ZenCopy 固有の設定はここまでです。
ファイル形式の本家は [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) です。ゲートウェイやモデル別設定などはそちらに説明があり、[`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples) には 3 サイズの設定例が揃っています。
