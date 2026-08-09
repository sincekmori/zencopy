<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/assets/zencopy-logo-dark.svg">
  <img src="src/assets/zencopy-logo.svg" alt="ZenCopy" width="280">
</picture>

**Copy twice, act instantly.**

A calm, resident desktop agent that turns whatever you copied into an instant AI result — triggered by **Ctrl/Cmd + C + C**.

[![Latest release](https://img.shields.io/github/v/release/sincekmori/zencopy)](https://github.com/sincekmori/zencopy/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/sincekmori/zencopy/total)](https://github.com/sincekmori/zencopy/releases)
[![License](https://img.shields.io/github/license/sincekmori/zencopy)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/sincekmori/zencopy/ci.yml?branch=main&label=CI)](https://github.com/sincekmori/zencopy/actions/workflows/ci.yml)

[![i18n](https://img.shields.io/badge/i18n-19_languages-blue)](https://zencopy.app/)
[![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?logo=tauri&logoColor=fff)](https://tauri.app/)

</div>

---

## What it is

ZenCopy lives quietly in your system tray. Press **Ctrl/Cmd + C + C** (copy twice in quick succession) on any selection, and a small popup appears with an AI result for what you copied. A single normal copy is never disturbed.

The default prompt is **Zen**: it distills the copied text to its essence in one short sentence, in your chosen language. Prompts are configurable, and you can add your own.

## Why ZenCopy

Plenty of tools put an AI popup near your selection — most are macOS-only, text-only, and tied to one vendor's models or a subscription. ZenCopy's combination is what's rare:

- **Windows, macOS, and Linux**, one behavior.
- **Your model, your rules** — any provider (OpenAI / Google / Anthropic / a corporate gateway / local Ollama); keys never leave your machine, and a free Gemini API key is enough to start.
- **Everything you copy** — text, rich text, images, and files, not just selected text.
- **Rules you control** — which prompt runs is decided by declarative rules (capture kind, plus app / window / URL / length overrides), edited in the GUI or as a file.
- **Calm and honest** — no account, no subscription, no telemetry. Apache-2.0.

## Highlights

- **One global trigger** — Ctrl/Cmd + C + C, anywhere. Powered by the [`copycopy`](https://crates.io/crates/copycopy) crate.
- **Streaming, calm popup** — the copied content on top, the operation in the middle, the result below; reply under any result to continue the conversation, with copy and retry beneath every answer.
- **Provider-agnostic LLM** — built on the Vercel AI SDK + [`ai-sdk-catalog`](https://www.npmjs.com/package/ai-sdk-catalog). Roles map to models in a single config file; swap providers without touching prompts.
- **Not just text** — rich text arrives as Markdown; images and files attach as-is, with the type decided by contents, never by file extension.
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
