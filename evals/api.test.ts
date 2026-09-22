import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/evaluate/route";

let dir: string;
const originalDataDir = process.env.DATA_DIR;
const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "winback-api-"));
  process.env.DATA_DIR = dir;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/evaluate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("GET /api/evaluate", () => {
  it("returns every cart with a null evaluation before anything has run", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results.map((r: { cart: { cartId: string } }) => r.cart.cartId)).toEqual(["C-1001", "C-1002", "C-1003", "C-1004", "C-1005"]);
    expect(json.results.every((r: { evaluation: unknown }) => r.evaluation === null)).toBe(true);
  });
});

describe("POST /api/evaluate", () => {
  it("evaluates one cart, persists it, and GET reads it back with a cost estimate", async () => {
    const res = await post({ cartId: "C-1003" });
    expect(res.status).toBe(200);
    const json = await res.json();
    const c1003 = json.results.find((r: { cart: { cartId: string } }) => r.cart.cartId === "C-1003");
    expect(c1003.evaluation.status).toBe("SUPPRESSED");
    expect(c1003.evaluation.costUsd).toBe(0);
    const others = json.results.filter((r: { cart: { cartId: string } }) => r.cart.cartId !== "C-1003");
    expect(others.every((r: { evaluation: unknown }) => r.evaluation === null)).toBe(true);

    const again = await (await GET()).json();
    expect(again.results.find((r: { cart: { cartId: string } }) => r.cart.cartId === "C-1003").evaluation.recommendationId).toBe(
      c1003.evaluation.recommendationId,
    );
  });

  it("evaluates all carts when no cartId is given and never throws without an API key", async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    const json = await res.json();
    const statuses = Object.fromEntries(json.results.map((r: { cart: { cartId: string }; evaluation: { status: string } }) => [r.cart.cartId, r.evaluation.status]));
    expect(statuses).toEqual({
      "C-1001": "NEEDS_REVIEW",
      "C-1002": "NEEDS_REVIEW",
      "C-1003": "SUPPRESSED",
      "C-1004": "WAIT",
      "C-1005": "NEEDS_REVIEW",
    });
  });

  it("returns 404 for an unknown cart", async () => {
    const res = await post({ cartId: "C-9999" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed body", async () => {
    const res = await POST(new Request("http://localhost/api/evaluate", { method: "POST", body: "not json" }));
    expect(res.status).toBe(400);
  });
});
