import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadCarts } from "@/lib/carts";
import { segmentFan } from "@/lib/policy/segmentation";
import { getOfferPolicy } from "@/lib/policy/offerRules";
import {
  buildStrategistPrompt,
  runStrategist,
  STRATEGIST_TOOL_NAME,
  type StrategistInput,
} from "@/lib/agents/strategist";
import type { Cart } from "@/lib/types";
import { scripted, textMessage, toolMessage as fakeTool } from "./helpers/fakeMessages";

const toolMessage = (input: unknown) => fakeTool(STRATEGIST_TOOL_NAME, input);

const carts = loadCarts();
const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

function inputFor(cartId: string): StrategistInput {
  const cart = cartById(cartId);
  const segment = segmentFan(cart);
  return { cart, segment, offerPolicy: getOfferPolicy(segment.segment) };
}

const goodOutput = {
  offerType: "FEE_WAIVER",
  discountPercent: 0,
  reason: "First-time buyer with a $140 cart abandoned for 26 hours.",
  confidence: "medium",
  evidence: [
    { field: "lifetimeTickets", value: 0 },
    { field: "cartValue", value: 140 },
  ],
};

describe("strategist prompt", () => {
  it("shows the model only the allowed offers and the cap for that segment", () => {
    const { user } = buildStrategistPrompt(inputFor("C-1002"));
    expect(user).toContain("NEW");
    expect(user).toContain("REMINDER");
    expect(user).toContain("FEE_WAIVER");
    expect(user).toContain("PERCENT_DISCOUNT");
    expect(user).toContain("10%");
    expect(user).not.toContain("PERSONAL_OUTREACH");
  });

  it("tells a loyal-fan strategist that no discount is available", () => {
    const { user } = buildStrategistPrompt(inputFor("C-1001"));
    expect(user).toContain("LOYAL");
    expect(user).toMatch(/0%/);
    expect(user).not.toContain("PERCENT_DISCOUNT");
  });

  it("includes every cart field by name so evidence citations can be checked", () => {
    const { user } = buildStrategistPrompt(inputFor("C-1002"));
    for (const field of ["cartId", "fanId", "seats", "section", "cartValue", "abandonedHours", "lifetimeTickets", "lastPurchaseDaysAgo", "emailOptIn"]) {
      expect(user).toContain(field);
    }
  });

  it("system prompt forbids deciding consent, eligibility, or the cap", () => {
    const { system } = buildStrategistPrompt(inputFor("C-1002"));
    expect(system).toMatch(/consent/i);
    expect(system).toMatch(/evidence/i);
  });
});

describe("runStrategist", () => {
  it("returns the parsed recommendation and token usage on a valid tool call", async () => {
    const { createMessage, calls } = scripted([toolMessage(goodOutput)]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.output.offerType).toBe("FEE_WAIVER");
    expect(result.call.attempts).toBe(1);
    expect(result.call.usage).toEqual({ inputTokens: 500, outputTokens: 80, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
    expect(result.call.agent).toBe("strategist");
    expect(calls).toHaveLength(1);
  });

  it("forces the recommendation tool with a strict schema", async () => {
    const { createMessage, calls } = scripted([toolMessage(goodOutput)]);
    await runStrategist(inputFor("C-1002"), { createMessage });

    const params = calls[0];
    expect(params.tool_choice).toEqual({ type: "tool", name: STRATEGIST_TOOL_NAME });
    expect(params.tools).toHaveLength(1);
    const tool = params.tools?.[0] as Anthropic.Tool;
    expect(tool.name).toBe(STRATEGIST_TOOL_NAME);
    expect(tool.strict).toBe(true);
    expect(tool.input_schema.additionalProperties).toBe(false);
    expect(tool.input_schema).not.toHaveProperty("$schema");
  });

  it("asks the strategist model for low effort so adaptive thinking stays short", async () => {
    const { createMessage, calls } = scripted([toolMessage(goodOutput)]);
    await runStrategist(inputFor("C-1002"), { createMessage });
    expect(calls[0].output_config).toEqual({ effort: "low" });
  });

  it("uses the configured strategist model", async () => {
    const { createMessage, calls } = scripted([toolMessage(goodOutput)]);
    await runStrategist(inputFor("C-1002"), { createMessage, model: "claude-test-model" });
    expect(calls[0].model).toBe("claude-test-model");
  });

  it("retries once on malformed output, feeding the schema error back to the model", async () => {
    const { createMessage, calls } = scripted([
      toolMessage({ ...goodOutput, offerType: "SEAT_HOLD" }),
      toolMessage(goodOutput),
    ]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });

    expect(result.ok).toBe(true);
    expect(result.call.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    const retryMessages = calls[1].messages;
    expect(retryMessages.length).toBeGreaterThan(1);
    expect(JSON.stringify(retryMessages)).toMatch(/offerType/);
  });

  it("gives up after the second malformed response with an explicit error, never a guess", async () => {
    const { createMessage } = scripted([
      toolMessage({ ...goodOutput, evidence: [] }),
      toolMessage({ ...goodOutput, confidence: "certain" }),
    ]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("MALFORMED_OUTPUT");
    expect(result.error.message).toMatch(/confidence/);
    expect(result.call.attempts).toBe(2);
  });

  it("sums token usage across attempts", async () => {
    const { createMessage } = scripted([
      toolMessage({ ...goodOutput, evidence: [] }),
      toolMessage(goodOutput),
    ]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });
    expect(result.call.usage.inputTokens).toBe(1000);
    expect(result.call.usage.outputTokens).toBe(160);
  });

  it("treats a text-only reply as NO_TOOL_CALL", async () => {
    const { createMessage } = scripted([textMessage("I recommend a fee waiver."), textMessage("Still text.")]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("NO_TOOL_CALL");
  });

  it("surfaces API failures as API_ERROR without throwing", async () => {
    const { createMessage } = scripted([new Error("529 overloaded")]);
    const result = await runStrategist(inputFor("C-1002"), { createMessage });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("API_ERROR");
    expect(result.error.message).toContain("529 overloaded");
    expect(result.call.attempts).toBe(1);
  });

  describe("without an API key", () => {
    const original = process.env.ANTHROPIC_API_KEY;
    beforeEach(() => {
      delete process.env.ANTHROPIC_API_KEY;
    });
    afterEach(() => {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
      vi.restoreAllMocks();
    });

    it("returns MISSING_API_KEY instead of attempting a network call", async () => {
      const result = await runStrategist(inputFor("C-1002"));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error.kind).toBe("MISSING_API_KEY");
      expect(result.call.attempts).toBe(0);
    });
  });
});
