import { CART_EVIDENCE_FIELDS } from "../schemas";
import type { Cart, StrategistOutput } from "../types";
import { fromChecks, type ValidationCheck, type ValidationResult } from "./result";

const cartFields = new Set<string>(CART_EVIDENCE_FIELDS);

/**
 * Grounding. Every field the strategist cites must exist on the source cart
 * and hold exactly the cited value. Strict equality on purpose: "140" is not
 * 140, and a model that stringifies numbers is a model that might round them.
 */
export function validateEvidence(output: StrategistOutput, cart: Cart): ValidationResult {
  const checks: ValidationCheck[] = output.evidence.map(({ field, value }) => {
    if (!cartFields.has(field)) {
      return {
        name: `evidence:${field}`,
        passed: false,
        detail: `"${field}" is not a cart field; the model cited data it was never given.`,
      };
    }
    const actual = cart[field as keyof Cart];
    const matches = Object.is(actual, value);
    return {
      name: `evidence:${field}`,
      passed: matches,
      detail: matches
        ? `${field} = ${JSON.stringify(value)} matches the cart.`
        : `${field} cited as ${JSON.stringify(value)} but the cart says ${JSON.stringify(actual)}.`,
    };
  });

  return fromChecks(checks);
}
