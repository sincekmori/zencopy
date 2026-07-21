import { createContext, useContext, useEffect, useState } from "react";
import { createLogger } from "@/lib/log.ts";
import {
  DEFAULT_LOCALE,
  type Locale,
  localeDir,
  type Messages,
  messages,
} from "@/lib/messages/index.ts";
import { getLocale, LocaleSchema } from "@/lib/settings.ts";
import { useTauriEvent } from "@/lib/use-tauri-event.ts";

const log = createLogger("i18n");

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Provides the active locale to the tree. Loads the saved preference on mount and
 * follows live changes: settings broadcasts `locale-changed` (the resolved locale)
 * to every window, mirroring how the theme is kept in sync.
 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  // Reflect the locale on the document: assistive tech reads the language,
  // and RTL locales (Arabic, Persian, Hebrew) flip the layout via `dir` —
  // the styles use logical properties, so this one attribute does the work.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await getLocale();
      if (!cancelled) {
        setLocale(resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useTauriEvent<Locale>("locale-changed", (payload) => {
    // An unknown code would index `messages` with undefined and take the
    // whole window down — ignore it instead.
    const changed = LocaleSchema.safeParse(payload);
    if (changed.success) {
      setLocale(changed.data);
    } else {
      log.warn("ignoring locale-changed with an invalid payload", changed.error);
    }
  });

  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** The message catalog for the active locale. */
export function useT(): Messages {
  return messages[useContext(LocaleContext)];
}

/** The active locale code (e.g. "en", "ja") — for passing to action templates. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/**
 * Returns a function that resolves an action's display label: a localized
 * override for a pre-installed action (keyed by id), else the action's own
 * label. Use everywhere a label is shown, so built-ins follow the UI language
 * while user actions stay verbatim.
 */
export function useActionLabel(): (id: string, fallback: string) => string {
  const t = useT();
  return (id, fallback) => t.actions.builtinLabels[id] ?? fallback;
}
