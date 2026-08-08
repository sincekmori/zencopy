#!/usr/bin/env bun
// Append dummy events to the local usage.jsonl — development only, for
// exercising the settings cost viewer without burning real tokens.
// Cross-platform (run with `bun scripts/dev-usage.ts`, or `bun run dev-usage`).
//
// Writes events in the ledger's frozen vocabulary ({ at, action, kind, model,
// tokens: { input, output, cache_read, cache_write } }), spread over the last
// three months, and mixed on purpose: mostly a priced catalog model, plus
// some runs on an unpriced local model — the export's error path.
//
// Usage: bun scripts/dev-usage.ts [count]   (default 60)

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const IDENTIFIER = "app.zencopy";

function dataDir(): string {
  const home = homedir();
  switch (process.platform) {
    case "darwin": {
      return join(home, "Library", "Application Support", IDENTIFIER);
    }
    case "win32": {
      return join(process.env["APPDATA"] ?? join(home, "AppData", "Roaming"), IDENTIFIER);
    }
    default: {
      return join(process.env["XDG_DATA_HOME"] ?? join(home, ".local", "share"), IDENTIFIER);
    }
  }
}

// The same shapes the app records: real ids, kinds, and catalog addresses.
const ACTIONS = ["zencopy-zen", "zencopy-explain", "zencopy-translate", "zencopy-polish"];
const KINDS = ["text", "image", "files"];
const MODELS = [
  { model: "google:gemini-3.1-flash-lite", weight: 8 }, // priced by the catalog
  { model: "local:gemma4:e4b", weight: 2 }, // no price sheet -> "*" row
];

function pick<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function weightedModel(): string {
  const total = MODELS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of MODELS) {
    roll -= entry.weight;
    if (roll < 0) {
      return entry.model;
    }
  }
  return MODELS[0]!.model;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** RFC 3339 with the local UTC offset, exactly like the Rust side writes. */
function formatAt(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function makeEvent(now: Date): Record<string, unknown> {
  // Anywhere in the last ~90 days, so several months appear in the viewer.
  const at = new Date(now.getTime() - randomInt(0, 90 * 24 * 60 * 60) * 1000);
  const event: Record<string, unknown> = {
    at: formatAt(at),
    action: pick(ACTIONS),
    kind: pick(KINDS),
    model: weightedModel(),
  };
  const input = randomInt(200, 6000);
  const tokens: Record<string, number> = {
    input,
    output: randomInt(50, 1500),
  };
  if (Math.random() < 0.3) {
    tokens["cache_read"] = randomInt(100, input);
  }
  event["tokens"] = tokens;
  return event;
}

const count = Number(process.argv[2] ?? "60");
if (!Number.isInteger(count) || count <= 0) {
  console.error(`not a count: ${process.argv[2]}`);
  process.exit(1);
}

const dir = join(dataDir(), "stats");
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}
const file = join(dir, "usage.jsonl");
const now = new Date();
const lines = Array.from({ length: count }, () => `${JSON.stringify(makeEvent(now))}\n`).join("");
appendFileSync(file, lines);
console.log(`appended ${count} dummy events to ${file}`);
