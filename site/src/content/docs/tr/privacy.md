---
title: Gizlilik
description: Cihazından neler çıkar, neler kalır ve başka kimler işin içinde.
sidebar:
  hidden: true
---

ZenCopy yerel bir masaüstü uygulamasıdır.
Sunucusu, hesabı ve telemetrisi yoktur.

## Cihazından neler çıkar

Tetikleyiciye bastığında (<span data-os-modifier>Ctrl/⌘</span> + C + C), yakalanan pano içeriği doğrudan _senin_ yapılandırdığın LLM sağlayıcısına gönderilir — başka hiçbir şey ve başka hiçbir yere.
Tam olarak neyin gönderileceği, çalışan eyleme bağlıdır:

- Render edilmiş prompt; yakalamanın bağlamını [şablon değişkenleri](/tr/configuration/#actionsmd) olarak içerebilir: kopyalanan metin ve markup, kaynak uygulamanın adı ve pencere başlığı, sayfa URL'si, tarih ve arayüz dilin.
- Görselde ya da kopyalanan dosyalarda içeriğin kendisi eklenir (yakalama başına 10 MB'a kadar) — dosyalarda tam yolları da.
  Varsayılan olarak açılır pencere, bunları göndermeden önce sorar.

Tek bir normal kopyalama asla yakalanmaz ve asla gönderilmez.
Başka uygulamaların hassas olarak işaretlediği pano içeriği (örn. parola yöneticileri) yok sayılır.

## Cihazında neler kalır

- API anahtarların (uygulama yapılandırma dizinindeki `ai-sdk-catalog.json` — asla pakete dahil edilmez, asla yüklenmez).
- Ayarların (tema, dil, açılır pencere konumu, …).
- Günlük dosyaları.
  Günlükler gizli bilgileri ayıklar; kopyalanan içeriği ya da API anahtarlarını asla içermez.

## Üçüncü taraflar

Bir LLM sağlayıcısını kullanman, o sağlayıcının kendi koşullarına ve gizlilik politikasına tabidir.
ZenCopy araya hiçbir aracı katmaz: içeriğin yalnızca yapılandırdığın sağlayıcıya gider; kullanımı ve maliyetleri sana aittir.

## Sözümüze güvenmek zorunda değilsin

ZenCopy açık kaynaktır (Apache-2.0).
Bu sayfadaki her iddia [kaynak kodla](https://github.com/sincekmori/zencopy) doğrulanabilir.
