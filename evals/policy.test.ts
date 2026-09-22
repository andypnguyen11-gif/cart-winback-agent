import { describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { POLICY } from "@/lib/config";
import { checkEligibility } from "@/lib/policy/eligibility";
import { segmentFan } from "@/lib/policy/segmentation";
import { getOfferPolicy } from "@/lib/policy/offerRules";
import { FAN_SEGMENTS } from "@/lib/schemas";
import type { Cart } from "@/lib/types";

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

const baseCart: Cart = {
  cartId: "C-9000",
  fanId: "F-9000",
  seats: 2,
  section: "Upper Deck",
  cartValue: 80,
  abandonedHours: 24,
  lifetimeTickets: 5,
  lastPurchaseDaysAgo: 30,
  emailOptIn: true,
};

describe("eligibility", () => {
  it("C-1003 is always suppressed because the fan has not opted in", () => {
    const result = checkEligibility(cartById("C-1003"));
    expect(result.status).toBe("SUPPRESSED");
    expect(result.reason).toMatch(/opt/i);
  });

  it("C-1004 waits because only one hour has passed", () => {
    const result = checkEligibility(cartById("C-1004"));
    expect(result.status).toBe("WAIT");
    if (result.status !== "WAIT") throw new Error("unreachable");
    expect(result.recheckInHours).toBe(1);
  });

  it("consent is checked before staleness so a fresh cart without consent is suppressed, not waiting", () => {
    const result = checkEligibility({ ...baseCart, emailOptIn: false, abandonedHours: 0.5 });
    expect(result.status).toBe("SUPPRESSED");
  });

  it("a cart at exactly the stale threshold is eligible", () => {
    const result = checkEligibility({ ...baseCart, abandonedHours: POLICY.staleThresholdHours });
    expect(result.status).toBe("ELIGIBLE");
  });

  it("a cart just under the stale threshold waits for the remaining time", () => {
    const result = checkEligibility({ ...baseCart, abandonedHours: POLICY.staleThresholdHours - 0.5 });
    expect(result.status).toBe("WAIT");
    if (result.status !== "WAIT") throw new Error("unreachable");
    expect(result.recheckInHours).toBe(0.5);
  });

  it("the other four fixture carts are eligible or waiting, never suppressed", () => {
    for (const id of ["C-1001", "C-1002", "C-1004", "C-1005"]) {
      expect(checkEligibility(cartById(id)).status).not.toBe("SUPPRESSED");
    }
  });
});

describe("segmentation", () => {
  it("zero lifetime tickets is NEW", () => {
    expect(segmentFan(cartById("C-1002")).segment).toBe("NEW");
  });

  it("C-1001 with 14 tickets is LOYAL", () => {
    expect(segmentFan(cartById("C-1001")).segment).toBe("LOYAL");
  });

  it("C-1004 with 40 tickets is VIP", () => {
    expect(segmentFan(cartById("C-1004")).segment).toBe("VIP");
  });

  it("C-1005 with one ticket bought 300 days ago is LAPSED", () => {
    expect(segmentFan(cartById("C-1005")).segment).toBe("LAPSED");
  });

  it("a fan in the 1-9 band who bought within 180 days is RETURNING", () => {
    expect(segmentFan(baseCart).segment).toBe("RETURNING");
  });

  it("exactly 180 days since purchase is RETURNING, not LAPSED (C-1003's profile)", () => {
    expect(segmentFan(cartById("C-1003")).segment).toBe("RETURNING");
  });

  it("a quiet VIP stays VIP: 20 tickets and 400 days silent is not LAPSED", () => {
    const quietVip = { ...baseCart, lifetimeTickets: 20, lastPurchaseDaysAgo: 400 };
    expect(segmentFan(quietVip).segment).toBe("VIP");
  });

  it("a quiet loyal fan stays LOYAL", () => {
    const quietLoyal = { ...baseCart, lifetimeTickets: 10, lastPurchaseDaysAgo: 400 };
    expect(segmentFan(quietLoyal).segment).toBe("LOYAL");
  });

  it("band boundaries: 9 tickets is RETURNING, 10 is LOYAL, 19 is LOYAL, 20 is VIP", () => {
    expect(segmentFan({ ...baseCart, lifetimeTickets: 9 }).segment).toBe("RETURNING");
    expect(segmentFan({ ...baseCart, lifetimeTickets: 10 }).segment).toBe("LOYAL");
    expect(segmentFan({ ...baseCart, lifetimeTickets: 19 }).segment).toBe("LOYAL");
    expect(segmentFan({ ...baseCart, lifetimeTickets: 20 }).segment).toBe("VIP");
  });

  it("explains the segment in plain language", () => {
    expect(segmentFan(cartById("C-1005")).reason).toMatch(/300 days/);
  });
});

describe("offer rules", () => {
  it("loyal fan discount cap is zero and PERCENT_DISCOUNT is not on the menu", () => {
    const policy = getOfferPolicy("LOYAL");
    expect(policy.maxDiscountPercent).toBe(0);
    expect(policy.allowedOffers).not.toContain("PERCENT_DISCOUNT");
  });

  it("VIP discount cap is zero and PERSONAL_OUTREACH is available", () => {
    const policy = getOfferPolicy("VIP");
    expect(policy.maxDiscountPercent).toBe(0);
    expect(policy.allowedOffers).not.toContain("PERCENT_DISCOUNT");
    expect(policy.allowedOffers).toContain("PERSONAL_OUTREACH");
  });

  it("new-fan discount cap is 10%", () => {
    const policy = getOfferPolicy("NEW");
    expect(policy.maxDiscountPercent).toBe(10);
    expect(policy.allowedOffers).toContain("PERCENT_DISCOUNT");
  });

  it("lapsed-fan discount cap is 10%", () => {
    expect(getOfferPolicy("LAPSED").maxDiscountPercent).toBe(10);
  });

  it("every segment receives at least one allowed action besides NO_ACTION", () => {
    for (const segment of FAN_SEGMENTS) {
      const active = getOfferPolicy(segment).allowedOffers.filter((o) => o !== "NO_ACTION");
      expect(active.length, segment).toBeGreaterThan(0);
    }
  });

  it("PERCENT_DISCOUNT is on a menu only when the cap is above zero", () => {
    for (const segment of FAN_SEGMENTS) {
      const policy = getOfferPolicy(segment);
      const offersDiscount = policy.allowedOffers.includes("PERCENT_DISCOUNT");
      expect(offersDiscount, segment).toBe(policy.maxDiscountPercent > 0);
    }
  });

  it("SEAT_HOLD never appears on any menu", () => {
    for (const segment of FAN_SEGMENTS) {
      expect(getOfferPolicy(segment).allowedOffers as readonly string[]).not.toContain("SEAT_HOLD");
    }
  });

  it("the returned policy names its segment so the trace can show it", () => {
    expect(getOfferPolicy("NEW").segment).toBe("NEW");
  });
});
