# ZenCopy Agent Guide

Notes for coding agents (Copilot, Claude Code, Cursor, …) working in this repo.
Humans are welcome to read it too.

## Overview

ZenCopy is a Tauri v2 desktop agent for Windows, macOS, and Linux.
React 19 + Vite 8 frontend, Rust backend.
The global trigger (Ctrl/Cmd + C + C) runs an AI prompt on whatever was copied and shows the result in a small popup.
See [README.md](README.md) for the product overview.

## Local checks (mirror CI)

Everything CI runs is scripted or is a one-liner:

- `bun install` — install JS deps (also `bun install --cwd site` for the knip site workspace)
- `bun run lint` — oxlint (`--deny-warnings`: a warning fails the run, locally and in CI), then the site workspace: eslint (eslint-plugin-astro `flat/all` + strict a11y, for the `.astro` files oxlint cannot parse) and `astro check`.
  Needs `bun install --cwd site` once.
- `bun run lint:dead` — knip: unused files, exports, and dependencies across root + site.
  Note its limit: a value that is _serialized on one side of the Rust ↔ TS IPC boundary and schema-declared on the other_ looks used to every per-language tool — when adding or removing a `CapturePayload`-style field, check both sides by hand.
- `bun run format:check` — oxfmt, then prettier (`prettier-plugin-astro`) for `site/**/*.astro` (write with `bun run format`).
  oxfmt also formats `site/**/*.mdx` (list markers, emphasis, tables — never the line breaks of prose), so the Semantic Line Breaks policy below applies to `.mdx` as well; run `bun run format` after editing.
