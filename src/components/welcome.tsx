import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { TriggerNotice } from "@/components/trigger-notice.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { WelcomeHero } from "@/components/welcome-hero.tsx";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { useT } from "@/lib/i18n.tsx";
import { createLogger } from "@/lib/log.ts";
import { TRIGGER_KEYS, TRIGGER_MODIFIER } from "@/lib/platform.ts";
import { FREE_KEY_URL, geminiQuickCatalog } from "@/lib/quickstart.ts";

const log = createLogger("welcome");

/** First-run welcome: what ZenCopy does, where copied content goes, and the
 *  shortest possible setup — paste one free Gemini key and go. The key is
 *  optional; an empty field just defers provider setup to the settings. */
export function Welcome({ onStart }: { onStart: () => void }): React.JSX.Element {
  const t = useT();
  const [key, setKey] = useState("");
  const [failed, setFailed] = useState(false);

  // The quick path: save the pasted key as a ready-to-run Gemini catalog.
  // The alternative path (the secondary button) skips straight to the full
  // provider settings — a key is one way in, never a requirement.
  const start = (): void => {
    if (key.trim() === "") {
      return; // the button is disabled; belt and suspenders
    }
    setFailed(false);
    void (async () => {
      try {
        await invoke("write_catalog", { json: geminiQuickCatalog(key) });
        await emit("catalog-changed");
        onStart();
      } catch (error) {
        log.error("quick setup failed", error);
        setFailed(true);
      }
    })();
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ZenCopyMark className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.welcome.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t.settings.tagline(TRIGGER_KEYS)}</p>
        </div>

        {/* The whole app in one loop: select, copy twice, popup — wordless,
            so it needs no translation. */}
        <WelcomeHero modifier={TRIGGER_MODIFIER} />

        <TriggerNotice />

        <div className="flex w-full flex-col gap-1.5 text-start">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="gemini-key">
            {t.welcome.keyLabel}
          </label>
          <input
            id="gemini-key"
            className={FIELD}
            type="password"
            placeholder="AIza…"
            value={key}
            onChange={(event) => {
              setFailed(false);
              setKey(event.target.value);
            }}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t.welcome.keyHint}{" "}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                void invoke("open_url", { url: FREE_KEY_URL });
              }}
            >
              aistudio.google.com
              <ExternalLink className="size-3" />
            </button>
          </p>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{t.ai.disclosure}</p>
        <div className="flex flex-col items-center gap-2">
          <Button disabled={key.trim() === ""} onClick={start}>
            {t.welcome.start}
          </Button>
          {/* The equal alternative, not fine print: opens the full provider
              settings (OpenAI, Anthropic, local models, …) — no key needed. */}
          <Button variant="ghost" className="text-muted-foreground" onClick={onStart}>
            {t.welcome.otherSetup}
          </Button>
          {failed ? <p className="text-xs text-destructive">{t.ai.saveFailed}</p> : undefined}
        </div>
      </div>
    </main>
  );
}
