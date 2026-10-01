//! Handing things to the OS shell: URLs to the default browser, folders to
//! the system file browser.

use crate::OrLog;
use tauri::Manager;

/// Open an https URL in the default browser. Called with literal URLs from our
/// own frontend (repository, docs) and with links the model emitted in Markdown
/// results; anything not https is refused — the frontend offers no other link
/// (SystemBrowserLink in src/components/markdown.tsx), so a refusal here is a
/// bug there.
#[tauri::command]
pub(crate) fn open_url(app: tauri::AppHandle, url: String) {
    use tauri_plugin_opener::OpenerExt;
    if url.starts_with("https://") {
        app.opener()
            .open_url(url, None::<&str>)
            .or_log("open url in the default browser");
    } else {
        // The scheme only: the rest may quote what the user copied.
        let scheme = url.split(':').next().unwrap_or_default();
        log::warn!("open url: refused a link that is not https ({scheme}:)");
    }
}

/// Open the log directory in the system file browser — About's "Logs" link.
/// Exists so a support conversation can be "click Logs, send me the file"
/// instead of walking someone through hidden platform paths. The directory is
/// created first: a fresh install may not have logged anything yet, and some
/// file browsers silently do nothing on a missing path.
#[tauri::command]
pub(crate) fn open_log_dir(app: tauri::AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    match app.path().app_log_dir() {
        Ok(dir) => {
            std::fs::create_dir_all(&dir).or_log("create the log directory");
            app.opener()
                .open_path(dir.to_string_lossy(), None::<&str>)
                .or_log("open the log directory");
        }
        Err(error) => log::warn!("log directory unavailable: {error}"),
    }
}
