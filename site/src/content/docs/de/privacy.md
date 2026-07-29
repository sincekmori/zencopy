---
title: Datenschutz
description: Was dein Gerät verlässt, was darauf bleibt und wer sonst noch beteiligt ist.
sidebar:
  hidden: true
---

ZenCopy ist eine lokale Desktop-App.
Sie hat keinen Server, kein Konto und keine Telemetrie.

## Was dein Gerät verlässt

Wenn du den Trigger drückst (<span data-os-modifier>Ctrl/⌘</span> + C + C), wird der erfasste Zwischenablage-Inhalt direkt an den LLM-Anbieter gesendet, den _du_ eingerichtet hast — nichts anderes, und nirgendwo sonst hin.
Was genau gesendet wird, hängt von der ausgeführten Aktion ab:

- Der gerenderte Prompt, der den Kontext der Erfassung als [Template-Variablen](/de/configuration/#actionsmd) einbetten kann: den kopierten Text und das Markup, den Namen der Quell-App und den Fenstertitel, die Seiten-URL, das Datum und deine Sprache.
- Bei einem Bild oder kopierten Dateien wird der Inhalt selbst angehängt (bis zu 10 MB pro Erfassung) — bei Dateien auch ihre vollständigen Pfade.
  Standardmäßig fragt das Popup, bevor diese gesendet werden.

Ein einzelnes normales Kopieren wird nie erfasst und nie gesendet.
Zwischenablage-Inhalte, die andere Apps als sensibel markieren (z. B. Passwort-Manager), werden ignoriert.

## Was auf deinem Gerät bleibt

- Deine API-Schlüssel (`ai-sdk-catalog.json` im App-Konfigurationsverzeichnis — nie mitgeliefert, nie hochgeladen).
- Deine Einstellungen (Design, Sprache, Popup-Position, …).
- Log-Dateien.
  Logs schwärzen Geheimnisse und enthalten nie kopierte Inhalte oder API-Schlüssel.

## Dritte

Deine Nutzung eines LLM-Anbieters unterliegt dessen eigenen Bedingungen und dessen eigener Datenschutzerklärung.
ZenCopy fügt keinen Vermittler hinzu: Deine Inhalte gehen nur an den Anbieter, den du einrichtest, und Nutzung und Kosten liegen bei dir.

## Verlass dich nicht auf unser Wort

ZenCopy ist Open Source (Apache-2.0).
Jede Aussage auf dieser Seite lässt sich am [Quellcode](https://github.com/sincekmori/zencopy) überprüfen.
