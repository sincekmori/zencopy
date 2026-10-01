//! Turning a copycopy capture into the payload the popup receives:
//! source previews, template variables, and markup-to-text conversion.

use crate::prompts::Prompt;

/// The captured content, prepared for display in the popup ("what is being acted
/// on"). Serialized with its own `kind` tag: rich text keeps a distinct tag
/// here for rendering, even though the rules kind folds it into `text`.
#[derive(Clone, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SourcePreview {
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
}

impl SourcePreview {
    /// The capture's content kind, used for rules and shown in the payload.
    /// Rich text is deliberately just "text": which clipboard flavor a copy
    /// carries is the source app's habit, not the user's intent, so the kind
    /// vocabulary ignores it. The richness itself survives where it is useful
    /// — the source preview renders the markup, and templates still get
    /// `{{ markup }}` / `{{ format }}`.
    pub(crate) fn kind(&self) -> &'static str {
        match self {
            Self::Text { .. } | Self::RichText { .. } => "text",
            Self::Image { .. } => "image",
            Self::Files { .. } => "files",
        }
    }
}

/// A capture, prepared for the UI. The popup shows `source` ("what is being acted
/// on") and runs `roles`/`instructions`/`prompt` when `runnable`.
#[derive(Clone, serde::Serialize)]
pub(crate) struct CapturePayload {
    pub(crate) kind: &'static str,
    /// The captured content itself, for the popup to display.
    pub(crate) source: SourcePreview,
    /// The matched prompt's id (empty if none). Lets the popup's switcher know
    /// what is selected and what "set as default" refers to.
    pub(crate) prompt_id: String,
    /// The matched prompt's label (empty if none).
    pub(crate) label: String,
    /// The catalog roles to run with, in the order they are tried
    /// (`Prompt::roles`; none when no prompt matched).
    pub(crate) roles: Vec<String>,
    /// The prompt's system prompt as a Liquid template (the frontend renders it).
    pub(crate) instructions: String,
    /// The prompt body (user prompt) as a Liquid template (the frontend renders it).
    pub(crate) prompt: String,
    /// Template variables (from the capture + now) for the frontend to render with.
    pub(crate) vars: std::collections::HashMap<&'static str, String>,
    /// Whether an prompt applies to this capture and is ready to run.
    pub(crate) runnable: bool,
}

/// An HTML copy's `{{ text }}`: the markup converted to Markdown, so its
/// formatting survives the model round trip — the popup renders Markdown, so
/// inline code, bold, and links come back as themselves instead of degrading
/// to plain text. Falls back to the app-provided plain text when the
/// conversion fails or comes back empty.
pub(crate) fn html_to_markdown(markup: &str, plain: &str) -> String {
    match html_converter().convert(markup) {
        Ok(markdown) if !markdown.trim().is_empty() => markdown,
        Ok(_) => plain.to_string(),
        Err(error) => {
            log::warn!("rich capture: HTML to Markdown failed ({error}), using plain text");
            plain.to_string()
        }
    }
}

/// The converter behind [`html_to_markdown`]. Two things a page does not show
/// stay out of the Markdown. One is what sits in `<head>`, `<script>`,
/// `<style>` and `<title>`, whose text htmd passes through by default: Word
/// and Outlook hand over a whole document, its stylesheet — kilobytes of it —
/// ahead of the body. The other is the payload of an inline `data:` image,
/// which would put the whole base64 into the text; such an image leaves its
/// alt text.
fn html_converter() -> htmd::HtmlToMarkdown {
    use htmd::{Element, element_handler::Handlers};

    htmd::HtmlToMarkdown::builder()
        .skip_tags(vec!["head", "script", "style", "title"])
        .add_handler(vec!["img"], |handlers: &dyn Handlers, element: Element| {
            let attrs = element.attrs;
            let attr = |name: &str| {
                attrs
                    .iter()
                    .find(|attr| &*attr.name.local == name)
                    .map(|attr| attr.value.to_string())
            };
            match attr("src") {
                Some(src) if src.trim_start().starts_with("data:") => {
                    Some(attr("alt").unwrap_or_default().into())
                }
                _ => handlers.fallback(element),
            }
        })
        .build()
}

