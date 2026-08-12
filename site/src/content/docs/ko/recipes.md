---
title: 레시피
description: 제공업체 하나짜리 구성부터 여러 제공업체에 걸친 역할까지, 복사해 붙여넣을 수 있는 ai-sdk-catalog.json 설정 모음.
---

이 페이지는 설정 파일을 직접 편집하는 **파워 유저**를 위한 것입니다.
앱 화면 안에서만 쓰고 싶다면 이 페이지는 전혀 필요 없습니다.

`ai-sdk-catalog.json`을 위한, 복사해 붙여넣을 수 있는 출발점 모음입니다.
파일을 [앱 설정 디렉터리](/ko/configuration/)에 두세요. 편집 내용은 다음 트리거부터 적용됩니다.

## 제공업체 하나, 모델 하나 {#one-provider-one-model}

설정 UI가 저장하는 내용 그대로 — 대부분의 사람에게는 이것이 파일의 전부입니다:

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

`$schema` 줄은 선택 사항입니다. JSON Schema를 이해하는 에디터는 이를 이용해 입력하는 동안 파일을 검증하고 자동 완성합니다.

## 로컬 Ollama — 아무것도 컴퓨터를 떠나지 않음 {#local-ollama--nothing-leaves-your-machine}

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

OpenAI 호환 엔드포인트라면 무엇이든 같은 방식으로 동작합니다 — LM Studio, llama.cpp, 사내 게이트웨이: vendor의 `baseURL`을 바꾸면 됩니다(엔드포인트가 요구한다면 그 옆에 `apiKey`도 추가).
역할은 `"provider:model"` 형식이고 첫 번째 `:`에서 나뉩니다 — 모델 id에 콜론이 들어 있어도 `"ollama:gemma4:e4b"`가 동작하는 이유입니다.

## 역할 두 개: 기본은 빠르게, 필요할 때는 똑똑하게 {#two-roles-fast-by-default-smart-on-demand}

역할은 프롬프트와 모델을 분리합니다.
프롬프트는 역할 이름을 지정하고(프롬프트 frontmatter의 `role: smart`), 그 역할이 어떤 모델을 뜻하는지는 여기서 정합니다 — 프롬프트를 건드리지 않고 언제든 바꿀 수 있습니다.

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

ZenCopy 특유의 설정은 여기까지입니다.
파일 형식 자체는 [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme)의 것입니다 — 게이트웨이, 모델별 설정 등 나머지는 그곳에 문서화되어 있고, [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples)에는 세 가지 규모의 기성 설정이 있습니다.
