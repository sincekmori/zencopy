import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { useT } from "@/lib/i18n.tsx";
import { createLogger } from "@/lib/log.ts";
import { getUserContext, setUserContext } from "@/lib/settings.ts";
import { useTauriEvent } from "@/lib/use-tauri-event.ts";
import { cn } from "@/lib/utils.ts";

const log = createLogger("user-context");

/** "About you": one free-form multiline self-description, sent with every
 *  prompt run (appended to the instructions, see llm-impl). One field on
 *  purpose — people describe themselves better in their own words than in a
 *  form, and the model reads prose natively. */
/** How long each example persona stays on screen before the next rotates in. */
const PLACEHOLDER_ROTATION_MS = 6000;

export function UserContextSettings(): React.JSX.Element {
  const t = useT();
  const [text, setText] = useState("");
  // Which confirmation the footer shows — saving and clearing each get their
  // own words, so the user knows exactly which prompt just took effect.
  const [confirmation, setConfirmation] = useState<"saved" | "cleared" | undefined>(undefined);

  // The settings window hides on close instead of being destroyed, so state
  // survives — a confirmation left standing would greet the next open.
  useTauriEvent("window-closed", () => {
    setConfirmation(undefined);
  });
  // Which example persona the (empty) field is currently showing.
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getUserContext();
      if (!cancelled) {
        setText(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rotate the example personas while the field is empty (a placeholder is
  // only visible then); pause the timer as soon as the user types.
  const empty = text === "";
  useEffect(() => {
    if (!empty) {
      return;
    }
    const id = setInterval(() => {
      setPlaceholderIndex((index) => index + 1);
    }, PLACEHOLDER_ROTATION_MS);
    return () => {
      clearInterval(id);
    };
  }, [empty]);

  const placeholder =
    t.settings.userContextPlaceholders[
      placeholderIndex % t.settings.userContextPlaceholders.length
    ];

  const save = (): void => {
    void (async () => {
      try {
        await setUserContext(text.trim());
        setConfirmation("saved");
      } catch (error) {
        log.error("saving the user context failed", error);
      }
    })();
  };

  // One gesture wipes both the field and the stored value, confirmed in its
  // own words once the write lands — an emptied field alone leaves the user
  // guessing whether the stored value went with it.
  const clear = (): void => {
    setText("");
    setConfirmation(undefined);
    void (async () => {
      try {
        await setUserContext("");
        setConfirmation("cleared");
      } catch (error) {
        log.error("clearing the user context failed", error);
      }
    })();
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="text-sm font-medium">{t.settings.userContext}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.settings.userContextHint}</p>
      </div>
      {/* The wrapper carries the field's background: the textarea itself is
          transparent so the ghost overlay shows through it. */}
      <div className="relative rounded-md bg-background">
        {/* Ghost-text suggestion, Smart-Compose style: the example renders as
            dimmed text with a Tab keycap right where the text ends — the
            established "press Tab to accept" idiom, no sentence needed. It
            mirrors the textarea's exact metrics (border, padding, type) so a
            multi-line example wraps exactly like real input would. */}
        {empty ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent px-3 py-1.5 text-sm leading-relaxed"
          >
            <span className="text-muted-foreground/60">{placeholder}</span>
            <kbd className="ms-2 inline-flex rounded-md border bg-muted px-1.5 align-middle font-mono text-[10px] font-medium text-muted-foreground">
              Tab
            </kbd>
          </div>
        ) : undefined}
        <textarea
          className={cn(FIELD, "block h-28 resize-none bg-transparent leading-relaxed")}
          value={text}
          onChange={(event) => {
            setConfirmation(undefined);
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            // Tab adopts the example currently on display — only while the
            // field is empty (that's when the ghost text is visible); with
            // text present, Tab keeps its normal focus-move meaning.
            if (event.key === "Tab" && empty && placeholder !== undefined) {
              event.preventDefault();
              setConfirmation(undefined);
              setText(placeholder);
            }
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save}>
          {t.common.save}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={empty}
          onClick={clear}
        >
          {t.settings.userContextClear}
        </Button>
        {confirmation ? (
          <span className="text-xs text-muted-foreground">
            {confirmation === "saved" ? t.common.saved : t.settings.userContextCleared}
          </span>
        ) : undefined}
      </div>
    </section>
  );
}
