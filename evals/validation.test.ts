import { describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { getOfferPolicy } from "@/lib/policy/offerRules";
import { validateOffer } from "@/lib/validation/validateOffer";
import { validateMessage } from "@/lib/validation/validateMessage";
import { failures } from "@/lib/validation/result";
import type { Cart, MessageOutput, StrategistOutput } from "@/lib/types";

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
  evidence: [{ field: "lifetimeTickets", value: 0 }],
};

describe("validateOffer", () => {
  it("passes an allowed offer within cap and reports every check as passed", () => {
    const result = validateOffer(base, getOfferPolicy("NEW"));
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(2);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("rejects an offer type that is not on the segment's menu", () => {
    const result = validateOffer({ ...base, offerType: "PERSONAL_OUTREACH" }, getOfferPolicy("NEW"));
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/PERSONAL_OUTREACH.*not allowed/i);
  });

  it("rejects a discount above the cap and names both numbers", () => {
    const result = validateOffer(
      { ...base, offerType: "PERCENT_DISCOUNT", discountPercent: 15 },
      getOfferPolicy("NEW"),
    );
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/15%.*10%/);
  });

  it("rejects any discount for a zero-cap segment even if PERCENT_DISCOUNT were somehow chosen", () => {
    const result = validateOffer(
      { ...base, offerType: "PERCENT_DISCOUNT", discountPercent: 5 },
      getOfferPolicy("LOYAL"),
    );
    expect(result.passed).toBe(false);
    const text = failures(result).join(" ");
    expect(text).toMatch(/not allowed/i);
    expect(text).toMatch(/cap/i);
  });

  it("rejects a non-zero discount attached to a non-discount offer", () => {
    const result = validateOffer({ ...base, offerType: "FEE_WAIVER", discountPercent: 5 }, getOfferPolicy("NEW"));
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/FEE_WAIVER/);
  });

  it("rejects PERCENT_DISCOUNT with a zero discount as incoherent", () => {
    const result = validateOffer({ ...base, offerType: "PERCENT_DISCOUNT", discountPercent: 0 }, getOfferPolicy("NEW"));
    expect(result.passed).toBe(false);
  });

  it("accepts a discount exactly at the cap", () => {
    const result = validateOffer({ ...base, offerType: "PERCENT_DISCOUNT", discountPercent: 10 }, getOfferPolicy("NEW"));
    expect(result.passed).toBe(true);
  });
});

describe("validateMessage", () => {
  const newFanCart = cartById("C-1002"); // 4 seats, Upper Deck, $140, NEW
  const discountOffer: StrategistOutput = { ...base, offerType: "PERCENT_DISCOUNT", discountPercent: 10 };
  const ctx = { offer: discountOffer, cart: newFanCart, segment: "NEW" as const };

  const clean: MessageOutput = {
    subject: "Your 4 Upper Deck seats are still in your cart",
    body: "Hi there,\n\nYour 4 Upper Deck tickets ($140) are waiting in your cart. Finish checkout and we'll take 10% off.\n\nThanks again for considering the Seawolves.\n\nSeattle Seawolves Ticketing",
  };

  it("passes a clean message whose numbers match the offer and cart", () => {
    const result = validateMessage(clean, ctx);
    expect(result.passed).toBe(true);
  });

  it("does not block the word 'again'", () => {
    const result = validateMessage({ ...clean, body: "See you again soon. Thanks again!" }, ctx);
    expect(result.passed).toBe(true);
  });

  it("rejects a percentage that differs from the offer", () => {
    const result = validateMessage({ ...clean, body: "Finish checkout and we'll take 15% off." }, ctx);
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/15%/);
  });

  it("rejects any percentage when the offer is not a discount", () => {
    const result = validateMessage(clean, { ...ctx, offer: base });
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/10%/);
  });

  it("rejects a dollar figure that is not the cart value", () => {
    const result = validateMessage({ ...clean, body: "Your $99 cart is waiting. 10% off." }, ctx);
    expect(result.passed).toBe(false);
    expect(failures(result).join(" ")).toMatch(/\$99/);
  });

  it("accepts the cart value with cents or thousands formatting", () => {
    const bigCart = { ...newFanCart, cartValue: 1540 };
    const result = validateMessage({ ...clean, body: "Your $1,540.00 cart is waiting. 10% off." }, { ...ctx, cart: bigCart });
    expect(result.passed).toBe(true);
  });

  it.each([
    "This is your last chance to grab them.",
    "Your offer expires tonight!",
    "Only 3 left in this section.",
    "For a limited time, finish checkout.",
    "Your seats are still available.",
    "We've held your seats.",
    "Seats guaranteed if you act now.",
  ])("rejects urgency or seat claim: %s", (sentence) => {
    const result = validateMessage({ ...clean, body: `${sentence} 10% off.` }, ctx);
    expect(result.passed).toBe(false);
  });

  it.each([
    "Since you attended our home opener, we saved this.",
    "Hope you enjoyed the last game.",
    "After last week's match, come back.",
    "Bring your favorite player's jersey.",
  ])("rejects invented history for any segment: %s", (sentence) => {
    const result = validateMessage({ ...clean, body: `${sentence} 10% off.` }, ctx);
    expect(result.passed).toBe(false);
  });

  it("matches phrases case-insensitively and with curly apostrophes", () => {
    const result = validateMessage({ ...clean, body: "After LAST WEEK’S MATCH, 10% off." }, ctx);
    expect(result.passed).toBe(false);
  });

  it("checks the subject line too", () => {
    const result = validateMessage({ ...clean, subject: "Last chance: 4 Upper Deck seats" }, ctx);
    expect(result.passed).toBe(false);
  });

  it.each(["Welcome back!", "As a season ticket holder, you know the drill.", "Like last season, we're ready.", "As a returning fan, thanks."])(
    "rejects returning-fan language for a NEW fan: %s",
    (sentence) => {
      const result = validateMessage({ ...clean, body: `${sentence} 10% off.` }, ctx);
      expect(result.passed).toBe(false);
      expect(failures(result).join(" ")).toMatch(/first-time|new/i);
    },
  );

  it("allows 'welcome back' for a fan who actually has purchase history", () => {
    const lapsedCart = cartById("C-1005");
    const result = validateMessage(
      { subject: "Your 2 Upper Deck seats are waiting", body: "Welcome back! Your $70 cart is ready. 10% off when you finish." },
      { offer: discountOffer, cart: lapsedCart, segment: "LAPSED" },
    );
    expect(result.passed).toBe(true);
  });

  it("names the failing phrase so the reviewer knows what tripped it", () => {
    const result = validateMessage({ ...clean, body: "Limited time: 10% off." }, ctx);
    expect(failures(result).join(" ")).toMatch(/limited time/i);
  });
});
