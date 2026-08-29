//! Rules: which prompt handles a capture — the flat kind map, the
//! override rules, and the commands the settings rules section calls.

use crate::capture::{capture_kind, capture_text};
use crate::config::config_base;
use crate::prompts::{Prompt, checked_prompt_id};
/// A rules override's `when` condition. Every present field must match (AND).
/// String fields support `*` wildcards and match case-sensitively — except
/// `file_name`, which matches case-insensitively (file systems mostly do, and
/// `*.pdf` should catch `Scan.PDF`). Field names mirror the template variables
/// (e.g. `app_name`). Serialized for the settings UI and back into
/// rules.json, so absent fields must stay absent.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct WhenCondition {
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exec_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    window_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    /// Matches a `files` capture by name: every copied file's base name must
    /// match the pattern (`*.pdf`, `IMG_*`, …). Other capture kinds never match.
    #[serde(skip_serializing_if = "Option::is_none")]
    file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_chars: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_chars: Option<usize>,
}

/// A higher-priority rules rule: if `when` matches the capture, use `prompt`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct Override {
    when: WhenCondition,
    prompt: String,
}

/// Rules: a flat `kind` → prompt map (the intuitive base) plus an optional,
/// higher-priority `overrides` list, evaluated first (first match wins).
#[derive(Clone)]
pub(crate) struct RulesConfig {
    by_kind: std::collections::HashMap<String, String>,
    overrides: Vec<Override>,
}

/// Parse rules JSON into a config (top-level `kind: prompt` plus `overrides`).
pub(crate) fn parse_rules(text: &str) -> Option<RulesConfig> {
    let value = serde_json::from_str::<serde_json::Value>(text).ok()?;
    let object = value.as_object()?;
    let mut by_kind = std::collections::HashMap::new();
    let mut overrides = Vec::new();
    for (key, val) in object {
        if key == "overrides" {
            if let Ok(parsed) = serde_json::from_value::<Vec<Override>>(val.clone()) {
                overrides = parsed;
            }
        } else if let Some(prompt) = val.as_str() {
            by_kind.insert(key.clone(), prompt.to_string());
        }
    }
    Some(RulesConfig { by_kind, overrides })
}

/// The embedded default rules, parsed once — it is a compile-time constant.
pub(crate) static DEFAULT_ROUTING: std::sync::LazyLock<RulesConfig> =
    std::sync::LazyLock::new(|| {
        parse_rules(include_str!("../rules.json")).unwrap_or(RulesConfig {
            by_kind: std::collections::HashMap::new(),
            overrides: Vec::new(),
        })
    });

/// Rules: the user's `rules.json` if present and valid, else the embedded
/// default. A missing/broken file can't disable rules — the default stands.
pub(crate) fn load_rules(handle: &tauri::AppHandle) -> RulesConfig {
    let user = config_base(handle)
        .map(|base| base.join("rules.json"))
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok())
        .filter(|text| !text.trim().is_empty());
    let user_rules = user.as_deref().and_then(|text| {
        let parsed = parse_rules(text);
        if parsed.is_none() {
            log::warn!("rules.json: not valid rules JSON, falling back to the default rules");
        }
        parsed
    });
    let rules = user_rules.unwrap_or_else(|| DEFAULT_ROUTING.clone());
    // A rule naming a kind that doesn't exist (a typo, or a leftover from a
    // removed kind) can never fire — silent config decay deserves a trace.
    for kind in rules.by_kind.keys() {
        if !RULE_KINDS.contains(&kind.as_str()) {
            log::warn!("rules.json: unknown kind \"{kind}\" is never matched, ignored");
        }
    }
    for rule in &rules.overrides {
        if let Some(kind) = &rule.when.kind
            && !RULE_KINDS.contains(&kind.as_str())
        {
            log::warn!("rules.json: override with unknown kind \"{kind}\" never matches");
        }
    }
    rules
}

/// Case-sensitive glob match where `*` matches any (possibly empty) run.
pub(crate) fn glob_match(pattern: &str, value: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    let count = parts.len();
    if count == 1 {
        return value == pattern;
    }
    let mut cursor = 0;
    for (index, part) in parts.into_iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if index == 0 {
            if !value[cursor..].starts_with(part) {
                return false;
            }
            cursor += part.len();
        } else if index == count - 1 {
            if !value[cursor..].ends_with(part) {
                return false;
            }
        } else if let Some(found) = value[cursor..].find(part) {
            cursor += found + part.len();
        } else {
            return false;
        }
    }
    true
}

