import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Check,
  Copy,
  ExternalLink,
  LayoutGrid,
  LoaderCircle,
  RotateCcw,
  Settings,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Markdown } from "@/components/markdown.tsx";
import { SourceView } from "@/components/source-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FIELD } from "@/components/ui/field.ts";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { type PromptInfo, listPrompts } from "@/lib/prompts.ts";
import {
  ATTACHMENT_TOO_LARGE,
  buildAttachments,
  type CapturePayload,
  CapturePayloadSchema,
  FILE_UNREADABLE_PREFIX,
  MAX_ATTACHMENT_MB,
  sourceSignature,
  UNSUPPORTED_FILE_PREFIX,
} from "@/lib/capture.ts";
import { formatUsd, monthCostUsd } from "@/lib/costs.ts";
import { usePromptLabel, useLocale, useT } from "@/lib/i18n.tsx";
import { createLogger, errorMessage } from "@/lib/log.ts";
import {
  type Exchange,
  EMPTY_RESULT,
  INVALID_CONFIG,
  NOT_CONFIGURED,
  streamPrompt,
  type StreamOutcome,
  TIMED_OUT,
  warmUp,
} from "@/lib/llm.ts";
import { TRIGGER_MODIFIER } from "@/lib/platform.ts";
import {
  getCostLimit,
  getQuickPrompts,
  isConfirmAttachments,
  isDevMode,
  isPopupCostShown,
  isStatsEnabled,
  setConfirmAttachments,
} from "@/lib/settings.ts";
import { cn } from "@/lib/utils.ts";
import { siteUrl } from "@/lib/site.ts";
import { useUpdateVersion } from "@/lib/updater.ts";
import { useLiveValue, useTauriEvent } from "@/lib/use-tauri-event.ts";
import { screenshotScenario } from "@/lib/screenshot.ts";
import { POPUP_RESULT_SCENARIO } from "@/lib/screenshot-scenarios.ts";

type Result =
  // The last turn streams; completed turns before it are settled.
  | { phase: "running"; turns: Exchange[] }
  // `setup` marks "no provider configured yet": guidance, not an error — the
  // popup stays calm and offers a way into settings instead of red text.
  | { phase: "done"; turns: Exchange[]; ok: boolean; setup?: boolean };

/** A single keycap, e.g. ⌘ or C. */
function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border bg-muted px-2 py-1 font-mono text-xs font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

const log = createLogger("popup");

function openSettings(): void {
  void invoke("open_settings");
}

function hidePopup(): void {
  void (async () => {
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      log.error("popup hide failed", error);
    }
  })();
}

// Hidden from the developer-mode JSON: the source view already shows them.
const VISIBLE_ELSEWHERE = new Set(["text", "markup"]);

/** The quiet small-icon affordance (per-turn Copy/Retry, the composer's
 *  Stop): a size quieter than the text until the pointer or focus reaches it. */
const QUIET_ICON =
  "size-5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground";

