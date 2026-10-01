use tauri::{Emitter, Manager, tray::TrayIconBuilder};

/// OOXML (docx/pptx/xlsx) text extraction for attachments.
mod office;

/// File attachments: sniffing, decoding, reading.
mod attachments;
/// Capture → popup payload conversion.
mod capture;
/// Config-dir paths, the AI catalog, full reset.
mod config;
/// Prompts: built-ins, user files, and their commands.
mod prompts;
/// Capture → prompt rules.
mod rules;
/// Handing URLs and folders to the OS shell.
mod shell;
/// Usage statistics: the append-only invocation JSONL.
mod stats;
/// The locale-aware tray menu, and the macOS app menu.
mod tray;
/// Window placement and reveal helpers.
mod windows;

use crate::attachments::read_capture_files;
use crate::capture::{build_capture_payload, source_preview};
use crate::config::{STORE_FILE, config_base, read_catalog, reset_all_settings, write_catalog};
use crate::prompts::{
    delete_prompt, export_prompt_file, import_prompt, import_prompt_from_file, list_prompts_ui,
    load_prompts, save_prompt,
};
use crate::rules::{get_rules_ui, load_rules, resolve_prompt, set_kind_prompt, set_overrides};
use crate::shell::{open_log_dir, open_url};
use crate::stats::{
    export_usage_csv, open_catalog_file, open_stats_dir, read_usage_stats, record_usage,
    reset_usage_stats,
};
// The app menu exists only on macOS (tray.rs gates the builder the same way).
#[cfg(target_os = "macos")]
use crate::tray::build_app_menu;
use crate::tray::{LOCALE_CHANGED, app_locale, build_tray_menu, locale_from_tag};
use crate::windows::{
    conceal_window, current_corner, open_about, open_settings, reveal_popup, reveal_window,
    summon_popup,
};

/// The settings-store key of the first-run flag: written by the frontend once
/// the welcome flow is done (src/lib/settings.ts; pinned by the ts_mirror
/// tests below), read by setup to decide whether to surface the window.
const WELCOME_SEEN_KEY: &str = "welcomeSeen";

/// Log-and-continue for fallible calls whose failure must not break the flow
/// (window operations on a resident HUD degrade, they don't crash). Prefer this
/// over `let _ =`, which silently discards the reason something didn't happen —
/// exactly the evidence needed when "the popup didn't show" gets reported.
pub(crate) trait OrLog {
    fn or_log(self, context: &str);
}

impl<T, E: std::fmt::Display> OrLog for Result<T, E> {
    fn or_log(self, context: &str) {
        if let Err(error) = self {
            log::warn!("{context} failed: {error}");
        }
    }
}

/// The latest trigger status copycopy reported. The status handler in setup
/// writes it; `trigger_status` serves it to windows that open after the
/// report landed (welcome, settings) — live updates ride the
/// `trigger-status` event. Mirrored by TriggerStatus in
/// src/lib/trigger-status.ts.
static TRIGGER_STATUS: std::sync::Mutex<Option<copycopy::TriggerStatus>> =
    std::sync::Mutex::new(None);

/// The latest trigger status (`None` until the listener settles).
#[tauri::command]
fn trigger_status() -> Option<copycopy::TriggerStatus> {
    TRIGGER_STATUS.lock().ok().and_then(|latest| latest.clone())
}

/// The version the update manager (src/lib/updater.ts, hosted by the hidden
/// About window) currently offers, `None` when up to date. Written via
/// `set_update_state`; read by the tray menu builder and by windows that load
/// after the announcement (`update_state`).
pub(crate) static UPDATE_VERSION: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// The pending update's version for late-loading windows (the popup's hint);
/// live changes ride the `update-state` event.
#[tauri::command]
fn update_state() -> Option<String> {
    UPDATE_VERSION.lock().ok().and_then(|latest| latest.clone())
}

/// Store the offered version, relabel the tray with (or without) its update
/// item, and broadcast `update-state` to every window.
#[tauri::command]
fn set_update_state(app: tauri::AppHandle, version: Option<String>) {
    match UPDATE_VERSION.lock() {
        Ok(mut latest) => {
            if *latest == version {
                return; // the 24h re-check found nothing new — no tray churn
            }
            *latest = version.clone();
        }
        Err(_) => return,
    }
    match build_tray_menu(&app, app_locale(&app)) {
        Ok(menu) => {
            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(menu))
                    .or_log("tray: relabel on update state change");
            }
        }
        Err(error) => log::warn!("tray relabel on update state change failed: {error}"),
    }
    app.emit("update-state", &version)
        .or_log("emit update-state");
}

