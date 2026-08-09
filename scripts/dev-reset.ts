#!/usr/bin/env bun
// Reset the local ZenCopy environment to a clean first-run state.
// Cross-platform: macOS, Linux, and Windows (run with `bun scripts/dev-reset.ts`,
// or `bun run dev-reset`; node-compat APIs only, so @types/node covers it).
//
// Removes, wholesale (directories, not file lists, so the reset stays complete
// as future versions add files):
//   - the config dir (ai-sdk-catalog.json with API keys, rules.json, prompts/)
//   - the data dir (settings.json store), webview storage, and caches
//   - the log dir
//   - the autostart artifact (LaunchAgent plist / autostart .desktop / registry Run values)
//   - Linux: the copycopy GNOME Shell extension (disabled first, then deleted)
//
// The app re-creates all of it on the next launch — including the Welcome flow.
// Pass -y / --yes to skip the confirmation prompt.

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const IDENTIFIER = "app.zencopy";
const PRODUCT = "ZenCopy";
const GNOME_EXT_UUID = "copycopy@sincekmori.github.io";
// auto-launch (tauri-plugin-autostart) writes the app name as a value under
// both of these; StartupApproved carries the Task Manager enable/disable bit.
const WINDOWS_RUN_KEYS = [
  String.raw`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`,
  String.raw`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`,
];

const home = homedir();
const assumeYes = process.argv.includes("-y") || process.argv.includes("--yes");

function run(command: string, args: string[]): { ok: boolean; stdout: string } {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
}

/** One thing the reset deletes: a path, or a Windows registry value. */
interface Target {
  label: string;
  exists: () => boolean;
  remove: () => void;
}

function pathTarget(path: string): Target {
  return {
    label: path,
    exists: () => existsSync(path),
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

function registryValueTarget(key: string, value: string): Target {
  return {
    label: `registry: ${key} → ${value}`,
    exists: () => run("reg", ["query", key, "/v", value]).ok,
    remove: () => {
      if (!run("reg", ["delete", key, "/v", value, "/f"]).ok) {
        console.error(`warning: could not delete registry value ${value} under ${key}`);
      }
    },
  };
}

function targetsFor(platform: NodeJS.Platform): Target[] {
  switch (platform) {
    case "darwin": {
      const library = join(home, "Library");
      return [
        pathTarget(join(library, "Application Support", IDENTIFIER)), // config + data + settings store + stats
        pathTarget(join(library, "Logs", IDENTIFIER)),
        pathTarget(join(library, "Caches", IDENTIFIER)),
        pathTarget(join(library, "WebKit", IDENTIFIER)), // WKWebView storage (localStorage, …)
        pathTarget(join(library, "Saved Application State", `${IDENTIFIER}.savedState`)),
        pathTarget(join(library, "LaunchAgents", `${PRODUCT}.plist`)), // autostart
      ];
    }
    case "linux": {
      const config = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");
      const data = process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share");
      const cache = process.env["XDG_CACHE_HOME"] ?? join(home, ".cache");
      return [
        pathTarget(join(config, IDENTIFIER)), // config (catalog, rules, prompts/)
        pathTarget(join(data, IDENTIFIER)), // data dir (settings store, stats/, logs/, webview data)
        pathTarget(join(cache, IDENTIFIER)),
        pathTarget(join(config, "autostart", `${PRODUCT}.desktop`)), // autostart
        pathTarget(join(data, "gnome-shell", "extensions", GNOME_EXT_UUID)), // copycopy extension
      ];
    }
    case "win32": {
      // Tauri resolves the config and data dirs to Roaming, and local data
      // (logs/, the WebView2 profile, caches) to Local — both per identifier.
      const roaming = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
      const local = process.env["LOCALAPPDATA"] ?? join(home, "AppData", "Local");
      return [
        pathTarget(join(roaming, IDENTIFIER)),
        pathTarget(join(local, IDENTIFIER)),
        ...WINDOWS_RUN_KEYS.map((key) => registryValueTarget(key, PRODUCT)),
      ];
    }
    default: {
      console.error(`unsupported OS: ${platform} (this script covers macOS, Linux, and Windows)`);
      process.exit(1);
    }
  }
}

function appIsRunning(): boolean {
  // A running instance would flush its in-memory settings right back over the
  // deleted store on exit — refuse to reset around it.
  if (process.platform === "win32") {
    return [`${PRODUCT}.exe`, "zencopy.exe"].some((image) => {
      const { ok, stdout } = run("tasklist", ["/FI", `IMAGENAME eq ${image}`, "/NH"]);
      return ok && stdout.toLowerCase().includes(image.toLowerCase());
    });
  }
  return ["zencopy", PRODUCT].some((name) => run("pgrep", ["-x", name]).ok);
}

async function confirmDeletion(labels: string[]): Promise<boolean> {
  console.log("This will permanently delete:");
  for (const label of labels) {
    console.log(`  ${label}`);
  }
  if (assumeYes) {
    return true;
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question("Proceed? [y/N] ");
  readline.close();
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

/** Linux/GNOME: disable the extension before deleting its files, so the
 *  running shell drops it cleanly instead of tripping over a vanished dir. */
function disableGnomeExtension(): void {
  if (!run("gnome-extensions", ["info", GNOME_EXT_UUID]).ok) {
    return; // not installed, or not a GNOME session — nothing to disable
  }
  if (!run("gnome-extensions", ["disable", GNOME_EXT_UUID]).ok) {
    console.error("note: could not disable the GNOME extension; deleting its files anyway.");
  }
}

if (appIsRunning()) {
  console.error("ZenCopy is running — quit it first (tray menu → Quit), then re-run this script.");
  process.exit(1);
}

const targets = targetsFor(process.platform).filter((target) => target.exists());
if (targets.length === 0) {
  console.log("Nothing to reset — no ZenCopy state found.");
  process.exit(0);
}

if (!(await confirmDeletion(targets.map((target) => target.label)))) {
  console.log("Aborted — nothing deleted.");
  process.exit(1);
}

if (process.platform === "linux") {
  disableGnomeExtension();
}
for (const target of targets) {
  target.remove();
  console.log(`deleted: ${target.label}`);
}
console.log("Done. The next launch starts from a clean first-run state (Welcome flow included).");
