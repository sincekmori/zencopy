import { LazyStore } from "@tauri-apps/plugin-store";
import * as z from "zod";
import { createLogger } from "@/lib/log.ts";
import { detectLocale, type Locale, messages } from "@/lib/messages/index.ts";

const log = createLogger("settings");

// Every value read from settings.json goes through a zod schema below. The
// types are inferred from the schemas, so the schema is the single source of
// truth for what a valid stored value is.

/** The screen corner the popup is pinned to. */
const CornerSchema = z.enum(["top-right", "bottom-right", "top-left", "bottom-left"]);
export type Corner = z.infer<typeof CornerSchema>;

export const DEFAULT_CORNER: Corner = "top-right";

/** The color theme. "system" follows the OS appearance. Exported for the
 *  windows that validate the `theme-changed` broadcast at the boundary. */
export const ThemeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const DEFAULT_THEME: Theme = "system";

/** A concrete supported locale — the wire shape of `locale-changed`. */
export const LocaleSchema = z.enum(Object.keys(messages) as Locale[]);

/** The display language. "system" follows the OS/browser locale. The concrete
 *  codes come from `messages`, so a new language is accepted automatically. */
const LocalePreferenceSchema = z.union([z.literal("system"), LocaleSchema]);
export type LocalePreference = z.infer<typeof LocalePreferenceSchema>;

export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = "system";

const STORE_FILE = "settings.json";
const CORNER_KEY = "popupCorner";
const THEME_KEY = "theme";
const LOCALE_KEY = "locale";

// Loaded on first access, then cached for the window's lifetime. A factory
// reset closes the Rust-side resource and reloads every window, so a stale
// cache can never outlive the file it mirrors.
const store = new LazyStore(STORE_FILE, { autoSave: true, defaults: {} });

/** Read one settings value, validated. An unset key is the normal first-run
 *  case; an invalid one (hand-edited or from a future/older version) is warned
 *  about and replaced by the default — the GUI self-heals it on the next set. */
async function readSetting<Schema extends z.ZodType>(
  key: string,
  schema: Schema,
  fallback: z.infer<Schema>,
): Promise<z.infer<Schema>> {
  const value = await store.get(key);
  if (value === undefined) {
    return fallback;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    log.warn(`settings.json: ignoring invalid value for "${key}", using the default`, parsed.error);
    return fallback;
  }
  return parsed.data;
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await store.set(key, value);
}

export function getCorner(): Promise<Corner> {
  return readSetting(CORNER_KEY, CornerSchema, DEFAULT_CORNER);
}

export async function setCorner(corner: Corner): Promise<void> {
  await writeSetting(CORNER_KEY, corner);
}

export function getTheme(): Promise<Theme> {
  return readSetting(THEME_KEY, ThemeSchema, DEFAULT_THEME);
}

export async function setTheme(theme: Theme): Promise<void> {
  await writeSetting(THEME_KEY, theme);
}

/** Resolve a preference (which may be "system") to a concrete locale. */
export function resolveLocale(preference: LocalePreference): Locale {
  return preference === "system" ? detectLocale() : preference;
}

export function getLocalePreference(): Promise<LocalePreference> {
  return readSetting(LOCALE_KEY, LocalePreferenceSchema, DEFAULT_LOCALE_PREFERENCE);
}

/** The concrete locale to render in (preference resolved). */
export async function getLocale(): Promise<Locale> {
  return resolveLocale(await getLocalePreference());
}

export async function setLocalePreference(preference: LocalePreference): Promise<void> {
  await writeSetting(LOCALE_KEY, preference);
}

const DEV_MODE_KEY = "devMode";

/** Developer mode: the popup shows each capture's template variables as JSON,
 *  so action authors can see exactly what their Liquid templates receive. */
export function isDevMode(): Promise<boolean> {
  return readSetting(DEV_MODE_KEY, z.boolean(), false);
}