/// Whether every copied file's base name matches the pattern, case-insensitively.
/// All-files semantics: an prompt written for PDFs should not fire on a mixed
/// selection just because one PDF is in it — an unmatched rule falls through
/// to the next rule or the kind map.
fn all_file_names_match(pattern: &str, paths: &[String]) -> bool {
    let pattern = pattern.to_lowercase();
    !paths.is_empty()
        && paths.iter().all(|path| {
            glob_match(
                &pattern,
                &crate::capture::file_basename(path).to_lowercase(),
            )
        })
}

/// Whether an override's `when` matches the capture (all present fields, AND).
pub(crate) fn when_matches(
    when: &WhenCondition,
    event: &copycopy::CaptureEvent,
    kind: &str,
) -> bool {
    if let Some(expected) = &when.kind
        && expected != kind
    {
        return false;
    }
    if let Some(pattern) = &when.app_name
        && !glob_match(pattern, &event.app_name)
    {
        return false;
    }
    if let Some(pattern) = &when.exec_name
        && !glob_match(pattern, &event.exec_name)
    {
        return false;
    }
    if let Some(pattern) = &when.window_title
        && !glob_match(pattern, &event.window_title)
    {
        return false;
    }
    if let Some(pattern) = &when.url
        && !glob_match(pattern, event.url.as_deref().unwrap_or(""))
    {
        return false;
    }
    if let Some(pattern) = &when.file_name {
        let copycopy::Captured::Files { paths } = &event.content else {
            return false;
        };
        if !all_file_names_match(pattern, paths) {
            return false;
        }
    }
    if when.min_chars.is_some() || when.max_chars.is_some() {
        let count = capture_text(event).chars().count();
        if let Some(min) = when.min_chars
            && count < min
        {
            return false;
        }
        if let Some(max) = when.max_chars
            && count > max
        {
            return false;
        }
    }
    true
}

/// Resolve which prompt handles a capture: a matching override (first wins) takes
/// priority over the 1:1 kind map.
pub(crate) fn resolve_prompt<'a>(
    rules: &RulesConfig,
    prompts: &'a [Prompt],
    event: &copycopy::CaptureEvent,
) -> Option<&'a Prompt> {
    let kind = capture_kind(event);
    for rule in &rules.overrides {
        if when_matches(&rule.when, event, kind)
            && let Some(prompt) = prompts.iter().find(|prompt| prompt.id == rule.prompt)
        {
            return Some(prompt);
        }
    }
    let id = rules.by_kind.get(kind)?;
    prompts.iter().find(|prompt| &prompt.id == id)
}

/// Remove every reference to `id` from a rules JSON object: kind mappings
/// that pointed at it return to the embedded default (so a capture keeps
/// running something instead of dead-ending on a ghost id), and override
/// rules that ran it are dropped. The defaults only name built-ins — which
/// cannot be deleted — so this never reintroduces a dangling id.
pub(crate) fn purge_prompt_from_rules_object(
    object: &mut serde_json::Map<String, serde_json::Value>,
    id: &str,
) {
    let stale: Vec<String> = object
        .iter()
        .filter(|(key, value)| *key != "overrides" && value.as_str() == Some(id))
        .map(|(key, _)| key.clone())
        .collect();
    for kind in stale {
        match DEFAULT_ROUTING.by_kind.get(&kind) {
            Some(fallback) => {
                object.insert(kind, serde_json::json!(fallback));
            }
            None => {
                object.remove(&kind);
            }
        }
    }
    if let Some(rules) = object.get_mut("overrides").and_then(|v| v.as_array_mut()) {
        rules.retain(|rule| rule.get("prompt").and_then(|v| v.as_str()) != Some(id));
    }
}

/// The capture kinds the rules UI exposes (mirrors `capture_kind`; `empty`
/// is deliberately not routable).
pub(crate) const RULE_KINDS: [&str; 3] = ["text", "image", "files"];

