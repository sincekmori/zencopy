import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useEffectEvent, useRef, useState } from "react";

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
 * `load` must be a stable function (a module-level reader). A broadcast that
 * arrives while the load is still out is the newer word: the load's answer
 * does not replace it.
 */
export function useLiveValue<T>(
  load: () => Promise<T>,
  event: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const heard = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await load();
      if (!cancelled && !heard.current) {
        setValue(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);
  useTauriEvent<T>(event, (payload) => {
    heard.current = true;
    setValue(payload);
  });
  return [value, setValue];
}

/** The event a window's webview hears as it leaves the screen (Rust's
 *  `conceal_window`): what was only for this sitting — a "saved" note, a
 *  test's verdict — is dropped on it. */
export const WINDOW_CLOSED = "window-closed";

/**
 * Whether this window is open — on screen, as far as the app knows: revealed,
 * and not closed since. Rust says so both ways (`window-opened` from
 * reveal_window, `window-closed` from the close handler), and a window that
 * is already visible when the component mounts (the first-run welcome) counts
 * as open. The settings and About windows are created hidden at startup and
 * only hidden on close, so what waits on this does no work in a window nobody
 * is looking at.
 */
export function useWindowOpen(): boolean {
  const [open, setOpen] = useState(false);
  useTauriEvent("window-opened", () => {
    setOpen(true);
  });
  useTauriEvent(WINDOW_CLOSED, () => {
    setOpen(false);
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const visible = await getCurrentWindow().isVisible();
      if (!cancelled && visible) {
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return open;
}
