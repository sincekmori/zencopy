---
title: Resep
description: Konfigurasi ai-sdk-catalog.json siap salin-tempel, dari satu penyedia hingga role lintas beberapa penyedia.
---

Halaman ini untuk **pengguna mahir** yang menyunting berkas konfigurasi secara langsung.
Kalau kamu lebih suka tetap berada di layar aplikasi saja, halaman ini tidak akan pernah kamu perlukan.

Titik awal siap salin-tempel untuk `ai-sdk-catalog.json`.
Letakkan berkasnya di [direktori konfigurasi aplikasi](/id/configuration/); suntingan berlaku pada pemicu berikutnya.

## Satu penyedia, satu model {#one-provider-one-model}

Inilah yang ditulis UI pengaturan — seluruh isi berkas bagi kebanyakan orang:

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

Baris `$schema` opsional; editor yang memahami JSON Schema memakainya untuk memvalidasi dan melengkapi berkas secara otomatis saat kamu mengetik.

## Ollama lokal — tidak ada yang meninggalkan perangkatmu {#local-ollama--nothing-leaves-your-machine}

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

Endpoint apa pun yang kompatibel dengan OpenAI bekerja dengan cara yang sama — LM Studio, llama.cpp, gateway perusahaan: ubah `baseURL` milik vendor (dan tambahkan `apiKey` di sebelahnya kalau endpoint-nya memintanya).
Role berbentuk `"provider:model"`, dipisah pada `:` pertama — itulah sebabnya `"ollama:gemma4:e4b"` tetap berfungsi meski id modelnya mengandung titik dua.

## Dua role: cepat sebagai bawaan, pintar saat diperlukan {#two-roles-fast-by-default-smart-on-demand}

Role memisahkan prompt dari model.
Prompt menyebut sebuah role (`role: smart` di frontmatter prompt tersebut); model mana yang dimaksud diputuskan di sini — tukar kapan saja tanpa menyentuh prompt.

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

Sampai di sinilah konfigurasi yang khas ZenCopy.
Format berkasnya sendiri milik [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — gateway, pengaturan per model, dan selebihnya didokumentasikan di sana, dengan konfigurasi siap pakai dalam tiga ukuran di [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
