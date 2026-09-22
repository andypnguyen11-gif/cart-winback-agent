import { getModel } from "../config";
import { StrategistOutputSchema } from "../schemas";
import type { Cart, OfferPolicy, SegmentResult, StrategistOutput } from "../types";
import type { CreateMessage } from "./client";
import { runAgentStep, type AgentStepResult, type OutputValidator } from "./runAgentStep";

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

export type StrategistResult = AgentStepResult<StrategistOutput>;

export interface StrategistOptions {
  /** Injected in tests. Defaults to the real SDK client when an API key exists. */
  createMessage?: CreateMessage;
  model?: string;
  /** Deterministic checks run on the parsed output (offer allowlist, cap, evidence). Wired by the pipeline. */
  validators?: OutputValidator<StrategistOutput>[];
}

export const STRATEGIST_TOOL_NAME = "recommend_offer";
/** Bump when SYSTEM_PROMPT or the user prompt layout changes, so run logs stay comparable. */
export const STRATEGIST_PROMPT_VERSION = "strategist-v1";

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

export function runStrategist(input: StrategistInput, options: StrategistOptions = {}): Promise<StrategistResult> {
  const { system, user } = buildStrategistPrompt(input);
  return runAgentStep<StrategistOutput>({
    agent: "strategist",
    model: options.model ?? getModel("strategist"),
    promptVersion: STRATEGIST_PROMPT_VERSION,
    system,
    user,
    tool: {
      name: STRATEGIST_TOOL_NAME,
      description: "Record your offer recommendation for this abandoned cart. Call this exactly once.",
      schema: StrategistOutputSchema,
    },
    validators: options.validators,
    createMessage: options.createMessage,
  });
}