- `bun run lint:toml` — Tombi with `--error-on-warnings`
- `bun run build` — `bun run icons`, then `tsc -b && vite build`: produces `src-tauri/icons/` and `dist/`, the two things the Rust build embeds, so it comes before the cargo commands (as in CI)
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo build --manifest-path src-tauri/Cargo.toml`

To reset the local app state to a clean first-run (config with API keys, settings store, logs, autostart entry, and on Linux the copycopy GNOME Shell extension): `bun run dev-reset` (asks for confirmation; `-y` skips it).
It is a TypeScript script ([scripts/dev-reset.ts](scripts/dev-reset.ts)) running on bun, covering macOS, Linux, and Windows.

To exercise the auto-update UI without publishing a release: `VITE_ZENCOPY_FAKE_UPDATE=9.9.9 bun tauri dev` fakes an available update (About button, tray item, popup hint; download/install are simulated delays).
Dev builds only — the flag is ignored in production ([src/lib/updater.ts](src/lib/updater.ts)).

To screenshot the app's screens per locale without launching the app: `bun run screenshot [scenario …] [--out <root>]` (scenarios default to all; each shot lands at `<root>/<locale>/screenshots/<scenario>.png`, default root `site/public`, so docs can reference `/{locale}/screenshots/<scenario>.png` — commit only what a doc actually uses).
Every scenario is rendered as Windows and as macOS (the app spells the key chord off the user agent): a scenario flagged `os` in the registry lands twice, the macOS render as `<scenario>.mac.png`, and the docs embed it through [site/src/components/Screenshot.astro](site/src/components/Screenshot.astro), which the head script swaps to the `.mac` file on a Mac; a scenario without the flag must render identically on both in every locale, or the runner fails naming the shot to flag (a flagged scenario's two renders may coincide in a locale where a dialog covers the chord — it still lands twice, so the docs' reference holds).
It renders the React app in headless Playwright WebKit (the webview's own engine; one-time `bunx playwright install webkit`) against a Tauri-IPC mock.
The parts: [screenshot.html](screenshot.html) (dev-server entry) → [src/screenshot/harness.ts](src/screenshot/harness.ts) (the mock, fed by the real `src-tauri/prompts/*.md` and `rules.json`) → [scripts/screenshot.ts](scripts/screenshot.ts) (the runner); scenarios are declared in [src/lib/screenshot.ts](src/lib/screenshot.ts) and ride the URL (`?screenshot=…`), which components react to via `screenshotScenario()`.
Dev-only throughout: production builds contain neither the harness nor a live scenario check.

To generate the docs' demo videos without recording a screen at all: `bun run demo-video [--locale <code>] [--record] [--out <root>] [--keep-work]` (each locale is one session through the four demos declared in [scripts/demo-video/demos.ts](scripts/demo-video/demos.ts) — `summarize`, `explain`, `follow-up`, `custom`, each picking up where the previous left off — captured continuously and cut into `<root>/<locale>/demo/<demo>.mp4` plus a poster `.jpg`, default root `site/public`, what [site/src/components/DemoVideo.astro](site/src/components/DemoVideo.astro) serves).
It drives the popup through the same harness in headless WebKit, captures its window as 2× frames with a transparent background, and composites them with ffmpeg: the first demo over a page WebKit renders too — a plain, unbranded mail client ([scripts/demo-video/mail.html](scripts/demo-video/mail.html): folders, the inbox list with the mail open, the reading pane) showing the sample email of [scripts/demo-video/source.txt](scripts/demo-video/source.txt), selected before the eye, the popup landing top right — and the rest over a plain backdrop, the popup alone.
That source text is also what the guide embeds as its sample ([site/src/components/SampleEmail.astro](site/src/components/SampleEmail.astro)), so the mail in the video and the mail on the page are one file; after editing it, re-record.
The model's answers are real once: `--record` runs the session against Gemini 3.1 Flash Lite (`GEMINI_API_KEY` in the environment, ~$0.003 per locale) and keeps everything in `scripts/demo-video/recordings/<locale>.json` — the copied text, what was typed, each reply as text, and the responses as they streamed — and every later run replays that file (the harness answers the app's model calls from it, chunk by chunk at the recorded times), so the videos regenerate with no model call.
A replay shows the product as it is now (the popup, its labels, the prompts) with the recording's content: the copied text, the typed messages, and the replies come from the file — edit them there and the next replay shows the edit (a reply is streamed at the recorded pace, in the recorded shape) — and only the clock is borrowed, so a request that no longer matches the recording's, or a session that made fewer model calls than the recording holds, is reported as drift; `--record` has the model answer afresh.
A replay refuses to run when `source.txt` no longer matches the recording's copied text — the page behind the first demo is rendered from the file and the popup shows the recording, and a video must not show two mails — so after editing the file, re-record.
The drivers read the popup's state off the DOM (`data-run-state` on the headline, `data-turn-status` on a failed or setup reply — [src/components/popup.tsx](src/components/popup.tsx)), never off icon or utility class names.
A demo can carry captions, burned into the video: [scripts/demo-video/captions.ts](scripts/demo-video/captions.ts) holds one line per beat, per locale and demo (the first demo's four — the mail as it is, the selection, the chord, the summary complete), with `{chord}` for the visitor's key chord and `{lang}` / `{lang:in}` / `{lang:into}` for the viewer's language in the form the sentence needs (from [src/lib/language-forms.ts](src/lib/language-forms.ts)); WebKit sets each line in the site's font stack and ffmpeg lays it over the video from its beat's moment, which the generator takes off the page beats and the session's own clock, never off the footage.
A demo whose lines name the chord comes as two videos, `<demo>.mp4` saying Ctrl + C + C and `<demo>.mac.mp4` saying ⌘ + C + C (one poster, the default's), and the docs head script swaps the source on a Mac; a locale without an entry gets uncaptioned videos, so captions are part of translating a locale, followed by regenerating it.
Locales default to the recorded ones; recording a locale needs every string the demos type (`instruction`, `concise`) in its `POPUP_RESULT_FIXTURES` entry first, and `--record` without `--locale` takes exactly those locales.
`--keep-work` leaves each run's frames and a `report.json` (step timings, usage, replay drift) under `scratch/demo-video/`; a failed locale keeps them regardless, its `report.json` naming what stopped it.
Needs ffmpeg 9 on PATH besides the screenshot prerequisites.

The brand mark is drawn once, in [src/lib/brand.ts](src/lib/brand.ts) — the two arcs on Lucide's 24-unit grid, with functions that render them for a use (color, stroke, placement, a `pathLength` for a draw animation) as SVG strings, plus the raw geometry for React — and no brand file is committed: everything that shows it is rendered from the module when it is built, so a change to the mark is a change to that one file.
The name beside it is always plain text in the surrounding font (never outlines): the app's `ZenCopyMark`, both site headers, the landing hero, and the docs architecture diagram inline the mark in `currentColor` and write "ZenCopy" next to it.
The site's `favicon.svg` (the app icon, which the README shows too), `apple-touch-icon.png`, and `og.png` (the mark and the name over the en hero tagline of `landing-copy.ts`) are endpoints under [site/src/pages/](site/src/pages/), built with the site.
[scripts/icons.ts](scripts/icons.ts) renders the app icon set and the tray glyph into `src-tauri/icons/` (gitignored) through `tauri icon`; `bun run build` runs it first and `tauri dev` runs it before the dev server, so the Rust build always embeds the current brand — after a fresh clone, run `bun run build` (or `bun run icons`) once before a bare `cargo` command.
The dev server's tab icon is the same icon, inlined by a plugin in [vite.config.ts](vite.config.ts).

Run everything relevant to your change before opening a PR.
Windows- and Linux-side compilation is CI's job (the Rust code here is only ever compiled for macOS locally).
See [.github/workflows/ci.yml](.github/workflows/ci.yml) for the exact recipe.

## React

**React Compiler is enabled** (see [vite.config.ts](vite.config.ts)).
It auto-memoizes components and hooks at build time.

- **Do NOT reach for `useCallback`, `useMemo`, or `React.memo` in new code.**
  The compiler handles memoization automatically and more precisely than a human can.
- **Exception**: keep manual `useCallback` / `useMemo` when the memoized value MUST be passed as a `useEffect` dependency and you want a guaranteed-stable reference even if the compiler bails out on that component.
  Add a short comment saying why.
- Follow the [Rules of React](https://react.dev/reference/rules) strictly so the compiler can optimize freely.
  Rule violations cause silent bail-outs (the affected component is skipped, the rest of the app is still optimized).

## TypeScript & frontend style

- Linter: [oxlint](https://oxc.rs/docs/guide/usage/linter.html).
  Do not disable rules inline unless you can justify it in a comment.
- Formatter: [oxfmt](https://oxc.rs/).
  Runs across `**/*.{ts,tsx,md}` unless ignored in [.oxfmtrc.json](.oxfmtrc.json).
- Path alias `@/` points at `src/` (see [tsconfig.json](tsconfig.json) and [vite.config.ts](vite.config.ts)).
- UI primitives live under [src/components/ui/](src/components/ui/); higher level views under [src/components/](src/components/).

## Logging

Both sides share the same sinks (tauri-plugin-log): stdout in dev, a rotating file in the platform log dir in release (macOS: `~/Library/Logs/app.zencopy/`).

- Frontend: log through the scoped logger from [src/lib/log.ts](src/lib/log.ts) — `const log = createLogger("scope")`, then `log.error("what failed", error)`.
  Never call `console.*` or `@tauri-apps/plugin-log` directly: the logger adds the window label, expands errors in full (own properties, stack, cause chain), and redacts secrets and copied content.
  Uncaught errors, unhandled rejections, and `console.warn`/`console.error` are forwarded automatically (`installGlobalErrorLogging` in [src/main.tsx](src/main.tsx)).
- Rust: never discard a `Result` with `let _ =` — use `.or_log("context")` (the `OrLog` trait in [src-tauri/src/lib.rs](src-tauri/src/lib.rs)) so degraded behavior leaves a trace.
  When code falls back silently by design (config parsing, defaults), `log::warn!` the reason first.
- **Privacy: dependency logs are a leak channel.**
  Everything above (redaction, scoping) applies only to _our_ log calls — dependency crates log through `log` directly, and one that processes a capture can write the user's copied content into the log verbatim (html5ever did exactly that, as ~90% of the file).
  This is why the plugin's level is `Info` with `Debug` granted only to our own targets (`zencopy_lib`, `webview`): keep it that way, and before adding or unmuting any dependency that touches captured content, check what it logs.

## i18n

- All user-visible strings live in [src/lib/messages/](src/lib/messages/) — one file per locale (19 languages), each annotated with the `Messages` interface from `types.ts`, so the compiler forces every locale to provide every key.
- Access via `useT()` from [src/lib/i18n.tsx](src/lib/i18n.tsx).
  Do not hard-code English (or Japanese) into components.
- Adding a language = one new locale file plus `messages` / `LOCALES` entries in [src/lib/messages/index.ts](src/lib/messages/index.ts); extend `locale_from_tag` in [src-tauri/src/tray.rs](src-tauri/src/tray.rs) (tray menu) to match.
  The docs side of it: a `POPUP_RESULT_FIXTURES` entry in [src/lib/screenshot-scenarios.ts](src/lib/screenshot-scenarios.ts) (the strings the screenshots show and the demo session types), then `bun run screenshot --locale <code>` and `bun run demo-video --record --locale <code>` for its screenshots and videos, a `LANDING_LOCALES` entry and copy in [site/src/components/landing-copy.ts](site/src/components/landing-copy.ts), and the docs under `site/src/content/docs/<code>/`.
- RTL locales (ar, fa, he) flip the layout via `<html dir>` — use logical Tailwind utilities (`ms-*`, `me-*`, `text-start`, …), never physical ones (`ml-*`, `text-left`), except for screen-physical UI like the popup-corner picker.
- Changing a `Messages` key means updating all 19 locale files in the same commit — the build fails otherwise, by design.
- The ja docs are the reference the other locales are translated from, so their prose never hard-codes the reader's language: wherever it means _the language this page is in_, it renders [site/src/components/PageLanguage.astro](site/src/components/PageLanguage.astro), whose `form` attribute picks the shape the sentence needs (`name` 日本語, `in` 日本語で, `into` 日本語に) from [src/lib/language-forms.ts](src/lib/language-forms.ts) — a `Record<Locale, …>`, so every locale must define all three; a translation keeps the component and picks the form its own sentence needs.
  A literal 日本語 in the ja text means Japanese itself and is translated as such; `Intl.DisplayNames` is not used for this, since its one standalone form (Español, Русский, Português (Brasil)) does not fit mid-sentence in a third of the locales.
  外国語 means _a language the reader does not read_ — a translator may make it concrete for the locale.
  The demo videos' sample mail is in English in every locale, so a locale whose language is English says nothing about the mail being foreign — the summary is simply a summary.
  OS-specific wording (keys, launchers, where the tray icon is) renders through [site/src/components/OsText.astro](site/src/components/OsText.astro) (and [CopyTwice.astro](site/src/components/CopyTwice.astro) for the signal), which the head script swaps to the visitor's OS; its no-JS fallback is English, the site's default language.
  In MDX a tag alone on its line is a block, and the sentence after it becomes a paragraph of its own — so never start a sentence with a tag; put a word before it (the Prose section says why the formatter is part of this).
- Docs heading anchors are locale-invariant: every translated heading carries the English page's slug explicitly (`## 見出し {#english-slug}`), so section links are identical in all 19 locales and translators copy them verbatim.
  English itself keeps auto-generated slugs — renaming an English heading is SUPPOSED to ripple, and `starlight-links-validator` fails the site build at every stale anchor until the translations and links catch up.

