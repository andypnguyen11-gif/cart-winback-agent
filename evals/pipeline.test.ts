import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { STRATEGIST_TOOL_NAME } from "@/lib/agents/strategist";
import { COPYWRITER_TOOL_NAME } from "@/lib/agents/copywriter";
import { evaluateCart, evaluateCarts } from "@/lib/pipeline";
import type { Cart } from "@/lib/types";
import { scriptedByTool, toolMessage } from "./helpers/fakeMessages";

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

const fixedDeps = { now: () => new Date("2026-09-22T18:00:00.000Z"), newId: () => "rec-test-1" };

const feeWaiver = {
  offerType: "FEE_WAIVER",
  discountPercent: 0,
  reason: "First-time buyer with a $140 cart abandoned for 26 hours.",
  confidence: "medium",
  evidence: [{ field: "lifetimeTickets", value: 0 }, { field: "cartValue", value: 140 }],
};

const cleanEmail = {
  subject: "Your 4 Upper Deck seats are still in your cart",
  body: "Hi there,\n\nYour 4 Upper Deck tickets ($140) are waiting. Finish checkout and we'll waive the service fees.\n\nSeattle Seawolves Ticketing",
};

describe("evaluateCart: policy outcomes need no model", () => {
  it("C-1003 is SUPPRESSED with zero model calls and a policy-only trace", async () => {
    const { createMessage, calls } = scriptedByTool({});
    const result = await evaluateCart(cartById("C-1003"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("SUPPRESSED");
    expect(result.statusReason).toMatch(/opt/i);
    expect(calls).toHaveLength(0);
    expect(result.calls).toEqual([]);
    expect(result.recommendation).toBeNull();
    expect(result.message).toBeNull();
    expect(result.trace.map((t) => t.stage)).toEqual(["Policy engine"]);
    expect(result.recommendationId).toBe("rec-test-1");
    expect(result.evaluatedAt).toBe("2026-09-22T18:00:00.000Z");
  });

  it("C-1004 is WAIT and says when to re-check", async () => {
    const { createMessage, calls } = scriptedByTool({});
    const result = await evaluateCart(cartById("C-1004"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("WAIT");
    expect(result.recheckInHours).toBe(1);
    expect(calls).toHaveLength(0);
    expect(result.segment).toBeNull();
  });
});

describe("evaluateCart: eligible carts", () => {
  it("C-1002 runs strategist then copywriter and ends ACTIONABLE with a full trace", async () => {
    const { createMessage, calls } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [toolMessage(STRATEGIST_TOOL_NAME, feeWaiver)],
      [COPYWRITER_TOOL_NAME]: [toolMessage(COPYWRITER_TOOL_NAME, cleanEmail)],
    });
    const result = await evaluateCart(cartById("C-1002"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("ACTIONABLE");
    expect(result.segment?.segment).toBe("NEW");
    expect(result.offerPolicy?.maxDiscountPercent).toBe(10);
    expect(result.recommendation?.offerType).toBe("FEE_WAIVER");
    expect(result.message).toEqual(cleanEmail);
    expect(result.issues).toEqual([]);
    expect(result.agentError).toBeNull();
    expect(calls.map((c) => c.model)).toHaveLength(2);
    expect(result.calls.map((c) => c.agent)).toEqual(["strategist", "copywriter"]);
    expect(result.validation.offer?.passed).toBe(true);
    expect(result.validation.evidence?.passed).toBe(true);
    expect(result.validation.message?.passed).toBe(true);
    expect(result.trace.map((t) => t.stage)).toEqual([
      "Policy engine",
      "Strategist",
      "Offer and evidence checks",
      "Copywriter",
      "Message checks",
    ]);
    expect(result.trace.every((t) => t.status === "ok")).toBe(true);
    expect(result.trace[0].lines.join("\n")).toMatch(/consent/i);
    expect(result.trace[0].lines.join("\n")).toMatch(/NEW/);
  });

  it("the copywriter receives only the seven allowed fields, never the cart", async () => {
    const { createMessage, calls } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [toolMessage(STRATEGIST_TOOL_NAME, feeWaiver)],
      [COPYWRITER_TOOL_NAME]: [toolMessage(COPYWRITER_TOOL_NAME, cleanEmail)],
    });
    await evaluateCart(cartById("C-1002"), { ...fixedDeps, createMessage });
    const copyPrompt = JSON.stringify(calls[1].messages) + String(calls[1].system);
    expect(copyPrompt).not.toContain("F-511");
    expect(copyPrompt).not.toContain("lifetimeTickets");
  });

  it("a 25% discount for the LOYAL fan in C-1001 becomes NEEDS_REVIEW and the copywriter is never called", async () => {
    const { createMessage, calls } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [
        toolMessage(STRATEGIST_TOOL_NAME, {
          offerType: "PERCENT_DISCOUNT",
          discountPercent: 25,
          reason: "Big fan, big discount.",
          confidence: "high",
          evidence: [{ field: "lifetimeTickets", value: 14 }],
        }),
      ],
      [COPYWRITER_TOOL_NAME]: [toolMessage(COPYWRITER_TOOL_NAME, cleanEmail)],
    });
    const result = await evaluateCart(cartById("C-1001"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(calls).toHaveLength(1);
    expect(result.recommendation?.discountPercent).toBe(25);
    expect(result.message).toBeNull();
    expect(result.issues.join(" ")).toMatch(/25%.*cap of 0%/);
    expect(result.statusReason).toMatch(/offer|evidence/i);
    const checkStage = result.trace.find((t) => t.stage === "Offer and evidence checks");
    expect(checkStage?.status).toBe("failed");
    expect(result.trace.find((t) => t.stage === "Copywriter")?.status).toBe("skipped");
  });

  it("copy with a blocked phrase becomes NEEDS_REVIEW but keeps the draft for the marketer", async () => {
    const { createMessage } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [toolMessage(STRATEGIST_TOOL_NAME, feeWaiver)],
      [COPYWRITER_TOOL_NAME]: [
        toolMessage(COPYWRITER_TOOL_NAME, { ...cleanEmail, body: "Last chance! Your seats are still available." }),
      ],
    });
    const result = await evaluateCart(cartById("C-1002"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.message?.body).toContain("Last chance");
    expect(result.issues.join(" ")).toMatch(/last chance/i);
    expect(result.validation.message?.passed).toBe(false);
  });

  it("a NO_ACTION recommendation is ACTIONABLE with no email and the copywriter skipped", async () => {
    const { createMessage, calls } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [
        toolMessage(STRATEGIST_TOOL_NAME, {
          offerType: "NO_ACTION",
          discountPercent: 0,
          reason: "Low-value cart from an active buyer; let them finish on their own.",
          confidence: "medium",
          evidence: [{ field: "cartValue", value: 70 }],
        }),
      ],
    });
    const result = await evaluateCart(cartById("C-1005"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("ACTIONABLE");
    expect(result.recommendation?.offerType).toBe("NO_ACTION");
    expect(result.message).toBeNull();
    expect(calls).toHaveLength(1);
    expect(result.trace.find((t) => t.stage === "Copywriter")?.status).toBe("skipped");
  });

  it("a strategist API failure becomes NEEDS_REVIEW with the error surfaced, not thrown", async () => {
    const { createMessage } = scriptedByTool({ [STRATEGIST_TOOL_NAME]: [new Error("529 overloaded")] });
    const result = await evaluateCart(cartById("C-1002"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.agentError?.kind).toBe("API_ERROR");
    expect(result.statusReason).toContain("529 overloaded");
    expect(result.recommendation).toBeNull();
  });

  it("a copywriter failure still preserves the validated recommendation", async () => {
    const { createMessage } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [toolMessage(STRATEGIST_TOOL_NAME, feeWaiver)],
      [COPYWRITER_TOOL_NAME]: [new Error("timeout")],
    });
    const result = await evaluateCart(cartById("C-1002"), { ...fixedDeps, createMessage });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.recommendation?.offerType).toBe("FEE_WAIVER");
    expect(result.validation.offer?.passed).toBe(true);
    expect(result.agentError?.kind).toBe("API_ERROR");
  });
});

