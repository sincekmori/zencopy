//! Actions: the built-in set, the user's local .md files, and every
//! command the settings editor and the popup switcher call.

use crate::OrLog;
use crate::config::config_base;
use crate::routing::{edit_routing_json, purge_action_from_routing_object};
use tauri::Manager;
/// A parsed action: frontmatter metadata + the Markdown body (the prompt).
#[derive(Clone)]
pub(crate) struct Action {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) role: Option<String>,
    pub(crate) instructions: String,
    pub(crate) body: String,
}

/// Compatibility contract for the action format (shared files live for years
/// in gists and chats): evolve additively only — never remove or repurpose a
/// field, new fields are optional with a default, and unknown fields are
/// ignored (serde's default; never add `deny_unknown_fields`). No version
/// field on purpose: its absence IS version 1, and a breaking change — if one
/// ever becomes unavoidable — introduces an explicit `schema: 2` marker then.
#[derive(serde::Deserialize)]
pub(crate) struct ActionMeta {
    id: Option<String>,
    label: Option<String>,
    role: Option<String>,
    instructions: Option<String>,
}

/// Parse one action file: YAML frontmatter (between `---` lines) + Markdown body.
/// `default_id` (e.g. the filename stem) is used when frontmatter omits `id`.
pub(crate) fn parse_action(raw: &str, default_id: &str) -> Option<Action> {
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
    let meta: ActionMeta = serde_yaml_ng::from_str(&frontmatter).ok()?;
    let id = meta.id.unwrap_or_else(|| default_id.to_string());
    let label = meta.label.unwrap_or_else(|| id.clone());
    Some(Action {
        id,
        label,
        role: meta.role,
        instructions: meta.instructions.unwrap_or_default(),
        body: body.trim().to_string(),
    })
}

pub(crate) const DEFAULT_ACTIONS: &[(&str, &str)] = &[
    ("zencopy-zen", include_str!("../actions/zen.md")),
    ("zencopy-explain", include_str!("../actions/explain.md")),
    ("zencopy-translate", include_str!("../actions/translate.md")),
    ("zencopy-polish", include_str!("../actions/polish.md")),
];

/// Every pre-installed action id carries this prefix — it marks an action as
/// official, and reserving it keeps user actions from colliding with future
/// built-ins. User-supplied ids with this prefix are rejected everywhere ids
/// enter (editor save, import, files in the config dir).
pub(crate) const RESERVED_ID_PREFIX: &str = "zencopy-";

/// Whether `id` names a built-in (immutable) action.
pub(crate) fn is_builtin_action(id: &str) -> bool {
    DEFAULT_ACTIONS.iter().any(|(builtin, _)| *builtin == id)
}

/// Actions defined by local files in the config dir — the user's additions and
/// overrides. Invalid files are logged and skipped.
pub(crate) fn load_local_actions(handle: &tauri::AppHandle) -> Vec<Action> {
    let mut actions = Vec::new();
    if let Some(base) = config_base(handle)
        && let Ok(entries) = std::fs::read_dir(base.join("actions"))
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
            // must survive somewhere — a broken action "not doing anything" is
            // undebuggable without it.
            match std::fs::read_to_string(&path) {
                Ok(raw) => match parse_action(&raw, stem) {
                    Some(action) => actions.push(action),
                    None => log::warn!(
                        "action {}: missing or malformed frontmatter, file ignored",
                        path.display()
                    ),
                },
                Err(error) => log::warn!(
                    "action {}: unreadable ({error}), file ignored",
                    path.display()
                ),
            }
        }
    }
    actions
}

/// The action list: immutable built-ins plus local files in the config dir.
/// Local files add new actions only — one that names a built-in id is ignored
/// (with a warning), so the defaults can never be broken or impersonated. Read
/// per capture so edits take effect without a restart.
pub(crate) fn load_actions(handle: &tauri::AppHandle) -> Vec<Action> {
    // The built-ins are compile-time constants — parse their YAML once, not
    // on every capture (cloning a few KB of Strings is far cheaper).
    static BUILTINS: std::sync::LazyLock<Vec<Action>> = std::sync::LazyLock::new(|| {
        DEFAULT_ACTIONS
            .iter()
            .filter_map(|(id, raw)| parse_action(raw, id))
            .collect()
    });
    let mut by_id: std::collections::HashMap<String, Action> = BUILTINS
        .iter()
        .map(|action| (action.id.clone(), action.clone()))
        .collect();
    for action in load_local_actions(handle) {
        if is_builtin_action(&action.id) {
            log::warn!(
                "action '{}': shadows a built-in and is ignored (built-ins are immutable)",
                action.id
            );
            continue;
        }
        if action.id.starts_with(RESERVED_ID_PREFIX) {
            log::warn!(
                "action '{}': the '{RESERVED_ID_PREFIX}' id prefix is reserved for pre-installed actions; ignored",
                action.id
            );
            continue;
        }
        by_id.insert(action.id.clone(), action);
    }
    by_id.into_values().collect()
}

