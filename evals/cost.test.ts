import { describe, expect, it } from "vitest";
import { MODEL_PRICES } from "@/lib/config";
import { estimateCostUsd, estimateRunCostUsd } from "@/lib/cost";
import type { AgentCallRecord } from "@/lib/types";

const usage = (inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadInputTokens: cacheRead,
  cacheCreationInputTokens: cacheWrite,
});

describe("price table", () => {
  it("is dated and sourced so a reader knows how stale it is", () => {
    expect(MODEL_PRICES.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MODEL_PRICES.source).toMatch(/^https:\/\//);
  });

  it("covers both default models", () => {
    expect(MODEL_PRICES.perMillionTokens["claude-sonnet-5"]).toBeDefined();
    expect(MODEL_PRICES.perMillionTokens["claude-haiku-4-5-20251001"]).toBeDefined();
  });
});

describe("estimateCostUsd", () => {
  it("prices one million input and output tokens on Sonnet 5 at list price", () => {
    expect(estimateCostUsd("claude-sonnet-5", usage(1_000_000, 1_000_000))).toBe(12);
  });

  it("prices a realistic small call in fractions of a cent", () => {
    const cost = estimateCostUsd("claude-haiku-4-5-20251001", usage(600, 150));
    expect(cost).toBeCloseTo(0.00135, 6);
  });

  it("prices cache reads and writes separately from fresh input", () => {
    const fresh = estimateCostUsd("claude-sonnet-5", usage(1_000_000, 0));
    const cached = estimateCostUsd("claude-sonnet-5", usage(0, 0, 1_000_000, 0));
    expect(cached).toBeLessThan(fresh!);
  });

  it("returns null for a model that is not in the table instead of guessing", () => {
    expect(estimateCostUsd("claude-unknown-9", usage(1000, 1000))).toBeNull();
  });
});

describe("estimateRunCostUsd", () => {
  const call = (model: string, inputTokens: number, outputTokens: number): AgentCallRecord => ({
    agent: "strategist",
    model,
    promptVersion: "v1",
    attempts: 1,
    usage: usage(inputTokens, outputTokens),
    durationMs: 1,
    rawResponses: [],
  });

  it("sums across calls", () => {
    const total = estimateRunCostUsd([call("claude-sonnet-5", 1_000_000, 0), call("claude-haiku-4-5-20251001", 1_000_000, 0)]);
    expect(total).toBe(3);
  });

  it("is null if any call used an unpriced model", () => {
    expect(estimateRunCostUsd([call("claude-sonnet-5", 10, 10), call("mystery", 10, 10)])).toBeNull();
  });

  it("is zero for a run with no model calls", () => {
    expect(estimateRunCostUsd([])).toBe(0);
  });
});
