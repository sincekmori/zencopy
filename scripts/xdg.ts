// Where the app keeps its files on Linux, resolved as the app resolves it —
// for the dev scripts that reach into those directories.
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** An XDG base directory as the app reads it (the `dirs` crate): the
 *  variable when it names an absolute path, else the default under home. A
 *  value that is empty or relative is ignored, as the spec says — joined as
 *  it stands, it would name a directory under wherever the script runs. */
export function xdgDir(
  variable: "XDG_CACHE_HOME" | "XDG_CONFIG_HOME" | "XDG_DATA_HOME",
  ...fallback: string[]
): string {
  const value = process.env[variable];
  return value !== undefined && isAbsolute(value) ? value : join(homedir(), ...fallback);
}
