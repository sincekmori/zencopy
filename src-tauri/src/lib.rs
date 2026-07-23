use tauri::{
    Emitter, Manager, WebviewWindow,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

/// Log-and-continue for fallible calls whose failure must not break the flow
/// (window operations on a resident HUD degrade, they don't crash). Prefer this
/// over `let _ =`, which silently discards the reason something didn't happen —
/// exactly the evidence needed when "the popup didn't show" gets reported.
trait OrLog {
    fn or_log(self, context: &str);
}

impl<T, E: std::fmt::Display> OrLog for Result<T, E> {
    fn or_log(self, context: &str) {
        if let Err(error) = self {
            log::warn!("{context} failed: {error}");
        }
    }
}

/// The captured content, prepared for display in the popup ("what is being acted
/// on"). Serialized with a `kind` tag matching `CapturePayload.kind`.
#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum SourcePreview {
    Text {
        text: String,
    },
    RichText {
        format: String,
        markup: String,
        plain: String,
    },
    Image {
        width: u32,
        height: u32,
        /// `data:image/png;base64,...` so the webview can render it directly.
        data_url: String,
    },
    Files {
        paths: Vec<String>,
    },
    Empty,
}

/// A capture, prepared for the UI. The popup shows `source` ("what is being acted
/// on") and runs `role`/`instructions`/`prompt` when `runnable`.
#[derive(Clone, serde::Serialize)]
struct CapturePayload {
    kind: &'static str,
    /// The captured content itself, for the popup to display.
    source: SourcePreview,
    /// The matched action's id (empty if none). Lets the popup's switcher know
    /// what is selected and what "set as default" refers to.
    action_id: String,
    /// The matched action's label (empty if none).
    label: String,
    /// Catalog role to run with (already resolved to "default" when omitted).
    role: String,
    /// The action's system prompt as a Liquid template (the frontend renders it).
    instructions: String,
    /// The action body (user prompt) as a Liquid template (the frontend renders it).
    prompt: String,
    /// Template variables (from the capture + now) for the frontend to render with.
    vars: std::collections::HashMap<&'static str, String>,
    /// Whether an action applies to this capture and is ready to run.
    runnable: bool,
    /// Whether the popup is pinned to a bottom corner (card hugs the bottom edge).
    align_bottom: bool,
}

/// A parsed action: frontmatter metadata + the Markdown body (the prompt).
#[derive(Clone)]
struct Action {
    id: String,
    label: String,
    role: Option<String>,
    instructions: String,
    body: String,
}

/// Compatibility contract for the action format (shared files live for years
/// in gists and chats): evolve additively only — never remove or repurpose a
/// field, new fields are optional with a default, and unknown fields are
/// ignored (serde's default; never add `deny_unknown_fields`). No version
/// field on purpose: its absence IS version 1, and a breaking change — if one
/// ever becomes unavoidable — introduces an explicit `schema: 2` marker then.
#[derive(serde::Deserialize)]
struct ActionMeta {
    id: Option<String>,
    label: Option<String>,
    role: Option<String>,
    instructions: Option<String>,
}

/// Parse one action file: YAML frontmatter (between `---` lines) + Markdown body.
/// `default_id` (e.g. the filename stem) is used when frontmatter omits `id`.
fn parse_action(raw: &str, default_id: &str) -> Option<Action> {
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

/// Where user config files (ai-sdk-catalog.json, routing.json, actions/) are read
/// from: the per-user app config dir, in dev and release alike — one
/// predictable location (logged at startup). Defaults for routing and actions
/// are embedded in the binary, so this dir only ever *overrides*.
fn config_base(handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    handle.path().app_config_dir().ok()
}

/// Pre-installed actions: authored as files in `src-tauri/actions/` (kept as
/// real .md so formatters and reviews see them), embedded into the binary at
/// build time, and immutable at runtime — never shipped or seeded as files,
/// local files with the same id are ignored, and the UI shows them read-only.
/// Customization means adding *new* actions.
/// The tauri-plugin-store file; the frontend reads the same file via its own
/// STORE_FILE constant in src/lib/settings.ts (kept in sync by a test below).
const STORE_FILE: &str = "settings.json";

const DEFAULT_ACTIONS: &[(&str, &str)] = &[
    ("zen", include_str!("../actions/zen.md")),
    ("explain", include_str!("../actions/explain.md")),
    ("translate", include_str!("../actions/translate.md")),
    ("polish", include_str!("../actions/polish.md")),
];

/// Whether `id` names a built-in (immutable) action.
fn is_builtin_action(id: &str) -> bool {
    DEFAULT_ACTIONS.iter().any(|(builtin, _)| *builtin == id)
}

/// Actions defined by local files in the config dir — the user's additions and
/// overrides. Invalid files are logged and skipped.
fn load_local_actions(handle: &tauri::AppHandle) -> Vec<Action> {
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
fn load_actions(handle: &tauri::AppHandle) -> Vec<Action> {
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
        by_id.insert(action.id.clone(), action);
    }
    by_id.into_values().collect()
}

/// An HTML copy's `{{ text }}`: the markup converted to Markdown, so its
/// formatting survives the model round trip — the popup renders Markdown, so
/// inline code, bold, and links come back as themselves instead of degrading
/// to plain text. Falls back to the app-provided plain text on a conversion
/// error.
fn html_to_markdown(markup: &str, plain: &str) -> String {
    htmd::convert(markup).unwrap_or_else(|error| {
        log::warn!("rich capture: HTML to Markdown failed ({error}), using plain text");
        plain.to_string()
    })
}

/// Template variables available to action prompts, from the capture plus now.
/// Rendered by the frontend with Liquid; here we just collect the values.
fn template_vars(
    event: &copycopy::CaptureEvent,
) -> std::collections::HashMap<&'static str, String> {
    use copycopy::{Captured, RichFormat};

    let (text, markup, format) = match &event.content {
        Captured::Text { text } => (text.clone(), String::new(), String::new()),
        Captured::RichText {
            plain,
            markup,
            format,
        } => (
            match format {
                RichFormat::Html => html_to_markdown(markup, plain),
                RichFormat::Rtf => plain.clone(),
            },
            markup.clone(),
            match format {
                RichFormat::Html => "html".to_string(),
                RichFormat::Rtf => "rtf".to_string(),
            },
        ),
        _ => (String::new(), String::new(), String::new()),
    };

    std::collections::HashMap::from([
        ("text", text),
        ("markup", markup),
        ("format", format),
        ("app_name", event.app_name.clone()),
        ("exec_name", event.exec_name.clone()),
        ("exec_path", event.exec_path.clone()),
        ("window_title", event.window_title.clone()),
        ("url", event.url.clone().unwrap_or_default()),
        ("process_id", event.process_id.to_string()),
        (
            "now",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        ),
    ])
}

/// The captured content, shaped for display in the popup. Images are PNG, encoded
/// as a base64 data URL so the webview can render them with a plain `<img>`.
fn source_preview(event: &copycopy::CaptureEvent) -> SourcePreview {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use copycopy::{Captured, RichFormat};

    match &event.content {
        Captured::Text { text } => SourcePreview::Text { text: text.clone() },
        Captured::RichText {
            format,
            markup,
            plain,
        } => SourcePreview::RichText {
            format: match format {
                RichFormat::Html => "html",
                RichFormat::Rtf => "rtf",
            }
            .to_string(),
            markup: markup.clone(),
            plain: plain.clone(),
        },
        Captured::Image { width, height, png } => SourcePreview::Image {
            width: *width,
            height: *height,
            data_url: format!("data:image/png;base64,{}", STANDARD.encode(png)),
        },
        Captured::Files { paths } => SourcePreview::Files {
            paths: paths.clone(),
        },
        Captured::Empty => SourcePreview::Empty,
    }
}

