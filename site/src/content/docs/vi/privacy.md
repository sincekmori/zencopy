---
title: Quyền riêng tư
description: Những gì rời khỏi thiết bị của bạn, những gì ở lại, và những bên nào khác có liên quan.
sidebar:
  hidden: true
---

ZenCopy là ứng dụng desktop chạy cục bộ.
Nó không có máy chủ, không có tài khoản và không có telemetry.

## Những gì rời khỏi thiết bị của bạn

Khi bạn nhấn thao tác kích hoạt (<span data-os-modifier>Ctrl/⌘</span> + C + C), nội dung bộ nhớ tạm bắt được sẽ được gửi thẳng đến nhà cung cấp LLM do _chính bạn_ cấu hình — không gì khác, và không đi đâu khác.
Chính xác những gì được gửi phụ thuộc vào hành động được chạy:

- Prompt đã dựng hoàn chỉnh, có thể nhúng ngữ cảnh của lần bắt dưới dạng [biến mẫu](/vi/configuration/): văn bản và mã định dạng đã sao chép, tên ứng dụng nguồn và tiêu đề cửa sổ, URL của trang, ngày giờ, và ngôn ngữ của bạn.
- Với hình ảnh hoặc các tệp được sao chép, bản thân nội dung được đính kèm (tối đa 10 MB mỗi lần bắt) — và với tệp, cả đường dẫn đầy đủ.
  Theo mặc định, cửa sổ nổi sẽ hỏi trước khi gửi những nội dung này.

Một lần sao chép bình thường không bao giờ bị bắt và không bao giờ bị gửi đi.
Nội dung bộ nhớ tạm được các ứng dụng khác đánh dấu là nhạy cảm (ví dụ trình quản lý mật khẩu) sẽ bị bỏ qua.

## Những gì ở lại trên thiết bị của bạn

- Khóa API của bạn (`ai-sdk-catalog.json` trong thư mục cấu hình ứng dụng — không bao giờ được đóng gói kèm, không bao giờ được tải lên).
- Cài đặt của bạn (giao diện, ngôn ngữ, vị trí cửa sổ nổi, …).
- Các tệp nhật ký.
  Nhật ký che thông tin bí mật và không bao giờ chứa nội dung sao chép hay khóa API.

## Bên thứ ba

Việc bạn sử dụng một nhà cung cấp LLM chịu sự điều chỉnh của điều khoản và chính sách quyền riêng tư của chính nhà cung cấp đó.
ZenCopy không thêm bên trung gian nào: nội dung của bạn chỉ đi đến nhà cung cấp bạn cấu hình, và việc sử dụng cùng chi phí là của riêng bạn.

## Đừng chỉ tin lời chúng tôi

ZenCopy là mã nguồn mở (Apache-2.0).
Mọi tuyên bố trên trang này đều có thể kiểm chứng bằng [mã nguồn](https://github.com/sincekmori/zencopy).
