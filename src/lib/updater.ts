// Auto-update, the quiet way. The hidden About window (alive from launch)
// hosts the single manager: check at startup and every 24 hours, download in
// the background so the visible choice is "restart the app" (~1s), never
// "watch a progress bar". Install is always user-triggered — on Windows the
// install step kills the app (installer limitation), so silent installs would
// vanish the app mid-task. Rust mirrors the offered version (set_update_state)
// for the tray item and the popup's footer hint.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createLogger } from "@/lib/log.ts";

const log = createLogger("updater");

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type UpdateState =
  | { phase: "none" }
  | { phase: "available"; version: string } // known; download pending or failed
  | { phase: "ready"; version: string } // downloaded; an app restart applies it
  | { phase: "installing"; version: string };

/** The last check's visible outcome: `idle` before any manual
 *  interest, `upToDate`/`failed` as the answer to "is there an update?".
 *  Orthogonal to UpdateState — a found update takes over the UI instead. */
export type CheckStatus = "idle" | "checking" | "upToDate" | "failed";

/** The slice of the plugin's `Update` object the manager relies on, so a
 *  dev-mode fake can stand in for the real thing. */
interface UpdateHandle {
  version: string;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

/** Dev-only escape hatch: `VITE_ZENCOPY_FAKE_UPDATE=9.9.9 bun tauri dev`
 *  renders the whole update surface (About button, tray item, popup hint)
 *  without a published release. Ignored in production builds. */
const FAKE_VERSION: string | undefined = import.meta.env.DEV
  ? (import.meta.env["VITE_ZENCOPY_FAKE_UPDATE"] as string | undefined)
  : undefined;

function delay(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- a timer has no promise form
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fakeUpdate(version: string): UpdateHandle {
  return { version, download: () => delay(4000), install: () => delay(1500) };
}

// Module-level singleton: the manager outlives React renders (the About window
// is never destroyed, only hidden) and useSyncExternalStore keeps the
// component in step without effect-dependency gymnastics.
let state: UpdateState = { phase: "none" };
let checkStatus: CheckStatus = "idle";
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: UpdateState): void {
  state = next;
  notify();
}

function setCheckStatus(next: CheckStatus): void {
  checkStatus = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UpdateState {
  return state;
}

function getCheckSnapshot(): CheckStatus {
  return checkStatus;
}

/** The update currently on offer. Replaced wholesale when a check finds a
 *  newer version than the one the user postponed. */
let offered: UpdateHandle | undefined;
/** In-flight or completed downloads by version; a failed attempt is evicted so
 *  the next check (or an install click) can retry. */
const downloads = new Map<string, Promise<void>>();
const readyVersions = new Set<string>();

/** Mirror the offered version into Rust: it stores it for late-loading
 *  windows, rebuilds the tray menu, and broadcasts `update-state`.
 *  `undefined` (serialized as a missing argument, so `Option::None`) clears. */
async function announce(version: string | undefined): Promise<void> {
  try {
    await invoke("set_update_state", { version });
  } catch (error) {
    log.warn("failed to mirror the update state to the tray and popup", error);
  }
}

async function downloadOnce(update: UpdateHandle): Promise<void> {
  try {
    await update.download();
    readyVersions.add(update.version);
  } catch (error) {
    downloads.delete(update.version);
    throw error;
  }
}

function ensureDownloaded(update: UpdateHandle): Promise<void> {
  let pending = downloads.get(update.version);
  if (!pending) {
    pending = downloadOnce(update);
    downloads.set(update.version, pending);
  }
  return pending;
}

/** Guards against overlapping checks (focus events, the 24h timer, and the
 *  manual button can all fire close together). */
let checking = false;

async function checkOnce(): Promise<void> {
  if (checking || state.phase === "installing") {
    return;
  }
  checking = true;
  try {
    await runCheck();
  } finally {
    checking = false;
  }
}

async function runCheck(): Promise<void> {
  setCheckStatus("checking");
  let found: UpdateHandle | undefined;
  if (FAKE_VERSION) {
    found = fakeUpdate(FAKE_VERSION);
  } else {
    try {
      found = (await check()) ?? undefined;
    } catch (error) {
      // Expected offline or before the first release — stays in the log.
      log.warn("update check failed", error);
      setCheckStatus("failed");
      return;
    }
  }
  if (!found) {
    setCheckStatus("upToDate");
    return;
  }
  // A found update takes over the About surface; the check row steps aside.
  setCheckStatus("idle");
  if (offered?.version === found.version) {
    // Same version still on offer: keep the object whose download may already
    // be done, and let ensureDownloaded retry if a past attempt failed.
    found = offered;
  } else {
    offered = found;
    log.info(`update available: ${found.version}`);
    setState({ phase: "available", version: found.version });
    void announce(found.version);
  }
  const target = found;
  try {
    await ensureDownloaded(target);
  } catch (error) {
    log.warn(`v${target.version}: background download failed, will retry`, error);
    return;
  }
  if (offered?.version === target.version && state.phase === "available") {
    log.info(`update ${target.version} downloaded; an app restart applies it`);
    setState({ phase: "ready", version: target.version });
  }
}

let started = false;

function start(): void {
  if (started) {
    return;
  }
  started = true;
  void checkOnce();
  setInterval(() => {
    void checkOnce();
  }, CHECK_INTERVAL_MS);
}

function install(): void {
  const target = offered;
  if (!target || state.phase === "none" || state.phase === "installing") {
    return;
  }
  setState({ phase: "installing", version: target.version });
  void (async () => {
    try {
      await ensureDownloaded(target);
      await target.install();
      if (FAKE_VERSION) {
        log.info("dev fake update: install simulated, resetting");
        offered = undefined;
        downloads.delete(target.version);
        readyVersions.delete(target.version);
        setState({ phase: "none" });
        void announce(undefined);
        return;
      }
      // On Windows install() has already exited the app; elsewhere the new
      // version sits on disk and takes over now.
      await relaunch();
    } catch (error) {
      log.error("update install failed", error);
      setState(
        readyVersions.has(target.version)
          ? { phase: "ready", version: target.version }
          : { phase: "available", version: target.version },
      );
    }
  })();
}

/** Ask "is there an update?" right now — the About window's manual check
 *  (and its focus-triggered auto-check). A no-op while a check is running. */
function checkNow(): void {
  void checkOnce();
}

/** The About window's view of the manager (and its only control surface). */
export function useUpdateManager(): {
  update: UpdateState;
  checkStatus: CheckStatus;
  install: () => void;
  check: () => void;
} {
  const update = useSyncExternalStore(subscribe, getSnapshot);
  const status = useSyncExternalStore(subscribe, getCheckSnapshot);
  useEffect(() => {
    start();
  }, []);
  return { update, checkStatus: status, install, check: checkNow };
}

/** The pending update's version for read-only surfaces (the popup's footer
 *  hint): initial value from Rust, then live via `update-state` broadcasts. */
export function useUpdateVersion(): string | undefined {
  const [version, setVersion] = useState<string | undefined>(undefined);
  useEffect(() => {
    let disposed = false;
    let sawEvent = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<string | null>("update-state", (event) => {
          sawEvent = true;
          if (!disposed) {
            setVersion(event.payload ?? undefined);
          }
        });
        if (disposed) {
          unlisten();
          return;
        }
        const current = await invoke<string | null>("update_state");
        if (!disposed && !sawEvent) {
          setVersion(current ?? undefined);
        }
      } catch (error) {
        log.warn("update state unavailable", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return version;
}
