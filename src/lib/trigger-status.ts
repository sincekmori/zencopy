import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { createLogger } from "@/lib/log.ts";
import { useTauriEvent } from "@/lib/use-tauri-event.ts";

const log = createLogger("trigger-status");

/** Mirror of copycopy's TriggerStatus: serde-tagged with `kind` (snake_case).
 *  The Rust side stores the latest report and re-broadcasts it as the
 *  `trigger-status` event (see lib.rs). */
export type TriggerStatus =
  | { kind: "listening" }
  | { kind: "gnome_extension_awaiting_login" }
  | { kind: "gnome_extension_outdated"; loaded: number; embedded: number }
  | { kind: "unsupported_session" }
  | { kind: "failed"; message: string };

/** The latest trigger status, or undefined while none has been reported.
 *  Queried once on mount (the report usually predates the window opening),
 *  then kept live via the `trigger-status` event. */
export function useTriggerStatus(): TriggerStatus | undefined {
  const [status, setStatus] = useState<TriggerStatus | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Rust's Option<TriggerStatus> arrives as `null` for None.
        const initial = await invoke<TriggerStatus | null>("trigger_status");
        if (!cancelled && initial !== null) {
          // Events win over the initial query: apply the query result only
          // when no event has landed in the meantime.
          setStatus((current) => current ?? initial);
        }
      } catch (error) {
        log.error("querying the trigger status failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useTauriEvent<TriggerStatus>("trigger-status", setStatus);

  return status;
}
