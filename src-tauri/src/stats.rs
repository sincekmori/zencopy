//! Usage statistics: an append-only JSONL of action invocations. Events, not
//! aggregates — today's questions (counts) and tomorrow's (per-kind, per-hour,
//! cost) all stay derivable from the same file. Ids, kinds, timestamps, the
//! serving model, and token counts (the minimum for exact cost math); never
//! the copied content. A reused result records no model or tokens — the
//! absence IS the fact: it cost nothing.
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

/// The cost-relevant token counts, in the app's own stable vocabulary —
/// mapped once at the frontend edge (llm-impl) from the AI SDK's evolving
/// usage shape: the totals plus the cache split that changes the unit price.
#[derive(serde::Deserialize)]
pub(crate) struct TokenUsage {
    #[serde(rename = "in")]
    input: Option<u64>,
    out: Option<u64>,
    #[serde(rename = "cacheRead")]
    cache_read: Option<u64>,
    #[serde(rename = "cacheWrite")]
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
                ("in", tokens.input),
                ("out", tokens.out),
                ("cacheRead", tokens.cache_read),
                ("cacheWrite", tokens.cache_write),
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
