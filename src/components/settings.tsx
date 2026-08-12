import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState, useMemo } from "react";
import { PromptsSettings } from "@/components/prompts-settings.tsx";
import { AiSettings } from "@/components/ai-settings.tsx";
import { TriggerNotice } from "@/components/trigger-notice.tsx";
import { UserContextSettings } from "@/components/user-context-settings.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { SegmentedControl } from "@/components/ui/segmented-control.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ConfirmDialog } from "@/components/ui/alert-dialog.tsx";
import { Welcome } from "@/components/welcome.tsx";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { useT } from "@/lib/i18n.tsx";
import { createLogger, errorMessage } from "@/lib/log.ts";
import { eventMonth, runCost, type UsageEvent } from "@/lib/costs.ts";
import { modelCosts } from "@/lib/llm.ts";
import { LOCALES } from "@/lib/messages/index.ts";
import {
  type Corner,
  DEFAULT_CORNER,
  DEFAULT_LOCALE_PREFERENCE,
  DEFAULT_TEXT_SIZE,
  DEFAULT_THEME,
  getCorner,
  getLocalePreference,
  getTextSize,
  getTheme,
  getCostLimit,
  isConfirmAttachments,
  isDevMode,
  isPopupCostShown,
  isStatsEnabled,
  isWelcomeSeen,
  setCostLimit as saveCostLimit,
  setPopupCostShown as savePopupCostShown,
  type LocalePreference,
  markWelcomeSeen,
  resolveLocale,
  setConfirmAttachments as saveConfirmSend,
  setCorner as saveCorner,
  setDevMode as saveDevMode,
  setStatsEnabled as saveStatsEnabled,
  setLocalePreference as saveLocale,
  setTextSize as saveTextSize,
  setTheme as saveTheme,
  type TextSize,
  type Theme,
} from "@/lib/settings.ts";
import { TRIGGER_KEYS } from "@/lib/platform.ts";
import { applyTextSize } from "@/lib/text-size.ts";
import { applyTheme } from "@/lib/theme.ts";
import { cn } from "@/lib/utils.ts";
import { useTauriEvent } from "@/lib/use-tauri-event.ts";

const log = createLogger("settings");

// Each corner positioned on a mini "screen", so the picker is spatial, not a list.
const CORNER_POSITION: Record<Corner, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

/** Fold one priced run into its month × model row. */
function addToGroup(
  groups: Map<string, { month: string; model: string; cost: number }>,
  row: { month: string; model: string },
  cost: number,
): void {
  const key = `${row.month}\u0000${row.model}`;
  const group = groups.get(key) ?? { ...row, cost: 0 };
  group.cost += cost;
  groups.set(key, group);
}

