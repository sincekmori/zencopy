import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { createLogger } from "@/lib/log.ts";
import type { TextSize } from "@/lib/settings.ts";

const log = createLogger("text-size");

/** Zoom per size, on the browsers' own zoom ladder (90% / 100% / 115%).
 *  Before widening it, re-check the fixed-size windows (about, the popup's
 *  compact breakpoint) at the new extremes — and the popup's per-size home
 *  widths, which multiply this ladder in Rust (home_width_for in
 *  src-tauri/src/windows.rs, pinned by a ts_mirror test). */
const ZOOM: Record<TextSize, number> = { small: 0.9, standard: 1, large: 1.15 };

/** What this window last applied. Starts unknown, NOT "standard": webview
 *  zoom survives a reload, so the first call after a factory reset's reload
 *  must go through to un-zoom the window — only repeats are skipped (the
 *  settings window hears its own broadcast right after applying locally). */
let applied: TextSize | undefined;

/**
 * Apply the text size to this window. Webview zoom scales everything
 * uniformly — px and rem alike — so layouts keep their proportions in every
 * locale. That is why this is zoom and not a root font-size override: parts
 * of the chrome are sized in raw px and would be left behind by the latter.
 */
export async function applyTextSize(size: TextSize): Promise<void> {
  if (size === applied) {
    return;
  }
  try {
    await getCurrentWebviewWindow().setZoom(ZOOM[size]);
    applied = size;
  } catch (error) {
    log.error("applying the text size failed", error);
  }
}