describe("evaluateCart without an API key", () => {
  const original = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });

  it("policy outcomes still work and eligible carts become NEEDS_REVIEW with MISSING_API_KEY", async () => {
    const results = await evaluateCarts(carts, fixedDeps);
    const byId = Object.fromEntries(results.map((r) => [r.cartId, r]));
    expect(byId["C-1003"].status).toBe("SUPPRESSED");
    expect(byId["C-1004"].status).toBe("WAIT");
    expect(byId["C-1002"].status).toBe("NEEDS_REVIEW");
    expect(byId["C-1002"].agentError?.kind).toBe("MISSING_API_KEY");
  });
});

describe("evaluateCarts", () => {
  it("returns one result per cart in fixture order with distinct recommendation ids", async () => {
    let n = 0;
    const { createMessage } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [1, 2, 3].map(() => toolMessage(STRATEGIST_TOOL_NAME, feeWaiver)),
      [COPYWRITER_TOOL_NAME]: [1, 2, 3].map(() => toolMessage(COPYWRITER_TOOL_NAME, cleanEmail)),
    });
    const results = await evaluateCarts(carts, { ...fixedDeps, newId: () => `rec-${++n}`, createMessage });

    expect(results.map((r) => r.cartId)).toEqual(["C-1001", "C-1002", "C-1003", "C-1004", "C-1005"]);
    expect(new Set(results.map((r) => r.recommendationId)).size).toBe(5);
  });
});
