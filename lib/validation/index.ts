import type { OutputValidator } from "../agents/runAgentStep";
import type { Cart, MessageOutput, OfferPolicy, StrategistOutput } from "../types";
import { failures } from "./result";
import { validateEvidence } from "./validateEvidence";
import { validateMessage, type MessageContext } from "./validateMessage";
import { validateOffer } from "./validateOffer";

export { failures, fromChecks } from "./result";
export type { ValidationCheck, ValidationResult } from "./result";
export { validateEvidence } from "./validateEvidence";
export { validateMessage } from "./validateMessage";
export type { MessageContext } from "./validateMessage";
export { validateOffer } from "./validateOffer";

/** Adapters that plug the validators into runAgentStep as injected checks. */

export function strategistValidators(ctx: {
  cart: Cart;
  offerPolicy: OfferPolicy;
}): OutputValidator<StrategistOutput>[] {
  return [
    (output) => failures(validateOffer(output, ctx.offerPolicy)),
    (output) => failures(validateEvidence(output, ctx.cart)),
  ];
}

export function messageValidators(ctx: MessageContext): OutputValidator<MessageOutput>[] {
  return [(message) => failures(validateMessage(message, ctx))];
}
