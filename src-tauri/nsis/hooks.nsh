; Included by Tauri's installer.nsi ahead of its own page definitions
; (bundle.windows.nsis.installerHooks), so a Modern UI define placed here
; shapes the pages that follow.
;
; The finish page offers "Create desktop shortcut" through the Modern UI
; readme slot, which starts checked unless told otherwise. ZenCopy lives in
; the tray and nothing opens it from the desktop, so the box starts cleared:
; installing is Next, Next, Next, Finish, with nothing to un-tick.
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
