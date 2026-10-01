//! Text extraction for OOXML office attachments (docx / pptx / xlsx).
//!
//! Providers don't accept OOXML binaries, but the text inside them is exactly
//! what the model needs — so a copied Word/PowerPoint/Excel file becomes a text
//! attachment, like any copied `.md` or `.csv`. Extraction is text-only by
//! design: no styling, no images, no layout.
//!
//! docx and pptx are shallow XML walks (collect the `w:t` / `a:t` text runs);
//! xlsx goes through calamine, which understands shared strings, inline
//! values, and sheet order.
//!
//! All parsing is bounded. The input file is already capped by
//! `MAX_ATTACHMENT_BYTES`, but deflate can expand ~1000:1, so before anything
//! is parsed the whole archive is inflated once into nothing and refused past
//! [`MAX_INFLATED_BYTES`]; a workbook is checked for the one size it declares
//! and calamine trusts; a sheet is read cell by cell, never as the rectangle
//! its farthest cells span; and extraction stops once the text has outgrown
//! what an attachment may carry ([`TEXT_BUDGET`]).

use std::io::{Cursor, Read};

type Archive<'a> = zip::ZipArchive<Cursor<&'a [u8]>>;
type Extraction<T> = Result<T, Box<dyn std::error::Error>>;

/// Hard ceiling for what an OOXML zip may inflate to, all entries together.
const MAX_INFLATED_BYTES: u64 = 50 * 1024 * 1024;

/// Where extraction stops: text past what one capture may attach is refused
/// by the caller as too large, so there is no point in reading further.
const TEXT_BUDGET: usize = crate::attachments::MAX_ATTACHMENT_BYTES as usize;

/// Excel's grid. A cell beyond it is not something a spreadsheet app wrote.
const MAX_ROWS: u32 = 1_048_576;
const MAX_COLUMNS: u32 = 16_384;

