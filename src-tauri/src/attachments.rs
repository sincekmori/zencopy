//! File attachments: content sniffing (never extensions), text decoding,
//! and reading a files capture for the model.

use crate::office;

/// A copied file read for the model, typed by content. `path` rides along so
/// the prompt can tell the model which file is which. For binary types `data`
/// is base64; for `text/plain` it is the text itself (the frontend inlines it
/// into the prompt instead of attaching a file part).
#[derive(serde::Serialize)]
pub(crate) struct FileAttachment {
    name: String,
    path: String,
    media_type: String,
    data: String,
}

/// Total bytes one capture may attach, mirrored by MAX_ATTACHMENT_MB in
/// src/lib/capture.ts (the image path and the user-facing message). Keeps an
/// accidental C+C on a huge file from becoming a huge API request.
pub(crate) const MAX_ATTACHMENT_BYTES: u64 = 10 * 1024 * 1024;

/// What a file's *contents* say it is — extensions are never consulted, so a
/// mislabeled or extension-less file still does the right thing.
pub(crate) enum SniffedType {
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
pub(crate) fn decode_text(bytes: &[u8]) -> Option<String> {
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
/// media types providers expect; office files become their extracted text),
/// else the text decoding above. `None` means a recognized-but-unsupported or
/// opaque binary (zip, executable, …).
pub(crate) fn sniff_attachment(bytes: &[u8]) -> Option<SniffedType> {
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
        // docx/pptx/xlsx: providers don't take the binary, but the text
        // inside is exactly what the model needs. Checked whenever the bytes
        // are zip-shaped — infer's OOXML detection is entry-order-dependent
        // and misses files from producers other than Microsoft Office, which
        // sniff as plain application/zip.
        if let Some(text) = office::extract_text(bytes) {
            return Some(SniffedType::Text(text));
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
pub(crate) fn read_capture_files(paths: Vec<String>) -> Result<Vec<FileAttachment>, String> {
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
        if total.saturating_add(bytes.len() as u64) > MAX_ATTACHMENT_BYTES {
            return Err("attachment-too-large".to_string());
        }
        let (media_type, data, outgoing) = match sniff_attachment(&bytes) {
            Some(SniffedType::Binary(media_type)) => {
                (media_type.to_string(), STANDARD.encode(&bytes), bytes.len())
            }
            // Count the text, not the file: extracted office text (and decoded
            // legacy encodings) can outgrow their on-disk container.
            Some(SniffedType::Text(text)) => {
                let size = text.len();
                ("text/plain".to_string(), text, size)
            }
            None => return Err(format!("unsupported-file:{name}")),
        };
        total += outgoing as u64;
        if total > MAX_ATTACHMENT_BYTES {
            return Err("attachment-too-large".to_string());
        }
        files.push(FileAttachment {
            name,
            path: original.clone(),
            media_type,
            data,
        });
    }
    Ok(files)
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

    /// End to end through infer: a docx-shaped zip must be *detected* as docx
    /// (infer's msooxml matcher keys on `[Content_Types].xml` being the first
    /// entry) and come out as its extracted text — while a plain zip stays
    /// rejected. Guards the office-extraction wiring, not just the extractor.
    #[test]
    fn office_files_sniff_to_their_text() {
        use std::io::Write;
        let mut cursor = std::io::Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        // The real Word entry order: infer's msooxml matcher types the file
        // by the 3rd/4th entry names, so `word/…` must sit at those slots.
        for (name, content) in [
            ("[Content_Types].xml", "<Types/>"),
            ("_rels/.rels", "<Relationships/>"),
            ("word/_rels/document.xml.rels", "<Relationships/>"),
            (
                "word/document.xml",
                r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>議事録の本文</w:t></w:r></w:p></w:body></w:document>"#,
            ),
        ] {
            writer.start_file(name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
        let docx = cursor.into_inner();

        let Some(SniffedType::Text(text)) = sniff_attachment(&docx) else {
            panic!("docx must sniff to its extracted text");
        };
        assert_eq!(text, "議事録の本文\n");
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
