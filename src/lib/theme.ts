import { useSyncExternalStore } from "react";
import type { Theme } from "@/lib/settings.ts";

const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
let osListener: ((event: MediaQueryListEvent) => void) | undefined;

function setDark(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark);
}

/**
 * Apply the color theme. "system" follows the OS appearance and keeps updating
 * live; "light"/"dark" are fixed. Both WebView2 and WKWebView honor
 * `prefers-color-scheme`, so this works uniformly across platforms.
 */
export function applyTheme(theme: Theme): void {
  if (osListener) {
    media.removeEventListener("change", osListener);
    osListener = undefined;
  }
  if (theme === "system") {
    setDark(media.matches);
    osListener = (event) => {
      setDark(event.matches);
    };
    media.addEventListener("change", osListener);
  } else {
    setDark(theme === "dark");
  }
}

function subscribeToRootClass(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => {
    observer.disconnect();
  };
}

/**
 * Whether the applied theme is dark right now, as React state. Watching the
 * `dark` class (rather than the settings value) also tracks live OS appearance
 * changes under "system" — everything funnels through setDark above.
 */
export function useDarkScheme(): boolean {
  return useSyncExternalStore(subscribeToRootClass, () =>
    document.documentElement.classList.contains("dark"),
  );
}