export async function setDevMode(enabled: boolean): Promise<void> {
  await writeSetting(DEV_MODE_KEY, enabled);
}

const STATS_ENABLED_KEY = "statsEnabled";

/** Whether action invocations are appended to the local usage statistics
 *  (stats/usage.jsonl in the app data dir). On by default: the record is
 *  ids, kinds, and timestamps only, and it never leaves the machine. */
export function isStatsEnabled(): Promise<boolean> {
  return readSetting(STATS_ENABLED_KEY, z.boolean(), true);
}

export async function setStatsEnabled(enabled: boolean): Promise<void> {
  await writeSetting(STATS_ENABLED_KEY, enabled);
}

const CONFIRM_ATTACHMENTS_KEY = "confirmAttachments";

/** Whether the popup asks before sending an image or files to the provider.
 *  On by default: attachments are the captures that can get expensive, so the
 *  first one should never be a surprise. The popup's "don't ask again" writes
 *  false here; the Settings toggle can bring it back any time. */
export function isConfirmAttachments(): Promise<boolean> {
  return readSetting(CONFIRM_ATTACHMENTS_KEY, z.boolean(), true);
}

export async function setConfirmAttachments(enabled: boolean): Promise<void> {
  await writeSetting(CONFIRM_ATTACHMENTS_KEY, enabled);
}

/** The number of popup quick slots — the actions bound to number keys 1–N.
 *  Four matches the pre-installed action count and keeps the popup compact. */
export const QUICK_SLOT_COUNT = 4;

/** The pre-installed actions, in slot order — the zero-config default.
 *  Mirrors DEFAULT_ACTIONS in src-tauri/src/lib.rs (same ids, same order). */
const DEFAULT_QUICK_ACTIONS = [
  "zencopy-zen",
  "zencopy-explain",
  "zencopy-translate",
  "zencopy-polish",
];

const QUICK_ACTIONS_KEY = "quickActions";

/** The action ids bound to the popup's number keys (1–4), in slot order.
 *  Positions are stable so muscle memory holds — the settings editor is the
 *  only thing that reorders them. Stored loosely (any string array) and
 *  normalized to exactly QUICK_SLOT_COUNT ids on read, so a hand-edited or
 *  older file can never desync the row. */
export async function getQuickActions(): Promise<string[]> {
  const stored = await readSetting(QUICK_ACTIONS_KEY, z.array(z.string()), DEFAULT_QUICK_ACTIONS);
  const slots = stored.slice(0, QUICK_SLOT_COUNT);
  // Backfill from the defaults if the stored list is short, skipping ids
  // already present so slots stay duplicate-free.
  for (const id of DEFAULT_QUICK_ACTIONS) {
    if (slots.length >= QUICK_SLOT_COUNT) {
      break;
    }
    if (!slots.includes(id)) {
      slots.push(id);
    }
  }
  return slots.slice(0, QUICK_SLOT_COUNT);
}

export async function setQuickActions(ids: string[]): Promise<void> {
  await writeSetting(QUICK_ACTIONS_KEY, ids.slice(0, QUICK_SLOT_COUNT));
}

const USER_CONTEXT_KEY = "userContext";

/** The user's self-description (one free-form multiline text), appended to
 *  every action run's instructions so results fit who is asking — role,
 *  expertise, taste. Empty means "say nothing about me". */
export function getUserContext(): Promise<string> {
  return readSetting(USER_CONTEXT_KEY, z.string(), "");
}

export async function setUserContext(text: string): Promise<void> {
  await writeSetting(USER_CONTEXT_KEY, text);
}

const WELCOME_KEY = "welcomeSeen";

/** Whether the first-run welcome has been shown (orientation, not consent —
 *  the data-flow disclosure lives next to the AI settings' Save button). */
export function isWelcomeSeen(): Promise<boolean> {
  return readSetting(WELCOME_KEY, z.boolean(), false);
}

export async function markWelcomeSeen(): Promise<void> {
  await writeSetting(WELCOME_KEY, true);
}
