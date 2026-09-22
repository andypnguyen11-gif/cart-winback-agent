import { describe, expect, it } from "vitest";
import { CartSchema, StrategistOutputSchema } from "@/lib/schemas";
import { loadCarts } from "@/lib/carts";

const validCart = {
  cartId: "C-1002",
  fanId: "F-511",
  seats: 4,
  section: "Upper Deck",
  cartValue: 140,
  abandonedHours: 26,
  lifetimeTickets: 0,
  lastPurchaseDaysAgo: null,
  emailOptIn: true,
};

describe("cart fixture", () => {
  it("loads the five supplied stale carts", () => {
    const carts = loadCarts();
    expect(carts.map((c) => c.cartId)).toEqual([
      "C-1001",
      "C-1002",
      "C-1003",
      "C-1004",
      "C-1005",
    ]);
  });

  it("represents a fan who has never purchased with a null lastPurchaseDaysAgo", () => {
    const c1002 = loadCarts().find((c) => c.cartId === "C-1002");
    expect(c1002?.lastPurchaseDaysAgo).toBeNull();
    expect(c1002?.lifetimeTickets).toBe(0);
  });

  it("keeps the only non-consenting fan flagged as opted out", () => {
    const c1003 = loadCarts().find((c) => c.cartId === "C-1003");
    expect(c1003?.emailOptIn).toBe(false);
  });
});

describe("CartSchema", () => {
  it("accepts a well-formed cart", () => {
    expect(CartSchema.safeParse(validCart).success).toBe(true);
  });

  it("rejects a cart with a negative value", () => {
    const result = CartSchema.safeParse({ ...validCart, cartValue: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects a cart missing the consent flag", () => {
    const withoutConsent: Partial<typeof validCart> = { ...validCart };
    delete withoutConsent.emailOptIn;
    const result = CartSchema.safeParse(withoutConsent);
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields so the model can never be fed data we did not intend", () => {
    const result = CartSchema.safeParse({ ...validCart, attendedLastGame: true });
    expect(result.success).toBe(false);
  });
});

describe("StrategistOutputSchema", () => {
  const validOutput = {
    offerType: "FEE_WAIVER",
    discountPercent: 0,
    reason: "First-time buyer with a high-value cart abandoned for more than a day.",
    confidence: "medium",
    evidence: [
      { field: "lifetimeTickets", value: 0 },
      { field: "cartValue", value: 140 },
    ],
  };

  it("accepts a well-formed recommendation", () => {
    expect(StrategistOutputSchema.safeParse(validOutput).success).toBe(true);
  });

  it("rejects an offer type that is not in the allowed vocabulary", () => {
    const result = StrategistOutputSchema.safeParse({ ...validOutput, offerType: "SEAT_HOLD" });
    expect(result.success).toBe(false);
  });

  it("rejects a recommendation with no evidence", () => {
    const result = StrategistOutputSchema.safeParse({ ...validOutput, evidence: [] });
    expect(result.success).toBe(false);
  });
});
