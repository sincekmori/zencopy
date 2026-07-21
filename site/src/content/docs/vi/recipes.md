---
title: Cấu hình mẫu
description: Các thiết lập ai-sdk-catalog.json để sao chép và dán, từ một nhà cung cấp duy nhất đến vai trò trải trên nhiều nhà cung cấp.
---

Trang này dành cho **người dùng thành thạo** chỉnh sửa trực tiếp tệp cấu hình.
Nếu bạn thích ở yên trong các màn hình của chính ứng dụng, bạn sẽ không bao giờ cần đến nó.

Các điểm khởi đầu sao chép-và-dán cho `ai-sdk-catalog.json`.
Đặt tệp vào [thư mục cấu hình ứng dụng](/vi/configuration/); chỉnh sửa có hiệu lực ở lần kích hoạt kế tiếp.

## Một nhà cung cấp, một mô hình

Những gì giao diện cài đặt ghi ra — với phần lớn mọi người, đây là toàn bộ tệp:

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

Dòng `$schema` là tùy chọn; các trình soạn thảo hiểu JSON Schema dùng nó để kiểm tra và tự hoàn thành tệp khi bạn gõ.

## Ollama chạy tại máy — không gì rời khỏi máy bạn

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

Mọi endpoint tương thích OpenAI đều hoạt động theo cùng cách — LM Studio, llama.cpp, gateway công ty: đổi `baseURL` của vendor (và thêm `apiKey` bên cạnh nếu endpoint yêu cầu).
Một vai trò có dạng `"provider:model"`, tách tại dấu `:` đầu tiên — vì vậy `"ollama:gemma4:e4b"` vẫn hoạt động dù id mô hình chứa dấu hai chấm.

## Hai vai trò: nhanh theo mặc định, thông minh khi cần

Vai trò tách rời hành động khỏi mô hình.
Hành động gọi tên một vai trò (`role: smart` trong frontmatter của hành động); vai trò đó ứng với mô hình nào được quyết định ở đây — đổi lúc nào cũng được mà không đụng đến hành động.

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

Các thiết lập dành riêng cho ZenCopy chỉ đến đây là hết.
Bản thân định dạng tệp thuộc về [ai-sdk-catalog](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog#readme) — gateway, thiết lập theo từng mô hình và phần còn lại đều được mô tả ở đó, kèm các cấu hình làm sẵn ở ba kích cỡ trong [`examples/`](https://github.com/sincekmori/ai-sdk-utils/tree/main/packages/catalog/examples).