/// The capture's content kind, used for routing and shown in the payload.
fn capture_kind(event: &copycopy::CaptureEvent) -> &'static str {
    use copycopy::Captured;
    match &event.content {
        Captured::Text { .. } => "text",
        Captured::RichText { .. } => "rich_text",
        Captured::Image { .. } => "image",
        Captured::Files { .. } => "files",
        Captured::Empty => "empty",
    }
}

/// With no routed action the action fields stay empty but the template vars
/// are still collected, so an action picked manually from the popup's
/// switcher can run on this capture.
fn build_capture_payload(
    event: &copycopy::CaptureEvent,
    action: Option<&Action>,
) -> CapturePayload {
    CapturePayload {
        kind: capture_kind(event),
        source: source_preview(event),
        action_id: action.map(|a| a.id.clone()).unwrap_or_default(),
        label: action.map(|a| a.label.clone()).unwrap_or_default(),
        role: action
            .and_then(|a| a.role.clone())
            .unwrap_or_else(|| "default".to_string()),
        instructions: action.map(|a| a.instructions.clone()).unwrap_or_default(),
        prompt: action.map(|a| a.body.clone()).unwrap_or_default(),
        vars: template_vars(event),
        runnable: action.is_some(),
        align_bottom: false,
    }
}

/// A routing override's `when` condition. Every present field must match (AND).
/// String fields support `*` wildcards and match case-sensitively. Field names
/// mirror the template variables (e.g. `app_name`). Serialized for the settings
/// UI and back into routing.json, so absent fields must stay absent.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct WhenCondition {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    min_chars: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_chars: Option<usize>,
}

/// A higher-priority routing rule: if `when` matches the capture, use `action`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct Override {
    when: WhenCondition,
    action: String,
}

/// Routing: a flat `kind` → action map (the intuitive base) plus an optional,
/// higher-priority `overrides` list, evaluated first (first match wins).
#[derive(Clone)]
struct RoutingConfig {
    by_kind: std::collections::HashMap<String, String>,
    overrides: Vec<Override>,
}

/// Parse routing JSON into a config (top-level `kind: action` plus `overrides`).
fn parse_routing(text: &str) -> Option<RoutingConfig> {
    let value = serde_json::from_str::<serde_json::Value>(text).ok()?;
    let object = value.as_object()?;
    let mut by_kind = std::collections::HashMap::new();
    let mut overrides = Vec::new();
    for (key, val) in object {
        if key == "overrides" {
            if let Ok(parsed) = serde_json::from_value::<Vec<Override>>(val.clone()) {
                overrides = parsed;
            }
        } else if let Some(action) = val.as_str() {
            by_kind.insert(key.clone(), action.to_string());
        }
    }
    Some(RoutingConfig { by_kind, overrides })
}

/// The embedded default routing, parsed once — it is a compile-time constant.
static DEFAULT_ROUTING: std::sync::LazyLock<RoutingConfig> = std::sync::LazyLock::new(|| {
    parse_routing(include_str!("../routing.json")).unwrap_or(RoutingConfig {
        by_kind: std::collections::HashMap::new(),
        overrides: Vec::new(),
    })
});

/// Routing: the user's `routing.json` if present and valid, else the embedded
/// default. A missing/broken file can't disable routing — the default stands.
fn load_routing(handle: &tauri::AppHandle) -> RoutingConfig {
    let user = config_base(handle)
        .map(|base| base.join("routing.json"))
        .filter(|path| path.exists())
        .and_then(|path| std::fs::read_to_string(path).ok())
        .filter(|text| !text.trim().is_empty());
    let user_routing = user.as_deref().and_then(|text| {
        let parsed = parse_routing(text);
        if parsed.is_none() {
            log::warn!("routing.json: not valid routing JSON, falling back to the default routing");
        }
        parsed
    });
    user_routing.unwrap_or_else(|| DEFAULT_ROUTING.clone())
}

/// Case-sensitive glob match where `*` matches any (possibly empty) run.
fn glob_match(pattern: &str, value: &str) -> bool {
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

/// Visible text inside HTML markup (tags removed, `&nbsp;` treated as space).
/// Good enough to tell whether rich content is effectively empty.
fn html_visible_text(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("&#xa0;", " ")
        .replace("&#xA0;", " ")
}

/// Visible text inside RTF markup (groups and control words removed). Errs toward
/// keeping text, so real content is never mistaken for blank.
fn rtf_visible_text(rtf: &str) -> String {
    let mut out = String::new();
    let mut chars = rtf.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '{' | '}' => {}
            '\\' => match chars.peek().copied() {
                Some(c) if c.is_ascii_alphabetic() => {
                    // Control word: letters, an optional -number, one optional space.
                    while chars.next_if(|c| c.is_ascii_alphabetic()).is_some() {}
                    chars.next_if_eq(&'-');
                    while chars.next_if(|c| c.is_ascii_digit()).is_some() {}
                    chars.next_if_eq(&' ');
                }
                Some('\'') => {
                    // \'hh — a single (visible) byte. Mark it without decoding.
                    chars.next();
                    chars.next();
                    chars.next();
                    out.push('x');
                }
                Some(_) => {
                    // Control symbol (\\, \{, \}) — a literal character.
                    if let Some(c) = chars.next() {
                        out.push(c);
                    }
                }
                None => {}
            },
            _ => out.push(ch),
        }
    }
    out
}

/// Whether a capture has nothing worth acting on — empty clipboard, or text /
/// rich text whose *visible* content is only whitespace. Such captures are ignored
/// entirely (no popup, no action). Images and files are never considered blank.
///
/// For rich text we can't trust `plain` alone: it comes from the clipboard's
/// plain-text format, which some apps omit (leaving it empty though the markup has
/// real text). So we fall back to the markup's visible text when `plain` is empty.
fn is_blank(event: &copycopy::CaptureEvent) -> bool {
    use copycopy::{Captured, RichFormat};
    match &event.content {
        Captured::Empty => true,
        Captured::Text { text } => text.trim().is_empty(),
        Captured::RichText {
            plain,
            markup,
            format,
        } => {
            if !plain.trim().is_empty() {
                return false;
            }
            let visible = match format {
                RichFormat::Html => html_visible_text(markup),
                RichFormat::Rtf => rtf_visible_text(markup),
            };
            visible.trim().is_empty()
        }
        Captured::Image { .. } | Captured::Files { .. } => false,
    }
}

/// The plain text of a capture (for the min/max-chars conditions).
fn capture_text(event: &copycopy::CaptureEvent) -> &str {
    use copycopy::Captured;
    match &event.content {
        Captured::Text { text } => text,
        Captured::RichText { plain, .. } => plain,
        _ => "",
    }
}

