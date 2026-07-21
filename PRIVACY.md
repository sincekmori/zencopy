# Privacy

ZenCopy is a local desktop app.
It has no server, no account, and no telemetry.

## What leaves your device

When you press the trigger (Ctrl/Cmd + C + C), the captured clipboard content is sent directly to the LLM provider _you_ configured — nothing else, and nowhere else.
What exactly is sent depends on the action that runs:

- The rendered prompt, which can embed the capture's context as template variables: the copied text and markup, the source app's name and window title, the page URL, the date, and your locale.
- For an image or copied files, the content itself is attached (up to 10 MB per capture) — and for files, their full paths.
  By default the popup asks before sending these.

A single normal copy is never captured and never sent.
Clipboard content that other apps mark as sensitive (e.g. password managers) is ignored.

## What stays on your device

- Your API keys (`ai-sdk-catalog.json` in the app config dir — never bundled, never uploaded).
- Your settings (theme, language, popup position, …).
- Log files.
  Logs redact secrets and never include copied content or API keys.

## Third parties

Your use of an LLM provider is governed by that provider's own terms and privacy policy.
ZenCopy adds no intermediary: your content goes only to the provider you configure, and its use and costs are your own.

## Warranty

ZenCopy is provided as is, without warranty of any kind, under the [Apache-2.0 license](LICENSE) (see its sections 7 and 8).
AI output can be inaccurate — verify it before you rely on it.
