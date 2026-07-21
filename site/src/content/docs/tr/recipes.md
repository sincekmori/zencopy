---
title: Tarifler
description: Tek sağlayıcıdan birden çok sağlayıcıya yayılan role'lere, kopyala-yapıştır ai-sdk-catalog.json kurulumları.
---

Bu sayfa, yapılandırma dosyalarını doğrudan düzenleyen **ileri düzey kullanıcılar** için.
Uygulamanın kendi ekranlarında kalmayı tercih ediyorsan buna hiç ihtiyacın olmayacak.

`ai-sdk-catalog.json` için kopyala-yapıştır başlangıç noktaları.
Dosyayı [uygulama yapılandırma dizinine](/tr/configuration/) koy; düzenlemeler bir sonraki tetiklemede geçerli olur.

## Tek sağlayıcı, tek model

Ayarlar arayüzünün yazdığı şey — çoğu kişi için dosyanın tamamı:

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

`$schema` satırı isteğe bağlıdır; JSON Schema'dan anlayan düzenleyiciler, sen yazarken dosyayı doğrulamak ve otomatik tamamlamak için onu kullanır.

## Yerel Ollama — hiçbir şey makinenden çıkmaz

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

OpenAI uyumlu her uç nokta aynı şekilde çalışır — LM Studio, llama.cpp, kurumsal bir ağ geçidi: vendor'ın `baseURL` değerini değiştir (uç nokta istiyorsa yanına bir `apiKey` ekle).
Bir role, ilk `:` işaretinden bölünen `"provider:model"` biçimindedir — model id'sinde iki nokta üst üste olsa da `"ollama:gemma4:e4b"` bu yüzden çalışır.

## İki role: varsayılan olarak hızlı, istendiğinde akıllı

Role'ler eylemleri modellerden ayırır.
Eylemler bir role adı belirtir (eylemin frontmatter'ında `role: smart`); bunun hangi model anlamına geldiğine burada karar verilir — eylemlere dokunmadan istediğin an değiştir.

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

ZenCopy'ye özgü kurulumlar bu kadar.
Dosya biçiminin kendisi [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme)'a aittir — ağ geçitleri, model başına ayarlar ve gerisi orada belgelenmiştir; [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples) içinde üç boyda hazır yapılandırma bulunur.
