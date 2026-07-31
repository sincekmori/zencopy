import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import * as z from "zod";
import { Button } from "@/components/ui/button.tsx";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { useLocale, useT } from "@/lib/i18n.tsx";
import { createLogger } from "@/lib/log.ts";
import { siteUrl } from "@/lib/site.ts";
import { useUpdateManager } from "@/lib/updater.ts";

const log = createLogger("about");

const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  os: z.string(),
  copyright: z.string(),
});
type AppInfo = z.infer<typeof AppInfoSchema>;

function openHomepage(): void {
  void invoke("open_url", { url: "https://zencopy.app" });
}

function openRepo(): void {
  void invoke("open_url", { url: "https://github.com/sincekmori/zencopy" });
}

// Quiet footer links: no button chrome, no icons — the whole row reads as
// one line of small print, which is what these links are.
function footerLink(label: string, action: () => void): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={action}
      className="rounded-sm px-0.5 underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {label}
    </button>
  );
}

const DOT = (
  <span aria-hidden="true" className="text-muted-foreground/40">
    ·
  </span>
);

export function About(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [info, setInfo] = useState<AppInfo | undefined>(undefined);
  // This window exists from launch (hidden), so it hosts the update manager.
  const { update, checkStatus, install, check } = useUpdateManager();

  // Opening (or returning to) About asks "is there an update?" — the window
  // only gains focus when the user summons it, so a focus-driven check acts
  // as check-on-open without re-checking while hidden.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) {
          check();
        }
      });
      if (cancelled) {
        un();
      } else {
        unlisten = un;
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [check]);

  const openSitePage = (path: string): void => {
    void invoke("open_url", { url: siteUrl(locale, `${path}/`) });
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = await invoke<AppInfo>("app_info");
      const parsed = AppInfoSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn("app_info returned an unexpected shape; using it as-is", parsed.error);
      }
      if (!cancelled) {
        setInfo(parsed.success ? parsed.data : raw);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One row answers "is there an update?": the install button when one is on
  // offer, otherwise the current check state (checking → up to date / retry).
  let updateRow: React.JSX.Element;
  if (update.phase !== "none") {
    let label: string;
    if (update.phase === "installing") {
      label = t.about.updating;
    } else if (update.phase === "ready") {
      label = t.about.updateRestart(update.version);
    } else {
      label = t.about.update(update.version);
    }
    updateRow = (
      <Button
        size="sm"
        variant="outline"
        disabled={update.phase === "installing"}
        onClick={install}
      >
        {update.phase === "installing" ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        {label}
      </Button>
    );
  } else if (checkStatus === "checking") {
    updateRow = (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {t.about.checkingUpdates}
      </p>
    );
  } else if (checkStatus === "upToDate") {
    updateRow = (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" />
        {t.about.upToDate}
      </p>
    );
  } else {
    // idle (first paint before any check settles) or a failed check: both
    // resolve to the manual button, failure adds the reason above it.
    updateRow = (
      <div className="flex flex-col items-center gap-1.5">
        {checkStatus === "failed" ? (
          <p className="text-xs text-muted-foreground">{t.about.updateCheckFailed}</p>
        ) : undefined}
        <Button size="sm" variant="outline" onClick={check}>
          <RefreshCw className="size-3.5" />
          {t.about.checkUpdates}
        </Button>
      </div>
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-8 pt-10 pb-5 text-center">
      {/* Hero: identity and the one dynamic element (the update row), centered
          in the remaining space so the window reads as a single calm card. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
          <ZenCopyMark className="size-8" />
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">{info?.name ?? "ZenCopy"}</h1>
          {info ? (
            <p className="font-mono text-xs text-muted-foreground">v{info.version}</p>
          ) : undefined}
        </div>
        <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">{t.about.tagline}</p>
        {updateRow}
      </div>

      {/* Five links don't fit one 360px row in every language, so the nav
          wraps — but only between items: each link rides in a no-wrap span
          with its trailing dot, so labels never break mid-word (プライバ/シー)
          and a wrapped line never starts with an orphaned separator. */}
      <footer className="flex flex-col items-center gap-2">
        <nav className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {(
            [
              ["zencopy.app", openHomepage],
              ["GitHub", openRepo],
              // Support flow: "open About, click Logs, send me the newest
              // file" — opens the log folder in the system file browser.
              [
                t.about.logs,
                () => {
                  void invoke("open_log_dir");
                },
              ],
              [
                t.about.support,
                () => {
                  // Carry the two facts every support mail needs; the page's
                  // mailto folds them into the subject (see SupportEmail.astro).
                  const query = info
                    ? `?app_version=${encodeURIComponent(info.version)}&os=${encodeURIComponent(info.os)}&locale=${encodeURIComponent(locale)}`
                    : "";
                  void invoke("open_url", { url: siteUrl(locale, "support/") + query });
                },
              ],
              [
                t.about.privacy,
                () => {
                  openSitePage("privacy");
                },
              ],
              [
                t.about.terms,
                () => {
                  openSitePage("terms");
                },
              ],
            ] as const
          ).map(([label, action], index, links) => (
            <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
              {footerLink(label, action)}
              {index < links.length - 1 ? DOT : undefined}
            </span>
          ))}
        </nav>
        {info?.copyright ? (
          <p className="text-[11px] text-muted-foreground/70">{info.copyright}</p>
        ) : undefined}
      </footer>
    </main>
  );
}