/// Read-modify-write the user's rules.json as a JSON object (seeded from
/// the embedded default when none exists). Everything the mutation doesn't
/// touch is preserved verbatim.
pub(crate) fn edit_rules_json(
    app: &tauri::AppHandle,
    mutate: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> Result<(), String> {
    let base = config_base(app).ok_or_else(|| "config dir unavailable".to_string())?;
    let path = base.join("rules.json");
    let current = std::fs::read_to_string(&path)
        .ok()
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| include_str!("../rules.json").to_string());
    let mut value: serde_json::Value =
        serde_json::from_str(&current).unwrap_or_else(|_| serde_json::json!({}));
    let object = value
        .as_object_mut()
        .ok_or_else(|| "rules.json is not a JSON object".to_string())?;
    mutate(object);
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Update flat `kind` → prompt entries in the user's rules.json. Only the
/// given kinds are touched; `None` removes the mapping.
pub(crate) fn update_rules(
    app: &tauri::AppHandle,
    kinds: &[&str],
    id: Option<&str>,
) -> Result<(), String> {
    edit_rules_json(app, |object| {
        for kind in kinds {
            match id {
                Some(id) => {
                    object.insert((*kind).to_string(), serde_json::json!(id));
                }
                None => {
                    object.remove(*kind);
                }
            }
        }
    })
}

/// Route captures of `kind` to prompt `id` (`None` clears the mapping) — the
/// settings window's rules section.
#[tauri::command]
pub(crate) fn set_kind_prompt(
    app: tauri::AppHandle,
    kind: String,
    id: Option<String>,
) -> Result<(), String> {
    if !RULE_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown capture kind: {kind:?}"));
    }
    let id = id.as_deref().map(checked_prompt_id).transpose()?;
    update_rules(&app, &[kind.as_str()], id)?;
    match id {
        Some(id) => log::info!("rules: '{kind}' now routes to prompt '{id}'"),
        None => log::info!("rules: '{kind}' now has no prompt"),
    }
    Ok(())
}

/// Replace the overrides list in the user's rules.json — the settings
/// window's rule editor. The flat kind → prompt map is preserved; the list
/// order is the priority (first match wins).
#[tauri::command]
pub(crate) fn set_overrides(app: tauri::AppHandle, overrides: Vec<Override>) -> Result<(), String> {
    for rule in &overrides {
        checked_prompt_id(&rule.prompt)?;
    }
    let count = overrides.len();
    let value = serde_json::to_value(&overrides).map_err(|e| e.to_string())?;
    edit_rules_json(&app, |object| {
        object.insert("overrides".to_string(), value);
    })?;
    log::info!("rules: {count} override rule(s) saved");
    Ok(())
}

/// The effective rules as shown in the settings UI: the flat kind → prompt
/// map plus the ordered overrides list.
#[derive(serde::Serialize)]
pub(crate) struct RulesInfo {
    by_kind: std::collections::HashMap<String, String>,
    overrides: Vec<Override>,
}

#[tauri::command]
pub(crate) fn get_rules_ui(app: tauri::AppHandle) -> RulesInfo {
    let rules = load_rules(&app);
    RulesInfo {
        by_kind: rules.by_kind,
        overrides: rules.overrides,
    }
}

#[cfg(test)]
mod file_rule_tests {
    use super::all_file_names_match;

    /// `*.pdf` must catch every copied PDF regardless of case — file systems
    /// are mostly case-insensitive and users type lowercase patterns.
    #[test]
    fn extension_pattern_matches_case_insensitively() {
        let paths = vec!["/tmp/report.pdf".to_string(), "/tmp/Scan.PDF".to_string()];
        assert!(all_file_names_match("*.pdf", &paths));
    }

    /// A mixed selection must not match: the routed prompt was written for
    /// the pattern's kind of file, not for whatever rode along with it.
    #[test]
    fn mixed_selection_does_not_match() {
        let paths = vec!["/tmp/report.pdf".to_string(), "/tmp/notes.txt".to_string()];
        assert!(!all_file_names_match("*.pdf", &paths));
        assert!(!all_file_names_match("*.pdf", &[]));
    }

    /// The pattern matches base names, never the directory part of the path.
    #[test]
    fn matches_the_base_name_not_the_path() {
        let paths = vec!["/pdf/archive/notes.txt".to_string()];
        assert!(!all_file_names_match("*pdf*", &paths));
        assert!(all_file_names_match("notes.*", &paths));
    }
}
