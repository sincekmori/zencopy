---
title: Prywatność
description: Co opuszcza Twoje urządzenie, co na nim zostaje i kto jeszcze bierze w tym udział.
sidebar:
  hidden: true
---

ZenCopy to lokalna aplikacja desktopowa.
Nie ma serwera, konta ani telemetrii.

## Co opuszcza Twoje urządzenie

Gdy naciśniesz wyzwalacz (<span data-os-modifier>Ctrl/⌘</span> + C + C), przechwycona treść schowka jest wysyłana bezpośrednio do dostawcy LLM skonfigurowanego przez _Ciebie_ — nic więcej i nigdzie indziej.
Co dokładnie jest wysyłane, zależy od uruchamianej akcji:

- Wyrenderowany prompt, który może osadzać kontekst przechwycenia jako [zmienne szablonu](/pl/configuration/): skopiowany tekst i znaczniki, nazwę aplikacji źródłowej i tytuł okna, URL strony, datę oraz Twoje locale.
- Dla obrazu lub skopiowanych plików dołączana jest sama treść (do 10 MB na przechwycenie) — a dla plików także ich pełne ścieżki.
  Domyślnie okienko pyta przed ich wysłaniem.

Pojedyncze zwykłe kopiowanie nigdy nie jest przechwytywane ani wysyłane.
Treść schowka, którą inne aplikacje oznaczają jako wrażliwą (np. menedżery haseł), jest ignorowana.

## Co zostaje na Twoim urządzeniu

- Twoje klucze API (`ai-sdk-catalog.json` w katalogu konfiguracyjnym aplikacji — nigdy nie są dołączane do aplikacji ani nigdzie przesyłane).
- Twoje ustawienia (motyw, język, pozycja okienka, …).
- Pliki logów.
  Logi mają usuwane sekrety i nigdy nie zawierają skopiowanej treści ani kluczy API.

## Strony trzecie

Twoje korzystanie z dostawcy LLM podlega warunkom i polityce prywatności tego dostawcy.
ZenCopy nie dodaje żadnego pośrednika: Twoja treść trafia wyłącznie do skonfigurowanego przez Ciebie dostawcy, a jej wykorzystanie i koszty są po Twojej stronie.

## Nie wierz nam na słowo

ZenCopy jest oprogramowaniem open source (Apache-2.0).
Każde stwierdzenie na tej stronie można zweryfikować w [kodzie źródłowym](https://github.com/sincekmori/zencopy).
