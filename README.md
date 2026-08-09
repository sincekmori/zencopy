<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/assets/zencopy-logo-dark.svg">
  <img src="src/assets/zencopy-logo.svg" alt="ZenCopy" width="280">
</picture>

**Copy twice, act instantly.**

Talk to an AI anywhere, the moment you want to — the answer to whatever you copied appears on the spot, and the conversation continues right there. A calm, resident desktop agent, summoned by **Ctrl/Cmd + C + C**.

[![Latest release](https://img.shields.io/github/v/release/sincekmori/zencopy)](https://github.com/sincekmori/zencopy/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/sincekmori/zencopy/total)](https://github.com/sincekmori/zencopy/releases)
[![License](https://img.shields.io/github/license/sincekmori/zencopy)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/sincekmori/zencopy/ci.yml?branch=main&label=CI)](https://github.com/sincekmori/zencopy/actions/workflows/ci.yml)

[![i18n](https://img.shields.io/badge/i18n-19_languages-blue)](https://zencopy.app/)
[![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=fff)](https://tauri.app/)

</div>

---

## What it is

ZenCopy is a resident agent that summons an AI conversation on top of any app. No chat site to open, no pasting — you ask about what you are looking at, right where you are.

The signal is **Ctrl/Cmd + C + C** — your ordinary copy, twice, quickly. From there, in order:

1. what you had selected — text, image, or files — is captured,
2. a small popup opens in the corner of your screen,
3. the default prompt streams its answer immediately (out of the box that is **Zen**, which distills the copy to its essence in one sentence; switching to Explain, Translate, Polish, or your own prompts takes one click or one number key),
4. and a message field waits under the answer — "more detail", "as a table", "in English?". The conversation continues in place, no window switch.

A single normal copy is never disturbed.

Use it for a while and a habit forms: **when you want to ask an AI, you just copy twice.** Opening a chat site, finding the tab, pasting — all of it disappears. The copy everyone already knows becomes the door to an AI.

## Why ZenCopy

Plenty of tools put an AI popup near your selection — most are macOS-only, text-only, and tied to one vendor's models or a subscription. ZenCopy's combination is what's rare:

- **The conversation comes to you** — no hunting for a chat window; the first answer is automatic, the rest is yours to steer.
- **Windows, macOS, and Linux**, one behavior.
- **Your model, your rules** — any provider (OpenAI / Google / Anthropic / a corporate gateway / local Ollama); keys never leave your machine, and a free Gemini API key is enough to start.
- **Everything you copy** — text, images, and files, not just selected text. You can even talk to a screenshot.
- **Rules you control** — which prompt runs is decided by declarative rules (capture kind, plus app / window / URL / length overrides), edited in the GUI or as a file.
- **Calm and honest** — no account, no subscription, no telemetry. Apache-2.0.

## Highlights

- **Conversation in place** — reply under any answer with questions, instructions, or tangents; every reply carries copy and retry (retry rewinds the thread to that reply), Enter sends, Shift+Enter breaks a line, and an IME's confirming Enter never sends by accident.
- **One global trigger** — Ctrl/Cmd + C + C, anywhere. Powered by the [`copycopy`](https://crates.io/crates/copycopy) crate.
- **Streaming, calm popup** — the copied content on top, the operation in the middle, the result below.
- **Provider-agnostic LLM** — built on the Vercel AI SDK + [`ai-sdk-catalog`](https://www.npmjs.com/package/ai-sdk-catalog). Roles map to models in a single config file; swap providers without touching prompts.
- **Not just text** — formatted copies arrive as Markdown; images and files attach as-is, with the type decided by contents, never by file extension.
- **Resident & unobtrusive** — tray icon, frameless always-on-top popup you can drag and resize, launch-at-login (toggleable), recall the last result from the tray, dismiss with Esc or the close button.
- **Multi-display & multi-Space aware** — windows open where you are working.
- **Privacy-aware** — clipboard content marked sensitive (passwords/secrets) is ignored.
- **Theme & i18n** — light / dark / system; **19 languages** including RTL (Arabic, Persian, Hebrew), following the OS by default.

Platforms: **Windows, macOS, and Linux**.
On Linux, GNOME on Wayland is supported via a bundled GNOME Shell extension (installed automatically, no sudo) and X11 via a key listener;
other Wayland compositors (KDE, wlroots, …) are not supported yet.

## Develop

Prerequisites: [Bun](https://bun.sh), the [Rust toolchain](https://rustup.rs), and the [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/).

```sh
bun install
bun run tauri dev      # run the app
bun run tauri build    # produce a release bundle
```

Frontend checks: `bun run lint`, `bun run build`, `bun run format`. Backend: `cargo build` / `cargo clippy` / `cargo fmt` in `src-tauri/`.

## Configuration

Settings split into two layers:

- **GUI (Settings window)** — AI provider (a free Gemini key is the fastest start), the prompts editor, rules (per-kind assignments and override rules), popup position, theme, language, launch at login. Stored per-user.
- **Files (power users)** — read from the per-user app config dir (macOS: `~/Library/Application Support/app.zencopy/`; the exact path is logged at startup). Defaults for rules and prompts are embedded in the app, so these files only ever override:
  - `ai-sdk-catalog.json` — providers and **role → model** mapping. API keys live inline in this local file (what the settings UI writes) and never leave your machine.
  - `rules.json` — `kind → prompt`, plus higher-priority `overrides`.
  - `prompts/*.md` — prompt definitions: YAML frontmatter (`id`, `label`, optional `role`, `instructions`) + a Liquid prompt body. Template variables like `{{ text }}` embed the capture's context — the full table lives in the [configuration docs](https://zencopy.app/en/configuration/#promptsmd).

The Settings window covers the common setups (OpenAI / Google / Anthropic / any OpenAI-compatible endpoint such as Ollama); editing `ai-sdk-catalog.json` unlocks the rest — multiple providers, corporate gateways, per-role models.

## Privacy

No telemetry, no accounts, no intermediary server — copied content goes only to the LLM provider you configure.
See [PRIVACY.md](PRIVACY.md).
