//! Prompts: the built-in set, the user's local .md files, and every
//! command the settings editor and the popup switcher call.

use crate::OrLog;
use crate::config::config_base;
use crate::rules::{edit_rules_json, purge_prompt_from_rules_object};
use tauri::Manager;
/// A parsed prompt: frontmatter metadata + the Markdown body (the prompt).
#[derive(Clone)]
pub(crate) struct Prompt {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) role: Option<String>,
    pub(crate) instructions: String,
    pub(crate) body: String,
}

/// Compatibility contract for the prompt format (shared files live for years
/// in gists and chats): evolve additively only — never remove or repurpose a
/// field, new fields are optional with a default, and unknown fields are
/// ignored (serde's default; never add `deny_unknown_fields`). No version
/// field on purpose: its absence IS version 1, and a breaking change — if one
/// ever becomes unavoidable — introduces an explicit `schema: 2` marker then.
#[derive(serde::Deserialize)]
pub(crate) struct PromptMeta {
    id: Option<String>,
    label: Option<String>,
    role: Option<String>,
    instructions: Option<String>,
}

/// Parse one prompt file: YAML frontmatter (between `---` lines) + Markdown body.
/// `default_id` (e.g. the filename stem) is used when frontmatter omits `id`.
pub(crate) fn parse_prompt(raw: &str, default_id: &str) -> Option<Prompt> {
    let mut lines = raw
        .trim_start_matches(['\u{feff}', '\n', '\r', ' '])
        .lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut frontmatter = String::new();
    let mut closed = false;
    for line in lines.by_ref() {
        if line.trim() == "---" {
            closed = true;
            break;
        }
        frontmatter.push_str(line);
        frontmatter.push('\n');
    }
    if !closed {
        return None;
    }
    let body = lines.collect::<Vec<_>>().join("\n");
    let meta: PromptMeta = serde_yaml_ng::from_str(&frontmatter).ok()?;
    let id = meta.id.unwrap_or_else(|| default_id.to_string());
    let label = meta.label.unwrap_or_else(|| id.clone());
    Some(Prompt {
        id,
        label,
        role: meta.role,
        instructions: meta.instructions.unwrap_or_default(),
        body: body.trim().to_string(),
    })
}

pub(crate) const DEFAULT_ACTIONS: &[(&str, &str)] = &[
    ("zencopy-zen", include_str!("../prompts/zen.md")),
    ("zencopy-explain", include_str!("../prompts/explain.md")),
    ("zencopy-translate", include_str!("../prompts/translate.md")),
    ("zencopy-polish", include_str!("../prompts/polish.md")),
];

/// Every pre-installed prompt id carries this prefix — it marks an prompt as
/// official, and reserving it keeps user prompts from colliding with future
/// built-ins. User-supplied ids with this prefix are rejected everywhere ids
/// enter (editor save, import, files in the config dir).
pub(crate) const RESERVED_ID_PREFIX: &str = "zencopy-";

/// Whether `id` names a built-in (immutable) prompt.
pub(crate) fn is_builtin_prompt(id: &str) -> bool {
    DEFAULT_ACTIONS.iter().any(|(builtin, _)| *builtin == id)
}

/// Prompts defined by local files in the config dir — the user's additions and
/// overrides. Invalid files are logged and skipped.
pub(crate) fn load_local_prompts(handle: &tauri::AppHandle) -> Vec<Prompt> {
    let mut prompts = Vec::new();
    if let Some(base) = config_base(handle)
        && let Ok(entries) = std::fs::read_dir(base.join("prompts"))
    {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            // Falling back to the built-ins keeps the app working, but the why
            // must survive somewhere — a broken prompt "not doing anything" is
            // undebuggable without it.
            match std::fs::read_to_string(&path) {
                Ok(raw) => match parse_prompt(&raw, stem) {
                    Some(prompt) => prompts.push(prompt),
                    None => log::warn!(
                        "prompt {}: missing or malformed frontmatter, file ignored",
                        path.display()
                    ),
                },
                Err(error) => log::warn!(
                    "prompt {}: unreadable ({error}), file ignored",
                    path.display()
                ),
            }
        }
    }
    prompts
}

