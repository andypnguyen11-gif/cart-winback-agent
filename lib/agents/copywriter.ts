import { getModel } from "../config";
import { MessageOutputSchema } from "../schemas";
import type { Cart, FanSegment, MessageOutput, OfferType, Section, StrategistOutput } from "../types";
import type { CreateMessage } from "./client";
import { runAgentStep, type AgentStepResult, type OutputValidator } from "./runAgentStep";

/**
 * Step 2 of the agent layer. Turns an already-approved offer into an email
 * subject and body. It cannot change the offer or the discount because its
 * output schema has no such fields, and it cannot invent fan history because
 * it is never shown any.
 */

/** Deliberately narrow. Not the raw cart: no ids, no purchase history, no consent flag. */
export interface CopywriterInput {
  segment: FanSegment;
  offerType: OfferType;
  discountPercent: number;
  seats: number;
  section: Section;
  cartValue: number;
  abandonedHours: number;
}

export type CopywriterResult = AgentStepResult<MessageOutput>;

export interface CopywriterOptions {
  createMessage?: CreateMessage;
  model?: string;
  /** Deterministic message checks (blocked phrases, number match). Wired by the pipeline. */
  validators?: OutputValidator<MessageOutput>[];
}

export const COPYWRITER_TOOL_NAME = "write_email";

export function buildCopywriterInput(
  cart: Cart,
  segment: FanSegment,
  recommendation: StrategistOutput,
): CopywriterInput {
  return {
    segment,
    offerType: recommendation.offerType,
    discountPercent: recommendation.discountPercent,
    seats: cart.seats,
    section: cart.section,
    cartValue: cart.cartValue,
    abandonedHours: cart.abandonedHours,
  };
}

const SYSTEM_PROMPT = `You write short win-back emails for Seattle Seawolves ticketing. A marketer will review every email before anything is sent. The offer has already been chosen; you only put it into words.

Hard rules:
- Express the offer exactly as given. Do not change the offer type, the percentage, or add any other incentive. If no percentage is given, do not mention one.
- Do not say or imply seats are held, reserved, guaranteed, or still available. You have no inventory data.
- Do not invent deadlines, countdowns, or urgency. No "last chance", "expires tonight", "only a few left", "limited time".
- Do not reference fan history you were not given: no past games, attendance, favorite players, previous seasons, or how long they have been a fan. Do not call the fan loyal, new, returning, or a season ticket holder.
- You do not know the fan's name. Open with "Hi there," or go straight to the point. Never use placeholders like [Name].
- Plain, warm, specific. Mention the seats and section. One clear call to action to finish checkout.
- Subject under 80 characters. Body under 120 words. Sign off as "Seattle Seawolves Ticketing".

Respond by calling the ${COPYWRITER_TOOL_NAME} tool. Do not write prose outside the tool.`;

function describeOffer(input: CopywriterInput): string {
  switch (input.offerType) {
    case "PERCENT_DISCOUNT":
      return `PERCENT_DISCOUNT: ${input.discountPercent}% off this cart if they complete checkout. State ${input.discountPercent}% exactly once.`;
    case "FEE_WAIVER":
      return "FEE_WAIVER: service fees are waived if they complete checkout. There is no percentage discount; do not mention one.";
    case "REMINDER":
      return "REMINDER: a friendly reminder that the tickets are in their cart. There is no incentive; do not invent one.";
    case "PERSONAL_OUTREACH":
      return "PERSONAL_OUTREACH: a personal note from the ticketing team offering to help them finish or answer questions. No incentive; do not invent one.";
    case "NO_ACTION":
      return "NO_ACTION: no email should be written for this cart.";
  }
}

export function buildCopywriterPrompt(input: CopywriterInput): { system: string; user: string } {
  const user = `Write the email.

Offer to express: ${describeOffer(input)}
Cart: ${input.seats} seat${input.seats === 1 ? "" : "s"} in ${input.section}, total $${input.cartValue}, left ${input.abandonedHours} hours ago.

Call ${COPYWRITER_TOOL_NAME} with subject and body.`;
  return { system: SYSTEM_PROMPT, user };
}

export function runCopywriter(input: CopywriterInput, options: CopywriterOptions = {}): Promise<CopywriterResult> {
  const { system, user } = buildCopywriterPrompt(input);
  return runAgentStep<MessageOutput>({
    agent: "copywriter",
    model: options.model ?? getModel("copywriter"),
    system,
    user,
    tool: {
      name: COPYWRITER_TOOL_NAME,
      description: "Submit the email subject and body. Call this exactly once.",
      schema: MessageOutputSchema,
    },
    validators: options.validators,
    createMessage: options.createMessage,
  });
}
