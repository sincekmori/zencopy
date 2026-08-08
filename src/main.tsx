import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App.tsx";
import { I18nProvider } from "@/lib/i18n.tsx";
import { createLogger, installGlobalErrorLogging } from "@/lib/log.ts";
import type * as z from "zod";
import { getTextSize, getTheme, TextSizeSchema, ThemeSchema } from "@/lib/settings.ts";
import { applyTextSize } from "@/lib/text-size.ts";
import { applyTheme } from "@/lib/theme.ts";
import "@/index.css";

// First, so nothing that fails during startup can die unseen in the webview
// console — uncaught errors and rejections all land in the app log.
installGlobalErrorLogging();

const log = createLogger("main");

// The wiring every live setting shares: apply the saved value, then follow
// the settings window's broadcasts, validating each payload at the boundary.
function followSetting<Value>({
  event,
  schema,
  load,
  apply,
}: {
  event: string;
  schema: z.ZodType<Value>;
  load: () => Promise<Value>;
  apply: (value: Value) => void;
}): void {
  void (async () => {
    apply(await load());
  })();
  void listen<Value>(event, (received) => {
    const parsed = schema.safeParse(received.payload);
    if (parsed.success) {
      apply(parsed.data);
    } else {
      log.warn(`ignoring ${event} with an invalid payload`, parsed.error);
    }
  });
}

// Theme gets a baseline before the async load so the first paint is never
// unstyled. The text-size load is unconditional on purpose: webview zoom
// survives a reload, so this call is what un-zooms a factory-reset window.
applyTheme("system");
followSetting({ event: "theme-changed", schema: ThemeSchema, load: getTheme, apply: applyTheme });
followSetting({
  event: "text-size-changed",
  schema: TextSizeSchema,
  load: getTextSize,
  apply: (size) => {
    void applyTextSize(size);
  },
});

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
