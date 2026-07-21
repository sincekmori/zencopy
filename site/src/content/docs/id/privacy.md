---
title: Privasi
description: Apa yang meninggalkan perangkatmu, apa yang tetap di sana, dan siapa lagi yang terlibat.
sidebar:
  hidden: true
---

ZenCopy adalah aplikasi desktop lokal.
Tidak punya server, tidak punya akun, dan tidak punya telemetri.

## Apa yang meninggalkan perangkatmu

Saat kamu menekan pemicu (<span data-os-modifier>Ctrl/⌘</span> + C + C), konten papan klip yang ditangkap dikirim langsung ke penyedia LLM yang _kamu_ atur — tidak ada yang lain, dan tidak ke mana pun yang lain.
Apa persisnya yang dikirim bergantung pada aksi yang berjalan:

- Prompt yang sudah dirender, yang dapat menyematkan konteks tangkapan sebagai [variabel templat](/id/configuration/): teks dan markup yang disalin, nama aplikasi sumber dan judul jendelanya, URL halaman, tanggal, dan lokalmu.
- Untuk gambar atau berkas yang disalin, kontennya sendiri dilampirkan (hingga 10 MB per tangkapan) — dan untuk berkas, jalur lengkapnya juga.
  Secara bawaan popup bertanya dulu sebelum mengirimnya.

Salinan tunggal biasa tidak pernah ditangkap dan tidak pernah dikirim.
Konten papan klip yang ditandai sensitif oleh aplikasi lain (mis. pengelola kata sandi) diabaikan.

## Apa yang tetap di perangkatmu

- Kunci API kamu (`ai-sdk-catalog.json` di direktori konfigurasi aplikasi — tidak pernah dibundel, tidak pernah diunggah).
- Pengaturanmu (tema, bahasa, posisi popup, …).
- Berkas log.
  Log menyamarkan rahasia dan tidak pernah menyertakan konten yang disalin maupun kunci API.

## Pihak ketiga

Pemakaianmu atas sebuah penyedia LLM diatur oleh ketentuan dan kebijakan privasi penyedia itu sendiri.
ZenCopy tidak menambahkan perantara apa pun: kontenmu hanya pergi ke penyedia yang kamu atur, dan pemakaian serta biayanya menjadi tanggunganmu.

## Jangan hanya percaya kata kami

ZenCopy bersifat open source (Apache-2.0).
Setiap klaim di halaman ini dapat diverifikasi terhadap [kode sumbernya](https://github.com/sincekmori/zencopy).

## Situs web ini

zencopy.app adalah situs statis.
Tidak memasang cookie dan tidak menjalankan analitik.
