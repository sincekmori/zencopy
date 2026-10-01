import { createContext, useContext, useEffect, useState } from "react";
import { createLogger } from "@/lib/log.ts";
import {
  DEFAULT_LOCALE,
  DEFAULT_MESSAGES,
  loadMessages,
  type Locale,
  localeDir,
  type Messages,
} from "@/lib/messages/index.ts";
import { getLocale, LocaleSchema } from "@/lib/settings.ts";
import { useLiveValue } from "@/lib/use-tauri-event.ts";

const log = createLogger("i18n");

/** The language the tree speaks: its code, and its catalog — always the two
 *  together, so no frame names one language and shows another. */
interface Language {
  locale: Locale;
  messages: Messages;
}

const LanguageContext = createContext<Language>({
  locale: DEFAULT_LOCALE,
  messages: DEFAULT_MESSAGES,
});

/**
 * Provides the active locale to the tree. Loads the saved preference on mount and
 * follows live changes: settings broadcasts `locale-changed` (the resolved locale)
 * to every window, mirroring how the theme is kept in sync. A language's catalog
 * is fetched when the window first speaks it; the switch happens once it is here.
 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // The language asked for: the saved preference, then whatever a broadcast
  // names — `undefined` until the preference has been read.
  const [asked] = useLiveValue<unknown>(getLocale, "locale-changed", undefined);
  const [language, setLanguage] = useState<Language>({
    locale: DEFAULT_LOCALE,
    messages: DEFAULT_MESSAGES,
  });
  const { locale } = language;

  // Speak it once its catalog is here. A catalog that arrives after a newer
  // request is no longer wanted.
  useEffect(() => {
    let outdated = false;
    void (async () => {
      if (asked === undefined) {
        return;
      }
      // An unknown code has no catalog to load — ignore it.
      const next = LocaleSchema.safeParse(asked);
      if (!next.success) {
        log.warn("ignoring a locale that is not one of ours", next.error);
        return;
      }
      try {
        const messages = await loadMessages(next.data);
        if (!outdated) {
          setLanguage({ locale: next.data, messages });
        }
      } catch (error) {
        log.error(`loading the ${next.data} messages failed`, error);
      }
    })();
    return () => {
      outdated = true;
    };
  }, [asked]);

  // Reflect the locale on the document: assistive tech reads the language,
  // and RTL locales (Arabic, Persian, Hebrew) flip the layout via `dir` —
  // the styles use logical properties, so this one attribute does the work.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);

  return <LanguageContext value={language}>{children}</LanguageContext>;
}

/** The message catalog for the active locale. */
export function useT(): Messages {
  return useContext(LanguageContext).messages;
}

/** The active locale code (e.g. "en", "ja") — for passing to prompt templates. */
export function useLocale(): Locale {
  return useContext(LanguageContext).locale;
}

/**
 * Returns a function that resolves an prompt's display label: a localized
 * override for a pre-installed prompt (keyed by id), else the prompt's own
 * label. Use everywhere a label is shown, so built-ins follow the UI language
 * while user prompts stay verbatim.
 */
export function usePromptLabel(): (id: string, fallback: string) => string {
  const t = useT();
  return (id, fallback) => t.prompts.builtinLabels[id] ?? fallback;
}
