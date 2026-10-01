// ai-sdk-catalog.json as the settings screens read and write it: the text, the
// one check that says whether the app can run on it, and the two ways to
// write — a whole text, or a change made to the config the file holds.
// Neither puts a config on disk that fails the check, and neither writes over
// a file it cannot read: that rule lives here, not in the screens.

import { invoke } from "@tauri-apps/api/core";
import type { Config } from "ai-sdk-catalog";
import { runnableConfig } from "@/lib/llm.ts";
import { createLogger } from "@/lib/log.ts";
import type { Messages } from "@/lib/messages/types.ts";
import { catalogJson } from "@/lib/quickstart.ts";

const log = createLogger("catalog");

/** Why some text is not a config the app can run. Syntax and schema are
 *  reported separately — "invalid JSON" on a well-formed file with a wrong
 *  shape would send the user hunting for a missing comma. `io`: the read or
 *  the write itself failed. */
export type CatalogProblem = "syntax" | "schema" | "io";

type Checked =
  | { config: Config; problem?: undefined }
  | { config?: undefined; problem: CatalogProblem };

/** What a write came to: the config now on disk and its text, or why nothing
 *  was written — with the file's own text (`unreadable`) when the reason is
 *  that file, which a screen shows so it can be fixed. */
type Written =
  | { config: Config; json: string; problem?: undefined }
  | { config?: undefined; problem: CatalogProblem; unreadable?: string };

/** The sentence a problem is told in. */
export function catalogProblemText(t: Messages, problem: CatalogProblem): string {
  return { syntax: t.ai.invalidJson, schema: t.ai.invalidSchema, io: t.ai.saveFailed }[problem];
}

/** The file's text — "" when there is no file yet. */
export async function readCatalog(): Promise<string> {
  return await invoke<string>("read_catalog");
}

/** What config text holds: nothing (`undefined`, for no file yet or an empty
 *  one — nothing set up, which is not a broken config), a config the app can
 *  run, or why it cannot — by the runtime's own check. The user sees an i18n
 *  sentence only; what failed goes to the log. */
export async function checkCatalog(text: string): Promise<Checked | undefined> {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return { config: await runnableConfig(text) };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { problem: "syntax" };
    }
    log.warn("the config is not one the app can run", error);
    return { problem: "schema" };
  }
}

/** Check config text, then write it: a file the app would refuse never
 *  reaches disk, so a save cannot break the popup (only a hand edit can). */
export async function writeCatalog(json: string): Promise<Written> {
  const checked = await checkCatalog(json);
  if (checked?.config === undefined) {
    // No text at all is no JSON either.
    return { problem: checked?.problem ?? "syntax" };
  }
  try {
    await invoke("write_catalog", { json });
    return { config: checked.config, json };
  } catch (error) {
    log.error("write catalog failed", error);
    return { problem: "io" };
  }
}

/** Write a change into the config the file holds NOW — it is read here, so
 *  everything else in it survives, what was written since a screen last
 *  looked included. `edit` gets `undefined` when there is no config yet. A
 *  file the app cannot run is left alone and handed back (`unreadable`): a
 *  form's fields are no reason to lose what someone wrote there. */
export async function editCatalog(edit: (config: Config | undefined) => Config): Promise<Written> {
  let text: string;
  try {
    text = await readCatalog();
  } catch (error) {
    log.error("reading the catalog failed", error);
    return { problem: "io" };
  }
  const held = await checkCatalog(text);
  if (held?.problem) {
    return { problem: held.problem, unreadable: text };
  }
  return await writeCatalog(catalogJson(edit(held?.config)));
}
