//! The locale-aware tray menu, the macOS app menu (its key equivalents; no
//! one sees its labels), and the locale resolution the tray and the frontend
//! default share.

use crate::UPDATE_VERSION;
use crate::config::store_str;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

/// The settings-store key of the in-app language, and the event the settings
/// window broadcasts when it changes — as the frontend spells them
/// (src/lib/settings.ts, src/components/settings.tsx; pinned by the ts_mirror
/// tests in lib.rs).
pub(crate) const LOCALE_KEY: &str = "locale";
pub(crate) const LOCALE_CHANGED: &str = "locale-changed";

/// A language the UI speaks: one variant per locale file in
/// src/lib/messages/. The label tables below match on it without a wildcard,
/// so a language added here does not build until every menu label exists.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Locale {
    Ar,
    De,
    En,
    Es,
    Fa,
    Fr,
    He,
    Id,
    It,
    Ja,
    Ko,
    Pl,
    PtBr,
    Ru,
    Th,
    Tr,
    Vi,
    ZhHans,
    ZhHant,
}

/// The OS locale, mapped to a supported one — the fallback when the in-app
/// language preference is "system".
pub(crate) fn ui_locale() -> Locale {
    locale_from_tag(&sys_locale::get_locale().unwrap_or_default())
}

/// The UI language for native chrome (the tray menu): the in-app preference
/// when it names a concrete locale, else the OS locale. Mirrors the
/// frontend's resolveLocale, so the tray speaks the same language as the
/// windows — including after a settings change (see the locale-changed
/// listener in setup).
pub(crate) fn app_locale(app: &tauri::AppHandle) -> Locale {
    match store_str(app, LOCALE_KEY).as_deref() {
        None | Some("system") => ui_locale(),
        Some(tag) => locale_from_tag(tag),
    }
}

/// The subtags that make a Chinese tag Traditional when it names no script:
/// the script itself, and Taiwan, Hong Kong and Macau — as `matchLocaleTag`
/// lists them (pinned by the ts_mirror tests in lib.rs).
pub(crate) const TRADITIONAL_HINTS: [&str; 4] = ["hant", "tw", "hk", "mo"];

/// Best-matching supported locale for a BCP-47 tag, in any case. Mirrors
/// `matchLocaleTag` (src/lib/locale-tag.ts), which the windows and the site's
/// worker share — keep them in step.
pub(crate) fn locale_from_tag(tag: &str) -> Locale {
    let tag = tag.to_ascii_lowercase();
    let mut subtags = tag.split(['-', '_']);
    match subtags.next().unwrap_or_default() {
        // Chinese needs the script, not just the language: the one the tag
        // names, else Traditional for Taiwan / Hong Kong / Macau and
        // Simplified everywhere else.
        "zh" => {
            let rest: Vec<&str> = subtags.collect();
            let traditional =
                !rest.contains(&"hans") && TRADITIONAL_HINTS.iter().any(|hint| rest.contains(hint));
            if traditional {
                Locale::ZhHant
            } else {
                Locale::ZhHans
            }
        }
        "ar" => Locale::Ar,
        "de" => Locale::De,
        "es" => Locale::Es,
        "fa" => Locale::Fa,
        "fr" => Locale::Fr,
        "he" => Locale::He,
        "id" => Locale::Id,
        "it" => Locale::It,
        "ja" => Locale::Ja,
        "ko" => Locale::Ko,
        "pl" => Locale::Pl,
        // Any Portuguese lands on the (Brazilian) translation we ship.
        "pt" => Locale::PtBr,
        "ru" => Locale::Ru,
        "th" => Locale::Th,
        "tr" => Locale::Tr,
        "vi" => Locale::Vi,
        _ => Locale::En,
    }
}

/// The tray menu's labels in one language. "Show" names the app generically —
/// the menu already sits under ZenCopy's own icon, so repeating the name
/// reads as noise.
struct TrayLabels {
    show: &'static str,
    settings: &'static str,
    about: &'static str,
    quit: &'static str,
    /// The update item, with `{version}` where the number goes. Shown only
    /// while an update is pending, it opens About — the one place where
    /// installing actually happens — so it names the destination version,
    /// not the restart mechanics.
    update: &'static str,
}

