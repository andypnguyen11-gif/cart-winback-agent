import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/review/route";
import { readReviewActions } from "@/lib/reviews";
import { saveEvaluation } from "@/lib/storage";
import { actionableEvaluation, needsReviewEvaluation } from "./helpers/fixtures";

let dir: string;
const originalDataDir = process.env.DATA_DIR;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "winback-review-api-"));
  process.env.DATA_DIR = dir;
  await saveEvaluation(await actionableEvaluation());
  await saveEvaluation(await needsReviewEvaluation());
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/review", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("POST /api/review", () => {
  it("records an approval against the current recommendation and stamps the time", async () => {
    const res = await post({ cartId: "C-1002", recommendationId: "rec-actionable", decision: "APPROVED" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.review.decision).toBe("APPROVED");
    expect(json.review.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(json.warnings).toEqual([]);
    expect(await readReviewActions()).toHaveLength(1);
  });

  it("rejects a review made against a recommendation that is no longer current", async () => {
    const res = await post({ cartId: "C-1002", recommendationId: "rec-stale", decision: "APPROVED" });
    expect(res.status).toBe(409);
    expect(await readReviewActions()).toHaveLength(0);
  });

  it("saves an edit that trips a copy check, but returns the warnings", async () => {
    const res = await post({
      cartId: "C-1002",
      recommendationId: "rec-actionable",
      decision: "EDITED",
      editedSubject: "Last chance for your seats",
      editedBody: "Finish checkout and we'll waive the fees.",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warnings.join(" ")).toMatch(/last chance/i);
    expect((await readReviewActions())[0].decision).toBe("EDITED");
  });

  it("refuses to approve a recommendation whose offer failed a policy check", async () => {
    const res = await post({ cartId: "C-1001", recommendationId: "rec-review", decision: "APPROVED" });
    expect(res.status).toBe(422);
    expect(await readReviewActions()).toHaveLength(0);
  });

  it("still allows rejecting that recommendation", async () => {
    const res = await post({ cartId: "C-1001", recommendationId: "rec-review", decision: "REJECTED", rejectionReason: "DISCOUNT_TOO_HIGH" });
    expect(res.status).toBe(200);
  });

  it("returns 400 when a rejection has no reason", async () => {
    const res = await post({ cartId: "C-1002", recommendationId: "rec-actionable", decision: "REJECTED" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a cart with no stored evaluation", async () => {
    const res = await post({ cartId: "C-1005", recommendationId: "whatever", decision: "APPROVED" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/review", () => {
  it("lists recorded actions", async () => {
    await post({ cartId: "C-1002", recommendationId: "rec-actionable", decision: "APPROVED" });
    const json = await (await GET()).json();
    expect(json.actions).toHaveLength(1);
  });
});