/// The prompt list: immutable built-ins plus local files in the config dir.
/// Local files add new prompts only — one that names a built-in id is ignored
/// (with a warning), so the defaults can never be broken or impersonated. Read
/// per capture so edits take effect without a restart.
pub(crate) fn load_prompts(handle: &tauri::AppHandle) -> Vec<Prompt> {
    // The built-ins are compile-time constants — parse their YAML once, not
    // on every capture (cloning a few KB of Strings is far cheaper).
    static BUILTINS: std::sync::LazyLock<Vec<Prompt>> = std::sync::LazyLock::new(|| {
        DEFAULT_ACTIONS
            .iter()
            .filter_map(|(id, raw)| parse_prompt(raw, id))
            .collect()
    });
    let mut by_id: std::collections::HashMap<String, Prompt> = BUILTINS
        .iter()
        .map(|prompt| (prompt.id.clone(), prompt.clone()))
        .collect();
    for prompt in load_local_prompts(handle) {
        if is_builtin_prompt(&prompt.id) {
            log::warn!(
                "prompt '{}': shadows a built-in and is ignored (built-ins are immutable)",
                prompt.id
            );
            continue;
        }
        if prompt.id.starts_with(RESERVED_ID_PREFIX) {
            log::warn!(
                "prompt '{}': the '{RESERVED_ID_PREFIX}' id prefix is reserved for pre-installed prompts; ignored",
                prompt.id
            );
            continue;
        }
        by_id.insert(prompt.id.clone(), prompt);
    }
    by_id.into_values().collect()
}

/// An prompt as presented to the UI — the popup's switcher and the settings
/// list. `origin` tells the settings UI what is editable: "builtin" ships with
/// the app and is immutable, "custom" is the user's own local file.
#[derive(serde::Serialize)]
pub(crate) struct PromptInfo {
    id: String,
    label: String,
    role: Option<String>,
    instructions: String,
    prompt: String,
    origin: &'static str,
}

/// Every prompt: pre-installed first, in their DEFAULT_ACTIONS order (Zen
/// leads by construction), then the user's prompts sorted by label.
#[tauri::command]
pub(crate) fn list_prompts_ui(app: tauri::AppHandle) -> Vec<PromptInfo> {
    let mut infos: Vec<PromptInfo> = load_prompts(&app)
        .into_iter()
        .map(|prompt| PromptInfo {
            origin: if is_builtin_prompt(&prompt.id) {
                "builtin"
            } else {
                "custom"
            },
            id: prompt.id,
            label: prompt.label,
            role: prompt.role,
            instructions: prompt.instructions,
            prompt: prompt.body,
        })
        .collect();
    let builtin_rank = |id: &str| {
        DEFAULT_ACTIONS
            .iter()
            .position(|(builtin, _)| *builtin == id)
    };
    infos.sort_by(|a, b| match (builtin_rank(&a.id), builtin_rank(&b.id)) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.label.cmp(&b.label).then_with(|| a.id.cmp(&b.id)),
    });
    infos
}

/// Guard for ids used as file names: nothing that can escape `prompts/`.
pub(crate) fn checked_prompt_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || id.contains(['/', '\\']) || id.contains("..") {
        return Err(format!("invalid prompt id: {id:?}"));
    }
    Ok(id)
}

/// A freshly generated prompt id. The id is internal plumbing (file name and
/// rules key) whose only contract is being a unique string, so it is
/// random — never derived from the label, which users rename freely and which
/// has its own uniqueness rule (see `label_taken`).
pub(crate) fn new_prompt_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Whether another prompt (built-in or user, excluding `own_id`) already uses
/// `label`, compared trimmed and case-folded. Labels are the only identity
/// users ever see — every list in the app shows them without ids — so a
/// duplicate would make those lists ambiguous.
pub(crate) fn label_taken(app: &tauri::AppHandle, label: &str, own_id: Option<&str>) -> bool {
    let wanted = label.trim().to_lowercase();
    load_prompts(app).iter().any(|prompt| {
        Some(prompt.id.as_str()) != own_id && prompt.label.trim().to_lowercase() == wanted
    })
}

