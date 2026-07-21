# ZenCopy Agent Guide

Notes for coding agents (Copilot, Claude Code, Cursor, …) working in this repo.
Humans are welcome to read it too.

## Overview

ZenCopy is a Tauri v2 desktop agent for Windows, macOS, and Linux.
React 19 + Vite 8 frontend, Rust backend.
The global trigger (Ctrl/Cmd + C + C) runs an AI action on whatever was copied and shows the result in a small popup.
See [README.md](README.md) for the product overview.

## Local checks (mirror CI)

Everything CI runs is scripted or is a one-liner:

- `bun install` — install JS deps (also `bun install --cwd site` for the knip site workspace)
- `bun run lint` — oxlint (`--deny-warnings`: a warning fails the run, locally and in CI), then the site workspace: eslint (eslint-plugin-astro `flat/all` + strict a11y, for the `.astro` files oxlint cannot parse) and `astro check`.
  Needs `bun install --cwd site` once.
- `bun run lint:dead` — knip: unused files, exports, and dependencies across root + site.
  Note its limit: a value that is _serialized on one side of the Rust ↔ TS IPC boundary and schema-declared on the other_ looks used to every per-language tool — when adding or removing a `CapturePayload`-style field, check both sides by hand.
- `bun run format:check` — oxfmt, then prettier (`prettier-plugin-astro`) for `site/**/*.astro` (write with `bun run format`).
  oxfmt also formats `site/**/*.mdx`, reflowing prose to a fixed column width — so the Semantic Line Breaks policy below applies to `.md` files only, and `.mdx` edits need a `bun run format` pass before committing.
- `bun run lint:toml` — Tombi with `--error-on-warnings`
- `bun run build` — `tsc -b && vite build` (produces `dist/`)
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo build --manifest-path src-tauri/Cargo.toml`

To reset the local app state to a clean first-run (config with API keys, settings store, logs, autostart entry, and on Linux the copycopy GNOME Shell extension): `bun run dev-reset` (asks for confirmation; `-y` skips it).
It is a TypeScript script ([scripts/dev-reset.ts](scripts/dev-reset.ts)) running on bun, covering macOS, Linux, and Windows.

To exercise the auto-update UI without publishing a release: `VITE_ZENCOPY_FAKE_UPDATE=9.9.9 bun tauri dev` fakes an available update (About button, tray item, popup hint; download/install are simulated delays).
Dev builds only — the flag is ignored in production ([src/lib/updater.ts](src/lib/updater.ts)).

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
- Adding a language = one new locale file plus `messages` / `LOCALES` entries in [src/lib/messages/index.ts](src/lib/messages/index.ts); extend `locale_from_tag` in [src-tauri/src/lib.rs](src-tauri/src/lib.rs) (tray menu) to match.
- RTL locales (ar, fa, he) flip the layout via `<html dir>` — use logical Tailwind utilities (`ms-*`, `me-*`, `text-start`, …), never physical ones (`ml-*`, `text-left`), except for screen-physical UI like the popup-corner picker.
- Changing a `Messages` key means updating all 19 locale files in the same commit — the build fails otherwise, by design.

## Rust & Tauri

- Formatter: `rustfmt` (default settings).
- Linter: `clippy` with `-D warnings` in CI.
  Fix, do not silence, unless suppression is deliberate and commented.
- The tray/window/menu wiring lives in [src-tauri/src/lib.rs](src-tauri/src/lib.rs).

## TOML

TOML files are linted with [Tombi](https://tombi-toml.github.io/tombi/), the same engine the Tombi VS Code extension uses, so CI catches exactly the warnings authors see locally.
`--error-on-warnings` is on, so deprecations (e.g. `package.authors`) fail CI.

## Prose (Markdown)

All `.md` prose in this repo uses **Semantic Line Breaks** ([sembr.org](https://sembr.org/)): one physical line per sentence.
Optionally break after independent clauses (`,`, `;`, `:`, `—`) for clarity.
oxfmt's `proseWrap` defaults to `preserve` for `.md`, so hand-authored line breaks are kept as-is.
Do NOT reflow paragraphs to a fixed column width — it hides real prose changes in reflow noise and makes `git blame` sentence-level attribution useless.
The exception is `site/**/*.mdx`, which oxfmt does reflow to a fixed column width: let the formatter own the wrapping there and run `bun run format` after editing.

## Commits

Conventional Commits, English, imperative mood.
Existing history is a good reference:

- `feat: …` / `fix: …` / `refactor: …` / `chore: …` / `docs: …`
- `ci: …` / `build: …` / `style: …`

Keep the summary line short and factual; put the "why" and any surprising context in the body.

## Constraints

- **The `gh` CLI may be used** for GitHub operations (Actions, API queries, releases, PRs).
  Outward-facing or hard-to-reverse operations (merging, publishing a release, changing repo settings) still happen at the user's direction, not on the agent's own initiative.
- **Do not commit until the user has verified the change.**
  Keep commit messages neutral and centered on what changed.
- **Linux support has boundaries.** The global trigger (copycopy) covers GNOME on Wayland (via a bundled GNOME Shell extension, auto-installed on first run) and X11 (key listener).
  On other Wayland compositors (KDE, wlroots, …) the app runs but the trigger stays inert — copycopy logs a warning to stderr.
  Don't claim broader Linux coverage than that in docs or UI.
- **macOS main-thread constraint.** `copycopy` installs `CGEventTap`, which must run on the main run loop; keep the Tauri `setup` hook path intact.
- **Corporate proxy quirks (local dev only):** if TLS revocation checks fail behind a corporate proxy, set `CARGO_HTTP_CHECK_REVOKE=false` for cargo and pass `--ssl-no-revoke` to curl.

## Where to look first

| You want to change…           | Start here                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| The popup (copy → AI result)  | [src/components/popup.tsx](src/components/popup.tsx)                                                                                            |
| Settings window               | [src/components/settings.tsx](src/components/settings.tsx)                                                                                      |
| About window                  | [src/components/about.tsx](src/components/about.tsx)                                                                                            |
| AI provider / catalog         | [src/lib/llm.ts](src/lib/llm.ts); `ai-sdk-catalog.json` lives in the app config dir                                                             |
| Global trigger, tray, windows | [src-tauri/src/lib.rs](src-tauri/src/lib.rs)                                                                                                    |
| Action templates              | [src-tauri/actions/](src-tauri/actions/) (pre-installed, embedded at build time, immutable at runtime); user actions live in the app config dir |
| Homepage / docs (zencopy.app) | [site/](site/) — Astro + Starlight, deployed via Cloudflare Workers                                                                             |
