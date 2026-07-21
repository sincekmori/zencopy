import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App.tsx";
import { I18nProvider } from "@/lib/i18n.tsx";
import { createLogger, installGlobalErrorLogging } from "@/lib/log.ts";
import { getTheme, type Theme, ThemeSchema } from "@/lib/settings.ts";
import { applyTheme } from "@/lib/theme.ts";
import "@/index.css";

// First, so nothing that fails during startup can die unseen in the webview
// console — uncaught errors and rejections all land in the app log.
installGlobalErrorLogging();

// Apply a baseline immediately, then the saved theme, then follow live changes
// (settings broadcasts `theme-changed` to every window).
applyTheme("system");
void (async () => {
  applyTheme(await getTheme());
})();
void (async () => {
  await listen<Theme>("theme-changed", (event) => {
    const theme = ThemeSchema.safeParse(event.payload);
    if (theme.success) {
      applyTheme(theme.data);
    } else {
      createLogger("main").warn("ignoring theme-changed with an invalid payload", theme.error);
    }
  });
})();

// The popup is a frameless, transparent floating card — drop the page background.
if (getCurrentWindow().label === "popup") {
  document.documentElement.classList.add("popup");
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error('Root element "#root" was not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