/// The frontmatter written by `save_prompt` (a subset of what `parse_prompt`
/// accepts — hand-written files can carry more).
#[derive(serde::Serialize)]
pub(crate) struct PromptMetaFile<'a> {
    label: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<&'a str>,
    #[serde(skip_serializing_if = "str::is_empty")]
    instructions: &'a str,
}

/// Serialize an prompt's fields into the .md file format (frontmatter + body)
/// — the one shape `save_prompt` writes and `import_prompt` falls back to.
pub(crate) fn serialize_prompt_md(
    label: &str,
    role: Option<&str>,
    instructions: &str,
    body: &str,
) -> Result<String, String> {
    let meta = PromptMetaFile {
        label,
        role,
        instructions,
    };
    let yaml = serde_yaml_ng::to_string(&meta).map_err(|e| e.to_string())?;
    Ok(format!("---\n{yaml}---\n\n{body}\n"))
}

/// Create or update an prompt file in the config dir. Built-ins are immutable
/// and cannot be targeted; passing no id derives one from the label. Returns
/// the id.
#[tauri::command]
pub(crate) fn save_prompt(
    app: tauri::AppHandle,
    id: Option<String>,
    label: String,
    instructions: String,
    prompt: String,
    role: Option<String>,
) -> Result<String, PromptError> {
    let label = label.trim();
    if label.is_empty() {
        return Err(PromptError::code("no-label"));
    }
    let id = match id.as_deref() {
        Some(id) if !id.is_empty() => {
            let id = checked_prompt_id(id).map_err(|_| PromptError::with("invalid-id", id))?;
            if is_builtin_prompt(id) {
                return Err(PromptError::with(
                    "failed",
                    "built-in prompts cannot be edited",
                ));
            }
            if id.starts_with(RESERVED_ID_PREFIX) {
                return Err(PromptError::with("reserved-id", id));
            }
            id.to_string()
        }
        _ => new_prompt_id(),
    };
    if label_taken(&app, label, Some(&id)) {
        return Err(PromptError::with("label-exists", label));
    }
    let role = role.as_deref().map(str::trim).filter(|r| !r.is_empty());
    let content = serialize_prompt_md(label, role, instructions.trim(), prompt.trim())
        .map_err(|reason| PromptError::with("failed", reason))?;
    write_prompt_md(&app, &id, &content).map_err(|reason| PromptError::with("failed", reason))?;
    Ok(id)
}

/// Write an prompt's .md file into the config dir's `prompts/`.
pub(crate) fn write_prompt_md(
    app: &tauri::AppHandle,
    id: &str,
    content: &str,
) -> Result<(), String> {
    let dir = config_base(app)
        .ok_or_else(|| "config dir unavailable".to_string())?
        .join("prompts");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{id}.md")), content).map_err(|e| e.to_string())
}

