//! Text extraction for OOXML office attachments (docx / pptx / xlsx).
//!
//! Providers don't accept OOXML binaries, but the text inside them is exactly
//! what the model needs — so a copied Word/PowerPoint/Excel file becomes a text
//! attachment, like any copied `.md` or `.csv`. Extraction is text-only by
//! design: no styling, no images, no layout.
//!
//! docx and pptx are shallow XML walks (collect the `w:t` / `a:t` text runs);
//! xlsx goes through calamine, which understands shared strings, inline
//! values, and sheet order. All parsing is bounded: the input file is already
//! capped by `MAX_ATTACHMENT_BYTES`, and every XML entry read out of the zip
//! is clamped to [`MAX_XML_BYTES`] so a zip bomb cannot balloon memory.

use std::io::{Cursor, Read};

/// Hard ceiling for any single XML entry decompressed out of an OOXML zip.
/// Deflate can expand ~1000:1, so the 10 MB input cap alone does not bound
/// memory; past this point the read is cut short and the parse fails cleanly.
const MAX_XML_BYTES: u64 = 50 * 1024 * 1024;

/// Extract the text of an OOXML office file (docx/pptx/xlsx). The type is
/// decided by the zip's own contents (`word/document.xml`, `ppt/slides/…`,
/// `xl/workbook.xml`), NOT by the caller's media type: infer's OOXML matcher
/// depends on the zip entry *order* Microsoft Office happens to write, and
/// real-world files from other producers (python-pptx, LibreOffice) sniff as
/// plain `application/zip`. `None` when the bytes are not an OOXML file, when
/// parsing fails (corrupt, encrypted), or when there is no text at all —
/// callers treat all of those as "nothing to send".
pub fn extract_text(bytes: &[u8]) -> Option<String> {
    let Ok(archive) = zip::ZipArchive::new(Cursor::new(bytes)) else {
        return None; // not a zip — not an office file
    };
    let kind = if archive.index_for_name("word/document.xml").is_some() {
        "docx"
    } else if archive
        .file_names()
        .any(|name| name.starts_with("ppt/slides/slide"))
    {
        "pptx"
    } else if archive.index_for_name("xl/workbook.xml").is_some() {
        "xlsx"
    } else {
        return None; // a zip, but not an OOXML office file
    };
    let result = match kind {
        "docx" => extract_docx(archive),
        "pptx" => extract_pptx(archive),
        _ => extract_xlsx(bytes),
    };
    match result {
        Ok(text) if !text.trim().is_empty() => Some(text),
        Ok(_) => {
            log::warn!("office attachment ({kind}) contains no text");
            None
        }
        Err(error) => {
            log::warn!("office attachment ({kind}) failed to parse: {error}");
            None
        }
    }
}

/// Read one entry of the zip, clamped to MAX_XML_BYTES.
fn read_entry(
    archive: &mut zip::ZipArchive<Cursor<&[u8]>>,
    name: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let entry = archive.by_name(name)?;
    let mut data = Vec::new();
    entry.take(MAX_XML_BYTES).read_to_end(&mut data)?;
    Ok(data)
}

