import { describe, expect, it } from "vitest";
import { loadCarts } from "@/lib/carts";
import { runStrategist, STRATEGIST_TOOL_NAME } from "@/lib/agents/strategist";
import { segmentFan } from "@/lib/policy/segmentation";
import { getOfferPolicy } from "@/lib/policy/offerRules";
import { strategistValidators } from "@/lib/validation";
import type { Cart } from "@/lib/types";
import { scripted, toolMessage } from "./helpers/fakeMessages";

/**
 * The model misbehaves on purpose. These tests prove the deterministic layer,
 * not the prompt, is what keeps money and facts in bounds.
 */

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

function inputFor(cartId: string) {
  const cart = cartById(cartId);
  const segment = segmentFan(cart);
  return { cart, segment, offerPolicy: getOfferPolicy(segment.segment) };
}

describe("adversarial strategist", () => {
  it("a 25% discount for a LOYAL fan is caught and named, not sent onward", async () => {
    const input = inputFor("C-1001"); // 14 tickets → LOYAL, cap 0
    const { createMessage } = scripted([
      toolMessage(STRATEGIST_TOOL_NAME, {
        offerType: "PERCENT_DISCOUNT",
        discountPercent: 25,
        reason: "Big fan, big discount.",
        confidence: "high",
        evidence: [{ field: "lifetimeTickets", value: 14 }],
      }),
    ]);

    const result = await runStrategist(input, { createMessage, validators: strategistValidators(input) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("VALIDATION_FAILED");
    expect(result.issues.join(" ")).toMatch(/PERCENT_DISCOUNT.*not allowed/i);
    expect(result.issues.join(" ")).toMatch(/25%.*0%/);
    expect(result.output?.discountPercent).toBe(25);
  });

  it("fabricated evidence about attendance is caught even when the offer itself is fine", async () => {
    const input = inputFor("C-1002");
    const { createMessage } = scripted([
      toolMessage(STRATEGIST_TOOL_NAME, {
        offerType: "FEE_WAIVER",
        discountPercent: 0,
        reason: "They came to the opener.",
        confidence: "high",
        evidence: [{ field: "attendedLastGame", value: true }],
      }),
    ]);

    const result = await runStrategist(input, { createMessage, validators: strategistValidators(input) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("VALIDATION_FAILED");
    expect(result.issues.join(" ")).toMatch(/attendedLastGame/);
  });

  it("a compliant answer passes the same validators untouched", async () => {
    const input = inputFor("C-1002");
    const { createMessage } = scripted([
      toolMessage(STRATEGIST_TOOL_NAME, {
        offerType: "PERCENT_DISCOUNT",
        discountPercent: 10,
        reason: "First-time buyer, $140 cart, 26 hours.",
        confidence: "medium",
        evidence: [{ field: "lifetimeTickets", value: 0 }, { field: "cartValue", value: 140 }],
      }),
    ]);

    const result = await runStrategist(input, { createMessage, validators: strategistValidators(input) });
    expect(result.ok).toBe(true);
  });
});
