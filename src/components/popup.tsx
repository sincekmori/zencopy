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
  Maximize2,
  Minimize2,
  RotateCcw,
  Settings,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Markdown } from "@/components/markdown.tsx";
import { SourceView } from "@/components/source-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ZenCopyMark } from "@/components/zencopy-mark.tsx";
import { type ActionInfo, listActions } from "@/lib/actions.ts";
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
import { useActionLabel, useLocale, useT } from "@/lib/i18n.tsx";
import { createLogger, errorMessage } from "@/lib/log.ts";
import {
  EMPTY_RESULT,
  INVALID_CONFIG,
  NOT_CONFIGURED,
  streamAction,
  type StreamOutcome,
  TIMED_OUT,
  warmUp,
} from "@/lib/llm.ts";
import { TRIGGER_MODIFIER } from "@/lib/platform.ts";
import {
  getQuickActions,
  isConfirmAttachments,
  isDevMode,
  isStatsEnabled,
  QUICK_SLOT_COUNT,
  setConfirmAttachments,
} from "@/lib/settings.ts";
import { cn } from "@/lib/utils.ts";
import { siteUrl } from "@/lib/site.ts";
import { useUpdateVersion } from "@/lib/updater.ts";
import { useLiveValue, useTauriEvent } from "@/lib/use-tauri-event.ts";

type Result =
  | { phase: "running"; text: string }
  // `setup` marks "no provider configured yet": guidance, not an error — the
  // popup stays calm and offers a way into settings instead of red text.
  | { phase: "done"; text: string; ok: boolean; setup?: boolean };

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