/** RFC 4180 quoting, only when the value needs it. */
function csvCell(value: string): string {
  return /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function Settings(): React.JSX.Element {
  const t = useT();
  const [corner, setCorner] = useState<Corner>(DEFAULT_CORNER);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [textSize, setTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const [language, setLanguage] = useState<LocalePreference>(DEFAULT_LOCALE_PREFERENCE);
  // Autostart state lives in the OS (login item / Run key), so it's the source of
  // truth — we just mirror it here rather than persisting our own copy.
  const [autostart, setAutostart] = useState(false);
  const [devMode, setDevMode] = useState(false);
  // Ask before an image/files capture is sent to the provider.
  const [confirmSend, setConfirmSend] = useState(true);
  // First-run welcome: undefined while loading, then seen? — shown once.
  const [welcomed, setWelcomed] = useState<boolean | undefined>(undefined);
  // Factory reset: the destructive path asks first in a modal dialog.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statsOn, setStatsOn] = useState(true);
  // Turning statistics OFF asks first: the record is local-only and purely
  // the user's own, so the dialog's job is "you don't have to".
  const [confirmingStatsOff, setConfirmingStatsOff] = useState(false);
  // The popup's live month-cost readout (off by default) and the monthly cap
  // (the input holds the raw text; empty = no cap). Both need the ledger, so
  // both are disabled while statistics are off.
  const [popupCost, setPopupCost] = useState(false);
  const [costLimitText, setCostLimitText] = useState("");
  // The quiet stats-reset link's dialog, and its transient "done".
  const [confirmingStatsReset, setConfirmingStatsReset] = useState(false);
  const [statsResetDone, setStatsResetDone] = useState(false);
  // The CSV export's inline complaint: models it could not price, or the
  // nothing-recorded notice. Cleared on the next attempt.
  const [exportIssue, setExportIssue] = useState<"empty" | string[] | undefined>(undefined);
  const [resetError, setResetError] = useState<string | undefined>(undefined);
  // The window's tab. AI first: it's the one thing that must be set up.
  const [tab, setTab] = useState<"ai" | "prompts" | "general">("ai");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [
        savedCorner,
        savedTheme,
        savedTextSize,
        savedLocale,
        autostartOn,
        welcomeSeen,
        devModeOn,
        confirmOn,
        statsEnabled,
        popupCostOn,
        costLimit,
      ] = await Promise.all([
        getCorner(),
        getTheme(),
        getTextSize(),
        getLocalePreference(),
        isEnabled(),
        isWelcomeSeen(),
        isDevMode(),
        isConfirmAttachments(),
        isStatsEnabled(),
        isPopupCostShown(),
        getCostLimit(),
      ]);
      if (!cancelled) {
        setCorner(savedCorner);
        setTheme(savedTheme);
        setTextSize(savedTextSize);
        setLanguage(savedLocale);
        setAutostart(autostartOn);
        setWelcomed(welcomeSeen);
        setDevMode(devModeOn);
        setConfirmSend(confirmOn);
        setStatsOn(statsEnabled);
        setPopupCost(popupCostOn);
        setCostLimitText(costLimit === 0 ? "" : String(costLimit));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The popup's "don't ask again" writes the same preference — mirror it live
  // so this window never shows a stale toggle.
  useTauriEvent<boolean>("confirm-attachments-changed", setConfirmSend);

  const changeCorner = (value: Corner): void => {
    setCorner(value);
    void saveCorner(value);
  };

  const changeTheme = (value: Theme): void => {
    setTheme(value);
    void saveTheme(value);
    applyTheme(value); // instant in this window
    void emit("theme-changed", value); // live-update the other windows (popup)
  };

  const changeTextSize = (value: TextSize): void => {
    setTextSize(value);
    void saveTextSize(value);
    applyTextSize(value); // instant in this window
    // Live-update the other windows — and Rust: the payload drives the
    // popup's re-fit (follow_text_size in windows.rs), which reads it
    // precisely because the store write above may still be in flight.
    void emit("text-size-changed", value);
  };

  const changeLanguage = (value: LocalePreference): void => {
    setLanguage(value);
    void saveLocale(value);
    void emit("locale-changed", resolveLocale(value)); // live-update every window
  };

  const toggleDevMode = (next: boolean): void => {
    setDevMode(next);
    void saveDevMode(next);
    void emit("dev-mode-changed", next); // live-update the popup
  };

  const applyStats = (next: boolean): void => {
    setStatsOn(next);
    void saveStatsEnabled(next);
    void emit("stats-enabled-changed", next); // live-update the popup
  };

  // ON applies directly; OFF asks first — the record never leaves the device
  // and exists only for the user, so the dialog says "you don't have to".
  const toggleStats = (next: boolean): void => {
    if (next) {
      applyStats(true);
    } else {
      setConfirmingStatsOff(true);
    }
  };

  const togglePopupCost = (next: boolean): void => {
    setPopupCost(next);
    void savePopupCostShown(next);
    void emit("popup-cost-changed", next); // live-update the popup
  };

  // The cap input: digits and one dot only, persisted as it settles. An
  // empty (or unparsable) value stores the 0 sentinel: no cap.
  const changeCostLimit = (raw: string): void => {
    const text = raw.replaceAll(/[^0-9.]/gu, "").replaceAll(/\.(?=.*\.)/gu, "");
    setCostLimitText(text);
    const value = Number(text);
    const limit = text !== "" && Number.isFinite(value) && value > 0 ? value : 0;
    void saveCostLimit(limit);
    void emit("cost-limit-changed", limit); // live-update the popup
  };

  const resetStats = (): void => {
    setConfirmingStatsReset(false);
    setExportIssue(undefined); // its data just went away

    void (async () => {
      try {
        await invoke("reset_usage_stats");
        setStatsResetDone(true);
        setTimeout(() => {
          setStatsResetDone(false);
        }, 2500);
      } catch (error) {
        log.error("resetting usage statistics failed", error);
      }
    })();
  };

  // Download the all-time cost table as CSV: one row per month × model, cost
  // in plain USD decimals. Models the catalog can't price block the export
  // and are named inline — that hole has a fix (a cost block in the config),
  // and a report with silent holes would read as cheaper than reality. A
  // completed run whose provider reported no usage (the schema allows absent
  // tokens) must not block forever — nothing can ever supply the counts — so
  // it stays in its model's row, contributing the tokens it reported: none.
  const exportCosts = (): void => {
    setExportIssue(undefined);
    void (async () => {
      try {
        const [events, prices] = await Promise.all([
          invoke<UsageEvent[]>("read_usage_stats"),
          modelCosts(),
        ]);
        if (events.length === 0) {
          setExportIssue("empty");
          return;
        }
        const groups = new Map<string, { month: string; model: string; cost: number }>();
        const unpriced = new Set<string>();
        for (const event of events) {
          const month = eventMonth(event);
          if (month) {
            const model = event.model ?? "?";
            const price = event.model === undefined ? undefined : prices[event.model];
            if (price) {
              addToGroup(groups, { month, model }, event.tokens ? runCost(event.tokens, price) : 0);
            } else {
              unpriced.add(model);
            }
          }
        }
        if (unpriced.size > 0) {
          setExportIssue([...unpriced].toSorted());
          return;
        }
        const lines = [...groups.values()]
          .toSorted((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
          .map((group) => `${group.month},${csvCell(group.model)},${group.cost.toFixed(6)}`);
        const csv = ["month,model,cost_usd", ...lines, ""].join("\n");
        await invoke("export_usage_csv", { csv });
      } catch (error) {
        log.error("exporting the cost CSV failed", error);
      }
    })();
  };

  // What the export has to say, if anything: nothing recorded yet (calm), or
  // the models it cannot price (an error, with the fix one click away).
  let exportIssueRow: React.JSX.Element | undefined;
  if (exportIssue === "empty") {
    exportIssueRow = <p className="text-xs text-muted-foreground">{t.settings.costsEmpty}</p>;
  } else if (exportIssue) {
    exportIssueRow = (
      <p className="text-xs text-destructive">
        {t.settings.costsError(exportIssue.join(", "))}{" "}
        <button
          type="button"
          className="font-mono underline underline-offset-2"
          onClick={() => {
            void invoke("open_catalog_file");
          }}
        >
          ai-sdk-catalog.json
        </button>
      </p>
    );
  }

  // The reset link's two faces: idle link and transient done; the question
  // itself lives in a dialog (ConfirmDialog at the bottom of the window).
  const statsResetRow: React.JSX.Element = statsResetDone ? (
    <span>{t.settings.statsResetDone}</span>
  ) : (
    <button
      type="button"
      className="underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => {
        setConfirmingStatsReset(true);
      }}
    >
      {t.settings.statsReset}
    </button>
  );

  const toggleConfirmSend = (next: boolean): void => {
    setConfirmSend(next);
    void saveConfirmSend(next);
    void emit("confirm-attachments-changed", next); // live-update the popup
  };

  // Factory reset: Rust deletes every per-user file and reloads every window
  // in place (no relaunch — see reset_all_settings for why). This window
  // comes back as the first-run welcome; `resetting` just keeps the buttons
  // disabled until the reload lands.
  const resetAll = (): void => {
    setResetError(undefined);
    setResetting(true);
    void (async () => {
      try {
        // Launch-at-login lives in the OS, not in a file — reset it too.
        await disable().catch(() => undefined);
        await invoke("reset_all_settings");
      } catch (error) {
        log.error("factory reset failed", error);
        setResetError(t.prompts.failed(errorMessage(error).slice(0, 200)));
        setResetting(false);
        setConfirmingReset(false); // the error shows in the section below
      }
    })();
  };

  const toggleAutostart = (next: boolean): void => {
    setAutostart(next); // optimistic
    void (async () => {
      try {
        await (next ? enable() : disable());
      } catch (error) {
        setAutostart(!next); // revert if the OS rejected it
        log.error("autostart toggle failed", error);
      }
    })();
  };

  // The three arrays handed to SegmentedControl are memoized because
  // react-perf/jsx-no-new-array-as-prop can't see the compiler doing the
  // same thing; the inline-mapped arrays below (corners, languages) are not
  // props and stay plain.
  const tabs = useMemo(
    (): { value: "ai" | "prompts" | "general"; label: string }[] => [
      { value: "ai", label: t.ai.title },
      { value: "prompts", label: t.prompts.title },
      { value: "general", label: t.settings.tabGeneral },
    ],
    [t],
  );

  const corners: { value: Corner; label: string }[] = [
    { value: "top-left", label: t.settings.cornerTopLeft },
    { value: "top-right", label: t.settings.cornerTopRight },
    { value: "bottom-left", label: t.settings.cornerBottomLeft },
    { value: "bottom-right", label: t.settings.cornerBottomRight },
  ];
  const themes = useMemo(
    (): { value: Theme; label: string }[] => [
      { value: "system", label: t.settings.optionSystem },
      { value: "light", label: t.settings.optionLight },
      { value: "dark", label: t.settings.optionDark },
    ],
    [t],
  );
  const textSizes = useMemo(
    (): { value: TextSize; label: string }[] => [
      { value: "small", label: t.settings.textSizeSmall },
      { value: "standard", label: t.settings.textSizeStandard },
      { value: "large", label: t.settings.textSizeLarge },
    ],
    [t],
  );
  const languages: { value: LocalePreference; label: string }[] = [
    { value: "system", label: t.settings.optionSystem },
    ...LOCALES.map((locale) => ({ value: locale.value, label: locale.label })),
  ];

  if (welcomed === undefined) {
    return <main className="min-h-svh bg-background" />;
  }
  if (!welcomed) {
    return (
      <Welcome
        onStart={() => {
          setWelcomed(true);
          void markWelcomeSeen();
        }}
      />
    );
  }

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-xl flex-col gap-8 px-8 py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ZenCopyMark className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t.settings.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t.settings.tagline(TRIGGER_KEYS)}</p>
          </div>
        </header>

        {/* Above the tabs, so a dormant trigger (Linux: relogin pending or an
            unsupported compositor) is visible no matter which tab is open. */}
        <TriggerNotice />

        {/* Tabs keep the window calm as sections grow. Panels hide instead of
            unmounting, so unsaved edits (the AI JSON, an prompt draft) survive
            a tab switch. */}
        <nav className="flex justify-center">
          <SegmentedControl value={tab} options={tabs} onChange={setTab} />
        </nav>

        <div className={cn("flex-col gap-8", tab === "ai" ? "flex" : "hidden")}>
          <AiSettings />
          <UserContextSettings />
        </div>

        <div className={cn("flex-col gap-8", tab === "prompts" ? "flex" : "hidden")}>
          <PromptsSettings />
        </div>

        <div className={cn("flex-col gap-8", tab === "general" ? "flex" : "hidden")}>
          {/* Section order: descending by how likely a user is to act on it
              early on; the destructive reset dead last. */}
          <section className="flex flex-col gap-5 rounded-xl border bg-card p-6">
            <div>
              <h2 className="text-sm font-medium">{t.settings.position}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.positionHint}</p>
            </div>
            <div className="flex justify-center">
              <div className="relative aspect-16/10 w-72 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30">
                {corners.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    onClick={() => {
                      changeCorner(option.value);
                    }}
                    className={cn(
                      "absolute flex size-12 items-center justify-center rounded-md border text-xs font-medium transition-colors",
                      CORNER_POSITION[option.value],
                      corner === option.value
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-xl border bg-card p-6">
            <div>
              <h2 className="text-sm font-medium">{t.settings.startup}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.startupHint}</p>
            </div>
            <Switch
              checked={autostart}
              onCheckedChange={toggleAutostart}
              aria-label={t.settings.startup}
            />
          </section>

          <section className="flex items-center justify-between gap-4 rounded-xl border bg-card p-6">
            <div>
              <h2 className="text-sm font-medium">{t.settings.devMode}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.devModeHint}</p>
            </div>
            <Switch
              checked={devMode}
              onCheckedChange={toggleDevMode}
              aria-label={t.settings.devMode}
            />
          </section>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">{t.settings.stats}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.statsHint}</p>
              </div>
              <Switch
                checked={statsOn}
                onCheckedChange={toggleStats}
                aria-label={t.settings.stats}
              />
            </div>
            {/* Deliberately quiet utilities (small print, gray): the record is
                a background fact, not a feature to advertise. Reset asks in
                the shared confirm dialog below. */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
                onClick={exportCosts}
              >
                {t.settings.costsExport}
              </button>
              <button
                type="button"
                className="underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  void invoke("open_stats_dir");
                }}
              >
                {t.settings.statsOpen}
              </button>
              {statsResetRow}
            </div>
            {exportIssueRow}
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div>
                <h3 className="text-sm font-medium">{t.settings.popupCost}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.popupCostHint}</p>
              </div>
              <Switch
                checked={popupCost && statsOn}
                disabled={!statsOn}
                onCheckedChange={togglePopupCost}
                aria-label={t.settings.popupCost}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">{t.settings.costLimit}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.costLimitHint}</p>
              </div>
              <input
                className={cn(FIELD, "w-24 text-end tabular-nums")}
                inputMode="decimal"
                disabled={!statsOn}
                value={costLimitText}
                aria-label={t.settings.costLimit}
                onChange={(event) => {
                  changeCostLimit(event.target.value);
                }}
              />
            </div>
            {/* The honesty footnote: everything above is an estimate. */}
            <p className="text-xs text-muted-foreground">{t.settings.costsApproxHint}</p>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-xl border bg-card p-6">
            <div>
              <h2 className="text-sm font-medium">{t.settings.confirmSend}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t.settings.confirmSendHint}</p>
            </div>
            <Switch
              checked={confirmSend}
              onCheckedChange={toggleConfirmSend}
              aria-label={t.settings.confirmSend}
            />
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <h2 className="text-sm font-medium">{t.settings.textSize}</h2>
            <SegmentedControl
              value={textSize}
              options={textSizes}
              onChange={changeTextSize}
              className="w-fit"
            />
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <h2 className="text-sm font-medium">{t.settings.theme}</h2>
            <SegmentedControl
              value={theme}
              options={themes}
              onChange={changeTheme}
              className="w-fit"
            />
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <h2 className="text-sm font-medium">
              <label htmlFor="language-select">{t.settings.language}</label>
            </h2>
            <Select
              className="w-48"
              id="language-select"
              value={language}
              onChange={(event) => {
                changeLanguage(event.target.value as LocalePreference);
              }}
            >
              {languages.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">{t.settings.resetTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t.settings.resetHint}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={
                  // Not redundant: the outline variant's own
                  // hover:text-accent-foreground would recolor the label on
                  // hover — this override (resolved by twMerge) keeps it
                  // destructive. The linter sees this string in isolation.
                  // oxlint-disable-next-line tailwindcss/no-contradicting-variants
                  "shrink-0 text-destructive hover:text-destructive"
                }
                onClick={() => {
                  setResetError(undefined);
                  setConfirmingReset(true);
                }}
              >
                {t.settings.resetButton}
              </Button>
            </div>
            {resetError ? <p className="text-xs text-destructive">{resetError}</p> : undefined}
          </section>
        </div>
      </div>

      {/* The consequential choices ask in a modal, one register for all
          three: turning statistics off (a "you don't have to" — the record is
          local-only and purely the user's own), wiping the statistics, and
          the factory reset. */}
      <ConfirmDialog
        open={confirmingStatsOff}
        title={t.settings.statsOffTitle}
        description={t.settings.statsOffBody}
        confirmLabel={t.settings.statsOffConfirm}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          setConfirmingStatsOff(false);
          applyStats(false);
        }}
        onCancel={() => {
          setConfirmingStatsOff(false);
        }}
      />
      <ConfirmDialog
        open={confirmingStatsReset}
        title={t.settings.statsReset}
        description={t.settings.statsResetConfirm}
        confirmLabel={t.settings.statsReset}
        cancelLabel={t.common.cancel}
        destructive
        onConfirm={resetStats}
        onCancel={() => {
          setConfirmingStatsReset(false);
        }}
      />
      <ConfirmDialog
        open={confirmingReset}
        title={t.settings.resetButton}
        description={t.settings.resetWarning}
        confirmLabel={t.settings.resetConfirm}
        cancelLabel={t.common.cancel}
        destructive
        busy={resetting}
        onConfirm={resetAll}
        onCancel={() => {
          setConfirmingReset(false);
        }}
      />
    </main>
  );
}
