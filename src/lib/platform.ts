// A userAgent check is enough to pick the right modifier key (⌘ on macOS,
// Ctrl on Windows and Linux) without pulling in the OS plugin.
const isMac = navigator.userAgent.toLowerCase().includes("mac");

/** The trigger modifier on this OS: ⌘ on macOS, Ctrl elsewhere. */
export const TRIGGER_MODIFIER = isMac ? "⌘" : "Ctrl";

/** The trigger, spelled for this OS ("⌘ + C + C" / "Ctrl + C + C") — the one
 *  place the shortcut is written out, so every surface stays consistent. */
export const TRIGGER_KEYS = `${TRIGGER_MODIFIER} + C + C`;
