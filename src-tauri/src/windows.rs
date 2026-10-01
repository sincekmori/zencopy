//! Window management: the popup's corner placement and the show/reveal
//! helpers every window shares.

use crate::OrLog;
use crate::config::store_str;
use tauri::{Emitter, Manager, WebviewWindow};
/// The screen corner the popup is pinned to. Default is top-right.
#[derive(Clone, Copy)]
pub(crate) enum Corner {
    TopRight,
    BottomRight,
    TopLeft,
    BottomLeft,
}

/// Settings-store keys and the events the settings window broadcasts on a
/// change, as the frontend spells them (src/lib/settings.ts and
/// src/components/settings.tsx; pinned by the ts_mirror tests in lib.rs).
pub(crate) const POPUP_CORNER_KEY: &str = "popupCorner";
pub(crate) const TEXT_SIZE_KEY: &str = "textSize";
pub(crate) const TEXT_SIZE_CHANGED: &str = "text-size-changed";

/// Read the user's chosen popup corner from the settings store (default top-right).
pub(crate) fn current_corner(handle: &tauri::AppHandle) -> Corner {
    match store_str(handle, POPUP_CORNER_KEY).as_deref() {
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
/// built-in slot row (German: five labels, number badges, the Custom chip's pen
/// and its step of space) measures 535, the palette button budgets 30, card
/// chrome (float padding, border, body padding) adds 42, plus 8 for font
/// differences across platforms.
/// Re-measure when a built-in label changes (see `builtinLabels` in
/// src/lib/messages/types.ts). Must stay under the `compact` breakpoint
/// (index.css) or the home card loses its padded look. The popup window's
/// `width` in tauri.conf.json is only the pre-show placeholder.
pub(crate) const POPUP_HOME_VIEWPORT: f64 = 615.0;

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
    home_width_for(store_str(handle, TEXT_SIZE_KEY).as_deref())
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
    app.listen(TEXT_SIZE_CHANGED, move |event| {
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

/// Linux: the popup is a listed window — in Alt+Tab, the overview, the dock
/// — not a skip-taskbar one. The conf's `skipTaskbar` is meant for Windows,
/// where it removes nothing but the taskbar button (`ITaskbarList::DeleteTab`)
/// of a panel that floats above everything anyway. On GNOME the same flag
/// hides the popup from every window list, and Tiling Assistant — Ubuntu's
/// default since 23.10, which takes over Super+←/→ there — refuses to tile a
/// skip-taskbar window at all (`tile()` in its tilingWindowManager.js returns
/// on `is_skip_taskbar()`), so a panel the user drags, resizes, and tiles
/// must not carry it. Mutter's own tiling never minded; the extension does.
#[cfg(target_os = "linux")]
pub(crate) fn expose_popup_to_shell(app: &tauri::App) {
    if let Some(popup) = app.get_webview_window("popup") {
        popup
            .set_skip_taskbar(false)
            .or_log("popup: listing it in the shell");
    }
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
///
/// Windows reports the cursor and looks a monitor up in one physical space.
/// macOS and Linux look it up in logical points, yet tao (0.35) hands the
/// cursor back scaled by the primary monitor's factor — on a Retina primary a
/// cursor outside the top-left quarter then lands on another monitor, or on
/// none. Undo that scaling before asking.
pub(crate) fn monitor_at_cursor(handle: &tauri::AppHandle) -> Option<tauri::Monitor> {
    let cursor = handle.cursor_position().ok()?;
    let scale = if cfg!(windows) {
        1.0
    } else {
        handle.primary_monitor().ok().flatten()?.scale_factor()
    };
    handle
        .monitor_from_point(cursor.x / scale, cursor.y / scale)
        .ok()
        .flatten()
}

/// Move `window` to a point of `monitor`'s own physical space — what its
/// `work_area` is measured in. macOS turns a physical position into points
/// with the scale of the display the window is on *now*, which is wrong the
/// moment the target display has another one; points are the same on every
/// display there, so that is what it gets. Elsewhere physical pixels are the
/// shared space.
fn place(window: &WebviewWindow, monitor: &tauri::Monitor, x: i32, y: i32) -> tauri::Result<()> {
    let position = tauri::PhysicalPosition::new(x, y);
    if cfg!(target_os = "macos") {
        window.set_position(position.to_logical::<f64>(monitor.scale_factor()))
    } else {
        window.set_position(position)
    }
}

/// Bring a minimized window back to its size. `show` alone does not: on
/// Windows a minimized window still counts as visible, so showing it changes
/// nothing and focusing it is skipped.
fn restore(window: &WebviewWindow) {
    window
        .unminimize()
        .or_log(&format!("{}: restore", window.label()));
}

/// Show the popup pinned to the user's chosen corner of the active monitor's work
/// area. A fixed corner is predictable and never clipped — a calmer fit than
/// chasing the pointer or the (not-yet-reliable) text selection.
fn show_popup_in_corner(handle: &tauri::AppHandle, popup: &WebviewWindow, corner: Corner) {
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

    place(popup, &monitor, x, y).or_log("popup: set corner position");
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
        restore(&popup);
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
    let (Ok(outer), Ok(inner), Ok(scale)) = (
        window.outer_size(),
        window.inner_size(),
        window.scale_factor(),
    ) else {
        window
            .center()
            .or_log(&format!("{label}: center (size unknown)"));
        return;
    };
    if outer.width == 0 || outer.height == 0 {
        window
            .center()
            .or_log(&format!("{label}: center (zero size)"));
        return;
    }
    // Measured in logical units: the window's sizes come in the scale of the
    // display it is on now, the work area in the target monitor's.
    let outer = outer.to_logical::<f64>(scale);
    let inner = inner.to_logical::<f64>(scale);
    let monitor_scale = monitor.scale_factor();
    let area = monitor.work_area();
    let area_size = area.size.to_logical::<f64>(monitor_scale);
    // A window taller than the work area (the settings default on a short
    // monitor) is shrunk to fit, never grown — a user's own resize survives.
    // `set_size` sets the inner size, so the frame comes off the height that
    // fits: handed the outer size, the window would grow by its frame on
    // every reveal.
    let mut height = outer.height;
    if height > area_size.height {
        height = area_size.height;
        let frame = outer.height - inner.height;
        window
            .set_size(tauri::LogicalSize::new(inner.width, height - frame))
            .or_log(&format!("{label}: clamp to work area"));
    }
    let x = area.position.x + ((area_size.width - outer.width) / 2.0 * monitor_scale) as i32;
    let y = area.position.y + ((area_size.height - height) / 2.0 * monitor_scale) as i32;
    place(window, &monitor, x, y).or_log(&format!("{label}: set centered position"));
}

/// Whether a URL is one of the app's own pages: the bundled frontend
/// (`tauri://localhost`, or `http://tauri.localhost` on Windows), the dev
/// server in a dev build, and `about:` (an iframe's `srcdoc`).
fn is_app_url(url: &tauri::Url) -> bool {
    let host = url.host_str();
    match url.scheme() {
        "about" | "tauri" => true,
        "http" | "https" => {
            host == Some("tauri.localhost") || (cfg!(dev) && host == Some("localhost"))
        }
        _ => false,
    }
}

/// Keeps every webview on the app's own pages. Nothing in the app navigates
/// anywhere else — links go to the system browser — but a webview's own
/// gestures would (the context menu's Open Link, a middle click), and a page
/// loaded into the popup keeps receiving every capture made after it.
pub(crate) fn stay_on_app_pages() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("stay-on-app-pages")
        .on_navigation(|webview, url| {
            let allowed = is_app_url(url);
            if !allowed {
                // The scheme only: the rest may quote what the user copied.
                log::warn!(
                    "{}: refused to navigate away from the app ({}:)",
                    webview.label(),
                    url.scheme()
                );
            }
            allowed
        })
        .build()
}

/// The events a dialog window's webview hears when it comes on screen and when
/// it leaves (mirrored by useWindowOpen in src/lib/use-tauri-event.ts).
pub(crate) const WINDOW_OPENED: &str = "window-opened";
pub(crate) const WINDOW_CLOSED: &str = "window-closed";

/// ZenCopy's dialog windows. While any of them is visible, the popup's
/// always-on-top is suspended so they can stack above it naturally.
const DIALOG_LABELS: [&str; 2] = ["settings", "about"];

/// One rule, one place: the popup floats above everything (a PiP panel)
/// unless one of our own dialogs is on screen. Called after a dialog shows
/// (reveal_window) and as one closes (conceal_window), which names it in
/// `closing`: its hide has been asked for, but on Linux it lands only once
/// the event loop turns, so the window still reads as visible.
fn sync_popup_float(handle: &tauri::AppHandle, closing: Option<&str>) {
    let dialog_open = DIALOG_LABELS.iter().any(|label| {
        Some(*label) != closing
            && handle
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
        // First, so the centering measures the window and not its icon.
        restore(&window);
        center_on_active_monitor(handle, &window);
        show_on_active_space(&window);
        // Tell the webview it is on screen (the twin of `window-closed`):
        // these windows exist hidden from launch, and what they would load or
        // tick over waits for this (useWindowOpen in use-tauri-event.ts).
        window
            .emit_to(label, WINDOW_OPENED, ())
            .or_log(&format!("{label}: emit {WINDOW_OPENED}"));
        // A dialog must never sit underneath the floating popup.
        sync_popup_float(handle, None);
    }
}

/// Take a window off the screen instead of closing it (the twin of
/// reveal_window): a tray-resident app hides its windows rather than
/// destroying them, so they can always be reopened.
pub(crate) fn conceal_window(window: &tauri::Window) {
    let label = window.label();
    window.hide().or_log(&format!("{label}: hide on close"));
    // Tell the webview its session just ended: a hidden window keeps its
    // React state, so transient feedback (a "saved" confirmation) must be
    // dropped now or it would still be on screen at the next open. Minimize
    // and app-hide stay silent on purpose — the window is still "open" then.
    window
        .emit_to(label, WINDOW_CLOSED, ())
        .or_log(&format!("{label}: emit {WINDOW_CLOSED}"));
    // A dialog is leaving the screen — the popup's float may resume.
    if DIALOG_LABELS.contains(&label) {
        sync_popup_float(window.app_handle(), Some(label));
    }
}

/// Open (and focus) the settings window. Invoked from the popup's settings icon.
#[tauri::command]
pub(crate) fn open_settings(app: tauri::AppHandle) {
    reveal_window(&app, "settings");
}

#[cfg(test)]
mod tests {
    use super::is_app_url;

    /// The guard must let the app load itself on every platform — a wrong
    /// "no" here is a blank window — and nothing else.
    #[test]
    fn only_the_app_s_own_pages_may_load() {
        let allowed = |url: &str| is_app_url(&url.parse().expect("a URL"));
        for url in [
            "tauri://localhost/",
            "tauri://localhost/index.html",
            "http://tauri.localhost/",
            "https://tauri.localhost/assets/popup.js",
            "about:srcdoc",
            "about:blank",
        ] {
            assert!(allowed(url), "{url} is the app");
        }
        for url in [
            "https://example.com/",
            "http://example.com/",
            "https://tauri.localhost.example.com/",
            "file:///etc/passwd",
            "data:text/html,<p>hi",
        ] {
            assert!(!allowed(url), "{url} is not the app");
        }
        // The dev server is the app in a dev build only.
        assert_eq!(allowed("http://localhost:1420/"), cfg!(dev));
    }
}
