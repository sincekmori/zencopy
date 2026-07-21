import { invoke } from "@tauri-apps/api/core";
import { Download, ExternalLink, LoaderCircle } from "lucide-react";
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
  copyright: z.string(),
});
type AppInfo = z.infer<typeof AppInfoSchema>;

function openHomepage(): void {
  void invoke("open_url", { url: "https://zencopy.app" });
}

function openRepo(): void {
  void invoke("open_url", { url: "https://github.com/sincekmori/zencopy" });
}

export function About(): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const [info, setInfo] = useState<AppInfo | undefined>(undefined);
  // This window exists from launch (hidden), so it hosts the update manager;
  // the button surfaces only when there is something to offer.
  const { update, install } = useUpdateManager();

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

  let updateButton: React.JSX.Element | undefined;
  if (update.phase !== "none") {
    let label: string;
    if (update.phase === "installing") {
      label = t.about.updating;
    } else if (update.phase === "ready") {
      label = t.about.updateRestart(update.version);
    } else {
      label = t.about.update(update.version);
    }
    updateButton = (
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
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-8 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
        <ZenCopyMark className="size-8" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">{info?.name ?? "ZenCopy"}</h1>
        <p className="text-sm text-muted-foreground">
          {t.about.version} {info?.version ?? ""}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{t.about.tagline}</p>
      {updateButton}
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button variant="link" size="sm" className="text-muted-foreground" onClick={openHomepage}>
          <ExternalLink className="size-3.5" />
          zencopy.app
        </Button>
        <Button variant="link" size="sm" className="text-muted-foreground" onClick={openRepo}>
          <ExternalLink className="size-3.5" />
          GitHub
        </Button>
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            openSitePage("privacy");
          }}
        >
          <ExternalLink className="size-3.5" />
          {t.about.privacy}
        </Button>
        <Button
          variant="link"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            openSitePage("terms");
          }}
        >
          <ExternalLink className="size-3.5" />
          {t.about.terms}
        </Button>
      </div>
      {info?.copyright ? (
        <p className="mt-2 text-[11px] text-muted-foreground/80">{info.copyright}</p>
      ) : undefined}
    </main>
  );
}
