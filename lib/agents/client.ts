import Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "../types";

/**
 * Thin seam between the agents and the network. Agents receive a
 * `CreateMessage` function so tests can script responses without an API key
 * and without mocking the SDK's internals.
 */
export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

let client: Anthropic | null = null;

/** Returns null when no key is configured. The app must still start and the policy engine must still run. */
export function getCreateMessage(): CreateMessage | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (!client || client.apiKey !== apiKey) {
    // The SDK already retries transient failures (429, 5xx, timeouts) twice with backoff.
    client = new Anthropic({ apiKey, maxRetries: 2 });
  }
  const c = client;
  return (params) => c.messages.create(params);
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

export function addUsage(total: TokenUsage, usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: total.inputTokens + usage.input_tokens,
    outputTokens: total.outputTokens + usage.output_tokens,
    cacheReadInputTokens: total.cacheReadInputTokens + (usage.cache_read_input_tokens ?? 0),
    cacheCreationInputTokens: total.cacheCreationInputTokens + (usage.cache_creation_input_tokens ?? 0),
  };
}

/**
 * Strict tool use accepts types, enum, const, required, additionalProperties,
 * string formats and minItems 0 or 1. It rejects the bounds below with a 400.
 * They are stripped from the wire schema and folded into the field description
 * so the model still sees them. Nothing is lost: runAgentStep parses every tool
 * call with the original Zod schema, so the bounds are still enforced locally.
 */
const STRICT_MODE_REJECTS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "maxItems",
]);

/** Keys whose values are named children, not schema keywords, so their keys must not be stripped. */
const NAMED_CHILDREN = new Set(["properties", "$defs", "definitions"]);

function stripForStrictMode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripForStrictMode);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  const bounds: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (STRICT_MODE_REJECTS.has(key)) {
      bounds.push(`${key} ${String(value)}`);
    } else if (key === "minItems" && typeof value === "number" && value > 1) {
      bounds.push(`minItems ${value}`);
      out.minItems = 1;
    } else if (NAMED_CHILDREN.has(key) && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, stripForStrictMode(child)]));
    } else {
      out[key] = stripForStrictMode(value);
    }
  }
  if (bounds.length > 0) {
    const note = `Constraints: ${bounds.join(", ")}.`;
    out.description = typeof out.description === "string" && out.description ? `${out.description} ${note}` : note;
  }
  return out;
}

/** Zod 4 emits a draft-2020-12 schema; the tool API wants the bare object schema, minus what strict mode rejects. */
export function toToolInputSchema(jsonSchema: Record<string, unknown>): Anthropic.Tool.InputSchema {
  const { $schema: _dropped, ...rest } = jsonSchema;
  void _dropped;
  return stripForStrictMode(rest) as Anthropic.Tool.InputSchema;
}
