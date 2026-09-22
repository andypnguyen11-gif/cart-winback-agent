import { POLICY } from "../config";
import type { Cart, EligibilityResult } from "../types";

/**
 * First gate in the pipeline. Runs before any model is called, so a
 * suppressed or waiting cart never becomes a prompt.
 *
 * Order matters: consent is checked before timing. A fan who has not opted in
 * is suppressed even if their cart is brand new, so nothing downstream can
 * ever schedule a re-check for someone we must not contact.
 */
export function checkEligibility(cart: Cart): EligibilityResult {
  if (!cart.emailOptIn) {
    return {
      status: "SUPPRESSED",
      reason: "Fan has not opted in to email. No outreach of any kind.",
    };
  }

  const threshold = POLICY.staleThresholdHours;
  if (cart.abandonedHours < threshold) {
    const recheckInHours = threshold - cart.abandonedHours;
    return {
      status: "WAIT",
      reason: `Cart abandoned ${cart.abandonedHours}h ago; carts under ${threshold}h are still in progress.`,
      recheckInHours,
    };
  }

  return {
    status: "ELIGIBLE",
    reason: `Fan opted in and cart has been abandoned ${cart.abandonedHours}h (threshold ${threshold}h).`,
  };
}
