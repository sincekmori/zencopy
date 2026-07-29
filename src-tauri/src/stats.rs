//! Usage statistics: an append-only JSONL, one line per COMPLETED model run
//! — a local billing ledger. Reused results, user stops, timeouts, and error
//! responses all leave no line (a stopped run may still have consumed some
//! tokens; going unrecorded is the accepted trade for a ledger of clean
//! completions). The human-facing invocation trail lives in the ordinary log
//! instead. Events, not aggregates — counts, per-kind, per-hour, and cost
//! all stay derivable. Ids, kinds, timestamps, the serving model, and token
//! counts; never the copied content.
//!
//! The file lives under the platform DATA dir (`stats/usage.jsonl`), not the
//! config dir (statistics are accumulated user data, which XDG puts in
//! `~/.local/share` on Linux) and not the log dir (logs rotate away;
//! statistics must not). "Reset all settings" deliberately leaves it alone.
//!
//! THE SCHEMA IS A FROZEN CONTRACT — this file outlives every app version:
//! - Evolution is additive only: new keys may appear, existing keys are
//!   never renamed or repurposed. No version field; absence is version 1.
//! - An absent key means zero or unknown, never an error.
//! - `model` is the catalog address `provider:model`, split at the FIRST
//!   colon (model ids may contain colons, e.g. `local:gemma4:e4b`). The
//!   provider half is the user's own alias — it is what identifies local
//!   endpoints, whose runs cost nothing.
//! - `tokens` keys are BILLING BUCKETS named after models.dev's cost fields
//!   (input/output/cache_read/cache_write, per-bucket prices in USD per 1M):
//!   cost is the dot product of a line's tokens with the model's price entry.
//!   `input` is therefore the non-cached input; OTel's inclusive
//!   `gen_ai.usage.input_tokens` derives as input + cache_read + cache_write.
//! - Known, accepted cost-accuracy limits (within a few percent): providers
//!   that omit usage reporting, and audio-token premium rates (no split in
//!   the standard usage shape today; add `tokens.audioIn` if that changes).

use crate::OrLog;
use tauri::Manager;

fn stats_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("stats").join("usage.jsonl"))
}

/// Token counts as billing buckets (see the module doc) — mapped once at
/// the frontend edge (llm-impl) from the AI SDK's evolving usage shape.
#[derive(serde::Deserialize)]
pub(crate) struct TokenUsage {
    input: Option<u64>,
    output: Option<u64>,
    cache_read: Option<u64>,
    cache_write: Option<u64>,
}

/// Append one invocation event. Fire-and-forget from the popup: a failed
/// append is logged and never blocks a run.
#[tauri::command]
pub(crate) fn record_usage(
    app: tauri::AppHandle,
    action: String,
    kind: String,
    model: Option<String>,
    tokens: Option<TokenUsage>,
) {
    let Some(path) = stats_file(&app) else {
        log::warn!("stats: data dir unavailable");
        return;
    };
    let append = || -> std::io::Result<()> {
        use std::io::Write;
        std::fs::create_dir_all(path.parent().expect("stats file has a parent"))?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        // Local time with offset: statistics about someone's day should read
        // in their day's clock, and the offset keeps every line unambiguous.
        // Absent facts stay absent — keys are only written when they exist.
        let mut event = serde_json::Map::new();
        event.insert(
            "at".to_string(),
            serde_json::json!(
                chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            ),
        );
        event.insert("action".to_string(), serde_json::json!(action));
        event.insert("kind".to_string(), serde_json::json!(kind));
        if let Some(model) = &model {
            event.insert("model".to_string(), serde_json::json!(model));
        }
        if let Some(tokens) = &tokens {
            let mut counts = serde_json::Map::new();
            for (key, value) in [
                ("input", tokens.input),
                ("output", tokens.output),
                ("cache_read", tokens.cache_read),
                ("cache_write", tokens.cache_write),
            ] {
                if let Some(value) = value {
                    counts.insert(key.to_string(), serde_json::json!(value));
                }
            }
            if !counts.is_empty() {
                event.insert("tokens".to_string(), serde_json::Value::Object(counts));
            }
        }
        // One write_all per line: the popup runs actions in parallel, and
        // Tauri commands land on worker threads — a formatted multi-write
        // (writeln!) could interleave two events into one corrupt line. A
        // single small write to an O_APPEND file keeps every line whole.
        let mut line = serde_json::Value::Object(event).to_string();
        line.push('\n');
        file.write_all(line.as_bytes())
    };
    append().or_log("stats: append usage event");
}

/// The recorded events, one JSON value per line, parsed leniently: a torn or
/// foreign line is skipped, never fatal — the reader must not be the thing
/// that breaks an append-only ledger. Powers the cost viewer in settings.
#[tauri::command]
pub(crate) fn read_usage_stats(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = stats_file(&app).ok_or("stats dir unavailable")?;
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    Ok(text
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect())
}

/// Delete the recorded statistics — the settings section's quiet reset link.
/// The folder itself stays; future files may live beside usage.jsonl.
#[tauri::command]
pub(crate) fn reset_usage_stats(app: tauri::AppHandle) -> Result<(), String> {
    let Some(path) = stats_file(&app) else {
        return Err("data dir unavailable".to_string());
    };
    match std::fs::remove_file(&path) {
        Ok(()) => {
            log::info!("stats: reset");
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Reveal the user's catalog config in the file manager — the cost export's
/// "write a cost block here" pointer. Reveal, deliberately not open: opening
/// a .json can launch whatever heavyweight editor claims the extension,
/// while the file manager is already running. A config that does not exist
/// yet falls back to opening the config directory.
#[tauri::command]
pub(crate) fn open_catalog_file(app: tauri::AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    let Some(path) = crate::config::catalog_path(&app) else {
        log::warn!("stats: config dir unavailable");
        return;
    };
    if path.exists() {
        app.opener()
            .reveal_item_in_dir(&path)
            .or_log("reveal the catalog config");
    } else {
        let dir = path.parent().expect("catalog file has a parent");
        app.opener()
            .open_path(dir.to_string_lossy(), None::<&str>)
            .or_log("open the config directory");
    }
}

/// Save the cost table as a CSV the frontend already assembled — a native
/// save dialog, then one write. Returns false when the user cancels.
/// The suggested name carries the export date (the summary is a snapshot,
/// so the file says "as of when" by itself and repeated exports sort
/// chronologically); date only — sub-day uniqueness is the dialog's job,
/// and Windows forbids the colons a readable time would want.
/// `(async)`: the blocking dialog must stay off the main thread.
#[tauri::command(async)]
pub(crate) fn export_usage_csv(app: tauri::AppHandle, csv: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_name = format!(
        "zencopy-cost-summary-{}.csv",
        chrono::Local::now().format("%Y-%m-%d")
    );
    let Some(picked) = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .add_filter("CSV", &["csv"])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, csv).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Open the stats folder in the system file browser — the mirror of
/// shell::open_log_dir. Created first, so the very first click works.
#[tauri::command]
pub(crate) fn open_stats_dir(app: tauri::AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    let Some(path) = stats_file(&app) else {
        log::warn!("stats: data dir unavailable");
        return;
    };
    let dir = path.parent().expect("stats file has a parent");
    std::fs::create_dir_all(dir).or_log("create the stats directory");
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .or_log("open the stats directory");
}