/// Whether an override's `when` matches the capture (all present fields, AND).
fn when_matches(when: &WhenCondition, event: &copycopy::CaptureEvent, kind: &str) -> bool {
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

/// Resolve which action handles a capture: a matching override (first wins) takes
/// priority over the 1:1 kind map.
fn resolve_action<'a>(
    routing: &RoutingConfig,
    actions: &'a [Action],
    event: &copycopy::CaptureEvent,
) -> Option<&'a Action> {
    let kind = capture_kind(event);
    for rule in &routing.overrides {
        if when_matches(&rule.when, event, kind)
            && let Some(action) = actions.iter().find(|action| action.id == rule.action)
        {
            return Some(action);
        }
    }
    let id = routing.by_kind.get(kind)?;
    actions.iter().find(|action| &action.id == id)
}

/// The screen corner the popup is pinned to. Default is top-right.
#[derive(Clone, Copy)]
enum Corner {
    TopRight,
    BottomRight,
    TopLeft,
    BottomLeft,
}

impl Corner {
    fn is_bottom(self) -> bool {
        matches!(self, Corner::BottomRight | Corner::BottomLeft)
    }
}

/// Read the user's chosen popup corner from the settings store (default top-right).
fn current_corner(handle: &tauri::AppHandle) -> Corner {
    use tauri_plugin_store::StoreExt;

    let value = handle
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get("popupCorner"));
    match value.as_ref().and_then(serde_json::Value::as_str) {
        Some("bottom-right") => Corner::BottomRight,
        Some("top-left") => Corner::TopLeft,
        Some("bottom-left") => Corner::BottomLeft,
        _ => Corner::TopRight,
    }
}

/// The popup's logical width (matches the `popup` window in tauri.conf.json)
/// and its height bounds: on show it takes half the work area's height,
/// clamped — tall enough to read a real result, never a full-screen slab.
const POPUP_WIDTH: f64 = 380.0;
const POPUP_MIN_HEIGHT: f64 = 360.0;
const POPUP_MAX_HEIGHT: f64 = 720.0;

/// Show `window` on the desktop (macOS Space) the user is on right now, focused,
/// and pin it there. A hidden window keeps its previous Space assignment, so a
/// plain `show` could surface it on the wrong desktop; joining all Spaces just
/// for the instant of `show` moves it to the active one, and dropping the flag
/// right after keeps it from following the user to other desktops (it would
/// resurface behind whatever is already there — a window should exist only on
/// the desktop where it was summoned).
fn show_on_active_space(window: &WebviewWindow) {
    let label = window.label();
    #[cfg(target_os = "macos")]
    window
        .set_visible_on_all_workspaces(true)
        .or_log(&format!("{label}: joining all Spaces for show"));
    window.show().or_log(&format!("{label}: show"));
    // Focused, so the popup's Escape / click-outside (blur) dismissal works.
    #[cfg(target_os = "linux")]
    focus_with_server_time(window);
    #[cfg(not(target_os = "linux"))]
    window.set_focus().or_log(&format!("{label}: focus"));
    #[cfg(target_os = "macos")]
    window
        .set_visible_on_all_workspaces(false)
        .or_log(&format!("{label}: pinning to the active Space"));
}

/// Focus `window` on Linux by presenting it with a *fresh* X server timestamp.
///
/// `set_focus` boils down to `gtk_window_present_with_time(GDK_CURRENT_TIME)`,
/// and on X11 GTK replaces that 0 with the last input time *this app's* X
/// connection ever saw — stale or zero for a background agent whose windows
/// receive no input between triggers. Mutter's focus-stealing prevention
/// compares it against the active window's (current, the user just pressed
/// Ctrl+C+C there) time, silently rejects the older one, and only flags
/// "demands attention": the popup stays visible but keyboard-deaf, so the
/// number-key slots and Escape work at best for the brief map-time window
/// before Mutter re-asserts the previous focus. A timestamp read from the X
/// server *now* always wins that comparison, so the popup reliably gets — and
/// keeps — keyboard focus (which also makes blur-dismissal work: a real
/// FocusOut now arrives when the user clicks elsewhere).
///
/// Under a native-Wayland GDK backend (no X window to timestamp) this falls
/// back to plain `set_focus`. GTK calls must happen on the main thread; the
/// capture handler runs on a worker, hence the dispatch.
#[cfg(target_os = "linux")]
fn focus_with_server_time(window: &WebviewWindow) {
    let w = window.clone();
    window
        .run_on_main_thread(move || {
            use gtk::glib::Cast;
            use gtk::glib::translate::ToGlibPtr;
            use gtk::prelude::{GtkWindowExt, WidgetExt};

            let presented = w.gtk_window().ok().and_then(|gtk_window| {
                if !gtk_window.is_realized() {
                    // First show may reach here before tao processes `show()`;
                    // realize so the X window (and thus a server time) exists.
                    gtk_window.realize();
                }
                let x11: gdkx11::X11Window = gtk_window.window()?.downcast().ok()?;
                let time = unsafe { gdkx11::ffi::gdk_x11_get_server_time(x11.to_glib_none().0) };
                gtk_window.present_with_time(time);
                Some(())
            });
            if presented.is_none() {
                // Native Wayland (or no GTK window): the plain request is all
                // there is; Wayland compositors decide focus on their own.
                w.set_focus().or_log(&format!("{}: focus", w.label()));
            }
        })
        .or_log(&format!(
            "{label}: dispatching focus",
            label = window.label()
        ));
}

/// The monitor the user is working on right now (the one with the cursor).
fn monitor_at_cursor(handle: &tauri::AppHandle) -> Option<tauri::Monitor> {
    handle
        .cursor_position()
        .ok()
        .and_then(|c| handle.monitor_from_point(c.x, c.y).ok().flatten())
}

/// Show the popup pinned to the user's chosen corner of the active monitor's work
/// area. A fixed corner is predictable and never clipped — a calmer fit than
/// chasing the pointer or the (not-yet-reliable) text selection.
fn show_popup_in_corner(handle: &tauri::AppHandle, popup: &WebviewWindow, corner: Corner) {
    use tauri::PhysicalPosition;

    // The monitor the user is working on (where the cursor is), else the primary.
    let monitor = monitor_at_cursor(handle).or_else(|| handle.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        show_on_active_space(popup);
        return;
    };

    // Derive the popup's physical size from its logical size: `outer_size` is
    // unreliable for a window that has not been shown yet (notably on macOS).
    let scale = monitor.scale_factor();
    let w = (POPUP_WIDTH * scale) as i32;
    let margin = (16.0 * scale) as i32;

    // Pin within the work area (excludes Dock / taskbar / menu bar).
    let area = monitor.work_area();

    // Height: half the work area, clamped — adapts to the display instead of
    // hardcoding one laptop's idea of "enough".
    let height_logical =
        (f64::from(area.size.height) / scale / 2.0).clamp(POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT);
    popup
        .set_size(tauri::LogicalSize::new(POPUP_WIDTH, height_logical))
        .or_log("popup: set size");
    let h = (height_logical * scale) as i32;
    let left = area.position.x + margin;
    let right = area.position.x + area.size.width as i32 - w - margin;
    let top = area.position.y + margin;
    let bottom = area.position.y + area.size.height as i32 - h - margin;

    let (x, y) = match corner {
        Corner::TopRight => (right, top),
        Corner::BottomRight => (right, bottom),
        Corner::TopLeft => (left, top),
        Corner::BottomLeft => (left, bottom),
    };

    popup
        .set_position(PhysicalPosition::new(x, y))
        .or_log("popup: set corner position");
    show_on_active_space(popup);
}

