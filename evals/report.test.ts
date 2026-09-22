import { describe, expect, it } from "vitest";
import { formatReport, summarizeRuns } from "@/lib/report";
import { toRunRecord } from "@/lib/storage";
import { actionableEvaluation, needsReviewEvaluation, suppressedEvaluation } from "./helpers/fixtures";

const models = { strategist: "claude-sonnet-5", copywriter: "claude-haiku-4-5-20251001" };

describe("summarizeRuns", () => {
  it("totals tokens and cost per cart and per model, using the price table", async () => {
    const runs = [
      toRunRecord(await actionableEvaluation(), models),
      toRunRecord(await actionableEvaluation(), models),
      toRunRecord(await needsReviewEvaluation(), models),
      toRunRecord(await suppressedEvaluation(), models),
    ].map((r, i) => ({ ...r, calls: r.calls.map((c) => ({ ...c, model: c.agent === "strategist" ? models.strategist : models.copywriter })), latencyMs: 100 * (i + 1) }));

    const summary = summarizeRuns(runs);
    expect(summary.runs).toBe(4);
    expect(summary.byCart.map((c) => c.cartId)).toEqual(["C-1001", "C-1002", "C-1003"]);

    const c1002 = summary.byCart.find((c) => c.cartId === "C-1002")!;
    expect(c1002.runs).toBe(2);
    expect(c1002.lastStatus).toBe("ACTIONABLE");
    // Two runs × (strategist 500/80 + copywriter 500/80) from the fake usage.
    expect(c1002.inputTokens).toBe(2000);
    expect(c1002.outputTokens).toBe(320);

    expect(summary.totals.calls).toBe(5);
    expect(summary.totals.inputTokens).toBe(2500);
    expect(summary.totals.costUsd).toBeCloseTo(
      // sonnet: 3 calls × (500×2 + 80×10)/1e6 ; haiku: 2 calls × (500×1 + 80×5)/1e6
      3 * (1000 + 800) / 1e6 + 2 * (500 + 400) / 1e6,
      8,
    );
    expect(summary.byModel[models.strategist].calls).toBe(3);
    expect(summary.byModel[models.copywriter].calls).toBe(2);
    expect(summary.totals.avgLatencyMs).toBe(250);
  });

  it("reports null cost when any model is unpriced instead of undercounting", async () => {
    const run = toRunRecord(await actionableEvaluation(), models);
    const summary = summarizeRuns([{ ...run, calls: run.calls.map((c) => ({ ...c, model: "mystery" })) }]);
    expect(summary.totals.costUsd).toBeNull();
  });

  it("handles an empty log", () => {
    const summary = summarizeRuns([]);
    expect(summary.runs).toBe(0);
    expect(summary.totals.costUsd).toBe(0);
  });
});

describe("formatReport", () => {
  it("prints a readable table with the price date", async () => {
    const run = toRunRecord(await actionableEvaluation(), models);
    const text = formatReport(summarizeRuns([run]));
    expect(text).toMatch(/C-1002/);
    expect(text).toMatch(/ACTIONABLE/);
    expect(text).toMatch(/prices as of \d{4}-\d{2}-\d{2}/i);
    expect(text).toMatch(/\$/);
  });
});