/// Collect the character content of every `<{tag}>` element (matched by local
/// name, so namespace prefixes don't matter), with `break_after` element ends
/// each closing a line. The shared shape of the docx and pptx walks.
fn collect_text_runs(
    xml: &[u8],
    tag: &[u8],
    break_after: &[u8],
) -> Result<String, Box<dyn std::error::Error>> {
    use quick_xml::events::Event;

    let mut reader = quick_xml::Reader::from_reader(xml);
    let mut out = String::new();
    let mut in_run = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(start) if start.local_name().as_ref() == tag => in_run = true,
            Event::End(end) => {
                if end.local_name().as_ref() == tag {
                    in_run = false;
                } else if end.local_name().as_ref() == break_after {
                    // Paragraph boundary — avoid piling up blank lines for
                    // empty paragraphs (spacing is styling, not text).
                    if !out.is_empty() && !out.ends_with('\n') {
                        out.push('\n');
                    }
                }
            }
            Event::Text(text) => {
                if in_run {
                    out.push_str(&text.xml10_content()?);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(out)
}

/// docx: the document body text, one line per paragraph.
fn extract_docx(
    mut archive: zip::ZipArchive<Cursor<&[u8]>>,
) -> Result<String, Box<dyn std::error::Error>> {
    let xml = read_entry(&mut archive, "word/document.xml")?;
    collect_text_runs(&xml, b"t", b"p")
}

/// pptx: every slide's text in slide order, slides separated by a blank line.
fn extract_pptx(
    mut archive: zip::ZipArchive<Cursor<&[u8]>>,
) -> Result<String, Box<dyn std::error::Error>> {
    // Slide entries are "ppt/slides/slideN.xml"; N is the presentation order.
    let mut slides: Vec<(u32, String)> = archive
        .file_names()
        .filter_map(|name| {
            let number = name
                .strip_prefix("ppt/slides/slide")?
                .strip_suffix(".xml")?
                .parse()
                .ok()?;
            Some((number, name.to_string()))
        })
        .collect();
    slides.sort_unstable();

    let mut parts = Vec::new();
    for (_, name) in &slides {
        let xml = read_entry(&mut archive, name)?;
        let text = collect_text_runs(&xml, b"t", b"p")?;
        if !text.trim().is_empty() {
            parts.push(text.trim_end().to_string());
        }
    }
    Ok(parts.join("\n\n"))
}

/// xlsx: every sheet as tab-separated rows, prefixed with its name when the
/// workbook has more than one sheet.
fn extract_xlsx(bytes: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    use calamine::Reader;

    let mut workbook = calamine::Xlsx::new(Cursor::new(bytes))?;
    let names = workbook.sheet_names();
    let mut parts = Vec::new();
    for name in &names {
        let range = workbook.worksheet_range(name)?;
        let rows: Vec<String> = range
            .rows()
            .map(|row| {
                row.iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join("\t")
            })
            .collect();
        let body = rows.join("\n");
        if body.trim().is_empty() {
            continue;
        }
        if names.len() > 1 {
            parts.push(format!("[{name}]\n{body}"));
        } else {
            parts.push(body);
        }
    }
    Ok(parts.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::extract_text;
    use std::io::Write;

    /// A minimal OOXML container: `[Content_Types].xml` first (that is also
    /// what infer's msooxml matcher keys on), then the given entries.
    fn zip_fixture(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, content) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
        cursor.into_inner()
    }

    #[test]
    fn docx_text_comes_out_paragraph_per_line() {
        let bytes = zip_fixture(&[
            ("[Content_Types].xml", "<Types/>"),
            (
                "word/document.xml",
                r#"<?xml version="1.0"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                  <w:body>
                    <w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>
                    <w:p/>
                    <w:p><w:r><w:t>二段落目</w:t></w:r></w:p>
                  </w:body>
                </w:document>"#,
            ),
        ]);
        assert_eq!(extract_text(&bytes).unwrap(), "Hello world\n二段落目\n");
    }

    #[test]
    fn pptx_slides_join_in_order_with_blank_lines() {
        let slide = |text: &str| {
            format!(
                r#"<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
                <p:txBody><a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sld>"#
            )
        };
        let (one, two, ten) = (slide("Slide one"), slide("スライド 2"), slide("Slide ten"));
        let bytes = zip_fixture(&[
            ("[Content_Types].xml", "<Types/>"),
            // Deliberately out of order — and slide10 must sort after slide2.
            ("ppt/slides/slide10.xml", &ten),
            ("ppt/slides/slide2.xml", &two),
            ("ppt/slides/slide1.xml", &one),
        ]);
        assert_eq!(
            extract_text(&bytes).unwrap(),
            "Slide one\n\nスライド 2\n\nSlide ten"
        );
    }

    #[test]
    fn xlsx_sheets_become_tab_separated_rows() {
        let bytes = zip_fixture(&[
            (
                "[Content_Types].xml",
                r#"<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>"#,
            ),
            (
                "_rels/.rels",
                r#"<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#,
            ),
            (
                "xl/workbook.xml",
                r#"<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>"#,
            ),
            (
                "xl/_rels/workbook.xml.rels",
                r#"<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#,
            ),
            (
                "xl/sharedStrings.xml",
                r#"<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>名前</t></si><si><t>Mori</t></si></sst>"#,
            ),
            (
                "xl/worksheets/sheet1.xml",
                r#"<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>7.5</v></c></row></sheetData></worksheet>"#,
            ),
        ]);
        assert_eq!(extract_text(&bytes).unwrap(), "名前\t42\nMori\t7.5");
    }

    #[test]
    fn wrong_type_corrupt_and_empty_yield_none() {
        assert_eq!(extract_text(b"not a zip at all"), None);
        // A zip, but not an office file.
        let plain = zip_fixture(&[("readme.txt", "hello"), ("data.bin", "xx")]);
        assert_eq!(extract_text(&plain), None);
        // Parses fine but holds no text — nothing worth sending.
        let empty = zip_fixture(&[
            ("[Content_Types].xml", "<Types/>"),
            (
                "word/document.xml",
                r#"<w:document xmlns:w="x"><w:body/></w:document>"#,
            ),
        ]);
        assert_eq!(extract_text(&empty), None);
    }
}