/// Extract the text of an OOXML office file (docx/pptx/xlsx). The type is
/// decided by the zip's own contents (`word/document.xml`, `ppt/slides/…`,
/// `xl/workbook.xml`), NOT by the caller's media type: infer's OOXML matcher
/// depends on the zip entry *order* Microsoft Office happens to write, and
/// real-world files from other producers (python-pptx, LibreOffice) sniff as
/// plain `application/zip`. `None` when the bytes are not an OOXML file, when
/// parsing fails (corrupt, encrypted), or when there is no text at all —
/// callers treat all of those as "nothing to send".
pub fn extract_text(bytes: &[u8]) -> Option<String> {
    let Ok(mut archive) = zip::ZipArchive::new(Cursor::new(bytes)) else {
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
    let result = check_inflated_size(&mut archive).and_then(|()| match kind {
        "docx" => extract_docx(archive),
        "pptx" => extract_pptx(archive),
        _ => extract_xlsx(archive),
    });
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

/// Inflate every entry into nothing, refusing an archive that outgrows
/// [`MAX_INFLATED_BYTES`]: a zip bomb is turned away before any parser — ours
/// or calamine's, which reads its entries whole — sees a byte of it.
fn check_inflated_size(archive: &mut Archive) -> Extraction<()> {
    let mut left = MAX_INFLATED_BYTES;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let inflated = std::io::copy(&mut entry.take(left + 1), &mut std::io::sink())?;
        left = left
            .checked_sub(inflated)
            .ok_or("the archive inflates past the limit")?;
    }
    Ok(())
}

/// Read one entry of the zip (its size is within bounds — see
/// [`check_inflated_size`]).
fn read_entry(archive: &mut Archive, name: &str) -> Extraction<Vec<u8>> {
    let mut data = Vec::new();
    archive.by_name(name)?.read_to_end(&mut data)?;
    Ok(data)
}

/// Collect the text of a docx or pptx part: the character content of every
/// `<t>` element, with each paragraph (`<p>`) closing a line. Elements are
/// matched by local name, so namespace prefixes don't matter.
fn collect_text_runs(xml: &[u8]) -> Extraction<String> {
    use quick_xml::events::Event;

    let mut reader = quick_xml::Reader::from_reader(xml);
    let mut out = String::new();
    let mut in_text = false;
    let mut in_run = false;
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(start) | Event::Empty(start) => match start.local_name().as_ref() {
                "t" => in_text = true,
                "r" => in_run = true,
                // A tab typed into a run. (`w:tab` also names the tab stops
                // in a paragraph's properties; those sit outside any run.)
                "tab" if in_run => out.push('\t'),
                "br" | "cr" => out.push('\n'),
                _ => {}
            },
            Event::End(end) => match end.local_name().as_ref() {
                "t" => in_text = false,
                "r" => in_run = false,
                // Paragraph boundary — avoid piling up blank lines for empty
                // paragraphs (spacing is styling, not text).
                "p" if !out.is_empty() && !out.ends_with('\n') => out.push('\n'),
                _ => {}
            },
            Event::Text(text) if in_text => out.push_str(&text.xml10_content()),
            // `&amp;` and its kin arrive apart from the text around them.
            Event::GeneralRef(reference) if in_text => {
                if let Some(character) = reference.resolve_char_ref()? {
                    out.push(character);
                } else if let Some(text) = quick_xml::escape::resolve_xml_entity(&reference) {
                    out.push_str(text);
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
fn extract_docx(mut archive: Archive) -> Extraction<String> {
    let xml = read_entry(&mut archive, "word/document.xml")?;
    collect_text_runs(&xml)
}

/// pptx: every slide's text in slide order, slides separated by a blank line.
fn extract_pptx(mut archive: Archive) -> Extraction<String> {
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

    let mut out = String::new();
    for (_, name) in &slides {
        let xml = read_entry(&mut archive, name)?;
        let text = collect_text_runs(&xml)?;
        if text.trim().is_empty() {
            continue;
        }
        if push_part(&mut out, text.trim_end()) {
            break;
        }
    }
    Ok(out)
}

/// Add a slide's or a sheet's text to the whole, a blank line after what is
/// there. Says whether the text has now outgrown [`TEXT_BUDGET`].
fn push_part(out: &mut String, part: &str) -> bool {
    if !out.is_empty() {
        out.push_str("\n\n");
    }
    out.push_str(part);
    out.len() > TEXT_BUDGET
}

/// calamine makes room for as many shared strings as the workbook *says* it
/// has (`<sst uniqueCount>`) before it reads one, so a two-kilobyte file that
/// claims twenty million gets hundreds of megabytes. A string takes at least
/// `<si/>`: a count the table's own size cannot hold is a lie, and the
/// workbook is refused.
fn check_shared_strings(archive: &mut Archive) -> Extraction<()> {
    use quick_xml::events::Event;

    const SMALLEST_STRING: usize = "<si/>".len();
    let tables: Vec<String> = archive
        .file_names()
        .filter(|name| name.ends_with("sharedStrings.xml"))
        .map(str::to_string)
        .collect();
    for name in tables {
        let xml = read_entry(archive, &name)?;
        let mut reader = quick_xml::Reader::from_reader(xml.as_slice());
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf)? {
                Event::Start(start) | Event::Empty(start)
                    if start.local_name().as_ref() == "sst" =>
                {
                    let declared = start
                        .try_get_attribute("uniqueCount")?
                        .and_then(|count| count.value.trim().parse::<usize>().ok());
                    if declared.is_some_and(|count| count > xml.len() / SMALLEST_STRING) {
                        return Err("the shared strings table declares more than it holds".into());
                    }
                    break;
                }
                Event::Eof => break,
                _ => {}
            }
            buf.clear();
        }
    }
    Ok(())
}

/// A cell as text. calamine prints a date as the serial number Excel stores
/// (`46294`), which no reader can tell from a plain number — so a date-time
/// is written out: `2026-09-29`, `09:00:00`, `2026-09-29 09:00:00`, and a
/// duration as hours past the day (`36:00:00`).
fn cell_text(value: &calamine::DataRef<'_>) -> String {
    let calamine::DataRef::DateTime(moment) = value else {
        return calamine::Data::from(value.clone()).to_string();
    };
    if moment.is_duration() {
        let seconds = (moment.as_f64() * 86_400.0).round() as i64;
        let (hours, rest) = (seconds / 3600, seconds.abs() % 3600);
        return format!("{hours}:{:02}:{:02}", rest / 60, rest % 60);
    }
    let (year, month, day, hour, minute, second, _) = moment.to_ymd_hms_milli();
    let date = format!("{year:04}-{month:02}-{day:02}");
    let time = format!("{hour:02}:{minute:02}:{second:02}");
    if moment.as_f64() < 1.0 {
        time
    } else if (hour, minute, second) == (0, 0, 0) {
        date
    } else {
        format!("{date} {time}")
    }
}

/// xlsx: every sheet as tab-separated rows, prefixed with its name when the
/// workbook has more than one sheet. A sheet is read cell by cell, in the
/// order it stores them: two values a million rows apart cost two cells, not
/// the rectangle between them. Rows holding nothing are skipped, and a row
/// ends at its last value.
fn extract_xlsx(mut archive: Archive) -> Extraction<String> {
    use calamine::Reader;

    check_shared_strings(&mut archive)?;
    let mut workbook = calamine::Xlsx::new(archive.into_inner())?;
    let names = workbook.sheet_names();
    let mut out = String::new();
    for name in &names {
        let mut cells = workbook.worksheet_cells_reader(name)?;
        // Columns count from the sheet's first used one, as its range would.
        let first_column = cells.dimensions().start.1;
        let mut body = String::new();
        let mut last: Option<(u32, u32)> = None;
        while let Some(cell) = cells.next_cell()? {
            let text = cell_text(cell.get_value());
            if text.is_empty() {
                continue;
            }
            let (row, column) = cell.get_position();
            if row >= MAX_ROWS || column >= MAX_COLUMNS {
                return Err("a cell lies outside the grid".into());
            }
            let column = column.saturating_sub(first_column);
            // Tabs for the columns stepped over keep values in their columns.
            let tabs = match last {
                Some((last_row, last_column)) if last_row == row => {
                    column.saturating_sub(last_column).max(1)
                }
                Some(_) => {
                    body.push('\n');
                    column
                }
                None => column,
            };
            body.extend(std::iter::repeat_n('\t', tabs as usize));
            body.push_str(&text);
            last = Some((row, column));
            if out.len() + body.len() > TEXT_BUDGET {
                break;
            }
        }
        if body.trim().is_empty() {
            continue;
        }
        // A workbook of several sheets names each one.
        if names.len() > 1 {
            body.insert_str(0, &format!("[{name}]\n"));
        }
        if push_part(&mut out, &body) {
            break;
        }
    }
    Ok(out)
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

    /// A one-sheet workbook around the given sheet, shared strings and
    /// styles parts.
    fn xlsx_fixture(sheet: &str, shared_strings: &str, styles: &str) -> Vec<u8> {
        const MAIN: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        const RELS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        const PACKAGE: &str = "http://schemas.openxmlformats.org/package/2006";
        let content_types = format!(
            r#"<Types xmlns="{PACKAGE}/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>"#
        );
        let root_rels = format!(
            r#"<Relationships xmlns="{PACKAGE}/relationships"><Relationship Id="rId1" Type="{RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>"#
        );
        let workbook = format!(
            r#"<workbook xmlns="{MAIN}" xmlns:r="{RELS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>"#
        );
        let workbook_rels = format!(
            r#"<Relationships xmlns="{PACKAGE}/relationships"><Relationship Id="rId1" Type="{RELS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{RELS}/styles" Target="styles.xml"/></Relationships>"#
        );
        let sheet =
            format!(r#"<worksheet xmlns="{MAIN}"><sheetData>{sheet}</sheetData></worksheet>"#);
        let shared_strings = shared_strings.replace("<sst ", &format!(r#"<sst xmlns="{MAIN}" "#));
        let styles = format!(r#"<styleSheet xmlns="{MAIN}">{styles}</styleSheet>"#);
        zip_fixture(&[
            ("[Content_Types].xml", &content_types),
            ("_rels/.rels", &root_rels),
            ("xl/workbook.xml", &workbook),
            ("xl/_rels/workbook.xml.rels", &workbook_rels),
            ("xl/sharedStrings.xml", &shared_strings),
            ("xl/styles.xml", &styles),
            ("xl/worksheets/sheet1.xml", &sheet),
        ])
    }

    const NO_STRINGS: &str = r#"<sst count="0" uniqueCount="0"/>"#;

    #[test]
    fn xlsx_sheets_become_tab_separated_rows() {
        let bytes = xlsx_fixture(
            r#"<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>7.5</v></c></row>"#,
            r#"<sst count="2" uniqueCount="2"><si><t>名前</t></si><si><t>Mori</t></si></sst>"#,
            "",
        );
        assert_eq!(extract_text(&bytes).unwrap(), "名前\t42\nMori\t7.5");
    }

    /// `&amp;` arrives as an event of its own, and a tab or a line break is an
    /// element, not a character — none of them may fall out of the text. The
    /// tab *stop* in the paragraph's properties is not a tab.
    #[test]
    fn docx_keeps_entities_tabs_and_line_breaks() {
        let bytes = zip_fixture(&[
            ("[Content_Types].xml", "<Types/>"),
            (
                "word/document.xml",
                r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
                <w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>
                <w:r><w:t>R&amp;D budget &lt; 10&#37;</w:t><w:tab/><w:t>caf&#xE9;</w:t><w:br/><w:t>next</w:t></w:r></w:p>
                </w:body></w:document>"#,
            ),
        ]);
        assert_eq!(
            extract_text(&bytes).unwrap(),
            "R&D budget < 10%\tcafé\nnext\n"
        );
    }

    /// A date is stored as a serial number plus a number format; what the
    /// model gets must read as the date, not as `46294`.
    #[test]
    fn xlsx_dates_read_as_dates() {
        let bytes = xlsx_fixture(
            r#"<row r="1"><c r="A1" s="1"><v>46294</v></c><c r="B1" s="2"><v>46294.5</v></c><c r="C1" s="3"><v>0.375</v></c><c r="D1" s="4"><v>1.5</v></c><c r="E1"><v>46294</v></c></row>"#,
            NO_STRINGS,
            r#"<cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="22"/><xf numFmtId="20"/><xf numFmtId="46"/></cellXfs>"#,
        );
        assert_eq!(
            extract_text(&bytes).unwrap(),
            "2026-09-29\t2026-09-29 12:00:00\t09:00:00\t36:00:00\t46294"
        );
    }

    /// Two values far apart are two cells: the empty rows between them are
    /// not written out, and the columns stepped over are.
    #[test]
    fn xlsx_far_apart_cells_stay_sparse() {
        let bytes = xlsx_fixture(
            r#"<row r="1"><c r="A1"><v>1</v></c></row><row r="200000"><c r="C200000"><v>2</v></c><c r="E200000"><v>3</v></c></row>"#,
            NO_STRINGS,
            "",
        );
        assert_eq!(extract_text(&bytes).unwrap(), "1\n\t\t2\t\t3");
    }

    /// What used to bring the process down: a cell beyond Excel's grid, a
    /// shared strings table claiming more than it holds, and an archive that
    /// inflates past the limit are all refused before anything is allocated
    /// for them.
    #[test]
    fn hostile_workbooks_are_refused() {
        let beyond_the_grid = xlsx_fixture(
            r#"<row r="1"><c r="A1"><v>1</v></c><c r="XFE1"><v>2</v></c></row>"#,
            NO_STRINGS,
            "",
        );
        assert_eq!(extract_text(&beyond_the_grid), None);

        let lying_count = xlsx_fixture(
            r#"<row r="1"><c r="A1"><v>1</v></c></row>"#,
            r#"<sst count="1" uniqueCount="20000000"><si><t>x</t></si></sst>"#,
            "",
        );
        assert_eq!(extract_text(&lying_count), None);

        let padding = " ".repeat(super::MAX_INFLATED_BYTES as usize + 1);
        let bomb = zip_fixture(&[
            ("[Content_Types].xml", "<Types/>"),
            (
                "word/document.xml",
                r#"<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>text</w:t></w:r></w:p></w:body></w:document>"#,
            ),
            ("word/media/padding.bin", &padding),
        ]);
        assert_eq!(extract_text(&bomb), None);
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
