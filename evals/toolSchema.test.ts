import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toToolInputSchema } from "@/lib/agents/client";
import { MessageOutputSchema, StrategistOutputSchema } from "@/lib/schemas";

/**
 * Strict tool use rejects numeric and string bounds (minimum, maximum,
 * minLength, maxLength, pattern, maxItems) with a 400. The bounds still hold:
 * runAgentStep parses every tool call with the original Zod schema.
 */

const REJECTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern", "maxItems"];

function keywordsIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywordsIn(n, found));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (REJECTED.includes(k)) found.add(k);
      if (k === "properties" || k === "$defs" || k === "definitions") Object.values(v as object).forEach((n) => keywordsIn(n, found));
      else keywordsIn(v, found);
    }
  }
  return found;
}

describe("toToolInputSchema strict-mode compatibility", () => {
  it("sends the strategist schema without any keyword strict mode rejects", () => {
    const wire = toToolInputSchema(z.toJSONSchema(StrategistOutputSchema));
    expect([...keywordsIn(wire)]).toEqual([]);
    expect(wire).not.toHaveProperty("$schema");
    expect(wire.additionalProperties).toBe(false);
  });

  it("sends the copywriter schema without any keyword strict mode rejects", () => {
    const wire = toToolInputSchema(z.toJSONSchema(MessageOutputSchema));
    expect([...keywordsIn(wire)]).toEqual([]);
  });

  it("keeps the model informed by folding stripped bounds into the field description", () => {
    const wire = toToolInputSchema(z.toJSONSchema(StrategistOutputSchema)) as {
      properties: Record<string, { type?: unknown; description?: string }>;
    };
    expect(wire.properties.discountPercent.type).toBe("integer");
    expect(wire.properties.discountPercent.description).toMatch(/0/);
    expect(wire.properties.discountPercent.description).toMatch(/100/);
    expect(wire.properties.reason.description).toMatch(/500/);
  });

  it("leaves supported keywords alone and never strips a property that happens to share a keyword name", () => {
    const schema = z
      .object({ minimum: z.string(), tags: z.array(z.string()).min(1), kind: z.enum(["a", "b"]) })
      .strict();
    const wire = toToolInputSchema(z.toJSONSchema(schema)) as {
      properties: Record<string, Record<string, unknown>>;
      required: string[];
    };
    expect(Object.keys(wire.properties)).toEqual(["minimum", "tags", "kind"]);
    expect(wire.properties.tags.minItems).toBe(1);
    expect(wire.properties.kind.enum).toEqual(["a", "b"]);
    expect(wire.required).toEqual(["minimum", "tags", "kind"]);
  });
});