## Rust & Tauri

- Formatter: `rustfmt` (default settings).
- Linter: `clippy` with `-D warnings` in CI.
  Fix, do not silence, unless suppression is deliberate and commented.
- The Rust side is split by domain: [src-tauri/src/lib.rs](src-tauri/src/lib.rs) holds the `run()` wiring (trigger, setup, invoke handler) plus cross-cutting state; the domains live in sibling modules — `prompts.rs`, `rules.rs`, `capture.rs`, `attachments.rs` (+ `office.rs`), `config.rs`, `shell.rs`, `windows.rs`, `tray.rs`.
  New code goes into the module owning its domain, not into lib.rs.

## TOML

TOML files are linted with [Tombi](https://tombi-toml.github.io/tombi/), the same engine the Tombi VS Code extension uses, so CI catches exactly the warnings authors see locally.
`--error-on-warnings` is on, so deprecations (e.g. `package.authors`) fail CI.

## Prose (Markdown)

All `.md` and `.mdx` prose in this repo uses **Semantic Line Breaks** ([sembr.org](https://sembr.org/)): one physical line per sentence.
Optionally break after independent clauses (`,`, `;`, `:`, `—`) for clarity.
oxfmt's `proseWrap` defaults to `preserve` for both, so hand-authored line breaks are kept as-is.
Do NOT reflow paragraphs to a fixed column width — it hides real prose changes in reflow noise and makes `git blame` sentence-level attribution useless.
The one line oxfmt does re-break is an `.mdx` line that carries a component (`<OsText />`, `<CopyTwice />`, `<PageLanguage />`): it goes through the JSX printer, which splits it at the spaces around the tag once it exceeds `printWidth` — and a tag left alone on a line is a block to MDX, which cuts the paragraph in two on the rendered page.
That is why [.oxfmtrc.json](.oxfmtrc.json) raises `printWidth` to 320 for `site/**/*.mdx` (the most oxfmt accepts) and turns embedded code formatting off there, so fenced samples in docs stay exactly as written.
Still, never start a sentence with a tag — put a word before it.

## Commits

Conventional Commits, English, imperative mood.
Existing history is a good reference:

- `feat: …` / `fix: …` / `refactor: …` / `chore: …` / `docs: …`
- `ci: …` / `build: …` / `style: …`

Keep the summary line short and factual; put the "why" and any surprising context in the body.

## Constraints

- **The `gh` CLI may be used** for GitHub operations (Actions, API queries, releases, PRs).
  Outward-facing or hard-to-reverse operations (merging, publishing a release, changing repo settings) still happen at the user's direction, not on the agent's own initiative.
- **Linux support has boundaries.** The global trigger (copycopy) covers GNOME on Wayland (via a bundled GNOME Shell extension, auto-installed on first run) and X11 (key listener).
  On other Wayland compositors (KDE, wlroots, …) the app runs but the trigger stays inert — copycopy logs a warning to stderr.
  Don't claim broader Linux coverage than that in docs or UI.
- **macOS main-thread constraint.** `copycopy` installs `CGEventTap`, which must run on the main run loop; keep the Tauri `setup` hook path intact.

## Where to look first

| You want to change…           | Start here                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The popup (copy → AI result)  | [src/components/popup.tsx](src/components/popup.tsx)                                                                                                        |
| Settings window               | [src/components/settings.tsx](src/components/settings.tsx)                                                                                                  |
| About window                  | [src/components/about.tsx](src/components/about.tsx)                                                                                                        |
| AI provider / catalog         | [src/lib/llm.ts](src/lib/llm.ts); `ai-sdk-catalog.json` lives in the app config dir                                                                         |
| Global trigger, tray, windows | [src-tauri/src/lib.rs](src-tauri/src/lib.rs) (wiring), [src-tauri/src/tray.rs](src-tauri/src/tray.rs), [src-tauri/src/windows.rs](src-tauri/src/windows.rs) |
| Prompt templates              | [src-tauri/prompts/](src-tauri/prompts/) (pre-installed, embedded at build time, immutable at runtime); user prompts live in the app config dir             |
| Homepage / docs (zencopy.app) | [site/](site/) — Astro + Starlight, deployed via Cloudflare Workers                                                                                         |
| The brand mark and icons      | [src/lib/brand.ts](src/lib/brand.ts) — nothing else: every icon is rendered from it when the app or the site is built; the name is text                     |
