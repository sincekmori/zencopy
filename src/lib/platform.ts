// A userAgent check is enough to pick the right modifier key (⌘ on macOS,
// Ctrl on Windows and Linux) without pulling in the OS plugin.
import { screenshotParam } from "./screenshot.ts";

/** Whether the app runs on macOS. */
export const IS_MAC = navigator.userAgent.toLowerCase().includes("mac");

/** The trigger modifier on this OS: ⌘ on macOS, Ctrl elsewhere. The
 *  screenshot harness (dev-only) may spell it as it likes — `Ctrl/⌘` for
 *  the docs' neutral shots, shown where a visitor's OS is not known. */
export const TRIGGER_MODIFIER = screenshotParam("modifier") ?? (IS_MAC ? "⌘" : "Ctrl");

/** The trigger, spelled for this OS ("⌘ + C + C" / "Ctrl + C + C") — the one
 *  place the shortcut is written out, so every surface stays consistent. */
export const TRIGGER_KEYS = `${TRIGGER_MODIFIER} + C + C`;
