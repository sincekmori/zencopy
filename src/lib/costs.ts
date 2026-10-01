// The cost engine every cost feature shares: the settings CSV export, the
// popup's live month readout, and the monthly cost cap all price the same
// ledger with the same arithmetic — one module, so their numbers can never
// disagree. Estimates by design (the ledger records completed runs only, and
// unpriceable runs contribute nothing); the settings UI says so and points at
// the provider's billing page for exact figures.

import { invoke } from "@tauri-apps/api/core";
import { modelCosts, type TokenUsage } from "@/lib/llm.ts";

/** One recorded model run, as read back from usage.jsonl. Lenient by design:
 *  any field may be absent (absence means unknown) — the reader must accept
 *  every line the ledger's frozen contract allows. */
interface UsageEvent {
  at?: string;
  model?: string;
  tokens?: Record<string, number>;
}

/** The ledger's billing buckets. Tokens and prices share this vocabulary, so
 *  pricing a run is a plain dot product over these keys. */
const COST_BUCKETS = ["input", "output", "cache_read", "cache_write"] as const;

/** One run's cost in USD: Σ tokens[bucket] × price[bucket] / 1M. */
function runCost(tokens: Record<string, number>, price: TokenUsage): number {
  let sum = 0;
  for (const bucket of COST_BUCKETS) {
    sum += (tokens[bucket] ?? 0) * (price[bucket] ?? 0);
  }
  return sum / 1e6;
}

/** The local YYYY-MM an event belongs to ("" when it carries no timestamp). */
function eventMonth(event: UsageEvent): string {
  return (event.at ?? "").slice(0, 7);
}

/** The current month in the same local YYYY-MM key the ledger produces. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Fraction digits that follow the size — sub-cent run costs are the norm. */
function usdDigits(value: number): number {
  if (value < 0.01) {
    return 4;
  }
  if (value < 1) {
    return 3;
  }
  return 2;
}

export function formatUsd(locale: string, value: number): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: usdDigits(value),
  }).format(value);
}

/**
 * This month's estimated spend in USD — the popup's live readout and the
 * cost cap decide from this one number. Runs the catalog can't price
 * contribute nothing (an estimate, never an error): a cap must not brick the
 * app over a missing price sheet, and the disclaimer owns the imprecision.
 * Throws when the ledger or catalog can't be read at all — callers choose
 * fail-open (the cap) or hide (the readout).
 */
export async function monthCostUsd(): Promise<number> {
  // The month is asked for by name: the ledger only grows, and this runs
  // around every prompt run — Rust hands back that month's lines and parses
  // no others.
  const month = currentMonth();
  const [events, prices] = await Promise.all([
    invoke<UsageEvent[]>("read_usage_stats", { month }),
    modelCosts(),
  ]);
  let sum = 0;
  for (const event of events) {
    if (event.model !== undefined && event.tokens) {
      const price = prices[event.model];
      if (price) {
        sum += runCost(event.tokens, price);
      }
    }
  }
  return sum;
}

/** RFC 4180 quoting, only when the value needs it. */
function csvCell(value: string): string {
  return /[",\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Why there is no cost table to export: nothing recorded yet, or the models
 *  the catalog cannot price, by name. */
export type CostCsvIssue = "empty" | string[];

/**
 * The all-time cost table as CSV: one row per month × model, cost in plain
 * USD decimals. Models the catalog can't price hold the export back and are
 * named — that hole has a fix (a cost block in the config), and a report
 * with silent holes would read as cheaper than reality. A completed run
 * whose provider reported no usage (the schema allows absent tokens) must
 * not block forever — nothing can ever supply the counts — so it stays in
 * its model's row, contributing the tokens it reported: none.
 */
export async function costCsv(): Promise<
  { csv: string; issue?: undefined } | { csv?: undefined; issue: CostCsvIssue }
> {
  const [events, prices] = await Promise.all([
    invoke<UsageEvent[]>("read_usage_stats"),
    modelCosts(),
  ]);
  if (events.length === 0) {
    return { issue: "empty" };
  }
  const rows = new Map<string, { month: string; model: string; cost: number }>();
  const unpriced = new Set<string>();
  for (const event of events) {
    const month = eventMonth(event);
    if (month) {
      const model = event.model ?? "?";
      const price = event.model === undefined ? undefined : prices[event.model];
      if (price) {
        const key = `${month}\u0000${model}`;
        const row = rows.get(key) ?? { month, model, cost: 0 };
        row.cost += event.tokens ? runCost(event.tokens, price) : 0;
        rows.set(key, row);
      } else {
        unpriced.add(model);
      }
    }
  }
  if (unpriced.size > 0) {
    return { issue: [...unpriced].toSorted() };
  }
  const lines = [...rows.values()]
    .toSorted((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
    .map((row) => `${row.month},${csvCell(row.model)},${row.cost.toFixed(6)}`);
  return { csv: ["month,model,cost_usd", ...lines, ""].join("\n") };
}
