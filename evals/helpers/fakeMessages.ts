import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "@/lib/agents/client";

/** Test doubles for the Messages API. Nothing here touches the network. */

export const FAKE_USAGE = {
  input_tokens: 500,
  output_tokens: 80,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

export function toolMessage(
  toolName: string,
  input: unknown,
  overrides: Partial<Anthropic.Message> = {},
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [{ type: "tool_use", id: "toolu_1", name: toolName, input, caller: { type: "direct" } }],
    usage: { ...FAKE_USAGE, cache_creation: null, server_tool_use: null, service_tier: null, inference_geo: null },
    ...overrides,
  } as Anthropic.Message;
}

export function textMessage(text: string): Anthropic.Message {
  return toolMessage("unused", null, {
    stop_reason: "end_turn",
    content: [{ type: "text", text, citations: null }],
  });
}

/** A createMessage stub that yields the given responses in order and records every request. */
export function scripted(responses: Array<Anthropic.Message | Error>) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(params);
    const next = responses.shift();
    if (!next) throw new Error("scripted stub ran out of responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { createMessage, calls };
}