/// An action as presented to the UI — the popup's switcher and the settings
/// list. `origin` tells the settings UI what is editable: "builtin" ships with
/// the app and is immutable, "custom" is the user's own local file.
#[derive(serde::Serialize)]
pub(crate) struct ActionInfo {
    id: String,
    label: String,
    role: Option<String>,
    instructions: String,
    prompt: String,
    origin: &'static str,
}

/// Every action: pre-installed first, in their DEFAULT_ACTIONS order (Zen
/// leads by construction), then the user's actions sorted by label.
#[tauri::command]
pub(crate) fn list_actions_ui(app: tauri::AppHandle) -> Vec<ActionInfo> {
    let mut infos: Vec<ActionInfo> = load_actions(&app)
        .into_iter()
        .map(|action| ActionInfo {
            origin: if is_builtin_action(&action.id) {
                "builtin"
            } else {
                "custom"
            },
            id: action.id,
            label: action.label,
            role: action.role,
            instructions: action.instructions,
            prompt: action.body,
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

/// Guard for ids used as file names: nothing that can escape `actions/`.
pub(crate) fn checked_action_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || id.contains(['/', '\\']) || id.contains("..") {
        return Err(format!("invalid action id: {id:?}"));
    }
    Ok(id)
}

/// A freshly generated action id. The id is internal plumbing (file name and
/// routing key) whose only contract is being a unique string, so it is
/// random — never derived from the label, which users rename freely and which
/// has its own uniqueness rule (see `label_taken`).
pub(crate) fn new_action_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Whether another action (built-in or user, excluding `own_id`) already uses
/// `label`, compared trimmed and case-folded. Labels are the only identity
/// users ever see — every list in the app shows them without ids — so a
/// duplicate would make those lists ambiguous.
pub(crate) fn label_taken(app: &tauri::AppHandle, label: &str, own_id: Option<&str>) -> bool {
    let wanted = label.trim().to_lowercase();
    load_actions(app).iter().any(|action| {
        Some(action.id.as_str()) != own_id && action.label.trim().to_lowercase() == wanted
    })
}

/// The frontmatter written by `save_action` (a subset of what `parse_action`
/// accepts — hand-written files can carry more).
#[derive(serde::Serialize)]
pub(crate) struct ActionMetaFile<'a> {
    label: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<&'a str>,
    #[serde(skip_serializing_if = "str::is_empty")]
    instructions: &'a str,
}

/// Serialize an action's fields into the .md file format (frontmatter + body)
/// — the one shape `save_action` writes and `import_action` falls back to.
pub(crate) fn serialize_action_md(
    label: &str,
    role: Option<&str>,
    instructions: &str,
    body: &str,
) -> Result<String, String> {
    let meta = ActionMetaFile {
        label,
        role,
        instructions,
    };
    let yaml = serde_yaml_ng::to_string(&meta).map_err(|e| e.to_string())?;
    Ok(format!("---\n{yaml}---\n\n{body}\n"))
}

/// Create or update an action file in the config dir. Built-ins are immutable
/// and cannot be targeted; passing no id derives one from the label. Returns
/// the id.
#[tauri::command]
pub(crate) fn save_action(
    app: tauri::AppHandle,
    id: Option<String>,
    label: String,
    instructions: String,
    prompt: String,
    role: Option<String>,
) -> Result<String, ActionError> {
    let label = label.trim();
    if label.is_empty() {
        return Err(ActionError::code("no-label"));
    }
    let id = match id.as_deref() {
        Some(id) if !id.is_empty() => {
            let id = checked_action_id(id).map_err(|_| ActionError::with("invalid-id", id))?;
            if is_builtin_action(id) {
                return Err(ActionError::with(
                    "failed",
                    "built-in actions cannot be edited",
                ));
            }
            if id.starts_with(RESERVED_ID_PREFIX) {
                return Err(ActionError::with("reserved-id", id));
            }
            id.to_string()
        }
        _ => new_action_id(),
    };
    if label_taken(&app, label, Some(&id)) {
        return Err(ActionError::with("label-exists", label));
    }
    let role = role.as_deref().map(str::trim).filter(|r| !r.is_empty());
    let content = serialize_action_md(label, role, instructions.trim(), prompt.trim())
        .map_err(|reason| ActionError::with("failed", reason))?;
    write_action_md(&app, &id, &content).map_err(|reason| ActionError::with("failed", reason))?;
    Ok(id)
}

/// Write an action's .md file into the config dir's `actions/`.
pub(crate) fn write_action_md(
    app: &tauri::AppHandle,
    id: &str,
    content: &str,
) -> Result<(), String> {
    let dir = config_base(app)
        .ok_or_else(|| "config dir unavailable".to_string())?
        .join("actions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{id}.md")), content).map_err(|e| e.to_string())
}

