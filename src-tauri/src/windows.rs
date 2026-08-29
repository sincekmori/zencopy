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

/// A string setting from the settings store, if present and a string.
fn store_str(handle: &tauri::AppHandle, key: &str) -> Option<String> {
    use tauri_plugin_store::StoreExt;

    let value = handle
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(key));
    value
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

/// Read the user's chosen popup corner from the settings store (default top-right).
pub(crate) fn current_corner(handle: &tauri::AppHandle) -> Corner {
    match store_str(handle, "popupCorner").as_deref() {
        Some("bottom-right") => Corner::BottomRight,
        Some("top-left") => Corner::TopLeft,
        Some("bottom-left") => Corner::BottomLeft,
        _ => Corner::TopRight,
    }
}

/// The popup's HOME shape: the height bounds — on show it takes half the work
/// area's height, clamped. The conf's `minWidth`/`minHeight` are a different
/// thing: the manual-resize floor, deliberately below this home shape.
pub(crate) const POPUP_MIN_HEIGHT: f64 = 360.0;
pub(crate) const POPUP_MAX_HEIGHT: f64 = 720.0;

/// The home viewport width in CSS px, the same at every text size: the widest
/// built-in slot row (German, five labels + number badges) measures 533, the
/// palette button budgets 30, card chrome (float padding, border, body
/// padding) adds 42, plus 8 for font differences across platforms.
/// Re-measure when a built-in label changes (see `builtinLabels` in
/// src/lib/messages/types.ts). Must stay under the `compact` breakpoint
/// (index.css) or the home card loses its padded look. The popup window's
/// `width` in tauri.conf.json is only the pre-show placeholder.
pub(crate) const POPUP_HOME_VIEWPORT: f64 = 613.0;

/// The home width per text size — the viewport scaled by the webview zoom
/// that size applies (the ladder in src/lib/text-size.ts, pinned by a
/// ts_mirror test), so the popup looks the same at every size and in every
/// locale.
fn home_width_for(size: Option<&str>) -> f64 {
    let zoom = match size {
        Some("small") => ZOOM_SMALL,
        Some("large") => ZOOM_LARGE,
        _ => 1.0,
    };
    (POPUP_HOME_VIEWPORT * zoom).ceil()
}

pub(crate) const ZOOM_SMALL: f64 = 0.9;
pub(crate) const ZOOM_LARGE: f64 = 1.15;

/// `home_width_for` keyed by the stored text size (the summon path — by show
/// time any settings write has landed).
fn popup_home_width(handle: &tauri::AppHandle) -> f64 {
    home_width_for(store_str(handle, "textSize").as_deref())
}

/// While the popup is visible, a text-size change re-fits it immediately: the
/// width snaps to the new size's home width the moment the webviews apply
/// their zoom. The new size rides in the event's payload — the store write
/// may still be in flight when the event lands. Height and position are kept
/// (for right-side corners the right edge stays pinned), so a dragged popup
/// is not yanked back home.
pub(crate) fn follow_text_size(app: &tauri::App) {
    use tauri::{Listener, PhysicalPosition, PhysicalSize};

    let handle = app.handle().clone();
    app.listen("text-size-changed", move |event| {
        let Some(popup) = handle.get_webview_window("popup") else {
            return;
        };
        if !popup.is_visible().unwrap_or(false) {
            return;
        }
        let width_logical = serde_json::from_str::<String>(event.payload())
            .map(|size| home_width_for(Some(&size)))
            .unwrap_or_else(|_| popup_home_width(&handle));
        let scale = popup.scale_factor().unwrap_or(1.0);
        let width = (width_logical * scale) as u32;
        let Ok(outer) = popup.outer_size() else {
            return;
        };
        if width == outer.width {
            return;
        }
        if matches!(
            current_corner(&handle),
            Corner::TopRight | Corner::BottomRight
        ) && let Ok(position) = popup.outer_position()
        {
            let dx = outer.width as i32 - width as i32;
            popup
                .set_position(PhysicalPosition::new(position.x + dx, position.y))
                .or_log("popup: text-size reposition");
        }
        popup
            .set_size(PhysicalSize::new(width, outer.height))
            .or_log("popup: text-size resize");
    });
}

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
    // Focused, so Escape and the popup's number-key slots work right away.
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
/// keeps — keyboard focus.
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

    // Pin within the work area (excludes Dock / taskbar / menu bar).
    let area = monitor.work_area();
    let area_height_logical = f64::from(area.size.height) / scale;

    // The home shape: fixed width, half the work area's height, clamped —
    // adapts to the display instead of hardcoding one laptop's idea of
    // "enough". Reading bigger is the user's own move: drag an edge, and the
    // panel keeps that size for as long as it stays visible.
    let height_logical = (area_height_logical / 2.0).clamp(POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT);
    let area_width_logical = f64::from(area.size.width) / scale;
    let width_logical = popup_home_width(handle).min(area_width_logical);
    popup
        .set_size(tauri::LogicalSize::new(width_logical, height_logical))
        .or_log("popup: set size");
    // Flush against the work area: the webview's own compact-size padding
    // (popup.tsx's `max-compact:p-2`) is the only visible gap — exactly where
    // the OS would stop the panel if the user dragged it into the corner.
    let w = (width_logical * scale) as i32;
    let h = (height_logical * scale) as i32;
    let left = area.position.x;
    let right = area.position.x + area.size.width as i32 - w;
    let top = area.position.y;
    let bottom = area.position.y + area.size.height as i32 - h;

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

