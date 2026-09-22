import { describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { validateEvidence } from "@/lib/validation/validateEvidence";
import { failures } from "@/lib/validation/result";
import type { Cart, StrategistOutput } from "@/lib/types";

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

const base: StrategistOutput = {
  offerType: "FEE_WAIVER",
  discountPercent: 0,
  reason: "First-time buyer with a high-value cart.",
  confidence: "medium",
  evidence: [
    { field: "lifetimeTickets", value: 0 },
    { field: "cartValue", value: 140 },
    { field: "abandonedHours", value: 26 },
  ],
};

describe("validateEvidence", () => {
  const cart = cartById("C-1002");

  it("passes when every cited field exists with the same value", () => {
    const result = validateEvidence(base, cart);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(3);
  });

  it("rejects a field that does not exist on the cart", () => {
    const result = validateEvidence({ ...base, evidence: [{ field: "attendedLastGame", value: true }] }, cart);
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/attendedLastGame.*not a cart field/i);
  });

  it("rejects a real field cited with the wrong value", () => {
    const result = validateEvidence({ ...base, evidence: [{ field: "cartValue", value: 400 }] }, cart);
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/cartValue.*400.*140/);
  });

  it("rejects a numeric value cited as a string, since that is not the source value", () => {
    const result = validateEvidence({ ...base, evidence: [{ field: "cartValue", value: "140" }] }, cart);
    expect(result.passed).toBe(false);
  });

  it("accepts null when the source is null", () => {
    const result = validateEvidence({ ...base, evidence: [{ field: "lastPurchaseDaysAgo", value: null }] }, cart);
    expect(result.passed).toBe(true);
  });

  it("accepts string and boolean fields when they match exactly", () => {
    const result = validateEvidence(
      { ...base, evidence: [{ field: "section", value: "Upper Deck" }, { field: "emailOptIn", value: true }] },
      cart,
    );
    expect(result.passed).toBe(true);
  });

  it("reports one check per evidence item so the trace shows what was verified", () => {
    const result = validateEvidence(base, cart);
    expect(result.checks.map((c) => c.name)).toEqual(["evidence:lifetimeTickets", "evidence:cartValue", "evidence:abandonedHours"]);
  });

  it("fails the whole result if any single item is wrong, even when the others are right", () => {
    const result = validateEvidence({ ...base, evidence: [...base.evidence, { field: "seats", value: 2 }] }, cart);
    expect(result.passed).toBe(false);
    expect(result.checks.filter((c) => c.passed)).toHaveLength(3);
  });
});
