//! The locale-aware tray and app menus, and the locale resolution they
//! (and the frontend default) share.

use crate::UPDATE_VERSION;
use crate::config::STORE_FILE;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
/// The OS locale, mapped to a supported code — the fallback when the in-app
/// language preference is "system".
pub(crate) fn ui_locale() -> &'static str {
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
pub(crate) fn app_locale(app: &tauri::AppHandle) -> &'static str {
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
pub(crate) fn locale_from_tag(tag: &str) -> &'static str {
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
pub(crate) fn tray_labels(
    locale: &str,
) -> (&'static str, &'static str, &'static str, &'static str) {
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
pub(crate) fn tray_update_label(locale: &str, version: &str) -> String {
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
pub(crate) fn window_menu_labels(locale: &str) -> (&'static str, &'static str, &'static str) {
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
pub(crate) fn edit_menu_label(locale: &str) -> &'static str {
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
pub(crate) fn build_tray_menu(
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
pub(crate) fn build_app_menu(
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
