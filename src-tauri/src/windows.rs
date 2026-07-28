//! Window management: the popup's corner placement and the show/reveal
//! helpers every window shares.

use crate::OrLog;
use crate::config::STORE_FILE;
use tauri::{Manager, WebviewWindow};
/// The screen corner the popup is pinned to. Default is top-right.
#[derive(Clone, Copy)]
pub(crate) enum Corner {
    TopRight,
    BottomRight,
    TopLeft,
    BottomLeft,
}

impl Corner {
    pub(crate) fn is_bottom(self) -> bool {
        matches!(self, Corner::BottomRight | Corner::BottomLeft)
    }
}

/// Read the user's chosen popup corner from the settings store (default top-right).
pub(crate) fn current_corner(handle: &tauri::AppHandle) -> Corner {
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
pub(crate) const POPUP_WIDTH: f64 = 380.0;
pub(crate) const POPUP_MIN_HEIGHT: f64 = 360.0;
pub(crate) const POPUP_MAX_HEIGHT: f64 = 720.0;

/// Whether the popup is in its expanded shape (half the work area's width,
/// nearly its full height) instead of the compact card. Session-scoped by
/// design: a fresh launch starts compact — the expanded shape is a reading
/// mode, not a layout preference worth persisting.
static POPUP_EXPANDED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Show `window` on the desktop (macOS Space) the user is on right now, focused,
/// and pin it there. A hidden window keeps its previous Space assignment, so a
/// plain `show` could surface it on the wrong desktop; joining all Spaces just
/// for the instant of `show` moves it to the active one, and dropping the flag
/// right after keeps it from following the user to other desktops (it would
/// resurface behind whatever is already there — a window should exist only on
/// the desktop where it was summoned).
pub(crate) fn show_on_active_space(window: &WebviewWindow) {
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
pub(crate) fn focus_with_server_time(window: &WebviewWindow) {
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
pub(crate) fn monitor_at_cursor(handle: &tauri::AppHandle) -> Option<tauri::Monitor> {
    handle
        .cursor_position()
        .ok()
        .and_then(|c| handle.monitor_from_point(c.x, c.y).ok().flatten())
}

/// Show the popup pinned to the user's chosen corner of the active monitor's work
/// area. A fixed corner is predictable and never clipped — a calmer fit than
/// chasing the pointer or the (not-yet-reliable) text selection.
pub(crate) fn show_popup_in_corner(
    handle: &tauri::AppHandle,
    popup: &WebviewWindow,
    corner: Corner,
) {
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
    let margin_logical = 16.0;
    let margin = (margin_logical * scale) as i32;

    // Pin within the work area (excludes Dock / taskbar / menu bar).
    let area = monitor.work_area();
    let area_width_logical = f64::from(area.size.width) / scale;
    let area_height_logical = f64::from(area.size.height) / scale;

    // Compact: the card (fixed width, half the work area's height, clamped —
    // adapts to the display instead of hardcoding one laptop's idea of
    // "enough"). Expanded: a reading pane — half the work area's width and
    // nearly its full height, never smaller than the card.
    let (width_logical, height_logical) =
        if POPUP_EXPANDED.load(std::sync::atomic::Ordering::Relaxed) {
            (
                (area_width_logical / 2.0 - margin_logical * 1.5).max(POPUP_WIDTH),
                (area_height_logical - margin_logical * 2.0).max(POPUP_MIN_HEIGHT),
            )
        } else {
            (
                POPUP_WIDTH,
                (area_height_logical / 2.0).clamp(POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT),
            )
        };
    popup
        .set_size(tauri::LogicalSize::new(width_logical, height_logical))
        .or_log("popup: set size");
    let w = (width_logical * scale) as i32;
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

/// Re-show the popup (the last result is still in the frontend's memory) in its
/// corner. Lets the user bring back a closed result from the tray menu without
/// copying again; if it's already visible, this just re-focuses it.
pub(crate) fn reveal_popup(handle: &tauri::AppHandle) {
    if let Some(popup) = handle.get_webview_window("popup") {
        let corner = current_corner(handle);
        show_popup_in_corner(handle, &popup, corner);
    }
}

/// Toggle the popup between its compact card and the expanded reading pane —
/// the header's expand button. Applies immediately when the popup is visible
/// (same corner, new size); a hidden popup picks the shape up on its next show.
#[tauri::command]
pub(crate) fn set_popup_expanded(app: tauri::AppHandle, expanded: bool) {
    POPUP_EXPANDED.store(expanded, std::sync::atomic::Ordering::Relaxed);
    if let Some(popup) = app.get_webview_window("popup")
        && popup.is_visible().unwrap_or(false)
    {
        let corner = current_corner(&app);
        show_popup_in_corner(&app, &popup, corner);
    }
}

/// Open (and focus) the About window. Invoked from the popup's update hint.
#[tauri::command]
pub(crate) fn open_about(app: tauri::AppHandle) {
    reveal_window(&app, "about");
}

/// Center `window` on the monitor the user is currently on (where the cursor is),
/// so it opens where they are working — not back on whatever display it was last
/// shown. Falls back to the platform's own centering.
pub(crate) fn center_on_active_monitor(handle: &tauri::AppHandle, window: &WebviewWindow) {
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
pub(crate) fn reveal_window(handle: &tauri::AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label) {
        center_on_active_monitor(handle, &window);
        show_on_active_space(&window);
    }
}

/// Open (and focus) the settings window. Invoked from the popup's settings icon.
#[tauri::command]
pub(crate) fn open_settings(app: tauri::AppHandle) {
    reveal_window(&app, "settings");
}
