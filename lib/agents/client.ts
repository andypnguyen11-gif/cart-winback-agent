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

/** Zod 4 emits a draft-2020-12 schema; the tool API wants the bare object schema. */
export function toToolInputSchema(jsonSchema: Record<string, unknown>): Anthropic.Tool.InputSchema {
  const { $schema: _dropped, ...rest } = jsonSchema;
  void _dropped;
  return rest as Anthropic.Tool.InputSchema;
}
