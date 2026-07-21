import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent, useState } from "react";

/**
 * Subscribe to a Tauri event for the component's lifetime. Encapsulates the
 * async-listen races every call site used to hand-roll: the subscription is
 * torn down even when the component unmounts before `listen` resolves, and
 * the handler is an Effect Event so each event sees the latest closure
 * without ever re-subscribing (a re-subscribe has a gap where events are
 * missed between the old unlisten and the new listen).
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void): void {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const un = await listen<T>(event, (incoming) => {
        onEvent(incoming.payload);
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
  }, [event]);
}

/**
 * A value loaded once (a settings read) and then kept live by a broadcast
 * event carrying the new value. Returns [value, setValue] like useState, so a
 * window that also *writes* the setting can reflect its own change instantly.
 * `load` must be a stable function (a module-level reader).
 */
export function useLiveValue<T>(
  load: () => Promise<T>,
  event: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await load();
      if (!cancelled) {
        setValue(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);
  useTauriEvent<T>(event, setValue);
  return [value, setValue];
}
