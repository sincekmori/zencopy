---
title: สูตรสำเร็จ
description: การตั้งค่า ai-sdk-catalog.json แบบคัดลอกไปวางได้เลย ตั้งแต่ผู้ให้บริการรายเดียวไปจนถึง role ที่ครอบคลุมหลายราย
---

หน้านี้สำหรับ**ผู้ใช้ขั้นสูง**ที่แก้ไขไฟล์ตั้งค่าโดยตรง
ถ้าคุณสะดวกใช้เฉพาะหน้าจอในแอปเอง ก็ไม่จำเป็นต้องอ่านหน้านี้เลย

จุดเริ่มต้นแบบคัดลอกไปวางสำหรับ `ai-sdk-catalog.json`
วางไฟล์ไว้ใน[ไดเรกทอรีตั้งค่าแอป](/th/configuration/) การแก้ไขมีผลตั้งแต่ทริกเกอร์ครั้งถัดไป

## ผู้ให้บริการเดียว โมเดลเดียว

สิ่งที่ UI การตั้งค่าเขียน — สำหรับคนส่วนใหญ่ ทั้งไฟล์มีแค่นี้:

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

บรรทัด `$schema` จะใส่หรือไม่ก็ได้ เอดิเตอร์ที่เข้าใจ JSON Schema จะใช้มันตรวจสอบและเติมข้อความอัตโนมัติให้ระหว่างที่คุณพิมพ์

## Ollama ในเครื่อง — ไม่มีอะไรออกนอกเครื่องของคุณ

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

เอนด์พอยต์ที่เข้ากันได้กับ OpenAI ตัวไหนก็ใช้แบบเดียวกันได้ — LM Studio, llama.cpp, เกตเวย์องค์กร: เปลี่ยน `baseURL` ของ vendor (และเพิ่ม `apiKey` ไว้ข้าง ๆ ถ้าเอนด์พอยต์ต้องการ)
role คือ `"provider:model"` โดยแยกที่ `:` ตัวแรก — นี่คือเหตุผลที่ `"ollama:gemma4:e4b"` ใช้ได้แม้ id ของโมเดลจะมีโคลอนอยู่ข้างใน

## สอง role: เร็วเป็นค่าเริ่มต้น ฉลาดเมื่อต้องการ

role แยกแอ็กชันออกจากโมเดล
แอ็กชันระบุชื่อ role (`role: smart` ใน frontmatter ของแอ็กชัน) ส่วน role นั้นหมายถึงโมเดลไหนตัดสินกันที่นี่ — สลับได้ทุกเมื่อโดยไม่ต้องแตะแอ็กชันเลย

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

การตั้งค่าเฉพาะของ ZenCopy มีเพียงเท่านี้
รูปแบบไฟล์เป็นของ [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — เกตเวย์ การตั้งค่ารายโมเดล และเรื่องอื่น ๆ มีเอกสารอยู่ที่นั่น พร้อมตัวอย่างการตั้งค่าสำเร็จรูปสามขนาดใน [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples)
