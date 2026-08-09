//! Config-dir plumbing: paths, the AI catalog file, and full reset.

use crate::OrLog;
use tauri::Manager;
/// Where user config files (ai-sdk-catalog.json, rules.json, prompts/) are read
/// from: the per-user app config dir, in dev and release alike — one
/// predictable location (logged at startup). Defaults for rules and prompts
/// are embedded in the binary, so this dir only ever *overrides*.
pub(crate) fn config_base(handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    handle.path().app_config_dir().ok()
}

/// Pre-installed prompts: authored as files in `src-tauri/prompts/` (kept as
/// real .md so formatters and reviews see them), embedded into the binary at
/// build time, and immutable at runtime — never shipped or seeded as files,
/// local files with the same id are ignored, and the UI shows them read-only.
/// Customization means adding *new* prompts.
/// The tauri-plugin-store file; the frontend reads the same file via its own
/// STORE_FILE constant in src/lib/settings.ts (kept in sync by a test below).
pub(crate) const STORE_FILE: &str = "settings.json";

/// The catalog config file, named after the schema that defines it
/// (ai-sdk-catalog). Never bundled/seeded — created by the user via the
/// settings UI in the per-user app config dir.
pub(crate) const CATALOG_FILE: &str = "ai-sdk-catalog.json";

/// Path to the user's catalog config.
pub(crate) fn catalog_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    config_base(app).map(|dir| dir.join(CATALOG_FILE))
}

/// Factory reset: delete the directories ZenCopy owns wholesale — the config
/// dir (catalog with keys, rules, custom prompts) and the data dir (the
/// settings store and the usage statistics), which are the same directory on
/// macOS — the just-installed state the Reset button promises. Whole directories,
/// not a file list, so the reset stays complete as future versions add or
/// rename files. The log dir is deliberately spared: a reset should still be
/// diagnosable afterwards. Every window is then reloaded in place — NOT the
/// app relaunched: a relaunch detaches a dev app from its dev server (vite
/// dies with the original process, leaving every window white), and the live
/// settings store would flush its in-memory values right back over the
/// deleted file on exit. Reloading gets the same clean slate in dev and
/// release alike.
#[tauri::command]
pub(crate) fn reset_all_settings(app: tauri::AppHandle) -> Result<(), String> {
    fn remove_dir_if_present(path: &std::path::Path) -> Result<(), String> {
        match std::fs::remove_dir_all(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("{}: {e}", path.display())),
        }
    }
    // Empty the live store BEFORE deleting its file, and close the resource
    // so the next `load()` in a reloaded window rereads from disk (defaults)
    // instead of getting this cached instance back. The explicit save() after
    // clear() is load-bearing: clear() schedules a debounced auto-save, and
    // tauri-plugin-store 2.4.3's Drop self-deadlocks (apply_pending_auto_save
    // holds the debounce-sender mutex across save(), which re-locks it) when
    // an auto-save is still pending at drop time — save() settles it now, so
    // the Store drops with nothing pending.
    {
        use tauri_plugin_store::StoreExt;
        if let Ok(store) = app.store(STORE_FILE) {
            store.clear();
            store.save().or_log("flush the cleared settings store");
            store.close_resource();
        }
    }
    let config = config_base(&app).ok_or_else(|| "config dir unavailable".to_string())?;
    remove_dir_if_present(&config)?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if data != config {
        remove_dir_if_present(&data)?;
    }
    for (_, window) in app.webview_windows() {
        window
            .eval("window.location.reload()")
            .or_log("reload a window after reset");
    }
    log::info!("factory reset: all local data deleted");
    Ok(())
}

/// Raw catalog JSON text for the settings editor ("" when none exists yet).
#[tauri::command]
pub(crate) fn read_catalog(app: tauri::AppHandle) -> Result<String, String> {
    let Some(path) = catalog_path(&app) else {
        return Ok(String::new());
    };
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Write the catalog JSON (validated as JSON first). Written locally only.
#[tauri::command]
pub(crate) fn write_catalog(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let dir = config_base(&app).ok_or_else(|| "config dir unavailable".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(CATALOG_FILE), json).map_err(|e| e.to_string())?;
    Ok(())
}