/// Template variables available to prompt prompts, from the capture plus now.
/// Rendered by the frontend with Liquid; here we just collect the values.
pub(crate) fn template_vars(
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

    // File copies: the names (and paths) as variables, so a prompt can say
    // "rename {{ file_name }}" without fishing them out of the attachment
    // list. Multi-file values are newline-joined — Liquid's `split` turns
    // them back into an array. Empty for every other capture kind.
    let (file_name, file_names, file_paths) = match &event.content {
        Captured::Files { paths } => {
            let names: Vec<String> = paths.iter().map(|path| file_basename(path)).collect();
            (
                names.first().cloned().unwrap_or_default(),
                names.join("\n"),
                paths.join("\n"),
            )
        }
        _ => (String::new(), String::new(), String::new()),
    };

    std::collections::HashMap::from([
        ("text", text),
        ("markup", markup),
        ("format", format),
        ("file_name", file_name),
        ("file_names", file_names),
        ("file_paths", file_paths),
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

/// A path's final component, for the `file_name(s)` template variables and
/// the `file_name` rules condition. Falls back to the whole string when the
/// path has no name component (which real copied-file paths always have).
pub(crate) fn file_basename(path: &str) -> String {
    std::path::Path::new(path).file_name().map_or_else(
        || path.to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

/// The captured content, shaped for display in the popup — `None` when there
/// is nothing to act on (see [`is_blank`]), and then no popup and no prompt.
/// Images are PNG, encoded as a base64 data URL so the webview can render
/// them with a plain `<img>`.
pub(crate) fn source_preview(event: &copycopy::CaptureEvent) -> Option<SourcePreview> {
    use base64::{Engine, engine::general_purpose::STANDARD};
    use copycopy::{Captured, RichFormat};

    if is_blank(event) {
        return None;
    }
    Some(match &event.content {
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
        Captured::Empty => return None,
    })
}

/// With no routed prompt the prompt fields stay empty but the template vars
/// are still collected, so an prompt picked manually from the popup's
/// switcher can run on this capture.
pub(crate) fn build_capture_payload(
    event: &copycopy::CaptureEvent,
    source: SourcePreview,
    prompt: Option<&Prompt>,
) -> CapturePayload {
    CapturePayload {
        kind: source.kind(),
        source,
        prompt_id: prompt.map(|a| a.id.clone()).unwrap_or_default(),
        label: prompt.map(|a| a.label.clone()).unwrap_or_default(),
        roles: prompt.map(Prompt::roles).unwrap_or_default(),
        instructions: prompt.map(|a| a.instructions.clone()).unwrap_or_default(),
        prompt: prompt.map(|a| a.body.clone()).unwrap_or_default(),
        vars: template_vars(event),
        runnable: prompt.is_some(),
    }
}

/// Visible text inside HTML markup (tags removed, `&nbsp;` treated as space).
/// Good enough to tell whether rich content is effectively empty.
pub(crate) fn html_visible_text(html: &str) -> String {
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
pub(crate) fn rtf_visible_text(rtf: &str) -> String {
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
/// rich text whose *visible* content is only whitespace. Such captures are
/// ignored entirely (see [`source_preview`]). Images and files are never
/// considered blank.
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

/// The text of a capture, for the min/max-chars rules conditions. For rich
/// captures `plain` comes from the clipboard's plain-text flavor, which some
/// apps omit — fall back to the markup's visible text so a rich copy is
/// measured by what the user sees, the same rule `is_blank` applies.
pub(crate) fn capture_text(event: &copycopy::CaptureEvent) -> std::borrow::Cow<'_, str> {
    use copycopy::{Captured, RichFormat};
    match &event.content {
        Captured::Text { text } => std::borrow::Cow::Borrowed(text),
        Captured::RichText {
            plain,
            markup,
            format,
        } => {
            if plain.trim().is_empty() {
                std::borrow::Cow::Owned(match format {
                    RichFormat::Html => html_visible_text(markup),
                    RichFormat::Rtf => rtf_visible_text(markup),
                })
            } else {
                std::borrow::Cow::Borrowed(plain)
            }
        }
        _ => std::borrow::Cow::Borrowed(""),
    }
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

    /// Word hands over a whole document: the stylesheet and the script are
    /// not what was copied.
    #[test]
    fn what_a_page_does_not_show_stays_out() {
        let html = "<html><head><title>Doc</title><style><!-- p.MsoNormal {margin:0cm;} -->\
                    </style></head><body><p><b>Hello</b> world</p>\
                    <script>let x = 0;</script></body></html>";
        assert_eq!(html_to_markdown(html, "fallback"), "**Hello** world");
    }

    /// An inline image keeps its description, never its bytes.
    #[test]
    fn a_data_image_leaves_only_its_alt_text() {
        let html = r#"<p>Chart: <img alt="Q3 sales" src="data:image/png;base64,iVBORw0KGgo="> and <img alt="logo" src="https://example.com/logo.png"></p>"#;
        let markdown = html_to_markdown(html, "fallback");
        assert!(!markdown.contains("base64"), "got: {markdown}");
        assert!(markdown.contains("Q3 sales"), "got: {markdown}");
        assert!(
            markdown.contains("![logo](https://example.com/logo.png)"),
            "got: {markdown}"
        );
    }

    /// Markup that converts to nothing falls back to the plain text.
    #[test]
    fn empty_markdown_falls_back_to_the_plain_text() {
        assert_eq!(
            html_to_markdown("<style>p {}</style>", "fallback"),
            "fallback"
        );
    }
}
