---
title: Privacy
description: What leaves your device, what stays, and who else is involved.
sidebar:
  hidden: true
---

ZenCopy is a local desktop app.
It has no server, no account, and no telemetry.

## What leaves your device

When you press the trigger (<span data-os-modifier>Ctrl/⌘</span> + C + C), the captured clipboard content is sent directly to the LLM provider _you_ configured — nothing else, and nowhere else.
What exactly is sent depends on the prompt that runs:

- The rendered prompt, which can embed the capture's context as [template variables](/en/configuration/#promptsmd): the copied text and markup, the source app's name and window title, the page URL, the date, and your locale.
- For an image or copied files, the content itself is attached (up to 10 MB per capture) — and for files, their full paths.
  By default the popup asks before sending these.

A single normal copy is never captured and never sent.
Clipboard content that other apps mark as sensitive (e.g. password managers) is ignored.

Separately from captures, checking for updates asks GitHub for release metadata — never any of your content.

## What stays on your device

- Your API keys (`ai-sdk-catalog.json` in the app config dir — never bundled, never uploaded).
- Your settings (theme, language, popup position, …).
- Log files.
  Logs redact secrets and never include copied content or API keys.

- Usage statistics (a settings toggle, on by default): which prompt ran on which kind of capture, plus the model and token counts, so your costs stay computable.
  Kept in a local file only — never the copied content, never sent anywhere.

## Third parties

Your use of an LLM provider is governed by that provider's own terms and privacy policy.
ZenCopy adds no intermediary: your content goes only to the provider you configure, and its use and costs are your own.

## Don't take our word for it

ZenCopy is open source (Apache-2.0).
Every claim on this page can be verified against [the source code](https://github.com/sincekmori/zencopy).