impl Locale {
    fn tray_labels(self) -> TrayLabels {
        let (show, settings, about, quit, update) = match self {
            Locale::Ar => (
                "إظهار التطبيق",
                "فتح الإعدادات",
                "حول ZenCopy",
                "إنهاء",
                "التحديث إلى v{version}",
            ),
            Locale::De => (
                "App anzeigen",
                "Einstellungen öffnen",
                "Über ZenCopy",
                "Beenden",
                "Auf v{version} aktualisieren",
            ),
            Locale::En => (
                "Show App",
                "Open Settings",
                "About ZenCopy",
                "Quit",
                "Update to v{version}",
            ),
            Locale::Es => (
                "Mostrar la aplicación",
                "Abrir ajustes",
                "Acerca de ZenCopy",
                "Salir",
                "Actualizar a v{version}",
            ),
            Locale::Fa => (
                "نمایش برنامه",
                "باز کردن تنظیمات",
                "دربارهٔ ZenCopy",
                "خروج",
                "به‌روزرسانی به v{version}",
            ),
            Locale::Fr => (
                "Afficher l'application",
                "Ouvrir les réglages",
                "À propos de ZenCopy",
                "Quitter",
                "Mettre à jour vers v{version}",
            ),
            Locale::He => (
                "הצגת האפליקציה",
                "פתיחת ההגדרות",
                "על ZenCopy",
                "יציאה",
                "עדכון ל‑v{version}",
            ),
            Locale::Id => (
                "Tampilkan aplikasi",
                "Buka pengaturan",
                "Tentang ZenCopy",
                "Keluar",
                "Perbarui ke v{version}",
            ),
            Locale::It => (
                "Mostra l'app",
                "Apri impostazioni",
                "Informazioni su ZenCopy",
                "Esci",
                "Aggiorna alla v{version}",
            ),
            Locale::Ja => (
                "アプリを表示",
                "設定を開く",
                "ZenCopy について",
                "終了",
                "v{version} にアップデート",
            ),
            Locale::Ko => (
                "앱 표시",
                "설정 열기",
                "ZenCopy 정보",
                "종료",
                "v{version}(으)로 업데이트",
            ),
            Locale::Pl => (
                "Pokaż aplikację",
                "Otwórz ustawienia",
                "O ZenCopy",
                "Zakończ",
                "Zaktualizuj do v{version}",
            ),
            Locale::PtBr => (
                "Mostrar o aplicativo",
                "Abrir configurações",
                "Sobre o ZenCopy",
                "Sair",
                "Atualizar para v{version}",
            ),
            Locale::Ru => (
                "Показать приложение",
                "Открыть настройки",
                "О ZenCopy",
                "Выход",
                "Обновить до v{version}",
            ),
            Locale::Th => (
                "แสดงแอป",
                "เปิดการตั้งค่า",
                "เกี่ยวกับ ZenCopy",
                "ออก",
                "อัปเดตเป็น v{version}",
            ),
            Locale::Tr => (
                "Uygulamayı göster",
                "Ayarları aç",
                "ZenCopy hakkında",
                "Çık",
                "v{version} sürümüne güncelle",
            ),
            Locale::Vi => (
                "Hiện ứng dụng",
                "Mở cài đặt",
                "Về ZenCopy",
                "Thoát",
                "Cập nhật lên v{version}",
            ),
            Locale::ZhHans => (
                "显示应用",
                "打开设置",
                "关于 ZenCopy",
                "退出",
                "更新到 v{version}",
            ),
            Locale::ZhHant => (
                "顯示應用程式",
                "開啟設定",
                "關於 ZenCopy",
                "結束",
                "更新到 v{version}",
            ),
        };
        TrayLabels {
            show,
            settings,
            about,
            quit,
            update,
        }
    }
}

