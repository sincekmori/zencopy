import type { ModelCall } from "./model-call.ts";

/** The harness's driver global, `globalThis.__zencopyHarness` — the channel
 *  between a driver (scripts/screenshot.ts, scripts/demo-video.ts) and the
 *  page for what cannot ride a URL. A driver seeds the `In` fields before the
 *  page's scripts run and reads the `Out` ones off the page; harness.ts is
 *  the other end of each. One shape, so neither side can misname a field. */
export interface HarnessGlobal {
  /** In: the catalog `read_catalog` returns (object or JSON text). */
  catalog?: unknown;
  /** In: the app's state for the shot — settings.json's keys (popupCorner,
   *  theme, textSize, devMode, …) and `autostart`; a key left out keeps the
   *  store mock's default, so a plain shot shows the app as installed. */
  settings?: Record<string, unknown>;
  /** Out: deliver a Tauri event to the app's listeners; returns how many
   *  received it, so a driver can tell "nobody listens yet" from "handled". */
  emit?: (event: string, payload: unknown) => number;
  /** Out: every `record_usage` call's arguments (prompt, kind, model,
   *  tokens), so a driver can report what its real model calls cost. */
  usage?: unknown[];
  /** Out: the model calls, as they went over `fetch` (see {@link ModelCall}). */
  exchanges?: ModelCall[];
  /** In: recorded responses to answer the app's model calls with, in order. */
  replay?: Replay[];
  /** Out: the commands invoked that no handler answers. */
  unhandled?: string[];
}

/** What a replayed call needs of a {@link ModelCall}: the response. */
export type Replay = Pick<ModelCall, "status" | "contentType" | "chunks">;