/// The action's .md source: built-ins come from the embedded copies, custom
/// actions from their file. The text IS the action — importing it into
/// another ZenCopy (paste or URL) reinstalls it.
pub(crate) fn action_source(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
    let id = checked_action_id(id)?;
    if let Some((_, raw)) = DEFAULT_ACTIONS.iter().find(|(builtin, _)| *builtin == id) {
        return Ok((*raw).to_string());
    }
    let path = config_base(app)
        .ok_or_else(|| "config dir unavailable".to_string())?
        .join("actions")
        .join(format!("{id}.md"));
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Export an action as a .md file into the user's Downloads folder and reveal
/// it in the file manager — a download, browser-style: no dialog to dismiss,
/// and the revealed file is its own confirmation. The file is named after the
/// label (ids are opaque uuids), with path-hostile characters flattened; name
/// collisions get a browser-style " (n)" suffix rather than overwriting.
/// Returns the path.
#[tauri::command]
pub(crate) fn export_action_file(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let text = action_source(&app, &id)?;
    let label = parse_action(&text, &id).map(|action| action.label);
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
    tauri_plugin_opener::reveal_item_in_dir(&path).or_log("reveal the exported action");
    log::info!("action '{id}' exported to {}", path.display());
    Ok(path.display().to_string())
}

/// A structured action failure (import or save) the frontend maps to a
/// localized message (actionErrorText in src/components/actions-settings.tsx).
/// `detail` carries the offending id or label — or, for "failed", the raw
/// reason.
#[derive(serde::Serialize)]
pub(crate) struct ActionError {
    code: &'static str,
    detail: Option<String>,
}

impl ActionError {
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

/// Install a shared action from its raw .md text (the exact file format).
/// The id comes from the frontmatter, else it is generated. An id or a label
/// that is already taken — by a built-in or an existing user action — is
/// rejected: importing never overwrites, and labels stay unique (they are the
/// only identity users see). Returns the id.
#[tauri::command]
pub(crate) fn import_action(app: tauri::AppHandle, text: String) -> Result<String, ActionError> {
    let action = parse_action(&text, "").ok_or_else(|| ActionError::code("not-an-action"))?;
    if action.label.trim().is_empty() {
        return Err(ActionError::code("no-label"));
    }
    if !action.id.is_empty() && checked_action_id(&action.id).is_err() {
        return Err(ActionError::with("invalid-id", action.id));
    }
    let id = if action.id.is_empty() {
        new_action_id()
    } else {
        action.id.clone()
    };
    if is_builtin_action(&id) {
        return Err(ActionError::with("builtin-id", id));
    }
    if id.starts_with(RESERVED_ID_PREFIX) {
        return Err(ActionError::with("reserved-id", id));
    }
    let existing = config_base(&app)
        .ok_or_else(|| ActionError::with("failed", "config dir unavailable"))?
        .join("actions")
        .join(format!("{id}.md"));
    if existing.exists() {
        return Err(ActionError::with("id-exists", id));
    }
    if label_taken(&app, &action.label, None) {
        return Err(ActionError::with("label-exists", action.label.trim()));
    }
    // Verbatim: the shared text may carry more than save_action writes
    // (comments, future fields) — keep every byte the author shared.
    write_action_md(&app, &id, &text).map_err(|reason| ActionError::with("failed", reason))?;
    log::info!("action '{id}' imported");
    Ok(id)
}

/// The most bytes an imported action file may have — an action is a few KB
/// of Markdown, so anything huge is a mistake, not an action.
pub(crate) const MAX_ACTION_TEXT_BYTES: u64 = 256 * 1024;

/// Pick a local .md file and install it as an action — the file-dialog
/// sibling of import_action (pasted text). Returns the new action's id, or
/// None when the user cancels the picker. Dialogs stay entirely on the Rust
/// side, so the webview never needs dialog permissions. `(async)`: the
/// blocking picker must stay off the main thread.
#[tauri::command(async)]
pub(crate) fn import_action_from_file(
    app: tauri::AppHandle,
) -> Result<Option<String>, ActionError> {
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
        .map_err(|e| ActionError::with("failed", e.to_string()))?;
    let size = std::fs::metadata(&path)
        .map_err(|e| ActionError::with("failed", e.to_string()))?
        .len();
    if size > MAX_ACTION_TEXT_BYTES {
        return Err(ActionError::code("file-too-large"));
    }
    let text =
        std::fs::read_to_string(&path).map_err(|e| ActionError::with("failed", e.to_string()))?;
    import_action(app, text).map(Some)
}

/// Remove a custom action's file, and heal the routing that referenced it —
/// deleting the current default must leave the app working (back on the
/// built-in default), never silently dead.
#[tauri::command]
pub(crate) fn delete_action(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = checked_action_id(&id)?;
    if is_builtin_action(id) {
        return Err("built-in actions cannot be deleted".to_string());
    }
    let base = config_base(&app).ok_or_else(|| "config dir unavailable".to_string())?;
    std::fs::remove_file(base.join("actions").join(format!("{id}.md")))
        .map_err(|e| e.to_string())?;
    // No routing.json means only the embedded defaults are in play, and those
    // never reference a custom action — nothing to heal (and nothing to seed).
    if base.join("routing.json").exists() {
        // The action is already gone; a failed cleanup degrades to the old
        // dangling-reference behavior (visible in the settings UI), so log
        // rather than fail the deletion.
        edit_routing_json(&app, |object| purge_action_from_routing_object(object, id))
            .or_log("heal routing after an action deletion");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pre-installed action that fails to parse would silently vanish from
    /// the app (parse_action returns None) — catch that at test time instead.
    #[test]
    fn builtin_actions_parse() {
        for (id, raw) in DEFAULT_ACTIONS {
            let action = parse_action(raw, id)
                .unwrap_or_else(|| panic!("built-in action '{id}' failed to parse"));
            assert_eq!(&action.id, id, "built-in action id must match its key");
            assert!(
                action.id.starts_with(RESERVED_ID_PREFIX),
                "'{id}' must carry the '{RESERVED_ID_PREFIX}' prefix that marks pre-installed actions"
            );
            assert!(!action.label.is_empty(), "'{id}' must have a label");
            assert!(!action.body.is_empty(), "'{id}' must have a prompt body");
        }
    }

    /// Deleting an action that routing references must heal the file, not
    /// leave ghosts: kind mappings return to the embedded default, rules
    /// running the action disappear, everything else stays verbatim.
    #[test]
    fn deleting_a_routed_action_heals_the_routing() {
        let mut object = serde_json::json!({
            "text": "my-custom",
            "rich_text": "my-custom",
            "image": "zencopy-explain",
            "future_kind": "my-custom",
            "overrides": [
                { "when": { "app_name": "Mail" }, "action": "my-custom" },
                { "when": { "app_name": "Code" }, "action": "zencopy-zen" }
            ]
        })
        .as_object()
        .expect("test fixture is an object")
        .clone();
        purge_action_from_routing_object(&mut object, "my-custom");
        assert_eq!(
            object["text"], "zencopy-zen",
            "kind returns to the embedded default"
        );
        assert_eq!(object["rich_text"], "zencopy-zen");
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
            "rules running the deleted action are dropped"
        );
        assert_eq!(rules[0]["action"], "zencopy-zen");
    }

    /// The action format's compatibility contract (see ActionMeta): shared
    /// files written by FUTURE versions — extra fields, even a `schema`
    /// marker — must still parse in this version. If this test fails,
    /// something made the frontmatter parsing strict, and every shared
    /// action that uses a newer field just broke for existing users.
    #[test]
    fn action_parsing_tolerates_future_fields() {
        let raw = "---\nid: future\nlabel: Future\nschema: 2\nbrand_new_list: [a, b]\nbrand_new_map:\n  nested: true\n---\n\nBody\n";
        let action = parse_action(raw, "future")
            .expect("unknown frontmatter fields must be ignored, never a parse failure");
        assert_eq!(action.id, "future");
        assert_eq!(action.label, "Future");
        assert_eq!(action.body, "Body");
    }
}