/// The catalog config file, named after the schema that defines it
/// (ai-sdk-catalog). Never bundled/seeded — created by the user via the
/// settings UI in the per-user app config dir.
const CATALOG_FILE: &str = "ai-sdk-catalog.json";

/// Path to the user's catalog config.
fn catalog_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    config_base(app).map(|dir| dir.join(CATALOG_FILE))
}

/// Factory reset: delete the directories ZenCopy owns wholesale — the config
/// dir (catalog with keys, routing, custom actions) and the data dir (the
/// settings store), which are the same directory on macOS. Whole directories,
/// not a file list, so the reset stays complete as future versions add or
/// rename files. The log dir is deliberately spared: a reset should still be
/// diagnosable afterwards. Every window is then reloaded in place — NOT the
/// app relaunched: a relaunch detaches a dev app from its dev server (vite
/// dies with the original process, leaving every window white), and the live
/// settings store would flush its in-memory values right back over the
/// deleted file on exit. Reloading gets the same clean slate in dev and
/// release alike.
#[tauri::command]
fn reset_all_settings(app: tauri::AppHandle) -> Result<(), String> {
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

/// A copied file read for the model, typed by content. `path` rides along so
/// the prompt can tell the model which file is which. For binary types `data`
/// is base64; for `text/plain` it is the text itself (the frontend inlines it
/// into the prompt instead of attaching a file part).
#[derive(serde::Serialize)]
struct FileAttachment {
    name: String,
    path: String,
    media_type: String,
    data: String,
}

/// Total bytes one capture may attach, mirrored by MAX_ATTACHMENT_MB in
/// src/lib/capture.ts (the image path and the user-facing message). Keeps an
/// accidental C+C on a huge file from becoming a huge API request.
const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;

/// What a file's *contents* say it is — extensions are never consulted, so a
/// mislabeled or extension-less file still does the right thing.
enum SniffedType {
    /// A binary format the model side accepts, with its media type.
    Binary(&'static str),
    /// A text file, decoded to UTF-8 with LF line endings.
    Text(String),
}

/// Decode a text file to a clean UTF-8 string, or `None` if it isn't text.
/// Browser-grade pipeline: a BOM decides first (UTF-8/UTF-16 — before the NUL
/// guard, since UTF-16 is full of NULs), then strict UTF-8, then chardetng's
/// guess for legacy encodings (Shift_JIS on Japanese Windows, …). Line
/// endings normalize to LF, so CRLF and mixed files come out uniform.
fn decode_text(bytes: &[u8]) -> Option<String> {
    let decoded = if let Some((encoding, _)) = encoding_rs::Encoding::for_bom(bytes) {
        let (text, _, had_errors) = encoding.decode(bytes);
        if had_errors {
            return None;
        }
        text.into_owned()
    } else if bytes.contains(&0) {
        return None; // git's own not-text heuristic
    } else if let Ok(text) = std::str::from_utf8(bytes) {
        text.to_string()
    } else {
        // Local files, not web content: ISO-2022-JP is fair game (the email
        // semantics), and UTF-8 was already settled by the strict check above.
        let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
        detector.feed(bytes, true);
        let encoding = detector.guess(None, chardetng::Utf8Detection::Deny);
        let (text, _, had_errors) = encoding.decode(bytes);
        if had_errors {
            return None;
        }
        text.into_owned()
    };
    Some(decoded.replace("\r\n", "\n").replace('\r', "\n"))
}

/// Sniff a file: magic bytes first (images, PDF, audio — normalized to the
/// media types providers expect), else the text decoding above. `None` means
/// a recognized-but-unsupported or opaque binary (zip, executable, …).
fn sniff_attachment(bytes: &[u8]) -> Option<SniffedType> {
    // infer's Text matchers (HTML, XML, shell scripts) are content heuristics,
    // not binary signatures — an SVG's `<?xml` prolog matches text/xml, for
    // example. Those files are text like any other: let decode_text decide.
    if let Some(kind) =
        infer::get(bytes).filter(|kind| kind.matcher_type() != infer::MatcherType::Text)
    {
        let media_type = match kind.mime_type() {
            "audio/x-wav" => "audio/wav",
            "audio/x-flac" => "audio/flac",
            "audio/m4a" => "audio/mp4",
            other => other,
        };
        if media_type.starts_with("image/")
            || media_type.starts_with("audio/")
            || media_type == "application/pdf"
        {
            return Some(SniffedType::Binary(media_type));
        }
        return None; // a known binary format the model can't take
    }
    decode_text(bytes).map(SniffedType::Text)
}

/// Read the files of a `files` capture for sending to the model. Errors are
/// sentinels the popup turns into i18n messages: `unsupported-file:<name>`,
/// `file-unreadable:<name>`, or `attachment-too-large`.
///
/// `(async)` so it runs on a worker thread: a plain sync command executes on
/// the main thread, and on macOS that is the CGEventTap run loop — reading and
/// encoding up to 10 MB there would stall the trigger and the UI.
#[tauri::command(async)]
fn read_capture_files(paths: Vec<String>) -> Result<Vec<FileAttachment>, String> {
    use base64::{Engine, engine::general_purpose::STANDARD};

    let mut total: u64 = 0;
    let mut files = Vec::new();
    for original in &paths {
        let path = std::path::Path::new(original);
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let unreadable = |error: &dyn std::fmt::Display| {
            log::warn!("attachment {}: {error}", path.display());
            format!("file-unreadable:{name}")
        };
        // Check the size before reading, so an accidental C+C on a huge file
        // never loads it into memory just to reject it.
        let size = std::fs::metadata(path).map_err(|e| unreadable(&e))?.len();
        if total.saturating_add(size) > MAX_ATTACHMENT_BYTES {
            return Err("attachment-too-large".to_string());
        }
        let bytes = std::fs::read(path).map_err(|e| unreadable(&e))?;
        // Re-check with the actual byte count — the file may have grown
        // between the metadata call and the read.
        total += bytes.len() as u64;
        if total > MAX_ATTACHMENT_BYTES {
            return Err("attachment-too-large".to_string());
        }
        let (media_type, data) = match sniff_attachment(&bytes) {
            Some(SniffedType::Binary(media_type)) => {
                (media_type.to_string(), STANDARD.encode(&bytes))
            }
            Some(SniffedType::Text(text)) => ("text/plain".to_string(), text),
            None => return Err(format!("unsupported-file:{name}")),
        };
        files.push(FileAttachment {
            name,
            path: original.clone(),
            media_type,
            data,
        });
    }
    Ok(files)
}

/// Raw catalog JSON text for the settings editor ("" when none exists yet).
#[tauri::command]
fn read_catalog(app: tauri::AppHandle) -> Result<String, String> {
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
fn write_catalog(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let dir = config_base(&app).ok_or_else(|| "config dir unavailable".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(CATALOG_FILE), json).map_err(|e| e.to_string())?;
    Ok(())
}

/// An action as presented to the UI — the popup's switcher and the settings
/// list. `origin` tells the settings UI what is editable: "builtin" ships with
/// the app and is immutable, "custom" is the user's own local file.
#[derive(serde::Serialize)]
struct ActionInfo {
    id: String,
    label: String,
    role: Option<String>,
    instructions: String,
    prompt: String,
    origin: &'static str,
    /// Whether routing currently sends plain-text captures to this action.
    is_default: bool,
}

/// Every action: pre-installed first, in their DEFAULT_ACTIONS order (Zen
/// leads by construction), then the user's actions sorted by label.
#[tauri::command]
fn list_actions_ui(app: tauri::AppHandle) -> Vec<ActionInfo> {
    let default_id = load_routing(&app).by_kind.get("text").cloned();

    let mut infos: Vec<ActionInfo> = load_actions(&app)
        .into_iter()
        .map(|action| ActionInfo {
            is_default: default_id.as_deref() == Some(action.id.as_str()),
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
fn checked_action_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || id.contains(['/', '\\']) || id.contains("..") {
        return Err(format!("invalid action id: {id:?}"));
    }
    Ok(id)
}

/// A freshly generated action id. The id is internal plumbing (file name and
/// routing key) whose only contract is being a unique string, so it is
/// random — never derived from the label, which users rename freely and which
/// has its own uniqueness rule (see `label_taken`).
fn new_action_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Whether another action (built-in or user, excluding `own_id`) already uses
/// `label`, compared trimmed and case-folded. Labels are the only identity
/// users ever see — every list in the app shows them without ids — so a
/// duplicate would make those lists ambiguous.
fn label_taken(app: &tauri::AppHandle, label: &str, own_id: Option<&str>) -> bool {
    let wanted = label.trim().to_lowercase();
    load_actions(app).iter().any(|action| {
        Some(action.id.as_str()) != own_id && action.label.trim().to_lowercase() == wanted
    })
}

/// The frontmatter written by `save_action` (a subset of what `parse_action`
/// accepts — hand-written files can carry more).
#[derive(serde::Serialize)]
struct ActionMetaFile<'a> {
    label: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<&'a str>,
    #[serde(skip_serializing_if = "str::is_empty")]
    instructions: &'a str,
}

/// Serialize an action's fields into the .md file format (frontmatter + body)
/// — the one shape `save_action` writes and `import_action` falls back to.
fn serialize_action_md(
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
fn save_action(
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
fn write_action_md(app: &tauri::AppHandle, id: &str, content: &str) -> Result<(), String> {
    let dir = config_base(app)
        .ok_or_else(|| "config dir unavailable".to_string())?
        .join("actions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{id}.md")), content).map_err(|e| e.to_string())
}

/// The action's .md source: built-ins come from the embedded copies, custom
/// actions from their file. The text IS the action — importing it into
/// another ZenCopy (paste or URL) reinstalls it.
fn action_source(app: &tauri::AppHandle, id: &str) -> Result<String, String> {
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
fn export_action_file(app: tauri::AppHandle, id: String) -> Result<String, String> {
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
struct ActionError {
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
fn import_action(app: tauri::AppHandle, text: String) -> Result<String, ActionError> {
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
const MAX_ACTION_TEXT_BYTES: u64 = 256 * 1024;

/// Pick a local .md file and install it as an action — the file-dialog
/// sibling of import_action (pasted text). Returns the new action's id, or
/// None when the user cancels the picker. Dialogs stay entirely on the Rust
/// side, so the webview never needs dialog permissions. `(async)`: the
/// blocking picker must stay off the main thread.
#[tauri::command(async)]
fn import_action_from_file(app: tauri::AppHandle) -> Result<Option<String>, ActionError> {
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

/// Remove every reference to `id` from a routing JSON object: kind mappings
/// that pointed at it return to the embedded default (so a capture keeps
/// running something instead of dead-ending on a ghost id), and override
/// rules that ran it are dropped. The defaults only name built-ins — which
/// cannot be deleted — so this never reintroduces a dangling id.
fn purge_action_from_routing_object(
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
        rules.retain(|rule| rule.get("action").and_then(|v| v.as_str()) != Some(id));
    }
}

/// Remove a custom action's file, and heal the routing that referenced it —
/// deleting the current default must leave the app working (back on the
/// built-in default), never silently dead.
#[tauri::command]
fn delete_action(app: tauri::AppHandle, id: String) -> Result<(), String> {
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

/// The capture kinds the routing UI exposes (mirrors `capture_kind`; `empty`
/// is deliberately not routable).
const ROUTABLE_KINDS: [&str; 4] = ["text", "rich_text", "image", "files"];

/// Read-modify-write the user's routing.json as a JSON object (seeded from
/// the embedded default when none exists). Everything the mutation doesn't
/// touch is preserved verbatim.
fn edit_routing_json(
    app: &tauri::AppHandle,
    mutate: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> Result<(), String> {
    let base = config_base(app).ok_or_else(|| "config dir unavailable".to_string())?;
    let path = base.join("routing.json");
    let current = std::fs::read_to_string(&path)
        .ok()
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| include_str!("../routing.json").to_string());
    let mut value: serde_json::Value =
        serde_json::from_str(&current).unwrap_or_else(|_| serde_json::json!({}));
    let object = value
        .as_object_mut()
        .ok_or_else(|| "routing.json is not a JSON object".to_string())?;
    mutate(object);
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Update flat `kind` → action entries in the user's routing.json. Only the
/// given kinds are touched; `None` removes the mapping.
fn update_routing(app: &tauri::AppHandle, kinds: &[&str], id: Option<&str>) -> Result<(), String> {
    edit_routing_json(app, |object| {
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

/// Point text captures at `id` — the settings list's star. Only the flat
/// text/rich_text mappings are touched.
#[tauri::command]
fn set_default_action(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = checked_action_id(&id)?;
    update_routing(&app, &["text", "rich_text"], Some(id))?;
    log::info!("routing: text/rich_text now default to action '{id}'");
    Ok(())
}

/// Route captures of `kind` to action `id` (`None` clears the mapping) — the
/// settings window's routing section.
#[tauri::command]
fn set_kind_action(app: tauri::AppHandle, kind: String, id: Option<String>) -> Result<(), String> {
    if !ROUTABLE_KINDS.contains(&kind.as_str()) {
        return Err(format!("unknown capture kind: {kind:?}"));
    }
    let id = id.as_deref().map(checked_action_id).transpose()?;
    update_routing(&app, &[kind.as_str()], id)?;
    match id {
        Some(id) => log::info!("routing: '{kind}' now routes to action '{id}'"),
        None => log::info!("routing: '{kind}' now has no action"),
    }
    Ok(())
}

/// Replace the overrides list in the user's routing.json — the settings
/// window's rule editor. The flat kind → action map is preserved; the list
/// order is the priority (first match wins).
#[tauri::command]
fn set_overrides(app: tauri::AppHandle, overrides: Vec<Override>) -> Result<(), String> {
    for rule in &overrides {
        checked_action_id(&rule.action)?;
    }
    let count = overrides.len();
    let value = serde_json::to_value(&overrides).map_err(|e| e.to_string())?;
    edit_routing_json(&app, |object| {
        object.insert("overrides".to_string(), value);
    })?;
    log::info!("routing: {count} override rule(s) saved");
    Ok(())
}

/// The effective routing as shown in the settings UI: the flat kind → action
/// map plus the ordered overrides list.
#[derive(serde::Serialize)]
struct RoutingInfo {
    by_kind: std::collections::HashMap<String, String>,
    overrides: Vec<Override>,
}

#[tauri::command]
fn get_routing_ui(app: tauri::AppHandle) -> RoutingInfo {
    let routing = load_routing(&app);
    RoutingInfo {
        by_kind: routing.by_kind,
        overrides: routing.overrides,
    }
}

/// Re-show the popup (the last result is still in the frontend's memory) in its
/// corner. Lets the user bring back a closed result from the tray menu without
/// copying again; if it's already visible, this just re-focuses it.
fn reveal_popup(handle: &tauri::AppHandle) {
    if let Some(popup) = handle.get_webview_window("popup") {
        let corner = current_corner(handle);
        show_popup_in_corner(handle, &popup, corner);
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
static UPDATE_VERSION: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

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

/// Open (and focus) the About window. Invoked from the popup's update hint.
#[tauri::command]
fn open_about(app: tauri::AppHandle) {
    reveal_window(&app, "about");
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

/// The OS locale, mapped to a supported code — the fallback when the in-app
/// language preference is "system".
fn ui_locale() -> &'static str {
    let tag = sys_locale::get_locale()
        .unwrap_or_default()
        .to_ascii_lowercase();
    locale_from_tag(&tag)
}

/// The UI language for native chrome (tray + app menu): the in-app preference
/// when it names a concrete locale, else the OS locale. Mirrors the
/// frontend's resolveLocale, so the tray speaks the same language as the
/// windows — including after a settings change (see the locale-changed
/// listener in setup).
fn app_locale(app: &tauri::AppHandle) -> &'static str {
    use tauri_plugin_store::StoreExt;
    let stored = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get("locale"))
        .and_then(|value| value.as_str().map(str::to_ascii_lowercase));
    match stored.as_deref() {
        None | Some("system") => ui_locale(),
        Some(tag) => locale_from_tag(tag),
    }
}

/// Best-matching supported locale for a lowercased BCP-47 tag. Mirrors the
/// frontend's `detectLocale` (src/lib/messages/index.ts) — keep them in sync.
fn locale_from_tag(tag: &str) -> &'static str {
    if tag.starts_with("zh") {
        // Chinese needs the script, not just the language: Traditional for
        // Taiwan / Hong Kong / Macau (or an explicit Hant), Simplified else.
        return if ["hant", "tw", "hk", "mo"]
            .iter()
            .any(|hint| tag.contains(hint))
        {
            "zh-hant"
        } else {
            "zh-hans"
        };
    }
    if tag.starts_with("pt") {
        return "pt-br";
    }
    [
        "ja", "ko", "es", "fr", "de", "it", "pl", "ru", "id", "vi", "th", "tr", "ar", "fa", "he",
    ]
    .into_iter()
    .find(|code| tag.starts_with(code))
    .unwrap_or("en")
}

/// Tray menu labels (show, open settings, about, quit) for a locale code.
/// "Show" names the app generically — the menu already sits under ZenCopy's
/// own icon, so repeating the name reads as noise.
fn tray_labels(locale: &str) -> (&'static str, &'static str, &'static str, &'static str) {
    match locale {
        "ja" => ("アプリを表示", "設定を開く", "ZenCopy について", "終了"),
        "zh-hans" => ("显示应用", "打开设置", "关于 ZenCopy", "退出"),
        "zh-hant" => ("顯示應用程式", "開啟設定", "關於 ZenCopy", "結束"),
        "ko" => ("앱 표시", "설정 열기", "ZenCopy 정보", "종료"),
        "es" => (
            "Mostrar la aplicación",
            "Abrir ajustes",
            "Acerca de ZenCopy",
            "Salir",
        ),
        "pt-br" => (
            "Mostrar o aplicativo",
            "Abrir configurações",
            "Sobre o ZenCopy",
            "Sair",
        ),
        "fr" => (
            "Afficher l'application",
            "Ouvrir les réglages",
            "À propos de ZenCopy",
            "Quitter",
        ),
        "de" => (
            "App anzeigen",
            "Einstellungen öffnen",
            "Über ZenCopy",
            "Beenden",
        ),
        "it" => (
            "Mostra l'app",
            "Apri impostazioni",
            "Informazioni su ZenCopy",
            "Esci",
        ),
        "pl" => (
            "Pokaż aplikację",
            "Otwórz ustawienia",
            "O ZenCopy",
            "Zakończ",
        ),
        "ru" => (
            "Показать приложение",
            "Открыть настройки",
            "О ZenCopy",
            "Выход",
        ),
        "id" => (
            "Tampilkan aplikasi",
            "Buka pengaturan",
            "Tentang ZenCopy",
            "Keluar",
        ),
        "vi" => ("Hiện ứng dụng", "Mở cài đặt", "Về ZenCopy", "Thoát"),
        "th" => ("แสดงแอป", "เปิดการตั้งค่า", "เกี่ยวกับ ZenCopy", "ออก"),
        "tr" => (
            "Uygulamayı göster",
            "Ayarları aç",
            "ZenCopy hakkında",
            "Çık",
        ),
        "ar" => ("إظهار التطبيق", "فتح الإعدادات", "حول ZenCopy", "إنهاء"),
        "fa" => ("نمایش برنامه", "باز کردن تنظیمات", "دربارهٔ ZenCopy", "خروج"),
        "he" => ("הצגת האפליקציה", "פתיחת ההגדרות", "על ZenCopy", "יציאה"),
        _ => ("Show App", "Open Settings", "About ZenCopy", "Quit"),
    }
}

/// The tray's update item, shown only while an update is pending. It opens
/// About — the one place where installing actually happens — so the label
/// names the destination version, not the restart mechanics.
fn tray_update_label(locale: &str, version: &str) -> String {
    match locale {
        "ja" => format!("v{version} にアップデート"),
        "zh-hans" => format!("更新到 v{version}"),
        "zh-hant" => format!("更新到 v{version}"),
        "ko" => format!("v{version}(으)로 업데이트"),
        "es" => format!("Actualizar a v{version}"),
        "pt-br" => format!("Atualizar para v{version}"),
        "fr" => format!("Mettre à jour vers v{version}"),
        "de" => format!("Auf v{version} aktualisieren"),
        "it" => format!("Aggiorna alla v{version}"),
        "pl" => format!("Zaktualizuj do v{version}"),
        "ru" => format!("Обновить до v{version}"),
        "id" => format!("Perbarui ke v{version}"),
        "vi" => format!("Cập nhật lên v{version}"),
        "th" => format!("อัปเดตเป็น v{version}"),
        "tr" => format!("v{version} sürümüne güncelle"),
        "ar" => format!("التحديث إلى v{version}"),
        "fa" => format!("به‌روزرسانی به v{version}"),
        "he" => format!("עדכון ל‑v{version}"),
        _ => format!("Update to v{version}"),
    }
}

/// macOS Window-menu labels (title, minimize, close) for a `ui_locale` code.
#[cfg(target_os = "macos")]
fn window_menu_labels(locale: &str) -> (&'static str, &'static str, &'static str) {
    match locale {
        "ja" => ("ウィンドウ", "しまう", "ウィンドウを閉じる"),
        "zh-hans" => ("窗口", "最小化", "关闭窗口"),
        "zh-hant" => ("視窗", "縮到最小", "關閉視窗"),
        "ko" => ("윈도우", "최소화", "윈도우 닫기"),
        "es" => ("Ventana", "Minimizar", "Cerrar ventana"),
        "pt-br" => ("Janela", "Minimizar", "Fechar janela"),
        "fr" => ("Fenêtre", "Réduire", "Fermer la fenêtre"),
        "de" => ("Fenster", "Minimieren", "Fenster schließen"),
        "it" => ("Finestra", "Riduci", "Chiudi finestra"),
        "pl" => ("Okno", "Minimalizuj", "Zamknij okno"),
        "ru" => ("Окно", "Свернуть", "Закрыть окно"),
        "id" => ("Jendela", "Minimalkan", "Tutup jendela"),
        "vi" => ("Cửa sổ", "Thu nhỏ", "Đóng cửa sổ"),
        "th" => ("หน้าต่าง", "ย่อ", "ปิดหน้าต่าง"),
        "tr" => ("Pencere", "Küçült", "Pencereyi kapat"),
        "ar" => ("النافذة", "تصغير", "إغلاق النافذة"),
        "fa" => ("پنجره", "کمینه کردن", "بستن پنجره"),
        "he" => ("חלון", "מזעור", "סגירת החלון"),
        _ => ("Window", "Minimize", "Close Window"),
    }
}

/// The macOS Edit submenu's title for a locale code (its items are the
/// predefined clipboard set).
#[cfg(target_os = "macos")]
fn edit_menu_label(locale: &str) -> &'static str {
    match locale {
        "ja" => "編集",
        "zh-hans" => "编辑",
        "zh-hant" => "編輯",
        "ko" => "편집",
        "es" => "Edición",
        "pt-br" => "Editar",
        "fr" => "Édition",
        "de" => "Bearbeiten",
        "it" => "Modifica",
        "pl" => "Edycja",
        "ru" => "Правка",
        "id" => "Edit",
        "vi" => "Chỉnh sửa",
        "th" => "แก้ไข",
        "tr" => "Düzen",
        "ar" => "تحرير",
        "fa" => "ویرایش",
        "he" => "עריכה",
        _ => "Edit",
    }
}

/// The tray menu, labelled for `locale`. Rebuilt whole on a language change —
/// the item ids never change, so the tray's click handler keeps working.
fn build_tray_menu(
    handle: &tauri::AppHandle,
    locale: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let (show_label, open_label, about_label, quit_label) = tray_labels(locale);
    // Accelerators are macOS-only: there the app menu (build_app_menu) gives
    // ⌘, and ⌘Q real key bindings, and the tray shows them right-aligned as a
    // reminder. On Windows and Linux a tray menu's accelerator is display-only
    // (nothing registers it globally), so showing one would advertise a
    // shortcut that never fires.
    let (settings_accelerator, quit_accelerator) = if cfg!(target_os = "macos") {
        (Some("Cmd+,"), Some("Cmd+Q"))
    } else {
        (None, None)
    };
    let show_item = MenuItem::with_id(handle, "show", show_label, true, None::<&str>)?;
    let open_item = MenuItem::with_id(handle, "open", open_label, true, settings_accelerator)?;
    let about_item = MenuItem::with_id(handle, "about", about_label, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", quit_label, true, quit_accelerator)?;
    // Present only while an update is pending — a permanent "check for
    // updates" item would be noise the app already handles by itself.
    let update_item = UPDATE_VERSION
        .lock()
        .ok()
        .and_then(|latest| latest.clone())
        .map(|version| {
            MenuItem::with_id(
                handle,
                "update",
                tray_update_label(locale, &version),
                true,
                None::<&str>,
            )
        })
        .transpose()?;
    let sep_middle = PredefinedMenuItem::separator(handle)?;
    let sep_bottom = PredefinedMenuItem::separator(handle)?;
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        vec![&show_item, &open_item, &sep_middle];
    if let Some(item) = &update_item {
        items.push(item);
    }
    items.push(&about_item);
    items.push(&sep_bottom);
    items.push(&quit_item);
    Menu::with_items(handle, &items)
}

/// The macOS app menu, labelled for `locale`. An Accessory app shows no menu
/// bar, but the menu's key equivalents work whenever a ZenCopy window is
/// focused — that is what makes ⌘, (settings) and ⌘Q (quit) real shortcuts.
/// The Edit submenu keeps the standard clipboard shortcuts working in text
/// fields; the Window submenu gives ⌘W / ⌘M their bindings (⌘W goes through
/// CloseRequested, so it hides, never destroys). Ids mirror the tray items.
#[cfg(target_os = "macos")]
fn build_app_menu(
    handle: &tauri::AppHandle,
    locale: &str,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder};

    let (_, open_label, about_label, quit_label) = tray_labels(locale);
    let menu_settings = MenuItem::with_id(handle, "open", open_label, true, Some("CmdOrCtrl+,"))?;
    let menu_about = MenuItem::with_id(handle, "about", about_label, true, None::<&str>)?;
    let zencopy_submenu = SubmenuBuilder::new(handle, "ZenCopy")
        .item(&menu_about)
        .separator()
        .item(&menu_settings)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text(quit_label)
        .build()?;
    let edit_submenu = SubmenuBuilder::new(handle, edit_menu_label(locale))
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;
    let (window_label, minimize_label, close_label) = window_menu_labels(locale);
    let window_submenu = SubmenuBuilder::new(handle, window_label)
        .item(&PredefinedMenuItem::minimize(handle, Some(minimize_label))?)
        .item(&PredefinedMenuItem::close_window(
            handle,
            Some(close_label),
        )?)
        .build()?;
    MenuBuilder::new(handle)
        .items(&[&zencopy_submenu, &edit_submenu, &window_submenu])
        .build()
}

/// Center `window` on the monitor the user is currently on (where the cursor is),
/// so it opens where they are working — not back on whatever display it was last
/// shown. Falls back to the platform's own centering.
fn center_on_active_monitor(handle: &tauri::AppHandle, window: &WebviewWindow) {
    use tauri::PhysicalPosition;

    let label = window.label();
    let monitor = monitor_at_cursor(handle)
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| handle.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        window
            .center()
            .or_log(&format!("{label}: center (no monitor found)"));
        return;
    };
    let Ok(size) = window.outer_size() else {
        window
            .center()
            .or_log(&format!("{label}: center (size unknown)"));
        return;
    };
    if size.width == 0 || size.height == 0 {
        window
            .center()
            .or_log(&format!("{label}: center (zero size)"));
        return;
    }
    let area = monitor.work_area();
    let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
    let y = area.position.y + (area.size.height as i32 - size.height as i32) / 2;
    window
        .set_position(PhysicalPosition::new(x, y))
        .or_log(&format!("{label}: set centered position"));
}

/// Reveal a window on the active monitor and focus it (settings / about).
fn reveal_window(handle: &tauri::AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label) {
        center_on_active_monitor(handle, &window);
        show_on_active_space(&window);
    }
}

/// Open (and focus) the settings window. Invoked from the popup's settings icon.
#[tauri::command]
fn open_settings(app: tauri::AppHandle) {
    reveal_window(&app, "settings");
}

/// App name, version, and copyright for the About window.
#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    version: String,
    copyright: String,
}

/// Open an https URL in the default browser. Called with literal URLs from our
/// own frontend (repository, docs) and with links the model emitted in Markdown
/// results; anything not https is ignored.
#[tauri::command]
fn open_url(app: tauri::AppHandle, url: String) {
    use tauri_plugin_opener::OpenerExt;
    if url.starts_with("https://") {
        app.opener()
            .open_url(url, None::<&str>)
            .or_log("open url in the default browser");
    }
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
            set_default_action,
            set_kind_action,
            set_overrides,
            get_routing_ui,
            reset_all_settings,
            export_action_file,
            import_action,
            import_action_from_file,
            open_settings,
            open_about,
            app_info,
            open_url,
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

#[cfg(test)]
mod markup_tests {
    use super::html_to_markdown;

    /// The formatting of an HTML copy must survive as Markdown — that is what
    /// the popup renders and what the model is asked to preserve.
    #[test]
    fn html_copies_become_markdown() {
        let html = r#"<p>use <code>foo</code>, <strong>bold</strong>, and <a href="https://example.com">a link</a></p>"#;
        let markdown = html_to_markdown(html, "fallback");
        assert!(markdown.contains("`foo`"), "got: {markdown}");
        assert!(markdown.contains("**bold**"), "got: {markdown}");
        assert!(
            markdown.contains("[a link](https://example.com)"),
            "got: {markdown}"
        );
    }
}

#[cfg(test)]
mod attachment_tests {
    use super::{SniffedType, sniff_attachment};

    /// Attachment typing is content-based: magic bytes decide the binary
    /// formats, the UTF-8 heuristic decides text, and everything else is
    /// refused — regardless of what the file name claims.
    #[test]
    fn sniffs_by_content_not_extension() {
        let png = b"\x89PNG\r\n\x1a\n rest of the image";
        assert!(matches!(
            sniff_attachment(png),
            Some(SniffedType::Binary("image/png"))
        ));

        let pdf = b"%PDF-1.7 rest of the document";
        assert!(matches!(
            sniff_attachment(pdf),
            Some(SniffedType::Binary("application/pdf"))
        ));

        let markdown = "# Notes\n\n- 日本語もOK\n".as_bytes();
        assert!(matches!(
            sniff_attachment(markdown),
            Some(SniffedType::Text(_))
        ));

        let zip = b"PK\x03\x04 not something a model can take";
        assert!(sniff_attachment(zip).is_none());

        let opaque = b"\x01\x02\x00\xff random binary";
        assert!(sniff_attachment(opaque).is_none());
    }

    /// infer also has *text* matchers (HTML, XML, shell scripts); those hits
    /// are text, not unsupported binaries. Regression: an SVG's `<?xml` prolog
    /// used to be rejected as text/xml.
    #[test]
    fn infer_text_hits_stay_on_the_text_path() {
        let svg = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n";
        assert!(matches!(sniff_attachment(svg), Some(SniffedType::Text(_))));

        let html = b"<!DOCTYPE html>\n<p>hello</p>\n";
        assert!(matches!(sniff_attachment(html), Some(SniffedType::Text(_))));

        let script = b"#!/bin/sh\necho hello\n";
        assert!(matches!(
            sniff_attachment(script),
            Some(SniffedType::Text(_))
        ));
    }

    /// Japanese Windows realities: Shift_JIS files, UTF-16 with a BOM, and
    /// CRLF (or mixed) line endings must all come out as clean UTF-8 + LF.
    #[test]
    fn decodes_legacy_text() {
        // A realistic Japanese Windows file: Shift_JIS, mostly Japanese text
        // (the detector needs real content to commit to an encoding).
        let (sjis, _, _) = encoding_rs::SHIFT_JIS
            .encode("会議の決定事項をまとめる。\r\n担当者と期限を箇条書きで整理して、明日の朝会で共有する。\r\n");
        let Some(SniffedType::Text(text)) = sniff_attachment(&sjis) else {
            panic!("Shift_JIS must decode as text");
        };
        assert!(text.contains("決定事項"), "got: {text}");
        assert!(!text.contains('\r'), "line endings must normalize to LF");

        // Notepad's legacy "Unicode": UTF-16LE with a BOM (and NULs galore).
        let mut utf16 = vec![0xff, 0xfe];
        for unit in "日本語のメモ\r\nCRLF行".encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        let Some(SniffedType::Text(text)) = sniff_attachment(&utf16) else {
            panic!("BOM'd UTF-16 must decode as text");
        };
        assert_eq!(text, "日本語のメモ\nCRLF行");

        // Mixed CRLF/LF UTF-8 normalizes to LF-only.
        let mixed = b"line one\r\nline two\nline three\r\n";
        let Some(SniffedType::Text(text)) = sniff_attachment(mixed) else {
            panic!("plain UTF-8 must stay text");
        };
        assert_eq!(text, "line one\nline two\nline three\n");
    }
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
            "image": "explain",
            "future_kind": "my-custom",
            "overrides": [
                { "when": { "app_name": "Mail" }, "action": "my-custom" },
                { "when": { "app_name": "Code" }, "action": "zen" }
            ]
        })
        .as_object()
        .expect("test fixture is an object")
        .clone();
        purge_action_from_routing_object(&mut object, "my-custom");
        assert_eq!(
            object["text"], "zen",
            "kind returns to the embedded default"
        );
        assert_eq!(object["rich_text"], "zen");
        assert_eq!(
            object["image"], "explain",
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
        assert_eq!(rules[0]["action"], "zen");
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

/// The frontend hand-mirrors a handful of backend values (each TS site says
/// so in a comment). Drift never fails the build — it silently falls back to
/// defaults or shows raw sentinel strings — so pin every mirrored pair here,
/// where CI can see it. `include_str!` keeps the check against the actual
/// sources instead of a copy.
#[cfg(test)]
mod ts_mirror_tests {
    use super::*;

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

#[cfg(test)]
mod locale_tests {
    use super::locale_from_tag;

    #[test]
    fn chinese_resolves_by_script_and_region() {
        assert_eq!(locale_from_tag("zh-cn"), "zh-hans");
        assert_eq!(locale_from_tag("zh-sg"), "zh-hans");
        assert_eq!(locale_from_tag("zh-hans-cn"), "zh-hans");
        assert_eq!(locale_from_tag("zh-tw"), "zh-hant");
        assert_eq!(locale_from_tag("zh-hant-hk"), "zh-hant");
        assert_eq!(locale_from_tag("zh-mo"), "zh-hant");
    }

    #[test]
    fn portuguese_lands_on_the_brazilian_translation() {
        assert_eq!(locale_from_tag("pt-br"), "pt-br");
        assert_eq!(locale_from_tag("pt-pt"), "pt-br");
        assert_eq!(locale_from_tag("pt"), "pt-br");
    }

    #[test]
    fn simple_prefixes_match_and_unknowns_fall_back_to_english() {
        assert_eq!(locale_from_tag("ja-jp"), "ja");
        assert_eq!(locale_from_tag("de-at"), "de");
        assert_eq!(locale_from_tag("id-id"), "id");
        assert_eq!(locale_from_tag("he-il"), "he");
        assert_eq!(locale_from_tag("nl-nl"), "en");
        assert_eq!(locale_from_tag(""), "en");
    }
}
