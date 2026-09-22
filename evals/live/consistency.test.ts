import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { estimateRunCostUsd } from "@/lib/cost";
import { evaluateCart } from "@/lib/pipeline";
import { validateOffer } from "@/lib/validation/validateOffer";
import type { EvaluationResult } from "@/lib/types";

/**
 * Live consistency eval. Runs every eligible cart several times against the
 * real models and asserts the things that must never vary. Wording is
 * allowed to differ; policy is not. Costs a few cents per run.
 */

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const RUNS_PER_CART = Number(process.env.EVAL_RUNS ?? 3);
const carts = loadCarts();
const results: EvaluationResult[] = [];

describe.skipIf(!hasKey)("live consistency", () => {
  const eligible = carts.filter((c) => c.emailOptIn && c.abandonedHours >= 2);

  it.each(eligible.map((c) => [c.cartId, c] as const))(
    `%s: ${RUNS_PER_CART} runs never violate policy`,
    async (_id, cart) => {
      const runs: EvaluationResult[] = [];
      for (let i = 0; i < RUNS_PER_CART; i++) runs.push(await evaluateCart(cart));
      results.push(...runs);

      // Deterministic parts are identical every time.
      expect(new Set(runs.map((r) => r.segment?.segment)).size).toBe(1);
      expect(new Set(runs.map((r) => JSON.stringify(r.offerPolicy))).size).toBe(1);

      for (const run of runs) {
        // A model failure is reported, not hidden, but it is not a policy violation.
        if (run.agentError && run.agentError.kind !== "VALIDATION_FAILED") continue;
        expect(run.recommendation, `${cart.cartId} run produced no recommendation`).not.toBeNull();
        // Whatever the model chose, an ACTIONABLE result must be inside policy.
        if (run.status === "ACTIONABLE") {
          expect(validateOffer(run.recommendation!, run.offerPolicy!).passed).toBe(true);
          expect(run.validation.evidence?.passed).toBe(true);
          if (run.message) expect(run.validation.message?.passed).toBe(true);
        }
      }
    },
  );

  it("suppressed and waiting carts stay that way and cost nothing", async () => {
    for (const cart of carts.filter((c) => !eligible.includes(c))) {
      const run = await evaluateCart(cart);
      results.push(run);
      expect(["SUPPRESSED", "WAIT"]).toContain(run.status);
      expect(run.calls).toHaveLength(0);
    }
  });
});

afterAll(async () => {
  if (results.length === 0) return;
  const rows = results.map((r) => ({
    cartId: r.cartId,
    status: r.status,
    segment: r.segment?.segment ?? null,
    offer: r.recommendation?.offerType ?? null,
    discount: r.recommendation?.discountPercent ?? null,
    subject: r.message?.subject ?? null,
    issues: r.issues,
    costUsd: estimateRunCostUsd(r.calls),
    latencyMs: r.latencyMs,
  }));
  const total = rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const actionable = rows.filter((r) => r.status === "ACTIONABLE").length;
  const needsReview = rows.filter((r) => r.status === "NEEDS_REVIEW").length;

  console.log("\n[eval:live] per-run outcomes");
  console.table(rows.map(({ issues, ...r }) => ({ ...r, issues: issues.length })));
  console.log(`[eval:live] ${rows.length} runs · ${actionable} actionable · ${needsReview} needs review · est. $${total.toFixed(4)}`);

  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "eval-live-last.json"), JSON.stringify({ ranAt: new Date().toISOString(), rows, totalCostUsd: total }, null, 2));
});