/// The tray menu, labelled for `locale`. Rebuilt whole on a language change —
/// the item ids never change, so the tray's click handler keeps working.
pub(crate) fn build_tray_menu(
    handle: &tauri::AppHandle,
    locale: Locale,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let labels = locale.tray_labels();
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
    let show_item = MenuItem::with_id(handle, "show", labels.show, true, None::<&str>)?;
    let open_item = MenuItem::with_id(handle, "open", labels.settings, true, settings_accelerator)?;
    let about_item = MenuItem::with_id(handle, "about", labels.about, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(handle, "quit", labels.quit, true, quit_accelerator)?;
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
                labels.update.replace("{version}", &version),
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

/// The macOS app menu. An Accessory app shows no menu bar, so nobody reads
/// these labels — they are English in every language — but the menu's key
/// equivalents work whenever a ZenCopy window is focused: that is what makes
/// ⌘, (settings) and ⌘Q (quit) real shortcuts. The Edit submenu keeps the
/// standard clipboard shortcuts working in text fields; the Window submenu
/// gives ⌘W / ⌘M their bindings (⌘W goes through CloseRequested, so it hides,
/// never destroys). Ids mirror the tray items.
#[cfg(target_os = "macos")]
pub(crate) fn build_app_menu(
    handle: &tauri::AppHandle,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder};

    let menu_settings = MenuItem::with_id(handle, "open", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let menu_about = MenuItem::with_id(handle, "about", "About ZenCopy", true, None::<&str>)?;
    let zencopy_submenu = SubmenuBuilder::new(handle, "ZenCopy")
        .item(&menu_about)
        .separator()
        .item(&menu_settings)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let edit_submenu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;
    let window_submenu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .close_window()
        .build()?;
    MenuBuilder::new(handle)
        .items(&[&zencopy_submenu, &edit_submenu, &window_submenu])
        .build()
}

#[cfg(test)]
mod locale_tests {
    use super::{Locale, locale_from_tag};

    #[test]
    fn chinese_resolves_by_script_and_region() {
        assert_eq!(locale_from_tag("zh-cn"), Locale::ZhHans);
        assert_eq!(locale_from_tag("zh-sg"), Locale::ZhHans);
        assert_eq!(locale_from_tag("zh-hans-cn"), Locale::ZhHans);
        assert_eq!(locale_from_tag("zh-tw"), Locale::ZhHant);
        assert_eq!(locale_from_tag("zh-hant-hk"), Locale::ZhHant);
        assert_eq!(locale_from_tag("zh-mo"), Locale::ZhHant);
        assert_eq!(locale_from_tag("zh"), Locale::ZhHans);
    }

    /// The script a tag names outranks its region: Simplified Chinese as
    /// read in Hong Kong is still Simplified.
    #[test]
    fn an_explicit_script_outranks_the_region() {
        assert_eq!(locale_from_tag("zh-Hans-HK"), Locale::ZhHans);
        assert_eq!(locale_from_tag("zh_Hans_TW"), Locale::ZhHans);
        assert_eq!(locale_from_tag("zh-Hant-CN"), Locale::ZhHant);
    }

    #[test]
    fn portuguese_lands_on_the_brazilian_translation() {
        assert_eq!(locale_from_tag("pt-br"), Locale::PtBr);
        assert_eq!(locale_from_tag("pt-pt"), Locale::PtBr);
        assert_eq!(locale_from_tag("pt"), Locale::PtBr);
    }

    #[test]
    fn the_language_subtag_decides_and_unknowns_fall_back_to_english() {
        assert_eq!(locale_from_tag("ja-JP"), Locale::Ja);
        assert_eq!(locale_from_tag("de-at"), Locale::De);
        assert_eq!(locale_from_tag("id-id"), Locale::Id);
        assert_eq!(locale_from_tag("he-il"), Locale::He);
        assert_eq!(locale_from_tag("nl-nl"), Locale::En);
        assert_eq!(locale_from_tag(""), Locale::En);
        // A language whose code merely starts like one of ours is not ours.
        assert_eq!(locale_from_tag("frr-DE"), Locale::En);
        assert_eq!(locale_from_tag("arn-CL"), Locale::En);
    }
}