export function Popup(): React.JSX.Element {
  const [payload, setPayload] = useState<CapturePayload | undefined>(undefined);
  // Every action's output for the current capture, keyed by action id —
  // running entries stream in place, finished ones stay until the next
  // capture. Actions run in parallel: switching away never cancels a stream,
  // and switching back shows whatever it has produced so far.
  const [results, setResults] = useState<ReadonlyMap<string, Result>>(new Map());
  // Hug the card to the same vertical edge as the pinned corner (Rust decides it).
  const [alignBottom, setAlignBottom] = useState(false);
  const [copied, setCopied] = useState(false);
  // The full-list action palette (the long tail beyond the quick slots).
  const [menuOpen, setMenuOpen] = useState(false);
  // Filter text inside the palette, for finding an action among many.
  const [menuFilter, setMenuFilter] = useState("");
  const [actions, setActions] = useState<ActionInfo[]>([]);
  // The action ids bound to number keys 1–4 (settings), in slot order.
  const [quickIds] = useLiveValue<string[]>(getQuickActions, "quick-actions-changed", []);
  // Developer mode (settings toggle): show the capture's template variables.
  const [devMode] = useLiveValue(isDevMode, "dev-mode-changed", false);
  // Usage statistics (settings toggle, default on): append invocation events.
  const [statsEnabled] = useLiveValue(isStatsEnabled, "stats-enabled-changed", true);
  // Ask before sending an image/files to the provider (settings toggle, or
  // this popup's own "don't ask again").
  const [confirmSend, setConfirmSend] = useLiveValue(
    isConfirmAttachments,
    "confirm-attachments-changed",
    true,
  );
  // Reading-pane mode: the window grows to half the screen's width (Rust owns
  // the geometry; this mirrors it for the toggle button's icon and labels).
  const [expanded, setExpanded] = useState(false);
  // Waiting for the user's go-ahead on the current capture's attachments.
  const [awaitingSend, setAwaitingSend] = useState(false);
  // The "don't ask again" checkbox inside the confirmation card.
  const [dontAsk, setDontAsk] = useState(false);
  const t = useT();
  const locale = useLocale();
  const actionLabel = useActionLabel();
  const updateVersion = useUpdateVersion();

  // The in-flight run per action id (current capture only). A run's identity
  // is its controller: stale callbacks compare against this map before
  // touching state, so a Retry or a new capture cleanly orphans old streams.
  const runsRef = useRef(new Map<string, AbortController>());
  // Signature of the capture the runs and results belong to; a different
  // signature aborts everything and starts a clean slate.
  const captureSig = useRef<string | undefined>(undefined);
  // Signature of the capture whose attachments the user approved sending, so
  // Retry and action switches on the same content don't ask again.
  const approvedSig = useRef<string | undefined>(undefined);
  // What each kept result was produced WITH (role + instructions + prompt at
  // run time): editing an action and re-copying the same test text must run
  // the new definition, not parrot the old result — that edit-and-retry loop
  // is exactly how actions get written.
  const ranDefinition = useRef(new Map<string, string>());
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the view is glued to the streaming output's bottom edge. "At the
  // bottom" is the single source of truth: our own scrollTo lands there (stays
  // pinned), a user scrolling up to read leaves it (auto-scroll stops), and
  // scrolling back down re-engages it — the usual AI-chat pattern, with no
  // flag juggling to tell user scrolls from programmatic ones.
  const pinnedRef = useRef(true);
  // The palette's filter field, focused when the palette opens.
  const filterRef = useRef<HTMLInputElement>(null);

  // What the popup shows: the current action's entry (live or kept).
  const result = payload ? results.get(payload.action_id) : undefined;

  const putResult = (actionId: string, entry: Result | undefined): void => {
    setResults((prev) => {
      const next = new Map(prev);
      if (entry) {
        next.set(actionId, entry);
      } else {
        next.delete(actionId);
      }
      return next;
    });
  };

  // The usage trail: one line per invocation, uniform across fresh runs,
  // retries, and kept results being shown — prose for the human reading the
  // log (statistics live in their own store, not here). Ids and kinds only,
  // never content.
  const logUsage = (actionId: string, kind: string): void => {
    log.info(`action run: ${actionId} (${kind})`);
  };

  // The statistics append — a ledger of COMPLETED runs only: reuses, gates,
  // config errors, user stops, timeouts, and error responses all leave no
  // line. Fire-and-forget; a failed append is logged Rust-side and never
  // blocks anything.
  const recordUsage = (actionId: string, kind: string, outcome: StreamOutcome): void => {
    if (statsEnabled) {
      void invoke("record_usage", {
        action: actionId,
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
    // results dropped. The same capture keeps both — actions run in parallel
    // and every action's result stays valid for identical content.
    if (captureSig.current !== sig) {
      abortAll();
      captureSig.current = sig;
      ranDefinition.current.clear();
      setResults(new Map());
    }
    setPayload(next);
    setCopied(false);

    if (!next.runnable) {
      return;
    }

    setAwaitingSend(false);

    const actionId = next.action_id;
    // Same content, same action, same definition, and a finished good result:
    // show it again instead of re-running — Esc-then-recopy means "let me see
    // that once more", not "spend tokens again". Retry stays the explicit
    // regenerate. Deliberately NOT reused: failures (a fresh C+C retries an
    // errored run instead of parroting the error), runs of an edited action
    // (the definition fingerprint differs), and `files` captures (their
    // signature is the paths, so the files' contents may have changed).
    const definition = `${next.role}\n${next.instructions}\n${next.prompt}`;
    const kept = results.get(actionId);
    if (
      !force &&
      kept?.phase === "done" &&
      kept.ok &&
      !kept.setup &&
      next.source.kind !== "files" &&
      ranDefinition.current.get(actionId) === definition
    ) {
      logUsage(actionId, next.source.kind);
      return;
    }
    const existing = runsRef.current.get(actionId);
    if (existing && !force) {
      // Already streaming this action for this content — the view follows it.
      return;
    }
    existing?.abort();

    logUsage(actionId, next.source.kind);

    const controller = new AbortController();
    runsRef.current.set(actionId, controller);
    ranDefinition.current.set(actionId, definition);
    // A callback owns its entry only while the capture is current AND its
    // controller is still the registered run — a Retry or a new capture takes
    // the slot over and orphans the old stream mid-flight.
    const owns = (): boolean =>
      captureSig.current === sig && runsRef.current.get(actionId) === controller;
    putResult(actionId, { phase: "running", text: "" });

    void (async () => {
      // The outcome once the stream settles — undefined when the run never
      // reached a model (gate, config errors), so the recorded event carries
      // exactly the facts that exist.
      let settled: StreamOutcome | undefined;
      try {
        const attachments = await buildAttachments(next.source);
        // Only binary attachments (image, PDF, audio) are the expensive path
        // worth a gate — text files ride like copied text and run right away.
        // Known only after reading the files, hence the gate sits here.
        const expensive = attachments?.some((file) => !file.media_type.startsWith("text/"));
        if (expensive && confirmSend && approvedSig.current !== sig) {
          if (owns()) {
            runsRef.current.delete(actionId);
            putResult(actionId, undefined);
            setDontAsk(false);
            setAwaitingSend(true);
          }
          return;
        }
        const outcome = await streamAction(
          // Expose the user's locale to action templates ({{ locale }}).
          { ...next, vars: { ...next.vars, locale }, ...(attachments ? { attachments } : {}) },
          (chunk) => {
            if (owns()) {
              putResult(actionId, { phase: "running", text: chunk });
            }
          },
          controller.signal,
        );
        settled = outcome;
        const { text } = outcome;
        if (owns()) {
          if (controller.signal.aborted && !text) {
            // Stopped before anything arrived — back to the source-only view.
            // A check mark next to an empty body would read as a result.
            putResult(actionId, undefined);
          } else {
            putResult(actionId, { phase: "done", text, ok: true });
          }
        }
      } catch (error) {
        const reason = errorMessage(error);
        if (reason === NOT_CONFIGURED) {
          // No provider set up yet. Stay put and offer a way into settings —
          // auto-opening it would steal focus and blur-dismiss this popup.
          if (owns()) {
            putResult(actionId, {
              phase: "done",
              text: t.ai.notConfigured,
              ok: false,
              setup: true,
            });
          }
        } else if (reason === INVALID_CONFIG) {
          // The catalog file exists but fails the schema. Same treatment as
          // "not configured" — a human sentence plus a way into settings; the
          // zod detail is already in the log.
          log.error("action failed: invalid ai-sdk-catalog.json", error);
          if (owns()) {
            putResult(actionId, {
              phase: "done",
              text: t.ai.invalidConfig,
              ok: false,
              setup: true,
            });
          }
        } else {
          log.error("action failed", error);
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
            putResult(actionId, { phase: "done", text, ok: false });
          }
        }
      } finally {
        if (owns()) {
          runsRef.current.delete(actionId); // free the slot for a later re-run
          if (settled && !controller.signal.aborted) {
            recordUsage(actionId, next.source.kind, settled);
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
    setAlignBottom(incoming.align_bottom);
    // run() drops kept results itself when the content actually changed; a
    // re-copy of identical content keeps every action's result valid.
    // Refresh the action list so edits on disk show up without the menu
    // ever being opened.
    void (async () => {
      try {
        setActions(await listActions());
      } catch (error) {
        log.error("listing actions failed", error);
      }
    })();
    run(incoming);
  });

  // Abort every in-flight run if the popup ever unmounts.
  useEffect(
    () => () => {
      for (const controller of runsRef.current.values()) {
        controller.abort();
      }
    },
    [],
  );

  // Warm the lazy LLM machinery off the first paint, so the first C+C never
  // pays the module load.
  useEffect(() => {
    warmUp();
  }, []);

  // Track whether the user is at the bottom. A threshold absorbs sub-pixel
  // scroll positions and the last few pixels of a fling.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const onScroll = (): void => {
      pinnedRef.current = body.scrollTop + body.clientHeight >= body.scrollHeight - 40;
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Follow the streaming output to the bottom — unless the user scrolled up
  // to read; scrolling back to the bottom resumes following.
  useEffect(() => {
    if (result?.phase === "running" && pinnedRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [result]);

  // A different view (new capture or a switched action) starts back at the
  // top with fresh content — follow its stream until the user says otherwise.
  useEffect(() => {
    pinnedRef.current = true;
  }, [payload?.action_id, payload?.source]);

  // A palette that opens for typing should receive the caret immediately.
  useEffect(() => {
    if (menuOpen) {
      filterRef.current?.focus();
    }
  }, [menuOpen]);

  // Stop cancels only the action on screen; other actions keep streaming.
  const stop = (): void => {
    if (payload) {
      runsRef.current.get(payload.action_id)?.abort();
    }
  };
  const retry = (): void => {
    if (payload) {
      run(payload, true);
    }
  };

  // The go-ahead on the confirmation card: remember it for this capture (so
  // Retry and action switches don't re-ask) and optionally stop asking at all.
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
    run(payload);
  };
  // Abort every in-flight run, invalidate them (so partials aren't shown),
  // and clear the kept results — the "clear the in-memory history" button.
  const reset = (): void => {
    abortAll();
    captureSig.current = undefined;
    approvedSig.current = undefined;
    ranDefinition.current.clear();
    setAwaitingSend(false);
    setPayload(undefined);
    setResults(new Map());
  };

  const dismiss = (): void => {
    // Ignore dismiss while any run is in flight — only the explicit Stop
    // button cancels. Finished results are kept so the tray can bring them back.
    if (runsRef.current.size > 0) {
      return;
    }
    hidePopup();
  };

  const toggleExpanded = (): void => {
    const next = !expanded;
    setExpanded(next);
    void (async () => {
      try {
        await invoke("set_popup_expanded", { expanded: next });
      } catch (error) {
        log.error("resizing the popup failed", error);
      }
    })();
  };

  const copyResult = (): void => {
    if (result?.phase !== "done") {
      return;
    }
    const { text } = result;
    void (async () => {
      try {
        await writeText(text);
        setCopied(true);
      } catch (error) {
        log.error("clipboard write failed", error);
      }
    })();
  };

  // The palette: the full action list, for the long tail beyond the quick
  // slots. Re-read from disk on every open, so file edits show up immediately.
  const toggleMenu = (): void => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setMenuFilter("");
    void (async () => {
      try {
        setActions(await listActions());
        setMenuOpen(true);
      } catch (error) {
        log.error("listing actions failed", error);
      }
    })();
  };

  const switchAction = (action: ActionInfo): void => {
    setMenuOpen(false);
    if (!payload || action.id === payload.action_id) {
      return;
    }
    const next: CapturePayload = {
      ...payload,
      action_id: action.id,
      label: action.label,
      role: action.role ?? "default",
      instructions: action.instructions,
      prompt: action.prompt,
      runnable: true,
    };
    // An action that already ran (or is still streaming) just becomes the
    // view: the derived result shows its kept text or its live stream — no
    // cancellation, no silent re-execution; Retry is the explicit re-run.
    if (results.has(action.id)) {
      logUsage(action.id, next.source.kind);
      setPayload(next);
      setCopied(false);
      return;
    }
    run(next);
  };

  // Number keys 1–4: switch to the quick slot's action (abort + re-run, via
  // switchAction). A number binds to a slot, not to the nth visible chip, so a
  // missing/absent action just makes its number a no-op — positions stay put.
  const switchToSlot = (num: number): void => {
    if (!payload || awaitingSend) {
      return;
    }
    const id = quickIds[num - 1];
    if (id === undefined || id === "" || id === payload.action_id) {
      return;
    }
    const action = actions.find((entry) => entry.id === id);
    if (action) {
      switchAction(action);
    }
  };

  // Effect Events, so the once-registered handlers below always see the
  // latest state (payload, actions, menuOpen change constantly) without
  // re-subscribing.
  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (menuOpen) {
        setMenuOpen(false);
      } else {
        dismiss();
      }
      return;
    }
    // A bare digit switches quick slots — but not while the palette is open
    // (its filter field owns typing) or when a text field has focus.
    if (menuOpen || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
      return;
    }
    if (/^[1-9]$/u.test(event.key)) {
      switchToSlot(Number(event.key));
    }
  });
  const onBlur = useEffectEvent(dismiss);

  // Dismiss on Escape or when the window loses focus (a click outside). The popup
  // is focused on show (Rust), so both reach us; the tray can bring it back.
  // While the action menu is open, Escape closes the menu first. Registered
  // once: re-subscribing onFocusChanged would leave a gap between the old
  // unlisten and the new listen where a blur went unseen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      onKeyDown(event);
    };
    globalThis.addEventListener("keydown", onKey);
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          onBlur();
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
      globalThis.removeEventListener("keydown", onKey);
      unlisten?.();
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

  // The quick slots, resolved: each number's action, or undefined when its id
  // names a deleted action. Positions are preserved (the number IS the slot),
  // so a gone action leaves a gap rather than shifting the rest.
  const quickSlots = quickIds.map((id) => actions.find((entry) => entry.id === id));
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

  // The action block: a prominent headline (the single source of truth for
  // "what is running") over a row of numbered quick slots. The current action
  // is the headline; the slots are the one-key switch. When the running action
  // is not among the four slots, none is highlighted — the layout never shifts.
  const actionRow = payload ? (
    <div className="flex flex-col gap-2">
      {/* Headline: status glyph + the action label as the visual anchor. The
          label carries the "-ing" via the spinner + ellipsis, so no per-action
          verb form is needed (works for custom labels too). */}
      <div
        className={cn(
          "flex items-center gap-2 text-sm font-semibold",
          failed ? "text-destructive" : "text-foreground",
        )}
      >
        {statusIcon}
        <span className="min-w-0 truncate">
          {actionLabel(payload.action_id, payload.label) || t.popup.chooseAction}
          {running ? "…" : ""}
        </span>
      </div>

      {/* Quick slots: numbered chips (1–4). The active one is highlighted; a
          run outside the four leaves none highlighted. A trailing button opens
          the full palette for everything else. */}
      <div className="flex flex-wrap items-center gap-1">
        {quickSlots.map((action, index) =>
          action ? (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                switchAction(action);
              }}
              className={cn(
                "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
                action.id === payload.action_id
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <kbd className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground/80">
                {index + 1}
              </kbd>
              <span className="max-w-32 truncate">{actionLabel(action.id, action.label)}</span>
              {/* A background action still streaming announces itself, so
                  "switch away and come back later" is a visible affordance. */}
              {results.get(action.id)?.phase === "running" ? (
                <LoaderCircle className="size-3 shrink-0 animate-spin" />
              ) : undefined}
            </button>
          ) : undefined,
        )}
        {/* The full-list palette only earns its place when there are more
            actions than the numbered slots can show — with just the
            pre-installed set, it would merely repeat the row above. */}
        {actions.length > QUICK_SLOT_COUNT ? (
          <button
            type="button"
            onClick={toggleMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t.popup.switchAction}
            title={t.popup.switchAction}
            className="flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
              placeholder={t.popup.chooseAction}
              onChange={(event) => {
                setMenuFilter(event.target.value);
              }}
              className="mb-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:border-ring"
            />
            <div className="max-h-[45svh] overflow-auto">
              {actions
                .filter((action) =>
                  actionLabel(action.id, action.label)
                    .toLowerCase()
                    .includes(menuFilter.trim().toLowerCase()),
                )
                .map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      switchAction(action);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs hover:bg-accent"
                  >
                    <Check
                      className={cn(
                        "size-3 shrink-0",
                        action.id === payload.action_id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{actionLabel(action.id, action.label)}</span>
                  </button>
                ))}
            </div>
          </div>
        </>
      ) : undefined}
    </div>
  ) : undefined;

  // Developer mode: exactly what the Liquid templates receive — locale
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
    if (result?.text) {
      resultView =
        failed || setup ? (
          <p
            className={cn(
              "text-sm wrap-break-word whitespace-pre-wrap",
              failed && "text-destructive",
              setup && "text-muted-foreground",
            )}
          >
            {result.text}
          </p>
        ) : (
          <Markdown text={result.text} imageHost={imageHost} />
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
        {actionRow}
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
        {actionRow}
        {payload.kind === "empty" ? undefined : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t.popup.noAction}</p>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                void invoke("open_url", { url: siteUrl(locale, "configuration/#routingjson") });
              }}
            >
              {t.popup.routingDocs}
              <ExternalLink className="size-3" />
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={cn("flex min-h-svh p-2", alignBottom ? "items-end" : "items-start")}>
      <div className="flex max-h-[calc(100svh-1rem)] w-full flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <ZenCopyMark className="size-4" />
          <span className="text-xs font-medium">ZenCopy</span>
          <div className="ms-auto flex items-center gap-0.5 text-muted-foreground">
            {/* Reading pane toggle: half the screen's width for long results,
                one click back to the compact card. Rust owns the geometry. */}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={toggleExpanded}
              aria-label={expanded ? t.popup.collapse : t.popup.expand}
              title={expanded ? t.popup.collapse : t.popup.expand}
            >
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
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

        {payload && (
          <div className="flex items-center justify-between gap-1 border-t px-2 py-1.5">
            <div>
              {done && (
                // Wipes the in-memory result but keeps the window open, so the
                // empty state is a visible confirmation that it cleared.
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reset}>
                  <Trash2 className="size-3.5" />
                  {t.popup.clear}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {running && (
                <Button variant="ghost" size="sm" onClick={stop}>
                  <Square className="size-3.5" />
                  {t.popup.stop}
                </Button>
              )}
              {done && (
                <>
                  <Button variant="ghost" size="sm" onClick={retry}>
                    <RotateCcw className="size-3.5" />
                    {t.popup.retry}
                  </Button>
                  {setup ? undefined : (
                    <Button variant="ghost" size="sm" onClick={copyResult}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? t.popup.copied : t.popup.copy}
                    </Button>
                  )}
                </>
              )}
            </div>
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