/// One log line per status report, at a severity matching what it means for
/// the user — a silently dormant trigger is a warning, not info.
fn log_trigger_status(status: &copycopy::TriggerStatus) {
    use copycopy::TriggerStatus;
    match status {
        TriggerStatus::Listening => log::info!("trigger: listening"),
        TriggerStatus::GnomeExtensionOutdated { loaded, embedded } => log::info!(
            "trigger: listening via GNOME Shell extension v{loaded} (v{embedded} activates at the next login)"
        ),
        TriggerStatus::GnomeExtensionAwaitingLogin => log::warn!(
            "trigger: GNOME Shell extension installed but not loaded — active after one logout/login"
        ),
        TriggerStatus::UnsupportedSession => {
            log::warn!("trigger: no capture path in this session (non-GNOME Wayland)");
        }
        TriggerStatus::Failed { message } => log::error!("trigger: failed — {message}"),
        other => log::warn!("trigger: unrecognized status {other:?}"),
    }
}

/// App name, version, and copyright for the About window.
#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    version: String,
    os: String,
    copyright: String,
}

/// `bundle.copyright` from tauri.conf.json, read at compile time.
///
/// Tauri's `generate_context!` hard-codes `bundle.copyright` to `None` in the
/// embedded runtime config (tauri-utils codegen), so `app.config()` always
/// returned an empty string here and About silently dropped the line — the
/// value only reaches the bundler. Including the config file ourselves keeps
/// tauri.conf.json the single source of truth (the same string still lands in
/// the macOS Info.plist and the Windows file metadata via the bundler).
fn config_copyright() -> String {
    static CONF: &str = include_str!("../tauri.conf.json");
    serde_json::from_str::<serde_json::Value>(CONF)
        .ok()
        .as_ref()
        .and_then(|value| {
            value
                .get("bundle")?
                .get("copyright")?
                .as_str()
                .map(String::from)
        })
        .unwrap_or_default()
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let os = os_info::get();
    // Architecture included because it is the triage fork nobody can answer
    // when asked ("is your Mac Intel or Apple Silicon?").
    let os = match os.architecture() {
        Some(arch) => format!("{} {} ({arch})", os.os_type(), os.version()),
        None => format!("{} {}", os.os_type(), os.version()),
    };
    AppInfo {
        name: "ZenCopy".to_string(),
        version: app.package_info().version.to_string(),
        os,
        copyright: config_copyright(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Linux: prefer X11 (XWayland) over native Wayland. Wayland forbids
    // clients to position windows and ignores always-on-top, so the popup
    // cannot pin to its corner, and tao's CSD titlebar buttons are unreliable
    // there (tauri#13440: the settings window's close button does nothing).
    // Under XWayland all of that behaves; the trailing "wayland" keeps
    // XWayland-free sessions bootable, and an explicit GDK_BACKEND from the
    // user still wins. copycopy is unaffected — it routes on
    // XDG_SESSION_TYPE / WAYLAND_DISPLAY, not on GDK's backend.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GDK_BACKEND").is_none() {
        // SAFETY: first thing in run(), before GTK init and before any
        // thread is spawned.
        unsafe { std::env::set_var("GDK_BACKEND", "x11,wayland") };
    }

    // Crashes must leave a trace: release builds abort on panic, and a bundled
    // app's stderr goes nowhere — without this hook a crash writes no log at
    // all. Chain the default hook so dev runs still print to the terminal.
    let default_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default_panic_hook(info);
    }));

    let mut builder = tauri::Builder::default();

    // Single instance MUST be the first plugin registered. ZenCopy is a resident
    // agent, so a second launch should not spawn a second tray — instead, surface
    // the existing window.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                reveal_window(app, "settings");
            }))
            // Auto-update: the About window checks GitHub Releases on startup
            // and installs on request; process provides the relaunch after.
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    // Debug is ours to use, not our dependencies'. A chatty crate (html5ever
    // parsing a rich copy) would otherwise flood the log at Debug — and, worse,
    // with the copied content our own logger is careful to redact. So the
    // default is Info; only our code and the forwarded webview logs get Debug,
    // and only in dev.
    let own_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for("zencopy_lib", own_level)
                .level_for("webview", own_level)
                // RFC 3339 local time with an explicit UTC offset. The plugin's
                // default stamps unlabeled UTC, and its `TimezoneStrategy::UseLocal`
                // silently falls back to UTC too (the `time` crate cannot read the
                // local offset once threads exist) — chrono::Local can.
                .format(|out, message, record| {
                    out.finish(format_args!(
                        "[{}][{}][{}] {}",
                        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z"),
                        record.level(),
                        record.target(),
                        message
                    ));
                })
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                // Bound disk use: rotate at ~5 MB, keep only the previous file.
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(crate::windows::stay_on_app_pages())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_catalog,
            write_catalog,
            read_capture_files,
            list_prompts_ui,
            save_prompt,
            delete_prompt,
            set_kind_prompt,
            record_usage,
            read_usage_stats,
            reset_usage_stats,
            open_catalog_file,
            export_usage_csv,
            open_stats_dir,
            set_overrides,
            get_rules_ui,
            reset_all_settings,
            export_prompt_file,
            import_prompt,
            import_prompt_from_file,
            open_settings,
            open_about,
            app_info,
            open_url,
            open_log_dir,
            trigger_status,
            update_state,
            set_update_state
        ])
        // The one menu handler. Tauri hands every menu event — the tray's and
        // the macOS app menu's alike — to every registered handler, so a
        // second one on the tray would run each click twice. The app menu
        // (⌘, / ⌘Q) mirrors the tray item ids; its predefined items (Edit
        // set, Quit) handle themselves.
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => reveal_popup(app),
            "open" => reveal_window(app, "settings"),
            "about" | "update" => reveal_window(app, "about"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            // Closing hides: without this, the settings window's title-bar
            // close button would destroy it for good.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                conceal_window(window);
            }
        })
        .setup(|app| {
            // First thing, before anything reads the config dir: run pending
            // config migrations (none yet) and stamp the running version.
            crate::config::migrate_config(app.handle());
            crate::windows::follow_text_size(app);
            #[cfg(target_os = "linux")]
            crate::windows::expose_popup_to_shell(app);
            // One-line banner so an attached log answers "which version, on
            // what?" without a follow-up question.
            let os = os_info::get();
            log::info!(
                "ZenCopy v{} ({} {}, {})",
                app.package_info().version,
                os.os_type(),
                os.version(),
                std::env::consts::ARCH
            );

            // Where things live, logged once at startup — the first question
            // when debugging is always "which files is the app actually reading?".
            match app.path().app_data_dir() {
                Ok(dir) => log::info!("settings store: {}", dir.join(STORE_FILE).display()),
                Err(error) => log::warn!("app data dir unavailable: {error}"),
            }
            match config_base(app.handle()) {
                Some(dir) => log::info!(
                    "config dir (ai-sdk-catalog.json, rules.json, prompts/): {}",
                    dir.display()
                ),
                None => log::warn!("config dir unavailable"),
            }
            match app.path().app_log_dir() {
                Ok(dir) => log::info!("log dir: {}", dir.display()),
                Err(error) => log::warn!("log dir unavailable: {error}"),
            }

            // macOS: live in the menu bar as an agent, with no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // System tray — ZenCopy lives here as a resident agent. Both mouse
            // buttons open the same menu (the builder's default), so the tray is
            // one predictable surface; the primary prompt sits at the top.
            // Labels follow the in-app language (falling back to the OS locale).
            let startup_locale = app_locale(app.handle());
            let menu = build_tray_menu(app.handle(), startup_locale)?;

            #[cfg(target_os = "macos")]
            app.set_menu(build_app_menu(app.handle())?)?;

            // macOS gets the monochrome mark on transparency and renders it as
            // a template (auto light/dark in the menu bar). Windows and Linux
            // draw a tray icon's pixels as they are, where a white mark all
            // but disappears on a light taskbar — Windows 11's default — so
            // they get the app icon, which brings its own ground.
            let tray_icon = if cfg!(target_os = "macos") {
                tauri::include_image!("icons/tray.png")
            } else {
                app.default_window_icon()
                    .cloned()
                    .ok_or("the app icon is missing")?
            };
            // The fixed id lets set_update_state find the tray again when the
            // update item needs to appear or disappear. Its menu's clicks land
            // in the builder's on_menu_event.
            let tray = TrayIconBuilder::with_id("main")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("ZenCopy")
                .menu(&menu)
                .build(app)?;

            // The settings window broadcasts `locale-changed` (with the
            // resolved locale) after saving — rebuild both native menus so the
            // tray speaks the same language as the windows. The event payload
            // is used directly: re-reading the store here could race its write.
            {
                use tauri::Listener;
                let handle = app.handle().clone();
                app.listen(LOCALE_CHANGED, move |event| {
                    let locale = serde_json::from_str::<String>(event.payload())
                        .map(|tag| locale_from_tag(&tag))
                        .unwrap_or_else(|_| app_locale(&handle));
                    match build_tray_menu(&handle, locale) {
                        Ok(menu) => tray
                            .set_menu(Some(menu))
                            .or_log("tray: relabel on locale change"),
                        Err(error) => log::warn!("tray relabel failed: {error}"),
                    }
                });
            }

            // The one and only trigger: global Ctrl/Cmd + C + C, via copycopy.
            // `start` must run on the main run loop thread (this setup hook); the
            // handler is invoked on a worker thread, so showing/emitting is safe.
            {
                let handle = app.handle().clone();
                let status_handle = app.handle().clone();
                // copycopy::Capture carries no Drop glue, so the listener stays
                // installed for the whole process even after the handle drops.
                let capture = copycopy::start_with_status(
                    copycopy::Config::default(),
                    move |event| {
                        let Some(source) = source_preview(&event) else {
                            log::debug!("capture: blank content, ignored");
                            return;
                        };
                        let prompts = load_prompts(&handle);
                        let rules = load_rules(&handle);
                        let prompt = resolve_prompt(&rules, &prompts, &event, source.kind());
                        let corner = current_corner(&handle);
                        let payload = build_capture_payload(&event, source, prompt);
                        log::debug!(
                            "capture: kind={} runnable={}",
                            payload.kind,
                            payload.runnable
                        );
                        // Emit first: the webview starts rendering the new
                        // capture while the window work happens, not after it.
                        handle.emit("capture", payload).or_log("emit capture");
                        summon_popup(&handle, corner);
                    },
                    // States where the trigger is silently inactive (Linux: GNOME
                    // extension pending a relogin, unsupported compositor) must
                    // reach the user — the welcome and settings windows show them.
                    move |status| {
                        log_trigger_status(&status);
                        if let Ok(mut latest) = TRIGGER_STATUS.lock() {
                            *latest = Some(status.clone());
                        }
                        status_handle
                            .emit("trigger-status", &status)
                            .or_log("emit trigger-status");
                    },
                );
                match capture {
                    Ok(_capture) => {
                        log::info!("global Ctrl/Cmd+C+C capture listener installed");
                    }
                    Err(error) => {
                        // Not fatal — on macOS this is the normal first launch:
                        // CGEventTap cannot be created until the user grants
                        // Input Monitoring, so start with a dormant trigger and
                        // let the welcome/settings windows explain the fix
                        // (TriggerNotice), like the inert Linux states.
                        log::error!("failed to install the Ctrl/Cmd+C+C listener: {error}");
                        let status = copycopy::TriggerStatus::Failed {
                            message: error.to_string(),
                        };
                        if let Ok(mut latest) = TRIGGER_STATUS.lock() {
                            *latest = Some(status.clone());
                        }
                        app.emit("trigger-status", &status)
                            .or_log("emit trigger-status");
                    }
                }
            }

            // First run (fresh install, or a factory reset followed by a
            // relaunch): the app lives in the tray, so a silent start would
            // look like nothing happened. Surface the settings window — it
            // renders the welcome flow until the frontend writes the flag.
            {
                use tauri_plugin_store::StoreExt;
                let welcomed = app
                    .handle()
                    .store(STORE_FILE)
                    .ok()
                    .and_then(|store| store.get(WELCOME_SEEN_KEY))
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false);
                if !welcomed {
                    reveal_window(app.handle(), "settings");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ZenCopy");
}

/// The frontend hand-mirrors a handful of backend values (each TS site says
/// so in a comment). Drift never fails the build — it silently falls back to
/// defaults or shows raw sentinel strings — so pin every mirrored pair here,
/// where CI can see it. `include_str!` keeps the check against the actual
/// sources instead of a copy.
#[cfg(test)]
mod ts_mirror_tests {
    use super::*;
    use crate::attachments::MAX_ATTACHMENT_BYTES;
    use crate::prompts::{DEFAULT_PROMPTS, is_builtin_prompt};

    const SETTINGS_TS: &str = include_str!("../../src/lib/settings.ts");
    const CAPTURE_TS: &str = include_str!("../../src/lib/capture.ts");
    const PROMPTS_TS: &str = include_str!("../../src/lib/prompts.ts");

    #[test]
    fn store_file_matches_the_frontend() {
        assert!(
            SETTINGS_TS.contains(&format!("const STORE_FILE = \"{STORE_FILE}\"")),
            "settings.ts must read the same store file as Rust ({STORE_FILE})"
        );
    }

    /// The names both sides must spell alike, with nothing but a silent
    /// fallback when they do not: a store key Rust reads and the frontend
    /// writes, an event one side emits and the other listens for. A rename on
    /// either side would leave the popup in the default corner, the tray in
    /// the OS language, a visible popup at its old width, a settings window
    /// that never loads its catalog — or pops up on every launch, the welcome
    /// flag never found.
    #[test]
    fn shared_names_match_the_frontend() {
        const SETTINGS_TSX: &str = include_str!("../../src/components/settings.tsx");
        const EVENTS_TS: &str = include_str!("../../src/lib/use-tauri-event.ts");
        use crate::tray::LOCALE_KEY;
        use crate::windows::{
            POPUP_CORNER_KEY, TEXT_SIZE_CHANGED, TEXT_SIZE_KEY, WINDOW_CLOSED, WINDOW_OPENED,
        };

        for (source, file, name) in [
            (SETTINGS_TS, "settings.ts", WELCOME_SEEN_KEY),
            (SETTINGS_TS, "settings.ts", POPUP_CORNER_KEY),
            (SETTINGS_TS, "settings.ts", TEXT_SIZE_KEY),
            (SETTINGS_TS, "settings.ts", LOCALE_KEY),
            (SETTINGS_TSX, "settings.tsx", TEXT_SIZE_CHANGED),
            (SETTINGS_TSX, "settings.tsx", LOCALE_CHANGED),
            (EVENTS_TS, "use-tauri-event.ts", WINDOW_OPENED),
            (EVENTS_TS, "use-tauri-event.ts", WINDOW_CLOSED),
        ] {
            assert!(
                source.contains(&format!("\"{name}\"")),
                "{file} must spell \"{name}\" as Rust does"
            );
        }
    }

    /// The frontend's locale codes, as messages/index.ts lists them.
    fn frontend_locales() -> Vec<&'static str> {
        const MESSAGES_TS: &str = include_str!("../../src/lib/messages/index.ts");
        let codes: Vec<&str> = MESSAGES_TS
            .lines()
            .filter_map(|line| line.trim().strip_prefix("{ value: \""))
            .filter_map(|rest| rest.split('"').next())
            .collect();
        assert!(
            codes.contains(&"en") && codes.contains(&"zh-Hant"),
            "messages/index.ts lists its locales as `{{ value: \"…\", … }}`, got {codes:?}"
        );
        codes
    }

    /// macOS asks whether ZenCopy may read a browser's page address in the
    /// user's own language: every locale of the frontend has the sentence
    /// the request shows (infoplist/<code>.lproj, bundled on macOS).
    #[test]
    fn every_frontend_locale_words_the_automation_request() {
        for code in frontend_locales() {
            let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(format!("infoplist/{code}.lproj/InfoPlist.strings"));
            let text = std::fs::read_to_string(&file).unwrap_or_default();
            assert!(
                text.starts_with("NSAppleEventsUsageDescription = \""),
                "{} must word the request for '{code}'",
                file.display()
            );
        }
    }

    /// A Chinese tag that names no script goes Traditional by the same
    /// subtags on both sides, or the tray and the windows would disagree
    /// about which Chinese a region reads.
    #[test]
    fn chinese_script_hints_match_the_frontend() {
        const LOCALE_TAG_TS: &str = include_str!("../../src/lib/locale-tag.ts");
        let hints = format!("{:?}", crate::tray::TRADITIONAL_HINTS);
        assert!(
            LOCALE_TAG_TS.contains(&hints),
            "locale-tag.ts must list the Traditional hints as tray.rs does ({hints})"
        );
    }

    /// Every language the windows can speak has its native menus: each of the
    /// frontend's locale codes resolves to a `Locale` of its own. A language
    /// added there and not in tray.rs would fall to English — and collide
    /// with it here.
    #[test]
    fn every_frontend_locale_has_native_menus() {
        let mut seen = Vec::new();
        for code in frontend_locales() {
            let locale = locale_from_tag(code);
            assert!(
                !seen.contains(&locale),
                "tray.rs has no Locale of its own for the frontend's '{code}'"
            );
            seen.push(locale);
        }
    }

    /// The popup's home width is POPUP_HOME_VIEWPORT times the zoom the
    /// frontend applies per text size; a retuned ladder or renamed size over
    /// there would quietly open the popup at the wrong width.
    #[test]
    fn text_size_zoom_ladder_matches_the_frontend() {
        const TEXT_SIZE_TS: &str = include_str!("../../src/lib/text-size.ts");
        let ladder = format!(
            "{{ small: {small}, standard: 1, large: {large} }}",
            small = crate::windows::ZOOM_SMALL,
            large = crate::windows::ZOOM_LARGE
        );
        assert!(
            TEXT_SIZE_TS.contains(&ladder),
            "text-size.ts must apply the zoom ladder windows.rs sizes the popup with ({ladder})"
        );
        for value in ["\"small\"", "\"large\""] {
            assert!(
                SETTINGS_TS.contains(value),
                "settings.ts must carry the text size {value} windows.rs matches on"
            );
        }
    }

    /// The screenshot harness renders the popup at the same home viewport
    /// windows.rs opens it with, and that viewport must sit under the CSS
    /// `compact` breakpoint or the home card silently loses its padded look.
    #[test]
    fn popup_home_viewport_matches_the_frontend() {
        const SCENARIOS_TS: &str = include_str!("../../src/lib/screenshot-scenarios.ts");
        let viewport = crate::windows::POPUP_HOME_VIEWPORT;
        assert!(
            SCENARIOS_TS.contains(&format!("width: {viewport}")),
            "screenshot-scenarios.ts must render the popup at the home viewport ({viewport})"
        );
        const INDEX_CSS: &str = include_str!("../../src/index.css");
        let breakpoint: f64 = INDEX_CSS
            .lines()
            .find_map(|line| line.trim().strip_prefix("--breakpoint-compact:"))
            .and_then(|value| value.trim().strip_suffix("px;"))
            .expect("index.css declares --breakpoint-compact in px")
            .trim()
            .parse()
            .expect("--breakpoint-compact is a number");
        assert!(
            viewport < breakpoint,
            "the home viewport ({viewport}) must stay under the compact breakpoint ({breakpoint})"
        );
    }

    /// corner() falls back to top-right for any unknown string, so a renamed
    /// variant on either side would not error — every popup would just quietly
    /// pin to the default corner.
    #[test]
    fn popup_corner_values_match_the_frontend() {
        for corner in ["top-right", "bottom-right", "top-left", "bottom-left"] {
            assert!(
                SETTINGS_TS.contains(&format!("\"{corner}\"")),
                "corner value '{corner}' missing from settings.ts"
            );
        }
    }

    /// DEFAULT_QUICK_PROMPTS in settings.ts names pre-installed prompts by id;
    /// renaming a built-in here would leave a quick slot empty over there.
    #[test]
    fn builtin_ids_appear_in_frontend_defaults() {
        for (id, _) in DEFAULT_PROMPTS {
            assert!(
                SETTINGS_TS.contains(&format!("\"{id}\"")),
                "built-in prompt '{id}' missing from settings.ts defaults"
            );
        }
    }

    /// The popup recognizes Custom by id (CUSTOM_PROMPT_ID in prompts.ts) to
    /// hold its first run until the user types; that id must name a
    /// pre-installed prompt, or Custom silently becomes an empty slot.
    #[test]
    fn custom_prompt_id_matches_the_frontend() {
        let id = PROMPTS_TS
            .lines()
            .find_map(|line| line.strip_prefix("export const CUSTOM_PROMPT_ID = \""))
            .and_then(|rest| rest.strip_suffix("\";"))
            .expect("prompts.ts declares CUSTOM_PROMPT_ID");
        assert!(
            is_builtin_prompt(id),
            "prompts.ts special-cases '{id}', which must stay pre-installed"
        );
    }

    /// A run that finds no role of its prompt's own mapped ends at
    /// DEFAULT_ROLE, and the frontend holds every config to mapping one role
    /// (REQUIRED_ROLES in llm.ts). The two must be the same role: named
    /// differently, a config would pass validation and leave every
    /// pre-installed prompt without a model.
    #[test]
    fn default_role_matches_the_frontend() {
        use crate::prompts::DEFAULT_ROLE;
        const LLM_TS: &str = include_str!("../../src/lib/llm.ts");

        assert!(
            LLM_TS.contains(&format!(
                "export const REQUIRED_ROLES = [\"{DEFAULT_ROLE}\"] as const;"
            )),
            "llm.ts must require the role Rust's prompts fall back to ({DEFAULT_ROLE})"
        );
    }

    /// rules.json (the default rules table) may only reference built-ins;
    /// an unknown id would make captures of that kind silently do nothing.
    /// It must also route EVERY kind — a missing key would leave captures of
    /// that kind inert out of the box — and the frontend's ROUTABLE_KINDS
    /// must list the same kinds, or the settings UI would show phantom rows
    /// or hide real ones.
    #[test]
    fn default_rules_uses_builtin_ids() {
        let rules: serde_json::Value =
            serde_json::from_str(include_str!("../rules.json")).expect("rules.json parses");
        let table = rules.as_object().expect("rules.json is an object");
        for kind in crate::rules::RULE_KINDS {
            assert!(
                table.contains_key(kind),
                "rules.json must route kind '{kind}' out of the box"
            );
            assert!(
                PROMPTS_TS.contains(&format!("\"{kind}\"")),
                "kind '{kind}' missing from ROUTABLE_KINDS in prompts.ts"
            );
        }
        for (kind, prompt) in table {
            if kind == "overrides" {
                continue;
            }
            let id = prompt.as_str().expect("rules target is a string");
            assert!(
                is_builtin_prompt(id),
                "rules.json routes '{kind}' to unknown prompt '{id}'"
            );
        }
    }

    /// Both sides enforce the attachment cap independently (Rust for files,
    /// TS for the clipboard image) and in different units — bytes vs MB.
    #[test]
    fn attachment_limit_matches_the_frontend() {
        let mb = MAX_ATTACHMENT_BYTES / (1024 * 1024);
        assert!(
            CAPTURE_TS.contains(&format!("MAX_ATTACHMENT_MB = {mb}")),
            "capture.ts MAX_ATTACHMENT_MB must equal {mb}"
        );
    }

    /// TriggerStatus crosses the IPC boundary tagged by `kind`; a variant the
    /// frontend does not know just never shows its notice — silently.
    #[test]
    fn trigger_status_kinds_match_the_frontend() {
        const TRIGGER_TS: &str = include_str!("../../src/lib/trigger-status.ts");
        for kind in [
            "listening",
            "gnome_extension_awaiting_login",
            "gnome_extension_outdated",
            "unsupported_session",
            "failed",
        ] {
            assert!(
                TRIGGER_TS.contains(&format!("\"{kind}\"")),
                "trigger status kind '{kind}' missing from trigger-status.ts"
            );
        }
    }

    /// Capture errors cross the IPC boundary as sentinel strings that the
    /// popup maps to i18n messages; a typo on either side shows users the raw
    /// sentinel instead of a translation.
    #[test]
    fn attachment_sentinels_match_the_frontend() {
        for sentinel in [
            "attachment-too-large",
            "unsupported-file:",
            "file-unreadable:",
        ] {
            assert!(
                CAPTURE_TS.contains(&format!("\"{sentinel}\"")),
                "sentinel '{sentinel}' missing from capture.ts"
            );
        }
    }
}

#[cfg(test)]
mod about_tests {
    use super::config_copyright;

    #[test]
    fn copyright_comes_from_the_bundled_config() {
        let value = config_copyright();
        assert!(
            value.contains("Shinsuke Mori"),
            "expected the copyright line from tauri.conf.json, got {value:?}"
        );
    }
}
