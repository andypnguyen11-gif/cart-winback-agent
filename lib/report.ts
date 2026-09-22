import { MODEL_PRICES } from "./config";
import { estimateCostUsd } from "./cost";
import type { DecisionStatus, RunRecord } from "./types";

/**
 * Read-time summary of data/runs.jsonl. Tokens come from the log; dollars are
 * computed here against the dated price table. Any unpriced model makes the
 * affected cost null rather than silently low.
 */

export interface CartSummary {
  cartId: string;
  runs: number;
  lastStatus: DecisionStatus;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface ModelSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface RunSummary {
  runs: number;
  byCart: CartSummary[];
  byModel: Record<string, ModelSummary>;
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number | null; avgLatencyMs: number };
  pricesAsOf: string;
}

function addCost(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

export function summarizeRuns(runs: RunRecord[]): RunSummary {
  const byCart = new Map<string, CartSummary>();
  const byModel: Record<string, ModelSummary> = {};
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 as number | null, avgLatencyMs: 0 };
  let latencySum = 0;

  for (const run of runs) {
    latencySum += run.latencyMs;
    const cart = byCart.get(run.cartId) ?? {
      cartId: run.cartId,
      runs: 0,
      lastStatus: run.status,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    cart.runs += 1;
    cart.lastStatus = run.status;

    for (const call of run.calls) {
      // A record with zero attempts (e.g. MISSING_API_KEY) is bookkeeping, not a call.
      if (call.attempts === 0) continue;
      const cost = estimateCostUsd(call.model, call.usage);
      cart.calls += 1;
      cart.inputTokens += call.usage.inputTokens;
      cart.outputTokens += call.usage.outputTokens;
      cart.costUsd = addCost(cart.costUsd, cost);

      const model = byModel[call.model] ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      model.calls += 1;
      model.inputTokens += call.usage.inputTokens;
      model.outputTokens += call.usage.outputTokens;
      model.costUsd = addCost(model.costUsd, cost);
      byModel[call.model] = model;

      totals.calls += 1;
      totals.inputTokens += call.usage.inputTokens;
      totals.outputTokens += call.usage.outputTokens;
      totals.costUsd = addCost(totals.costUsd, cost);
    }
    byCart.set(run.cartId, cart);
  }

  totals.avgLatencyMs = runs.length ? Math.round(latencySum / runs.length) : 0;
  return {
    runs: runs.length,
    byCart: [...byCart.values()].sort((a, b) => a.cartId.localeCompare(b.cartId)),
    byModel,
    totals,
    pricesAsOf: MODEL_PRICES.asOf,
  };
}

const money = (usd: number | null) => (usd === null ? "n/a" : `$${usd.toFixed(4)}`);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

export function formatReport(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push(`Run log: ${summary.runs} runs, ${summary.totals.calls} model calls, avg ${summary.totals.avgLatencyMs} ms per run`);
  lines.push("");
  lines.push(`${pad("Cart", 8)}${pad("Runs", 6)}${pad("Last status", 14)}${pad("Calls", 7)}${pad("In tok", 9)}${pad("Out tok", 9)}Est. cost`);
  for (const c of summary.byCart) {
    lines.push(`${pad(c.cartId, 8)}${pad(c.runs, 6)}${pad(c.lastStatus, 14)}${pad(c.calls, 7)}${pad(c.inputTokens, 9)}${pad(c.outputTokens, 9)}${money(c.costUsd)}`);
  }
  lines.push("");
  lines.push(`${pad("Model", 30)}${pad("Calls", 7)}${pad("In tok", 9)}${pad("Out tok", 9)}Est. cost`);
  for (const [model, m] of Object.entries(summary.byModel)) {
    lines.push(`${pad(model, 30)}${pad(m.calls, 7)}${pad(m.inputTokens, 9)}${pad(m.outputTokens, 9)}${money(m.costUsd)}`);
  }
  lines.push("");
  lines.push(`Total: ${summary.totals.inputTokens} in / ${summary.totals.outputTokens} out tokens, ${money(summary.totals.costUsd)} (list prices as of ${summary.pricesAsOf}; tokens are logged, dollars computed on read)`);
  return lines.join("\n");
}