/// The prompt's .md source: built-ins come from the embedded copies, custom
/// prompts from their file. The text IS the prompt — importing it into
/// another ZenCopy (paste or URL) reinstalls it.
pub(crate) fn prompt_source(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let id = checked_prompt_id(id)?;
    if let Some((_, raw)) = DEFAULT_ACTIONS.iter().find(|(builtin, _)| *builtin == id) {
        return Ok((*raw).to_string());
    }
    let path = config_base(app)
        .ok_or_else(|| "config dir unavailable".to_string())?
        .join("prompts")
        .join(format!("{id}.md"));
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Export an prompt as a .md file into the user's Downloads folder and reveal
/// it in the file manager — a download, browser-style: no dialog to dismiss,
/// and the revealed file is its own confirmation. The file is named after the
/// label (ids are opaque uuids), with path-hostile characters flattened; name
/// collisions get a browser-style " (n)" suffix rather than overwriting.
/// Returns the path.
#[tauri::command]
pub(crate) fn export_prompt_file(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let text = prompt_source(&app, &id)?;
    let label = parse_prompt(&text, &id).map(|prompt| prompt.label);
    let stem: String = label
        .as_deref()
        .unwrap_or(&id)
        .trim()
        .chars()
        .map(|c| {
            if c == '/' || c == '\\' || c == ':' || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let stem = if stem.is_empty() { id.clone() } else { stem };
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let mut path = dir.join(format!("{stem}.md"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).md"));
        n += 1;
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    tauri_plugin_opener::reveal_item_in_dir(&path).or_log("reveal the exported prompt");
    log::info!("prompt '{id}' exported to {}", path.display());
    Ok(path.display().to_string())
}

/// A structured prompt failure (import or save) the frontend maps to a
/// localized message (promptErrorText in src/components/prompts-settings.tsx).
/// `detail` carries the offending id or label — or, for "failed", the raw
/// reason.
#[derive(serde::Serialize)]
pub(crate) struct PromptError {
    code: &'static str,
    detail: Option<String>,
}

impl PromptError {
    fn code(code: &'static str) -> Self {
        Self { code, detail: None }
    }
    fn with(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: Some(detail.into()),
        }
    }
}

/// Install a shared prompt from its raw .md text (the exact file format).
/// The id comes from the frontmatter, else it is generated. An id or a label
/// that is already taken — by a built-in or an existing user prompt — is
/// rejected: importing never overwrites, and labels stay unique (they are the
/// only identity users see). Returns the id.
#[tauri::command]
pub(crate) fn import_prompt(app: tauri::AppHandle, text: String) -> Result<String, PromptError> {
    let prompt = parse_prompt(&text, "").ok_or_else(|| PromptError::code("not-an-prompt"))?;
    if prompt.label.trim().is_empty() {
        return Err(PromptError::code("no-label"));
    }
    if !prompt.id.is_empty() && checked_prompt_id(&prompt.id).is_err() {
        return Err(PromptError::with("invalid-id", prompt.id));
    }
    let id = if prompt.id.is_empty() {
        new_prompt_id()
    } else {
        prompt.id.clone()
    };
    if is_builtin_prompt(&id) {
        return Err(PromptError::with("builtin-id", id));
    }
    if id.starts_with(RESERVED_ID_PREFIX) {
        return Err(PromptError::with("reserved-id", id));
    }
    let existing = config_base(&app)
        .ok_or_else(|| PromptError::with("failed", "config dir unavailable"))?
        .join("prompts")
        .join(format!("{id}.md"));
    if existing.exists() {
        return Err(PromptError::with("id-exists", id));
    }
    if label_taken(&app, &prompt.label, None) {
        return Err(PromptError::with("label-exists", prompt.label.trim()));
    }
    // Verbatim: the shared text may carry more than save_prompt writes
    // (comments, future fields) — keep every byte the author shared.
    write_prompt_md(&app, &id, &text).map_err(|reason| PromptError::with("failed", reason))?;
    log::info!("prompt '{id}' imported");
    Ok(id)
}

/// The most bytes an imported prompt file may have — an prompt is a few KB
/// of Markdown, so anything huge is a mistake, not an prompt.
pub(crate) const MAX_ACTION_TEXT_BYTES: u64 = 256 * 1024;

/// Pick a local .md file and install it as an prompt — the file-dialog
/// sibling of import_prompt (pasted text). Returns the new prompt's id, or
/// None when the user cancels the picker. Dialogs stay entirely on the Rust
/// side, so the webview never needs dialog permissions. `(async)`: the
/// blocking picker must stay off the main thread.
#[tauri::command(async)]
pub(crate) fn import_prompt_from_file(
    app: tauri::AppHandle,
) -> Result<Option<String>, PromptError> {
    use tauri_plugin_dialog::DialogExt;

    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|e| PromptError::with("failed", e.to_string()))?;
    let size = std::fs::metadata(&path)
        .map_err(|e| PromptError::with("failed", e.to_string()))?
        .len();
    if size > MAX_ACTION_TEXT_BYTES {
        return Err(PromptError::code("file-too-large"));
    }
    let text =
        std::fs::read_to_string(&path).map_err(|e| PromptError::with("failed", e.to_string()))?;
    import_prompt(app, text).map(Some)
}

/// Remove a custom prompt's file, and heal the rules that referenced it —
/// deleting the current default must leave the app working (back on the
/// built-in default), never silently dead.
#[tauri::command]
pub(crate) fn delete_prompt(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = checked_prompt_id(&id)?;
    if is_builtin_prompt(id) {
        return Err("built-in prompts cannot be deleted".to_string());
    }
    let base = config_base(&app).ok_or_else(|| "config dir unavailable".to_string())?;
    std::fs::remove_file(base.join("prompts").join(format!("{id}.md")))
        .map_err(|e| e.to_string())?;
    // No rules.json means only the embedded defaults are in play, and those
    // never reference a custom prompt — nothing to heal (and nothing to seed).
    if base.join("rules.json").exists() {
        // The prompt is already gone; a failed cleanup degrades to the old
        // dangling-reference behavior (visible in the settings UI), so log
        // rather than fail the deletion.
        edit_rules_json(&app, |object| purge_prompt_from_rules_object(object, id))
            .or_log("heal rules after an prompt deletion");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pre-installed prompt that fails to parse would silently vanish from
    /// the app (parse_prompt returns None) — catch that at test time instead.
    #[test]
    fn builtin_prompts_parse() {
        for (id, raw) in DEFAULT_ACTIONS {
            let prompt = parse_prompt(raw, id)
                .unwrap_or_else(|| panic!("built-in prompt '{id}' failed to parse"));
            assert_eq!(&prompt.id, id, "built-in prompt id must match its key");
            assert!(
                prompt.id.starts_with(RESERVED_ID_PREFIX),
                "'{id}' must carry the '{RESERVED_ID_PREFIX}' prefix that marks pre-installed prompts"
            );
            assert!(!prompt.label.is_empty(), "'{id}' must have a label");
            assert!(!prompt.body.is_empty(), "'{id}' must have a prompt body");
        }
    }

    /// Deleting an prompt that rules references must heal the file, not
    /// leave ghosts: kind mappings return to the embedded default, rules
    /// running the prompt disappear, everything else stays verbatim.
    #[test]
    fn deleting_a_routed_prompt_heals_the_rules() {
        let mut object = serde_json::json!({
            "text": "my-custom",
            "image": "zencopy-explain",
            "future_kind": "my-custom",
            "overrides": [
                { "when": { "app_name": "Mail" }, "prompt": "my-custom" },
                { "when": { "app_name": "Code" }, "prompt": "zencopy-zen" }
            ]
        })
        .as_object()
        .expect("test fixture is an object")
        .clone();
        purge_prompt_from_rules_object(&mut object, "my-custom");
        assert_eq!(
            object["text"], "zencopy-zen",
            "kind returns to the embedded default"
        );
        assert_eq!(
            object["image"], "zencopy-explain",
            "other assignments stay verbatim"
        );
        assert!(
            !object.contains_key("future_kind"),
            "a kind with no embedded default is removed"
        );
        let rules = object["overrides"]
            .as_array()
            .expect("overrides stay a list");
        assert_eq!(
            rules.len(),
            1,
            "rules running the deleted prompt are dropped"
        );
        assert_eq!(rules[0]["prompt"], "zencopy-zen");
    }

    /// The prompt format's compatibility contract (see PromptMeta): shared
    /// files written by FUTURE versions — extra fields, even a `schema`
    /// marker — must still parse in this version. If this test fails,
    /// something made the frontmatter parsing strict, and every shared
    /// prompt that uses a newer field just broke for existing users.
    #[test]
    fn prompt_parsing_tolerates_future_fields() {
        let raw = "---\nid: future\nlabel: Future\nschema: 2\nbrand_new_list: [a, b]\nbrand_new_map:\n  nested: true\n---\n\nBody\n";
        let prompt = parse_prompt(raw, "future")
            .expect("unknown frontmatter fields must be ignored, never a parse failure");
        assert_eq!(prompt.id, "future");
        assert_eq!(prompt.label, "Future");
        assert_eq!(prompt.body, "Body");
    }
}
