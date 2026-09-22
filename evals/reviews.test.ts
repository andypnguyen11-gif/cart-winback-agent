import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actionableEvaluation, carts, needsReviewEvaluation } from "./helpers/fixtures";
import { buildQueue } from "@/lib/queue";
import { appendReviewAction, checkEditedMessage, latestReviewByRecommendation, readReviewActions, canApprove } from "@/lib/reviews";
import { ReviewActionInputSchema, ReviewActionSchema } from "@/lib/schemas";
import { saveEvaluation } from "@/lib/storage";
import type { ReviewAction } from "@/lib/types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "winback-reviews-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const approved: ReviewAction = {
  cartId: "C-1002",
  recommendationId: "rec-actionable",
  decision: "APPROVED",
  reviewedAt: "2026-09-22T18:05:00.000Z",
};

describe("review action schema", () => {
  it("accepts a plain approval", () => {
    expect(ReviewActionSchema.safeParse(approved).success).toBe(true);
  });

  it("requires a reason to reject", () => {
    const result = ReviewActionSchema.safeParse({ ...approved, decision: "REJECTED" });
    expect(result.success).toBe(false);
    expect(ReviewActionSchema.safeParse({ ...approved, decision: "REJECTED", rejectionReason: "WRONG_OFFER" }).success).toBe(true);
  });

  it("requires both edited fields to record an edit", () => {
    expect(ReviewActionSchema.safeParse({ ...approved, decision: "EDITED", editedSubject: "Hi" }).success).toBe(false);
    expect(ReviewActionSchema.safeParse({ ...approved, decision: "EDITED", editedSubject: "Hi", editedBody: "Body" }).success).toBe(true);
  });

  it("the input schema is the action without the server-assigned timestamp", () => {
    const { reviewedAt: _dropped, ...input } = approved;
    void _dropped;
    expect(ReviewActionInputSchema.safeParse(input).success).toBe(true);
    expect(ReviewActionInputSchema.safeParse(approved).success).toBe(false);
  });
});

describe("review action store", () => {
  it("appends and reads back in order, and picks the latest per recommendation", async () => {
    await appendReviewAction(approved, { dir });
    await appendReviewAction({ ...approved, decision: "REJECTED", rejectionReason: "POOR_TONE", reviewedAt: "2026-09-22T18:06:00.000Z" }, { dir });
    await appendReviewAction({ ...approved, recommendationId: "rec-other", reviewedAt: "2026-09-22T18:07:00.000Z" }, { dir });

    const all = await readReviewActions({ dir });
    expect(all).toHaveLength(3);
    const latest = latestReviewByRecommendation(all);
    expect(latest["rec-actionable"].decision).toBe("REJECTED");
    expect(latest["rec-other"].decision).toBe("APPROVED");
  });

  it("reads an empty list when nothing has been recorded", async () => {
    expect(await readReviewActions({ dir })).toEqual([]);
  });
});

describe("checkEditedMessage", () => {
  it("returns no warnings for a clean edit", async () => {
    const evaluation = await actionableEvaluation();
    expect(checkEditedMessage(evaluation, { subject: "Your seats are waiting", body: "Finish checkout and we'll waive the fees." })).toEqual([]);
  });

  it("warns, in the validator's words, when an edit introduces a blocked phrase or a wrong number", async () => {
    const evaluation = await actionableEvaluation();
    const warnings = checkEditedMessage(evaluation, { subject: "Last chance", body: "Take 15% off your $140 cart." });
    expect(warnings.join(" ")).toMatch(/last chance/i);
    expect(warnings.join(" ")).toMatch(/15%/);
  });
});

describe("canApprove", () => {
  it("allows approval of an actionable recommendation", async () => {
    expect(canApprove(await actionableEvaluation())).toEqual({ ok: true });
  });

  it("blocks approval when the offer or evidence failed a policy check, and says why", async () => {
    const verdict = canApprove(await needsReviewEvaluation());
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    expect(verdict.reason).toMatch(/policy/i);
  });
});

describe("buildQueue with reviews", () => {
  it("attaches the latest review only while the stored recommendation still matches", async () => {
    const evaluation = await actionableEvaluation();
    await saveEvaluation(evaluation, { dir });
    await appendReviewAction(approved, { dir });

    const before = await buildQueue(carts, { dir });
    expect(before.results.find((r) => r.cart.cartId === "C-1002")?.review?.decision).toBe("APPROVED");

    await saveEvaluation({ ...evaluation, recommendationId: "rec-rerun" }, { dir });
    const after = await buildQueue(carts, { dir });
    expect(after.results.find((r) => r.cart.cartId === "C-1002")?.review).toBeNull();
  });
});
