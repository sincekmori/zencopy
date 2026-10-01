import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { TriggerNotice } from "@/components/trigger-notice.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { WelcomeHero } from "@/components/welcome-hero.tsx";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { type CatalogProblem, catalogProblemText, editCatalog } from "@/lib/catalog-file.ts";
import { useT } from "@/lib/i18n.tsx";
import { testConnection } from "@/lib/llm.ts";
import { createLogger } from "@/lib/log.ts";
import { TRIGGER_KEYS, TRIGGER_MODIFIER } from "@/lib/platform.ts";
import { FREE_KEY_URL, withGeminiKey } from "@/lib/quickstart.ts";
import { cn } from "@/lib/utils.ts";

const log = createLogger("welcome");

/** First-run welcome: what ZenCopy does, where copied content goes, and the
 *  shortest possible setup — paste one free Gemini key and go. The key is
 *  optional; an empty field just defers provider setup to the settings. */
export function Welcome({ onStart }: { onStart: () => void }): React.JSX.Element {
  const t = useT();
  const [key, setKey] = useState("");
  // The one round trip between click and start: the pasted key is pinged for
  // real before the welcome closes. Failures split by what the fix is — the
  // save was refused (and why), or "test": the key (or the network) doesn't
  // work and the field lights up red.
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState<CatalogProblem | "test" | undefined>(undefined);

  // The quick path: save the pasted key as a ready-to-run Gemini setup — into
  // the config already there, when a reinstall finds one, so nothing in it is
  // lost (one the app cannot run is left as it is and said to be invalid:
  // the full settings show it) — then prove it works with one live ping: an
  // invalid key must fail HERE, with the field in sight, not later as a
  // broken first copy. The alternative path (the secondary button) skips
  // straight to the full provider settings — a key is one way in, never a
  // requirement.
  const start = (): void => {
    if (key.trim() === "" || checking) {
      return; // the button is disabled; belt and suspenders
    }
    setFailed(undefined);
    setChecking(true);
    void (async () => {
      const saved = await editCatalog((config) => withGeminiKey(config, key));
      if (saved.problem) {
        setChecking(false);
        setFailed(saved.problem);
        return;
      }
      try {
        await testConnection();
      } catch (error) {
        log.error("welcome key test failed", error);
        setChecking(false);
        setFailed("test");
        return;
      }
      onStart();
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
            className={cn(FIELD, failed === "test" && "border-destructive")}
            type="password"
            value={key}
            onChange={(event) => {
              setFailed(undefined);
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
          {/* While checking, the label goes invisible (not away) and the
              spinner overlays its center — the button keeps its exact size. */}
          <Button className="relative" disabled={key.trim() === "" || checking} onClick={start}>
            <span className={cn(checking && "invisible")}>{t.welcome.start}</span>
            {checking && <LoaderCircle className="absolute inset-0 m-auto size-4 animate-spin" />}
          </Button>
          {/* The equal alternative, not fine print: opens the full provider
              settings (OpenAI, Anthropic, local models, …) — no key needed. */}
          <Button variant="ghost" className="text-muted-foreground" onClick={onStart}>
            {t.welcome.otherSetup}
          </Button>
          {failed === undefined ? undefined : (
            <p className="text-xs text-destructive">
              {failed === "test" ? t.ai.testUnreachable : catalogProblemText(t, failed)}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
