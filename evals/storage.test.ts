import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { evaluateCart } from "@/lib/pipeline";
import { appendRun, readEvaluations, readRuns, saveEvaluation, toRunRecord } from "@/lib/storage";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "winback-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cart = loadCarts().find((c) => c.cartId === "C-1003")!;
const deps = { now: () => new Date("2026-09-22T18:00:00.000Z") };

describe("evaluations store", () => {
  it("reads an empty map when nothing has been saved", async () => {
    expect(await readEvaluations({ dir })).toEqual({});
  });

  it("keeps the last evaluation per cart", async () => {
    const first = await evaluateCart(cart, { ...deps, newId: () => "rec-1" });
    const second = await evaluateCart(cart, { ...deps, newId: () => "rec-2" });
    await saveEvaluation(first, { dir });
    await saveEvaluation(second, { dir });

    const stored = await readEvaluations({ dir });
    expect(Object.keys(stored)).toEqual(["C-1003"]);
    expect(stored["C-1003"].recommendationId).toBe("rec-2");
  });

  it("writes readable JSON that survives a round trip", async () => {
    const result = await evaluateCart(cart, { ...deps, newId: () => "rec-1" });
    await saveEvaluation(result, { dir });
    const raw = JSON.parse(await readFile(path.join(dir, "evaluations.json"), "utf8"));
    expect(raw["C-1003"]).toEqual(result);
  });
});

describe("run log", () => {
  it("appends one JSON line per run and reads them back in order", async () => {
    const a = await evaluateCart(cart, { ...deps, newId: () => "rec-1" });
    const b = await evaluateCart(cart, { ...deps, newId: () => "rec-2" });
    await appendRun(toRunRecord(a, { strategist: "s-model", copywriter: "c-model" }), { dir });
    await appendRun(toRunRecord(b, { strategist: "s-model", copywriter: "c-model" }), { dir });

    const lines = (await readFile(path.join(dir, "runs.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    const runs = await readRuns({ dir });
    expect(runs.map((r) => r.recommendationId)).toEqual(["rec-1", "rec-2"]);
    expect(runs[0].models).toEqual({ strategist: "s-model", copywriter: "c-model" });
    expect(runs[0].cartId).toBe("C-1003");
    expect(runs[0].status).toBe("SUPPRESSED");
    expect(runs[0].calls).toEqual([]);
    expect(typeof runs[0].latencyMs).toBe("number");
  });

  it("stores tokens, never dollars", async () => {
    const a = await evaluateCart(cart, { ...deps, newId: () => "rec-1" });
    await appendRun(toRunRecord(a, { strategist: "s", copywriter: "c" }), { dir });
    const text = await readFile(path.join(dir, "runs.jsonl"), "utf8");
    expect(text).not.toMatch(/cost|usd|dollar/i);
  });

  it("reads an empty list when no runs exist", async () => {
    expect(await readRuns({ dir })).toEqual([]);
  });
});
