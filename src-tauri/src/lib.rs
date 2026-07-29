use tauri::{Emitter, Manager, tray::TrayIconBuilder};

/// OOXML (docx/pptx/xlsx) text extraction for attachments.
mod office;

/// Actions: built-ins, user files, and their commands.
mod actions;
/// File attachments: sniffing, decoding, reading.
mod attachments;
/// Capture → popup payload conversion.
mod capture;
/// Config-dir paths, the AI catalog, full reset.
mod config;
/// Capture → action routing.
mod routing;
/// Handing URLs and folders to the OS shell.
mod shell;
/// Usage statistics: the append-only invocation JSONL.
mod stats;
/// The locale-aware tray and app menus.
mod tray;
/// Window placement and reveal helpers.
mod windows;

use crate::actions::{
    delete_action, export_action_file, import_action, import_action_from_file, list_actions_ui,
    load_actions, save_action,
};
use crate::attachments::read_capture_files;
use crate::capture::{build_capture_payload, is_blank};
use crate::config::{STORE_FILE, config_base, read_catalog, reset_all_settings, write_catalog};
use crate::routing::{
    get_routing_ui, load_routing, resolve_action, set_kind_action, set_overrides,
};
use crate::shell::{open_log_dir, open_url};
use crate::stats::{
    export_usage_csv, open_catalog_file, open_stats_dir, read_usage_stats, record_usage,
    reset_usage_stats,
};
// The app menu exists only on macOS (tray.rs gates the builder the same way).
#[cfg(target_os = "macos")]
use crate::tray::build_app_menu;
use crate::tray::{app_locale, build_tray_menu, locale_from_tag};
use crate::windows::{
    current_corner, open_about, open_settings, reveal_popup, reveal_window, set_popup_expanded,
    show_popup_in_corner,
};

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
    AppInfo {
        name: "ZenCopy".to_string(),
        version: app.package_info().version.to_string(),
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
            list_actions_ui,
            save_action,
            delete_action,
            set_kind_action,
            record_usage,
            read_usage_stats,
            reset_usage_stats,
            open_catalog_file,
            export_usage_csv,
            open_stats_dir,
            set_overrides,
            get_routing_ui,
            reset_all_settings,
            export_action_file,
            import_action,
            import_action_from_file,
            open_settings,
            set_popup_expanded,
            open_about,
            app_info,
            open_url,
            open_log_dir,
            trigger_status,
            update_state,
            set_update_state
        ])
        .on_menu_event(|app, event| match event.id.as_ref() {
            // The macOS app menu (⌘, / ⌘Q) mirrors the tray item ids; the
            // predefined items (Edit set, Quit) handle themselves. Revealing
            // twice when a tray handler also fires is harmless.
            "open" => reveal_window(app, "settings"),
            "about" => reveal_window(app, "about"),
            _ => {}
        })
        .on_window_event(|window, event| {
            // A tray-resident app hides its windows instead of destroying them, so
            // they can always be reopened. Without this, closing the settings
            // window (its title-bar close button) would destroy it for good.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window
                    .hide()
                    .or_log(&format!("{}: hide on close", window.label()));
                // Tell the webview its session just ended: a hidden window
                // keeps its React state, so transient feedback (a "saved"
                // confirmation) must be dropped now or it would still be on
                // screen at the next open. Minimize and app-hide stay silent
                // on purpose — the window is still "open" then.
                window
                    .emit_to(window.label(), "window-closed", ())
                    .or_log(&format!("{}: emit window-closed", window.label()));
            }
        })
        .setup(|app| {
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
                    "config dir (ai-sdk-catalog.json, routing.json, actions/): {}",
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
            // one predictable surface; the primary action sits at the top.
            // Labels follow the in-app language (falling back to the OS locale).
            let startup_locale = app_locale(app.handle());
            let menu = build_tray_menu(app.handle(), startup_locale)?;

            #[cfg(target_os = "macos")]
            app.set_menu(build_app_menu(app.handle(), startup_locale)?)?;

            // A monochrome mark on transparency: macOS renders it as a template
            // (auto light/dark in the menu bar), Windows and Linux show it as-is
            // in the tray.
            // The fixed id lets set_update_state find the tray again when the
            // update item needs to appear or disappear.
            let tray = TrayIconBuilder::with_id("main")
                .icon(tauri::include_image!("icons/tray.png"))
                .icon_as_template(true)
                .tooltip("ZenCopy")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal_popup(app),
                    "open" => reveal_window(app, "settings"),
                    "about" | "update" => reveal_window(app, "about"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // The settings window broadcasts `locale-changed` (with the
            // resolved locale) after saving — rebuild both native menus so the
            // tray speaks the same language as the windows. The event payload
            // is used directly: re-reading the store here could race its write.
            {
                use tauri::Listener;
                let handle = app.handle().clone();
                app.listen("locale-changed", move |event| {
                    let locale = serde_json::from_str::<String>(event.payload())
                        .map(|tag| locale_from_tag(&tag.to_ascii_lowercase()))
                        .unwrap_or_else(|_| app_locale(&handle));
                    match build_tray_menu(&handle, locale) {
                        Ok(menu) => tray
                            .set_menu(Some(menu))
                            .or_log("tray: relabel on locale change"),
                        Err(error) => log::warn!("tray relabel failed: {error}"),
                    }
                    #[cfg(target_os = "macos")]
                    match build_app_menu(&handle, locale) {
                        Ok(menu) => {
                            handle
                                .set_menu(menu)
                                .map(|_| ())
                                .or_log("app menu: relabel on locale change");
                        }
                        Err(error) => log::warn!("app menu relabel failed: {error}"),
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
                        if is_blank(&event) {
                            log::debug!("capture: blank content, ignored");
                            return;
                        }
                        let actions = load_actions(&handle);
                        let routing = load_routing(&handle);
                        let action = resolve_action(&routing, &actions, &event);
                        let corner = current_corner(&handle);
                        let mut payload = build_capture_payload(&event, action);
                        payload.align_bottom = corner.is_bottom();
                        log::debug!(
                            "capture: kind={} runnable={}",
                            payload.kind,
                            payload.runnable
                        );
                        if let Some(popup) = handle.get_webview_window("popup") {
                            show_popup_in_corner(&handle, &popup, corner);
                        } else {
                            log::warn!("popup window not found on capture");
                        }
                        handle.emit("capture", payload).or_log("emit capture");
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
            // renders the welcome flow until `welcomeSeen` is written by the
            // frontend (the key is mirrored in src/lib/settings.ts).
            {
                use tauri_plugin_store::StoreExt;
                let welcomed = app
                    .handle()
                    .store(STORE_FILE)
                    .ok()
                    .and_then(|store| store.get("welcomeSeen"))
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
    use crate::actions::{DEFAULT_ACTIONS, is_builtin_action};
    use crate::attachments::MAX_ATTACHMENT_BYTES;

    const SETTINGS_TS: &str = include_str!("../../src/lib/settings.ts");
    const CAPTURE_TS: &str = include_str!("../../src/lib/capture.ts");

    #[test]
    fn store_file_matches_the_frontend() {
        assert!(
            SETTINGS_TS.contains(&format!("const STORE_FILE = \"{STORE_FILE}\"")),
            "settings.ts must read the same store file as Rust ({STORE_FILE})"
        );
    }

    /// The first-run gate in setup reads the same store key the frontend
    /// writes after the welcome flow; a rename on either side would make the
    /// settings window pop up on every launch.
    #[test]
    fn welcome_seen_key_matches_the_frontend() {
        assert!(
            SETTINGS_TS.contains("\"welcomeSeen\""),
            "settings.ts must persist the welcome flag under the key setup reads"
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

    /// DEFAULT_QUICK_ACTIONS in settings.ts names pre-installed actions by id;
    /// renaming a built-in here would leave a quick slot empty over there.
    #[test]
    fn builtin_ids_appear_in_frontend_defaults() {
        for (id, _) in DEFAULT_ACTIONS {
            assert!(
                SETTINGS_TS.contains(&format!("\"{id}\"")),
                "built-in action '{id}' missing from settings.ts defaults"
            );
        }
    }

    /// routing.json (the default routing table) may only reference built-ins;
    /// an unknown id would make captures of that kind silently do nothing.
    #[test]
    fn default_routing_uses_builtin_ids() {
        let routing: serde_json::Value =
            serde_json::from_str(include_str!("../routing.json")).expect("routing.json parses");
        for (kind, action) in routing.as_object().expect("routing.json is an object") {
            if kind == "overrides" {
                continue;
            }
            let id = action.as_str().expect("routing target is a string");
            assert!(
                is_builtin_action(id),
                "routing.json routes '{kind}' to unknown action '{id}'"
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