/** Grow the composer textarea with its content (capped by its max-h class). */
function growComposer(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

/** One turn of a thread. Its own component so the compiler's memoization
 *  works per turn: settled turns keep their rendered Markdown while the last
 *  one streams (inside a `.map`, the compiler cannot cache per item). */
function Turn({
  turn,
  failed,
  setup,
  copyable,
  onRetry,
  imageHost,
}: {
  turn: Exchange;
  failed: boolean;
  setup: boolean;
  /** Whether this reply is settled output worth a copy affordance. */
  copyable: boolean;
  /** Re-run this reply's request, rewinding the thread to this turn. */
  onRetry?: (() => void) | undefined;
  imageHost: string | undefined;
}): React.JSX.Element {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void (async () => {
      try {
        await writeText(turn.text);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1500);
      } catch (error) {
        log.error("clipboard write failed", error);
      }
    })();
  };
  return (
    <div className="flex flex-col gap-2">
      {turn.question === undefined ? undefined : (
        <p className="border-s-2 ps-2 text-xs wrap-break-word whitespace-pre-wrap text-muted-foreground">
          {turn.question}
        </p>
      )}
      {turn.text &&
        (failed || setup ? (
          <p
            className={cn(
              "text-sm wrap-break-word whitespace-pre-wrap",
              failed && "text-destructive",
              setup && "text-muted-foreground",
            )}
          >
            {turn.text}
          </p>
        ) : (
          <Markdown text={turn.text} imageHost={imageHost} />
        ))}
      {/* The reply's own prompt row, start-aligned — the convention every AI
          chat converged on. Always visible but a size quieter than the text;
          Retry rewinds the conversation to this reply and runs it again. */}
      {(copyable || onRetry !== undefined) && (
        <div className="flex items-center gap-1">
          {copyable && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copy}
              aria-label={copied ? t.popup.copied : t.popup.copy}
              title={t.popup.copy}
              className={QUIET_ICON}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          )}
          {onRetry !== undefined && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onRetry}
              aria-label={t.popup.retry}
              title={t.popup.retry}
              className={QUIET_ICON}
            >
              <RotateCcw />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The reuse gate's fingerprint of what a run would do. One definition site:
 *  the gate in run() compares exactly what execute() records. */
const definitionOf = (payload: CapturePayload): string =>
  `${payload.role}\n${payload.instructions}\n${payload.prompt}`;

export function Popup(): React.JSX.Element {
  const [payload, setPayload] = useState<CapturePayload | undefined>(undefined);
  // Every prompt's output for the current capture, keyed by prompt id —
  // running entries stream in place, finished ones stay until the next
  // capture. Prompts run in parallel: switching away never cancels a stream,
  // and switching back shows whatever it has produced so far.
  const [results, setResults] = useState<ReadonlyMap<string, Result>>(new Map());
  // The follow-up field's draft, reset when the view changes underneath it.
  const [followUpText, setFollowUpText] = useState("");
  // The composer element, so view changes can also collapse its grown height.
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // The full-list prompt palette (the long tail beyond the quick slots).
  const [menuOpen, setMenuOpen] = useState(false);
  // Filter text inside the palette, for finding an prompt among many.
  const [menuFilter, setMenuFilter] = useState("");
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  // The prompt ids bound to number keys 1–4 (settings), in slot order.
  const [quickIds] = useLiveValue<string[]>(getQuickPrompts, "quick-prompts-changed", []);
  // The "Show template variables" toggle (stored as `devMode`).
  const [devMode] = useLiveValue(isDevMode, "dev-mode-changed", false);
  // Usage statistics (settings toggle, default on): append invocation events.
  const [statsEnabled] = useLiveValue(isStatsEnabled, "stats-enabled-changed", true);
  // The live month-cost readout (settings toggle, default off) and the
  // monthly cap — both estimates from the same local ledger.
  const [costShown] = useLiveValue(isPopupCostShown, "popup-cost-changed", false);
  const [costLimit] = useLiveValue<number>(getCostLimit, "cost-limit-changed", 0); // 0 = no cap
  // This month's estimate, refreshed when a capture arrives and after every
  // recorded run — "live" at the moments the number can actually change.
  const [monthCost, setMonthCost] = useState<number | undefined>(undefined);
  // Ask before sending an image/files to the provider (settings toggle, or
  // this popup's own "don't ask again").
  const [confirmSend, setConfirmSend] = useLiveValue(
    isConfirmAttachments,
    "confirm-attachments-changed",
    true,
  );
  // Waiting for the user's go-ahead on the current capture's attachments.
  const [awaitingSend, setAwaitingSend] = useState(false);
  // The "don't ask again" checkbox inside the confirmation card.
  const [dontAsk, setDontAsk] = useState(false);
  const t = useT();
  const locale = useLocale();
  const promptLabel = usePromptLabel();
  const updateVersion = useUpdateVersion();

  // The in-flight run per prompt id (current capture only). A run's identity
  // is its controller: stale callbacks compare against this map before
  // touching state, so a Retry or a new capture cleanly orphans old streams.
  const runsRef = useRef(new Map<string, AbortController>());
  // Signature of the capture the runs and results belong to; a different
  // signature aborts everything and starts a clean slate.
  const captureSig = useRef<string | undefined>(undefined);
  // Signature of the capture whose attachments the user approved sending, so
  // Retry and prompt switches on the same content don't ask again.
  const approvedSig = useRef<string | undefined>(undefined);
  // The run the attachment gate interrupted, so approval resumes exactly it.
  const pendingSend = useRef<
    { payload: CapturePayload; prior: Exchange[]; question?: string | undefined } | undefined
  >(undefined);
  // What each kept result was produced WITH (role + instructions + prompt at
  // run time): editing an prompt and re-copying the same test text must run
  // the new definition, not parrot the old result — that edit-and-retry loop
  // is exactly how prompts get written.
  const ranDefinition = useRef(new Map<string, string>());
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the view is glued to the streaming output's bottom edge: a user
  // scrolling up to read leaves it (auto-scroll stops), scrolling back down
  // re-engages it — the usual AI-chat pattern.
  const pinnedRef = useRef(true);
  // Where our own follow (autoScroll below) last scrolled to. Its scroll
  // event dispatches asynchronously, and a burst of streamed content can
  // commit in between — the handler would then read the old scrollTop against
  // the grown scrollHeight, conclude "not at the bottom anymore", and unpin
  // by itself, killing the follow for the rest of the stream. So the handler
  // recognizes the follow's own event by its position (pinned by definition)
  // — and only by its position, so a user scroll coalesced into the same
  // event still reads as the user's and wins.
  const autoScrollTargetRef = useRef<number | undefined>(undefined);

  /** Glue the body to its bottom edge, announcing the scroll as our own. */
  const autoScroll = (body: HTMLDivElement): void => {
    const bottom = body.scrollHeight - body.clientHeight;
    // Only a real movement dispatches an event; recording a target without
    // one would mislabel the user's next scroll as ours.
    if (bottom - body.scrollTop >= 1) {
      autoScrollTargetRef.current = bottom;
      body.scrollTop = bottom;
    }
  };
  // The palette's filter field, focused when the palette opens.
  const filterRef = useRef<HTMLInputElement>(null);

  // What the popup shows: the current prompt's entry (live or kept).
  const result = payload ? results.get(payload.prompt_id) : undefined;

  const putResult = (promptId: string, entry: Result | undefined): void => {
    setResults((prev) => {
      const next = new Map(prev);
      if (entry) {
        next.set(promptId, entry);
      } else {
        next.delete(promptId);
      }
      return next;
    });
  };

  // The usage trail: one line per invocation, uniform across fresh runs,
  // retries, and kept results being shown — prose for the human reading the
  // log (statistics live in their own store, not here). Ids and kinds only,
  // never content.
  const logUsage = (promptId: string, kind: string): void => {
    log.info(`prompt run: ${promptId} (${kind})`);
  };

  // Refresh the header's month estimate; a failure hides the number rather
  // than surfacing an error (it is a courtesy readout, not a feature gate).
  const refreshMonthCost = (): void => {
    if (!costShown || !statsEnabled) {
      return;
    }
    void (async () => {
      try {
        setMonthCost(await monthCostUsd());
      } catch {
        setMonthCost(undefined); // a courtesy readout never surfaces errors
      }
    })();
  };

  useEffect(() => {
    if (costShown && statsEnabled) {
      refreshMonthCost();
    } else {
      setMonthCost(undefined);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- refreshMonthCost reads the same two flags this effect keys on
  }, [costShown, statsEnabled]);

  // The statistics append — a ledger of COMPLETED runs only: reuses, gates,
  // config errors, user stops, timeouts, and error responses all leave no
  // line. Fire-and-forget; a failed append is logged Rust-side and never
  // blocks anything.
  const recordUsage = (promptId: string, kind: string, outcome: StreamOutcome): void => {
    if (statsEnabled) {
      void invoke("record_usage", {
        prompt: promptId,
        kind,
        model: outcome.model,
        tokens: outcome.tokens,
      });
    }
  };

  const abortAll = (): void => {
    for (const controller of runsRef.current.values()) {
      controller.abort();
    }
    runsRef.current.clear();
  };

  const run = (next: CapturePayload, force = false): void => {
    const sig = sourceSignature(next.source);
    // A different capture orphans everything: streams are aborted, kept
    // results dropped. The same capture keeps both — prompts run in parallel
    // and every prompt's result stays valid for identical content.
    if (captureSig.current !== sig) {
      abortAll();
      captureSig.current = sig;
      ranDefinition.current.clear();
      pendingSend.current = undefined;
      setResults(new Map());
    }
    setPayload(next);

    if (!next.runnable) {
      return;
    }

    setAwaitingSend(false);

    const promptId = next.prompt_id;
    // Same content, same prompt, same definition, and a finished result:
    // show it again instead of re-running — Esc-then-recopy means "let me see
    // that once more", not "spend tokens again". Retry stays the explicit
    // regenerate. Deliberately NOT reused: a failed FIRST run (a fresh C+C
    // retries it instead of parroting the error — but a thread whose only
    // blemish is its last follow-up IS kept: overwriting good turns over one
    // network blip would be data loss, and Retry re-asks that question),
    // runs of an edited prompt (the definition fingerprint differs), and
    // `files` captures (their signature is the paths, so the files' contents
    // may have changed).
    const definition = definitionOf(next);
    const kept = results.get(promptId);
    if (
      !force &&
      kept?.phase === "done" &&
      // Worth showing again: a sound single result, or ANY thread longer
      // than one turn — whatever its last turn's fate (error or config
      // trouble), overwriting the good turns before it would be data loss.
      // Only a failed FIRST run re-runs (a fresh C+C means "retry it" there).
      (kept.turns.length > 1 || (kept.ok && !kept.setup)) &&
      next.kind !== "files" &&
      ranDefinition.current.get(promptId) === definition
    ) {
      logUsage(promptId, next.kind);
      return;
    }
    const existing = runsRef.current.get(promptId);
    if (existing && !force) {
      // Already streaming this prompt for this content — the view follows it.
      return;
    }
    existing?.abort();

    execute(next, []);
  };

  // The shared run body — a first run and a follow-up differ only in the
  // thread they extend (`prior`, empty at first) and the user turn extending
  // it (`question`, absent at first: the first turn's question is the
  // prompt's own prompt). One path for both means a follow-up is capped,
  // confirmed, logged, and recorded in the ledger exactly like a first run.
  const execute = (next: CapturePayload, prior: Exchange[], question?: string): void => {
    const sig = sourceSignature(next.source);
    // The precondition run() used to guarantee by construction: execute only
    // ever extends the CURRENT capture. A stale payload must not claim the
    // run slot — an unowned claim would never be released and would wedge
    // the prompt for the session.
    if (captureSig.current !== sig) {
      return;
    }
    const promptId = next.prompt_id;

    logUsage(promptId, next.kind);

    const controller = new AbortController();
    runsRef.current.set(promptId, controller);
    ranDefinition.current.set(promptId, definitionOf(next));
    // A callback owns its entry only while the capture is current AND its
    // controller is still the registered run — a Retry or a new capture takes
    // the slot over and orphans the old stream mid-flight.
    const owns = (): boolean =>
      captureSig.current === sig && runsRef.current.get(promptId) === controller;
    // The thread with the current turn's text-so-far as its last entry.
    const turnsWith = (text: string): Exchange[] => [...prior, { question, text }];
    // Nothing arrived: a first run returns to the source-only view; a
    // follow-up returns to the thread it grew from.
    const revert = (): void => {
      putResult(
        promptId,
        question === undefined ? undefined : { phase: "done", turns: prior, ok: true },
      );
    };
    putResult(promptId, { phase: "running", turns: turnsWith("") });

    void (async () => {
      // The outcome once the stream settles — undefined when the run never
      // reached a model (gate, config errors), so the recorded event carries
      // exactly the facts that exist.
      let settled: StreamOutcome | undefined;
      try {
        // The monthly cost cap: when this month's estimate has reached the
        // user's limit, refuse before anything is sent. Fail-open on purpose
        // — a cap that cannot be computed must not stop the user's work.
        if (costLimit > 0 && statsEnabled) {
          let spent: number | undefined;
          try {
            spent = await monthCostUsd();
          } catch {
            spent = undefined; // fail-open: an uncomputable cap must not stop work
          }
          if (owns() && spent !== undefined && spent >= costLimit) {
            const capped = t.popup.costLimitReached(formatUsd(locale, costLimit));
            putResult(promptId, { phase: "done", turns: turnsWith(capped), ok: false });
            return;
          }
        }
        const attachments = await buildAttachments(next.source);
        // Only binary attachments (image, PDF, audio) are the expensive path
        // worth a gate — text files ride like copied text and run right away.
        // Known only after reading the files, hence the gate sits here.
        const expensive = attachments?.some((file) => !file.media_type.startsWith("text/"));
        if (expensive && confirmSend && approvedSig.current !== sig) {
          if (owns()) {
            runsRef.current.delete(promptId);
            // Suspend THIS run — approval must resume a follow-up or retry
            // as itself, not restart the capture from scratch via run().
            pendingSend.current = { payload: next, prior, question };
            revert();
            setDontAsk(false);
            setAwaitingSend(true);
          }
          return;
        }
        const followUp = question === undefined ? undefined : { turns: prior, question };
        const outcome = await streamPrompt(
          // Expose the user's locale to prompt templates ({{ locale }}).
          {
            ...next,
            vars: { ...next.vars, locale },
            ...(attachments ? { attachments } : {}),
            ...(followUp ? { followUp } : {}),
          },
          (chunk) => {
            if (owns()) {
              putResult(promptId, { phase: "running", turns: turnsWith(chunk) });
            }
          },
          controller.signal,
        );
        settled = outcome;
        const { text } = outcome;
        if (owns()) {
          if (controller.signal.aborted && !text) {
            revert();
            // The stopped question returns to the composer (unless a new
            // draft is already there) — Stop must not cost the typed text.
            if (question !== undefined) {
              setFollowUpText((draft) => draft || question);
            }
          } else {
            putResult(promptId, { phase: "done", turns: turnsWith(text), ok: true });
          }
        }
      } catch (error) {
        const reason = errorMessage(error);
        if (reason === NOT_CONFIGURED) {
          // No provider set up yet. Stay put and offer a way into settings —
          // auto-opening it would steal focus from this popup.
          if (owns()) {
            putResult(promptId, {
              phase: "done",
              turns: turnsWith(t.ai.notConfigured),
              ok: false,
              setup: true,
            });
          }
        } else if (reason === INVALID_CONFIG) {
          // The catalog file exists but fails the schema. Same treatment as
          // "not configured" — a human sentence plus a way into settings; the
          // zod detail is already in the log.
          log.error("prompt failed: invalid ai-sdk-catalog.json", error);
          if (owns()) {
            putResult(promptId, {
              phase: "done",
              turns: turnsWith(t.ai.invalidConfig),
              ok: false,
              setup: true,
            });
          }
        } else {
          log.error("prompt failed", error);
          if (owns()) {
            let text: string;
            if (reason === TIMED_OUT) {
              text = t.popup.timedOut;
            } else if (reason === EMPTY_RESULT) {
              text = t.popup.emptyResult;
            } else if (reason === ATTACHMENT_TOO_LARGE) {
              text = t.popup.attachmentTooLarge(MAX_ATTACHMENT_MB);
            } else if (reason.startsWith(UNSUPPORTED_FILE_PREFIX)) {
              text = t.popup.unsupportedFile(reason.slice(UNSUPPORTED_FILE_PREFIX.length));
            } else if (reason.startsWith(FILE_UNREADABLE_PREFIX)) {
              text = t.popup.fileUnreadable(reason.slice(FILE_UNREADABLE_PREFIX.length));
            } else {
              text = t.popup.failed(reason);
            }
            putResult(promptId, { phase: "done", turns: turnsWith(text), ok: false });
          }
        }
      } finally {
        if (owns()) {
          runsRef.current.delete(promptId); // free the slot for a later re-run
          if (settled && !controller.signal.aborted) {
            recordUsage(promptId, next.kind, settled);
            refreshMonthCost(); // the number just changed (fire-and-forget race is fine)
          }
        }
      }
    })();
  };

  // The capture stream. useTauriEvent always invokes the latest closure, so
  // `run` (which closes over `t` and `locale`) needs no ref mirroring here.
  useTauriEvent<CapturePayload>("capture", (raw) => {
    // Validate the Rust payload at the boundary; on version skew, warn
    // and render the raw data rather than dropping the capture.
    const checked = CapturePayloadSchema.safeParse(raw);
    if (!checked.success) {
      log.warn("capture payload has an unexpected shape; using it as-is", checked.error);
    }
    const incoming = checked.success ? checked.data : raw;
    // run() drops kept results itself when the content actually changed; a
    // re-copy of identical content keeps every prompt's result valid.
    // Refresh the prompt list so edits on disk show up without the menu
    // ever being opened.
    void (async () => {
      try {
        setPrompts(await listPrompts());
      } catch (error) {
        log.error("listing prompts failed", error);
      }
    })();
    run(incoming);
  });

  // Abort every in-flight run if the popup ever unmounts.
  useEffect(
    () => () => {
      abortAll();
    },
    [],
  );

  // Warm the lazy LLM machinery off the first paint, so the first C+C never
  // pays the module load.
  useEffect(() => {
    warmUp();
  }, []);

  // Screenshot scenario (dev-only, see src/lib/screenshot.ts): a settled
  // two-turn conversation, injected directly — no capture, no model call.
  // Re-runs when the async locale load lands, so the fixture speaks the
  // page's language, not the boot default.
  useEffect(() => {
    // The literal DEV check (a build-time constant, unlike the function call
    // below) is what lets the bundler drop this whole branch — and with it
    // the dynamically imported fixture chunk — from production.
    if (!import.meta.env.DEV) {
      return;
    }
    if (screenshotScenario() !== POPUP_RESULT_SCENARIO) {
      return;
    }
    // Dynamic import: the fixture table stays out of production chunks —
    // with the scenario check folded away, this branch (and the chunk) die.
    void (async () => {
      const { POPUP_RESULT_FIXTURES, POPUP_RESULT_SOURCE } =
        await import("@/lib/screenshot-scenarios.ts");
      const fixture = POPUP_RESULT_FIXTURES[locale] ?? POPUP_RESULT_FIXTURES["en"];
      if (fixture === undefined) {
        return;
      }
      setPayload({
        kind: "text",
        source: { kind: "text", text: POPUP_RESULT_SOURCE },
        prompt_id: "zencopy-summarize",
        label: "Summarize",
        role: "",
        instructions: "",
        prompt: POPUP_RESULT_SOURCE,
        vars: {},
        runnable: true,
      });
      setResults(
        new Map([
          [
            "zencopy-summarize",
            {
              phase: "done",
              ok: true,
              turns: [
                { text: fixture.answer },
                { question: fixture.question, text: fixture.reply },
              ],
            },
          ],
        ]),
      );
      // The quick-slot chips resolve against the prompt list, which normally
      // loads on capture — load it for the fixture too.
      try {
        setPrompts(await listPrompts());
      } catch (error) {
        log.error("listing prompts failed", error);
      }
    })();
  }, [locale]);

  // Track whether the user is at the bottom. A threshold absorbs sub-pixel
  // scroll positions and the last few pixels of a fling.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const onScroll = (): void => {
      const target = autoScrollTargetRef.current;
      autoScrollTargetRef.current = undefined;
      // Our own follow, arriving where it was sent (within the sub-pixel
      // clamp residual): pinned by definition, whatever grew since.
      if (target !== undefined && Math.abs(body.scrollTop - target) < 2) {
        pinnedRef.current = true;
        return;
      }
      // A user scroll. Note the moving-target tradeoff: while a stream grows
      // fast, the bottom keeps fleeing, so scrolling back down may not
      // re-pin until the stream pauses or ends — known and accepted.
      pinnedRef.current = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
    };
  }, []);

  // What the auto-scroll saw last, so the settle of a stream (running →
  // done, same prompt) can be told apart from switching to a finished result.
  const scrollSeenRef = useRef<{ id: string; phase: string } | undefined>(undefined);
  // Follow the streaming output to the bottom — unless the user scrolled up
  // to read; scrolling back to the bottom resumes following. The settle also
  // pins once more: the reply field appears under the finished answer, and
  // stopping one line above it would hide the way to continue.
  useEffect(() => {
    const id = payload?.prompt_id;
    const previous = scrollSeenRef.current;
    scrollSeenRef.current =
      id === undefined || result === undefined ? undefined : { id, phase: result.phase };
    const settled = result?.phase === "done" && previous?.phase === "running" && previous.id === id;
    if ((result?.phase === "running" || settled) && pinnedRef.current && bodyRef.current) {
      autoScroll(bodyRef.current);
    }
  }, [payload?.prompt_id, result]);

  // A different view (new capture or a switched prompt) starts back at the
  // top with fresh content — follow its stream until the user says otherwise,
  // and drop any half-typed follow-up (and the height it grew) that belonged
  // to the previous view.
  useEffect(() => {
    pinnedRef.current = true;
    setFollowUpText("");
    if (composerRef.current) {
      composerRef.current.style.height = "auto";
    }
  }, [payload?.prompt_id, payload?.source]);

  // A palette that opens for typing should receive the caret immediately.
  useEffect(() => {
    if (menuOpen) {
      filterRef.current?.focus();
    }
  }, [menuOpen]);

  // Stop cancels only the prompt on screen; other prompts keep streaming.
  const stop = (): void => {
    if (payload) {
      runsRef.current.get(payload.prompt_id)?.abort();
    }
  };
  // Retry any turn: the conversation rewinds to that point and the turn's
  // request runs again (turn 0 has no question — its retry is a fresh first
  // run). Everything after the retried turn is deliberately discarded.
  const retryTurn = (index: number): void => {
    if (!payload) {
      return;
    }
    const kept = results.get(payload.prompt_id);
    if (kept?.phase !== "done") {
      return;
    }
    runsRef.current.get(payload.prompt_id)?.abort();
    execute(payload, kept.turns.slice(0, index), kept.turns[index]?.question);
  };

  // The quiet composer under a finished result: submit to continue the thread.
  const submitFollowUp = (element: HTMLTextAreaElement): void => {
    const question = followUpText.trim();
    if (!payload || !question) {
      return;
    }
    const kept = results.get(payload.prompt_id);
    if (kept?.phase !== "done") {
      return; // Enter while the reply still streams — the draft just stays
    }
    setFollowUpText("");
    // Inline, not growComposer: the element still holds the old text until
    // React commits, so measuring now would restore the old height.
    element.style.height = "auto";
    execute(payload, kept.turns, question);
  };

  // The go-ahead on the confirmation card: remember it for this capture (so
  // Retry and prompt switches don't re-ask) and optionally stop asking at all.
  const approveSend = (): void => {
    if (!payload) {
      return;
    }
    approvedSig.current = sourceSignature(payload.source);
    if (dontAsk) {
      setConfirmSend(false);
      void setConfirmAttachments(false);
      void emit("confirm-attachments-changed", false); // live-update settings
    }
    setAwaitingSend(false);
    const pending = pendingSend.current;
    pendingSend.current = undefined;
    if (pending) {
      execute(pending.payload, pending.prior, pending.question);
    } else {
      run(payload);
    }
  };
  const dismiss = (): void => {
    // Ignore dismiss while any run is in flight — only the explicit Stop
    // button cancels. Finished results are kept so the tray can bring them back.
    if (runsRef.current.size > 0) {
      return;
    }
    hidePopup();
  };

  // The palette: the full prompt list, for the long tail beyond the quick
  // slots. Re-read from disk on every open, so file edits show up immediately.
  const toggleMenu = (): void => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setMenuFilter("");
    void (async () => {
      try {
        setPrompts(await listPrompts());
        setMenuOpen(true);
      } catch (error) {
        log.error("listing prompts failed", error);
      }
    })();
  };

  const switchPrompt = (prompt: PromptInfo): void => {
    setMenuOpen(false);
    if (!payload || prompt.id === payload.prompt_id) {
      return;
    }
    const next: CapturePayload = {
      ...payload,
      prompt_id: prompt.id,
      label: prompt.label,
      role: prompt.role ?? "default",
      instructions: prompt.instructions,
      prompt: prompt.prompt,
      runnable: true,
    };
    // An prompt that already ran (or is still streaming) just becomes the
    // view: the derived result shows its kept text or its live stream — no
    // cancellation, no silent re-execution; Retry is the explicit re-run.
    if (results.has(prompt.id)) {
      logUsage(prompt.id, next.kind);
      setPayload(next);
      return;
    }
    run(next);
  };

  // Number keys 1–4: switch to the quick slot's prompt (abort + re-run, via
  // switchPrompt). A number binds to a slot, not to the nth visible chip, so a
  // missing/absent prompt just makes its number a no-op — positions stay put.
  const switchToSlot = (num: number): void => {
    if (!payload || awaitingSend) {
      return;
    }
    const id = quickIds[num - 1];
    if (id === undefined || id === "" || id === payload.prompt_id) {
      return;
    }
    const prompt = prompts.find((entry) => entry.id === id);
    if (prompt) {
      switchPrompt(prompt);
    }
  };

  // Effect Events, so the once-registered handlers below always see the
  // latest state (payload, prompts, menuOpen change constantly) without
  // re-subscribing.
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    // Keys that belong to an IME composition (the Esc cancelling a
    // conversion, digits picking a candidate) are the IME's, not ours.
    // Safari reports the composition-commit key with isComposing already
    // false but the legacy keyCode 229 — guard both.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const inTextField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
    if (event.key === "Escape") {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      // Esc inside a text field (the follow-up input) steps out of the field
      // first; only a second Esc closes the popup — a half-typed question
      // must never cost the whole window.
      if (inTextField) {
        target?.blur();
        return;
      }
      dismiss();
      return;
    }
    // A bare digit switches quick slots — but not while the palette is open
    // (its filter field owns typing) or when a text field has focus.
    if (menuOpen || event.metaKey || event.ctrlKey || event.altKey || inTextField) {
      return;
    }
    if (/^[1-9]$/u.test(event.key)) {
      switchToSlot(Number(event.key));
    }
  });
  // Dismiss on Escape only. Losing focus is deliberately NOT a dismissal: the
  // popup is a picture-in-picture panel whose content cost tokens and seconds
  // to produce, so a stray click elsewhere must never destroy it — Esc (while
  // focused) and the close button are the only ways out. While the prompt
  // menu is open, Escape closes the menu first.
  useEffect(() => {
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const running = result?.phase === "running";
  const done = result?.phase === "done";
  const setup = result?.phase === "done" && result.setup === true;
  const failed = result?.phase === "done" && !result.ok && !result.setup;
  // The one host the result may load remote images from: where the capture
  // came from (see Markdown's isAllowedImage for the threat model).
  const imageHost = (() => {
    const url = payload?.vars["url"];
    if (!url) {
      return undefined;
    }
    try {
      return new URL(url).host;
    } catch {
      return undefined;
    }
  })();

  // The quick slots, resolved: each number's prompt, or undefined when its id
  // names a deleted prompt. Positions are preserved (the number IS the slot),
  // so a gone prompt leaves a gap rather than shifting the rest.
  const quickSlots = quickIds.map((id) => prompts.find((entry) => entry.id === id));
  // The status glyph for the headline (running / done / setup / failed).
  const statusIcon = ((): React.JSX.Element | undefined => {
    if (running) {
      return <LoaderCircle className="size-4 shrink-0 animate-spin" />;
    }
    if (done && result.ok) {
      return <Check className="size-4 shrink-0" />;
    }
    if (setup) {
      return <Settings className="size-4 shrink-0" />;
    }
    if (failed) {
      return <TriangleAlert className="size-4 shrink-0" />;
    }
    return undefined;
  })();

  // The prompt block: a prominent headline (the single source of truth for
  // "what is running") over a row of numbered quick slots. The current prompt
  // is the headline; the slots are the one-key switch. When the running prompt
  // is not among the four slots, none is highlighted — the layout never shifts.
  const promptRow = payload ? (
    <div className="flex flex-col gap-2">
      {/* Headline: status glyph + the prompt label as the visual anchor. The
          label carries the "-ing" via the spinner + ellipsis, so no per-prompt
          verb form is needed (works for custom labels too). */}
      <div
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          failed ? "text-destructive" : "text-foreground",
        )}
      >
        {statusIcon}
        <span className="min-w-0 truncate">
          {promptLabel(payload.prompt_id, payload.label) || t.popup.choosePrompt}
          {running ? "…" : ""}
        </span>
      </div>

      {/* Quick slots: numbered chips (1–4). The active one is highlighted; a
          run outside the four leaves none highlighted. A trailing button opens
          the full palette for everything else. One line always: the home width
          fits the longest built-in labels (windows.rs); a window dragged
          narrower shrinks the chips into their ellipses instead of wrapping. */}
      <div className="flex items-center gap-1">
        {quickSlots.map((prompt, index) =>
          prompt ? (
            <button
              key={prompt.id}
              type="button"
              onClick={() => {
                switchPrompt(prompt);
              }}
              className={cn(
                "flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
                prompt.id === payload.prompt_id
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <kbd className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground/80">
                {index + 1}
              </kbd>
              <span className="max-w-32 truncate">{promptLabel(prompt.id, prompt.label)}</span>
              {/* A background prompt still streaming announces itself, so
                  "switch away and come back later" is a visible affordance. */}
              {results.get(prompt.id)?.phase === "running" ? (
                <LoaderCircle className="size-3 shrink-0 animate-spin" />
              ) : undefined}
            </button>
          ) : undefined,
        )}
        {/* The full-list palette only earns its place when a custom prompt
            exists — those never appear on the popup by themselves, while the
            pre-installed set is already covered by the slots and the routing
            default. Detected from the list, not a count, so the number of
            built-ins can change freely. */}
        {prompts.some((prompt) => prompt.origin === "custom") ? (
          <button
            type="button"
            onClick={toggleMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t.popup.switchPrompt}
            title={t.popup.switchPrompt}
            className="flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LayoutGrid className="size-3.5" />
          </button>
        ) : undefined}
      </div>

      {menuOpen ? (
        <>
          {/* Mouse-only backdrop; keyboard users close the palette with Escape. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-10 bg-background/50"
            onClick={() => {
              setMenuOpen(false);
            }}
          />
          {/* Centered overlay with a filter field — the long-tail palette. */}
          <div
            role="menu"
            className="fixed inset-x-0 top-1/2 z-20 mx-auto flex w-64 max-w-[calc(100vw-2rem)] -translate-y-1/2 flex-col rounded-xl border bg-popover p-1 shadow-xl"
          >
            <input
              ref={filterRef}
              value={menuFilter}
              placeholder={t.popup.choosePrompt}
              onChange={(event) => {
                setMenuFilter(event.target.value);
              }}
              className="mb-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:border-ring"
            />
            <div className="max-h-[45svh] overflow-auto">
              {prompts
                .filter((prompt) =>
                  promptLabel(prompt.id, prompt.label)
                    .toLowerCase()
                    .includes(menuFilter.trim().toLowerCase()),
                )
                .map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      switchPrompt(prompt);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs hover:bg-accent"
                  >
                    <Check
                      className={cn(
                        "size-3 shrink-0",
                        prompt.id === payload.prompt_id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{promptLabel(prompt.id, prompt.label)}</span>
                  </button>
                ))}
            </div>
          </div>
        </>
      ) : undefined}
    </div>
  ) : undefined;

  // Template variables: exactly what the Liquid templates receive — locale
  // included (it is injected at run time), text/markup omitted because the
  // source view above already shows them. A collapsed one-line summary, so it
  // is discoverable without scrolling and never dominates the popup.
  const devVarsView =
    devMode && payload ? (
      <details className="rounded-lg bg-muted/40 px-2.5 py-1.5">
        <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground select-none">
          {t.popup.devVars}
        </summary>
        <pre className="mt-1.5 max-h-40 overflow-auto font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {JSON.stringify(
            Object.fromEntries([
              ...Object.entries(payload.vars).filter(([key]) => !VISIBLE_ELSEWHERE.has(key)),
              ["locale", locale],
            ]),
            undefined,
            2,
          )}
        </pre>
      </details>
    ) : undefined;

  // Body reads top-to-bottom as a pipeline: copied content → operation → result.
  let body: React.JSX.Element;
  if (!payload) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Kbd>{TRIGGER_MODIFIER}</Kbd>
          <span className="text-xs">+</span>
          <Kbd>C</Kbd>
          <span className="text-xs">+</span>
          <Kbd>C</Kbd>
        </div>
        <p className="text-xs text-muted-foreground">{t.popup.placeholder}</p>
      </div>
    );
  } else if (payload.runnable) {
    // Errors and setup guidance are our own i18n sentences — plain text,
    // styled as status. Only model output gets the Markdown treatment.
    let resultView: React.JSX.Element | undefined;
    if (result && result.turns.some((turn) => turn.text || turn.question)) {
      // The thread reads as one growing document: each follow-up question is
      // a quiet quoted line, each reply flows below it. Only the LAST turn
      // can be an error or setup sentence — earlier turns are settled output.
      resultView = (
        <div className="flex flex-col gap-3">
          {result.turns.map((turn, index) => {
            const lastTurn = index === result.turns.length - 1;
            return (
              <Turn
                // Turns only grow or truncate from the end, so an index is a
                // stable identity for every turn that survives.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                turn={turn}
                failed={lastTurn && failed}
                setup={lastTurn && setup}
                copyable={(!lastTurn || (done && !failed && !setup)) && turn.text !== ""}
                onRetry={
                  done
                    ? () => {
                        retryTurn(index);
                      }
                    : undefined
                }
                imageHost={imageHost}
              />
            );
          })}
        </div>
      );
    }
    // The attachment go-ahead: what will be sent is already on screen (the
    // source view above); this card only asks whether to send it.
    const confirmCard = (
      <div className="flex flex-col gap-2.5 rounded-lg bg-muted/40 px-3 py-2.5">
        <p className="text-sm">{t.popup.confirmSend}</p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(event) => {
              setDontAsk(event.target.checked);
            }}
            className="accent-foreground"
          />
          {t.popup.dontAskAgain}
        </label>
        <Button size="sm" className="self-start" onClick={approveSend}>
          {t.popup.send}
        </Button>
      </div>
    );
    body = (
      <>
        <SourceView source={payload.source} />
        {devVarsView}
        {promptRow}
        {awaitingSend ? confirmCard : resultView}
        {setup ? (
          <Button variant="outline" size="sm" className="self-start" onClick={openSettings}>
            <Settings className="size-3.5" />
            {t.popup.openSettings}
          </Button>
        ) : undefined}
      </>
    );
  } else {
    body = (
      <>
        <SourceView source={payload.source} />
        {devVarsView}
        {promptRow}
        {payload.kind === "empty" ? undefined : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t.popup.noPrompt}</p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                void invoke("open_url", { url: siteUrl(locale, "configuration/#rulesjson") });
              }}
            >
              {t.popup.rulesDocs}
              <ExternalLink className="size-3" />
            </Button>
          </div>
        )}
      </>
    );
  }

  // The card always fills the window — a stable frame whose content scrolls,
  // never a shape that grows under the reader. Two looks, one stateless rule
  // (the `compact` breakpoint in index.css): at the home size it floats with
  // a breathing margin — the padding Rust counts on when it places the
  // window flush against the work area — and dragged bigger it snaps
  // edge-to-edge, a window instead of a sticker.
  return (
    <div className="flex h-svh max-compact:p-2">
      <div className="flex size-full flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
        {/* The header doubles as the drag handle (PiP-style): "deep" makes
            the whole bar and everything in it draggable, while buttons keep
            being buttons (Tauri's drag script exempts clickable elements). */}
        <div className="flex items-center gap-2 border-b px-3 py-2" data-tauri-drag-region="deep">
          <ZenCopyMark className="size-4" />
          <span className="text-xs font-medium">ZenCopy</span>
          {costShown && statsEnabled && monthCost !== undefined ? (
            <span
              className="ms-2 text-[10px] text-muted-foreground tabular-nums"
              title={t.popup.monthCost}
            >
              {formatUsd(locale, monthCost)}
            </span>
          ) : undefined}
          <div className="ms-auto flex items-center gap-0.5 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={openSettings}
              aria-label={t.popup.openSettings}
            >
              <Settings className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={dismiss}
              disabled={running}
              aria-label={t.popup.close}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
          {body}
        </div>

        {/* The composer is fixed chrome, outside the scroll: the interaction
            point for "now" never moves. While a reply streams, its trailing
            corner holds Stop — the same spot ChatGPT taught the world. */}
        {payload?.runnable && !awaitingSend && (running || (done && !failed && !setup)) && (
          <div className="relative border-t px-3 py-2">
            <textarea
              ref={composerRef}
              rows={1}
              value={followUpText}
              onChange={(event) => {
                setFollowUpText(event.target.value);
                growComposer(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                // The Enter that commits an IME conversion must never send.
                // Safari reports it with isComposing already false but the
                // legacy keyCode 229 — guard both.
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
                  return;
                }
                if (event.shiftKey) {
                  return; // Shift+Enter = newline, the chat convention
                }
                event.preventDefault();
                submitFollowUp(event.currentTarget);
              }}
              placeholder={t.popup.followUp}
              aria-label={t.popup.followUp}
              className={cn(
                FIELD,
                "max-h-32 resize-none overflow-y-auto placeholder:text-muted-foreground/60",
                running && "pe-9",
              )}
            />
            {running && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={stop}
                aria-label={t.popup.stop}
                title={t.popup.stop}
                className={cn(QUIET_ICON, "absolute inset-e-5 top-1/2 -translate-y-1/2")}
              >
                <Square />
              </Button>
            )}
          </div>
        )}

        {updateVersion && (
          // Whisper-level, by design: rendered below everything, never louder
          // over time, gone the moment the update is installed. Clicking opens
          // About — the one place where updating actually happens — instead of
          // restarting mid-task under the user's result.
          <button
            type="button"
            onClick={() => {
              void invoke("open_about");
            }}
            className="cursor-pointer border-t px-3 py-1.5 text-start text-[10px] text-muted-foreground/80 transition-colors hover:text-foreground"
          >
            {t.popup.updateHint(updateVersion)}
          </button>
        )}
      </div>
    </div>
  );
}
