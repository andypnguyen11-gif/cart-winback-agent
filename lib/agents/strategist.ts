import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AGENT_MAX_OUTPUT_TOKENS, AGENT_SCHEMA_RETRIES, getModel } from "../config";
import { StrategistOutputSchema } from "../schemas";
import type {
  AgentCallRecord,
  AgentError,
  Cart,
  OfferPolicy,
  SegmentResult,
  StrategistOutput,
} from "../types";
import { addUsage, getCreateMessage, toToolInputSchema, ZERO_USAGE, type CreateMessage } from "./client";

export type { CreateMessage } from "./client";

/**
 * Step 1 of the agent layer. Chooses one offer from the menu the policy
 * engine produced. It never sees an offer type outside `allowedOffers`, never
 * learns a cap other than `maxDiscountPercent`, and its answer is still
 * checked by validateOffer and validateEvidence afterwards.
 */

export interface StrategistInput {
  cart: Cart;
  segment: SegmentResult;
  offerPolicy: OfferPolicy;
}

export type StrategistResult =
  | { ok: true; output: StrategistOutput; call: AgentCallRecord }
  | { ok: false; error: AgentError; call: AgentCallRecord };

export interface StrategistOptions {
  /** Injected in tests. Defaults to the real SDK client when an API key exists. */
  createMessage?: CreateMessage;
  model?: string;
}

export const STRATEGIST_TOOL_NAME = "recommend_offer";

const STRATEGIST_TOOL: Anthropic.Tool = {
  name: STRATEGIST_TOOL_NAME,
  description:
    "Record your offer recommendation for this abandoned cart. Call this exactly once.",
  input_schema: toToolInputSchema(z.toJSONSchema(StrategistOutputSchema)),
  strict: true,
};

const SYSTEM_PROMPT = `You are the offer strategist for Seattle Seawolves ticketing. A fan left tickets in their cart. Marketing has already decided this fan may be contacted and which offers are permitted. Your only job is to pick the single most appropriate option from the menu you are given and explain why.

Rules:
- Choose offerType only from the allowed offers listed. Nothing else exists.
- discountPercent must be 0 unless offerType is PERCENT_DISCOUNT, and never above the stated maximum. Prefer the smallest discount that plausibly works.
- You do not decide consent, eligibility, timing, or the discount ceiling. Those were decided before you were called. Do not comment on them.
- Every claim in your reason must be supported by the cart fields provided. Do not infer attendance, favorite teams, past games, or anything not in the data.
- evidence must list the exact field names and values from the cart that drove your choice. Cite only fields that appear in the cart.
- NO_ACTION is a valid choice when outreach would add little value.
- Keep reason under two sentences, written for a marketer reviewing your recommendation.

Respond by calling the ${STRATEGIST_TOOL_NAME} tool. Do not write prose.`;

export function buildStrategistPrompt(input: StrategistInput): { system: string; user: string } {
  const { cart, segment, offerPolicy } = input;
  const cartLines = (Object.entries(cart) as Array<[keyof Cart, Cart[keyof Cart]]>)
    .map(([field, value]) => `  ${field}: ${JSON.stringify(value)}`)
    .join("\n");

  const discountLine =
    offerPolicy.maxDiscountPercent > 0
      ? `Maximum discount: ${offerPolicy.maxDiscountPercent}% (only with PERCENT_DISCOUNT).`
      : "Maximum discount: 0%. No percentage discount is available for this segment.";

  const user = `Cart (every field you may cite as evidence):
${cartLines}

Fan segment: ${segment.segment}
Why: ${segment.reason}

Allowed offers for this segment: ${offerPolicy.allowedOffers.join(", ")}
${discountLine}

Pick one offer and call ${STRATEGIST_TOOL_NAME}.`;

  return { system: SYSTEM_PROMPT, user };
}

export async function runStrategist(
  input: StrategistInput,
  options: StrategistOptions = {},
): Promise<StrategistResult> {
  const model = options.model ?? getModel("strategist");
  const started = Date.now();
  const call: AgentCallRecord = { agent: "strategist", model, attempts: 0, usage: ZERO_USAGE, durationMs: 0 };
  const finish = (): AgentCallRecord => ({ ...call, durationMs: Date.now() - started });

  const createMessage = options.createMessage ?? getCreateMessage();
  if (!createMessage) {
    return {
      ok: false,
      error: { kind: "MISSING_API_KEY", message: "ANTHROPIC_API_KEY is not set; the strategist was not called." },
      call: finish(),
    };
  }

  const { system, user } = buildStrategistPrompt(input);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  let lastError: AgentError = { kind: "NO_TOOL_CALL", message: "The model never called the tool." };

  for (let attempt = 0; attempt <= AGENT_SCHEMA_RETRIES; attempt++) {
    let response: Anthropic.Message;
    try {
      call.attempts += 1;
      response = await createMessage({
        model,
        max_tokens: AGENT_MAX_OUTPUT_TOKENS,
        system,
        messages,
        tools: [STRATEGIST_TOOL],
        tool_choice: { type: "tool", name: STRATEGIST_TOOL_NAME },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { kind: "API_ERROR", message }, call: finish() };
    }

    call.usage = addUsage(call.usage, response.usage);

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === STRATEGIST_TOOL_NAME,
    );
    if (!toolUse) {
      lastError = {
        kind: "NO_TOOL_CALL",
        message: `Model stopped with "${response.stop_reason}" without calling ${STRATEGIST_TOOL_NAME}.`,
      };
      messages.push(
        { role: "assistant", content: response.content },
        { role: "user", content: `You must respond by calling the ${STRATEGIST_TOOL_NAME} tool with the required fields.` },
      );
      continue;
    }

    const parsed = StrategistOutputSchema.safeParse(toolUse.input);
    if (parsed.success) {
      return { ok: true, output: parsed.data, call: finish() };
    }

    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    lastError = { kind: "MALFORMED_OUTPUT", message: `Strategist output failed validation: ${issues}` };

    // Feed the exact schema errors back once. The model sees its own call and the tool_result explaining what was wrong.
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Invalid input: ${issues}. Call ${STRATEGIST_TOOL_NAME} again with corrected fields.`,
          },
        ],
      },
    );
  }

  return { ok: false, error: lastError, call: finish() };
}