/// Bring the popup to the user. A hidden popup opens fresh at its home corner
/// (and home shape); a visible one is only raised and re-focused — wherever
/// the user dragged or resized this PiP-style panel is where it stays, and a
/// new capture must never yank it back.
pub(crate) fn summon_popup(handle: &tauri::AppHandle, corner: Corner) {
    let Some(popup) = handle.get_webview_window("popup") else {
        log::warn!("popup window not found");
        return;
    };
    if popup.is_visible().unwrap_or(false) {
        show_on_active_space(&popup);
    } else {
        show_popup_in_corner(handle, &popup, corner);
    }
}

/// Re-show the popup (the last result is still in the frontend's memory).
/// Lets the user bring back a closed result from the tray menu without
/// copying again; if it's already visible, this just re-focuses it.
pub(crate) fn reveal_popup(handle: &tauri::AppHandle) {
    summon_popup(handle, current_corner(handle));
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
    // A window taller than the work area (the settings default on a short
    // monitor) is shrunk to fit, never grown — a user's own resize survives.
    let mut size = size;
    if size.height > area.size.height {
        size.height = area.size.height;
        window
            .set_size(tauri::PhysicalSize::new(size.width, size.height))
            .or_log(&format!("{label}: clamp to work area"));
    }
    let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
    let y = area.position.y + (area.size.height as i32 - size.height as i32) / 2;
    window
        .set_position(PhysicalPosition::new(x, y))
        .or_log(&format!("{label}: set centered position"));
}

/// ZenCopy's dialog windows. While any of them is visible, the popup's
/// always-on-top is suspended so they can stack above it naturally.
pub(crate) const DIALOG_LABELS: [&str; 2] = ["settings", "about"];

/// One rule, one place: the popup floats above everything (a PiP panel)
/// unless one of our own dialogs is on screen. Recomputed from what is
/// actually visible — called after a dialog shows (reveal_window) and after
/// one hides (lib.rs's CloseRequested handler).
pub(crate) fn sync_popup_float(handle: &tauri::AppHandle) {
    let dialog_open = DIALOG_LABELS.iter().any(|label| {
        handle
            .get_webview_window(label)
            .is_some_and(|w| w.is_visible().unwrap_or(false))
    });
    if let Some(popup) = handle.get_webview_window("popup") {
        popup
            .set_always_on_top(!dialog_open)
            .or_log("popup: set always-on-top");
    }
}

/// Reveal a window on the active monitor and focus it (settings / about).
pub(crate) fn reveal_window(handle: &tauri::AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label) {
        center_on_active_monitor(handle, &window);
        show_on_active_space(&window);
        // A dialog must never sit underneath the floating popup.
        sync_popup_float(handle);
    }
}

/// Open (and focus) the settings window. Invoked from the popup's settings icon.
#[tauri::command]
pub(crate) fn open_settings(app: tauri::AppHandle) {
    reveal_window(&app, "settings");
}
