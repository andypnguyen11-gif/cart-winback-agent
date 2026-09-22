import { MODEL_PRICES, type ModelPrice } from "./config";
import type { AgentCallRecord, TokenUsage } from "./types";

/**
 * Read-time cost estimates from the dated price table. Returns null rather
 * than a guess when a model is not priced, so a wrong number never shows up
 * as a confident one.
 */

const PER_TOKEN = 1 / 1_000_000;

function priceFor(model: string): ModelPrice | null {
  const table: Record<string, ModelPrice> = MODEL_PRICES.perMillionTokens;
  return table[model] ?? null;
}

export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (
    usage.inputTokens * price.input * PER_TOKEN +
    usage.outputTokens * price.output * PER_TOKEN +
    usage.cacheCreationInputTokens * price.cacheWrite * PER_TOKEN +
    usage.cacheReadInputTokens * price.cacheRead * PER_TOKEN
  );
}

export function estimateRunCostUsd(calls: AgentCallRecord[]): number | null {
  let total = 0;
  for (const call of calls) {
    const cost = estimateCostUsd(call.model, call.usage);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}
