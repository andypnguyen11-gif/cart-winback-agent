import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadCarts } from "@/lib/carts";
import {
  buildCopywriterInput,
  buildCopywriterPrompt,
  COPYWRITER_TOOL_NAME,
  runCopywriter,
  type CopywriterInput,
} from "@/lib/agents/copywriter";
import type { Cart, StrategistOutput } from "@/lib/types";
import { scripted, toolMessage } from "./helpers/fakeMessages";

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

const discountRecommendation: StrategistOutput = {
  offerType: "PERCENT_DISCOUNT",
  discountPercent: 10,
  reason: "First-time buyer with a $140 cart abandoned for 26 hours.",
  confidence: "medium",
  evidence: [{ field: "lifetimeTickets", value: 0 }],
};

const newFanInput: CopywriterInput = buildCopywriterInput(cartById("C-1002"), "NEW", discountRecommendation);

const goodEmail = {
  subject: "Your 4 Upper Deck seats are still in your cart",
  body: "Hi there,\n\nYour 4 Upper Deck tickets are waiting. Finish checkout and we'll take 10% off.\n\nSeattle Seawolves Ticketing",
};

describe("copywriter input", () => {
  it("contains only the seven fields the writer needs and nothing else", () => {
    expect(Object.keys(newFanInput).sort()).toEqual(
      ["abandonedHours", "cartValue", "discountPercent", "offerType", "seats", "section", "segment"].sort(),
    );
  });

  it("copies the offer and discount from the strategist unchanged", () => {
    expect(newFanInput.offerType).toBe("PERCENT_DISCOUNT");
    expect(newFanInput.discountPercent).toBe(10);
  });
});

describe("copywriter prompt", () => {
  it("never mentions identifiers or history fields the writer was not given", () => {
    const { system, user } = buildCopywriterPrompt(newFanInput);
    const text = system + user;
    for (const leaked of ["C-1002", "F-511", "lifetimeTickets", "lastPurchaseDaysAgo", "emailOptIn", "fanId", "cartId"]) {
      expect(text).not.toContain(leaked);
    }
  });

  it("states the exact offer and discount the writer must express", () => {
    const { user } = buildCopywriterPrompt(newFanInput);
    expect(user).toContain("PERCENT_DISCOUNT");
    expect(user).toContain("10%");
    expect(user).toContain("Upper Deck");
    expect(user).toContain("4");
  });

  it("tells the writer a fee waiver carries no percentage", () => {
    const { user } = buildCopywriterPrompt({ ...newFanInput, offerType: "FEE_WAIVER", discountPercent: 0 });
    expect(user).toContain("FEE_WAIVER");
    expect(user).not.toMatch(/\d+%/);
  });

  it("system prompt forbids seat availability claims, invented deadlines, fan history, and changing the offer", () => {
    const { system } = buildCopywriterPrompt(newFanInput);
    expect(system).toMatch(/seat/i);
    expect(system).toMatch(/deadline|urgency|expire/i);
    expect(system).toMatch(/history|attended|past/i);
    expect(system).toMatch(/do not change|must not change|exactly/i);
    expect(system).toMatch(/name/i);
  });
});

describe("runCopywriter", () => {
  it("returns subject and body from a valid tool call", async () => {
    const { createMessage, calls } = scripted([toolMessage(COPYWRITER_TOOL_NAME, goodEmail)]);
    const result = await runCopywriter(newFanInput, { createMessage });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.output).toEqual(goodEmail);
    expect(result.call.agent).toBe("copywriter");
    expect(result.call.attempts).toBe(1);
    expect(calls[0].tool_choice).toEqual({ type: "tool", name: COPYWRITER_TOOL_NAME });
    expect((calls[0].tools?.[0] as Anthropic.Tool).strict).toBe(true);
  });

  it("sends no effort parameter, because Haiku 4.5 rejects it and has no adaptive thinking to bound", async () => {
    const { createMessage, calls } = scripted([toolMessage(COPYWRITER_TOOL_NAME, goodEmail)]);
    await runCopywriter(newFanInput, { createMessage });
    expect(calls[0]).not.toHaveProperty("output_config");
  });

  it("uses the configured copywriter model", async () => {
    const { createMessage, calls } = scripted([toolMessage(COPYWRITER_TOOL_NAME, goodEmail)]);
    await runCopywriter(newFanInput, { createMessage, model: "claude-copy-test" });
    expect(calls[0].model).toBe("claude-copy-test");
  });

  it("rejects output that tries to smuggle in a different offer", async () => {
    const { createMessage } = scripted([
      toolMessage(COPYWRITER_TOOL_NAME, { ...goodEmail, discountPercent: 25 }),
      toolMessage(COPYWRITER_TOOL_NAME, { ...goodEmail, offerType: "SEAT_HOLD" }),
    ]);
    const result = await runCopywriter(newFanInput, { createMessage });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("MALFORMED_OUTPUT");
    expect(result.call.attempts).toBe(2);
  });

  it("rejects an over-long subject", async () => {
    const { createMessage } = scripted([
      toolMessage(COPYWRITER_TOOL_NAME, { ...goodEmail, subject: "x".repeat(121) }),
      toolMessage(COPYWRITER_TOOL_NAME, { ...goodEmail, subject: "x".repeat(121) }),
    ]);
    const result = await runCopywriter(newFanInput, { createMessage });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toMatch(/subject/);
  });
});
