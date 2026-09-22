import { describe, expect, it } from "vitest";
import { COPYWRITER_TOOL_NAME } from "@/lib/agents/copywriter";
import { STRATEGIST_TOOL_NAME } from "@/lib/agents/strategist";
import { POLICY } from "@/lib/config";
import { evaluateCart } from "@/lib/pipeline";
import { OFFER_TYPES } from "@/lib/schemas";
import type { OfferType } from "@/lib/types";
import { cartById } from "./helpers/fixtures";
import { scriptedByTool, toolMessage } from "./helpers/fakeMessages";

/**
 * Golden dataset. These are the promises the README makes about the five
 * supplied carts. They are asserted through the whole pipeline with the
 * models replaced by scripted replies, including deliberately bad ones, so
 * the promise rests on deterministic code rather than on model behaviour.
 */

const neverCalled = () => {
  throw new Error("a model was called for a cart that policy should have stopped");
};

/** Evidence cites the real cart id so grounding passes and only offer/cap rules are under test. */
function strategistReply(cartId: string, offerType: OfferType, discountPercent: number) {
  return toolMessage(STRATEGIST_TOOL_NAME, {
    offerType,
    discountPercent,
    reason: "Scripted reply for the golden tests.",
    confidence: "medium",
    evidence: [{ field: "cartId", value: cartId }],
  });
}

function copyReply(discountPercent: number, cartValue: number) {
  const incentive = discountPercent > 0 ? `Finish checkout for ${discountPercent}% off.` : "Finish checkout when you're ready.";
  return toolMessage(COPYWRITER_TOOL_NAME, {
    subject: "Your seats are still in your cart",
    body: `Hi there,\n\nYour $${cartValue} cart is waiting. ${incentive}\n\nSeattle Seawolves Ticketing`,
  });
}

describe("golden: C-1003 is always SUPPRESSED", () => {
  it("never reaches a model, whatever the model would have said", async () => {
    const result = await evaluateCart(cartById("C-1003"), { createMessage: neverCalled });
    expect(result.status).toBe("SUPPRESSED");
    expect(result.calls).toHaveLength(0);
  });
});

describe("golden: C-1004 is WAIT", () => {
  it("waits without a model call and says how long", async () => {
    const result = await evaluateCart(cartById("C-1004"), { createMessage: neverCalled });
    expect(result.status).toBe("WAIT");
    expect(result.recheckInHours).toBe(POLICY.staleThresholdHours - 1);
    expect(result.calls).toHaveLength(0);
  });
});

describe("golden: C-1001 (loyal) never gets a percentage discount", () => {
  const cart = cartById("C-1001");
  const cases = OFFER_TYPES.flatMap((offerType) => [0, 5, 25].map((d) => [offerType, d] as const));

  it.each(cases)("strategist proposes %s at %d%% → ACTIONABLE only if on the loyal menu with 0%%", async (offerType, discount) => {
    const { createMessage } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [strategistReply(cart.cartId, offerType, discount)],
      [COPYWRITER_TOOL_NAME]: [copyReply(discount, cart.cartValue)],
    });
    const result = await evaluateCart(cart, { createMessage });

    const onMenu = POLICY.offers.LOYAL.allowedOffers.includes(offerType as never);
    const allowed = onMenu && discount === 0;
    if (allowed) {
      expect(result.status, `${offerType}@${discount} is on the loyal menu and should be actionable`).toBe("ACTIONABLE");
      expect(result.recommendation?.offerType).not.toBe("PERCENT_DISCOUNT");
    } else {
      expect(result.status, `${offerType}@${discount} must not be actionable`).toBe("NEEDS_REVIEW");
      expect(result.message).toBeNull();
    }
  });
});

describe("golden: C-1002 (new) discount never exceeds the new-fan cap", () => {
  const cart = cartById("C-1002");
  const cap = POLICY.offers.NEW.maxDiscountPercent;

  it.each([0, 1, 5, cap, cap + 1, 15, 50])("PERCENT_DISCOUNT at %d%%", async (discount) => {
    const { createMessage } = scriptedByTool({
      [STRATEGIST_TOOL_NAME]: [strategistReply(cart.cartId, "PERCENT_DISCOUNT", discount)],
      [COPYWRITER_TOOL_NAME]: [copyReply(discount, cart.cartValue)],
    });
    const result = await evaluateCart(cart, { createMessage });

    if (discount >= 1 && discount <= cap) {
      expect(result.status).toBe("ACTIONABLE");
    } else {
      expect(result.status).toBe("NEEDS_REVIEW");
      expect(result.message).toBeNull();
    }
    if (result.status === "ACTIONABLE") {
      expect(result.recommendation!.discountPercent).toBeLessThanOrEqual(cap);
    }
  });
});

describe("golden: consistency across repeated runs (mocked)", () => {
  it("wording may vary; eligibility, segment, menu, and cap never do", async () => {
    const cart = cartById("C-1002");
    const bodies = ["Come back and finish up.", "Your seats miss you.", "Ready when you are.", "Pick up where you left off.", "Still thinking it over?"];
    const results = [];
    for (const line of bodies) {
      const { createMessage } = scriptedByTool({
        [STRATEGIST_TOOL_NAME]: [strategistReply(cart.cartId, "FEE_WAIVER", 0)],
        [COPYWRITER_TOOL_NAME]: [
          toolMessage(COPYWRITER_TOOL_NAME, { subject: "Your seats are waiting", body: `${line} We'll waive the fees.\n\nSeattle Seawolves Ticketing` }),
        ],
      });
      results.push(await evaluateCart(cart, { createMessage }));
    }

    expect(new Set(results.map((r) => r.message?.body)).size).toBe(bodies.length);
    expect(new Set(results.map((r) => r.status))).toEqual(new Set(["ACTIONABLE"]));
    expect(new Set(results.map((r) => r.segment?.segment))).toEqual(new Set(["NEW"]));
    expect(new Set(results.map((r) => JSON.stringify(r.offerPolicy)))).toHaveProperty("size", 1);
  });
});
