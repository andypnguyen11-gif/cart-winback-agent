import { POLICY } from "../config";
import type { FanSegment, OfferPolicy } from "../types";

/**
 * Produces the menu the strategist chooses from. The model never sees an
 * offer type outside `allowedOffers` and never learns a cap other than
 * `maxDiscountPercent`. The same object is handed to validateOffer after the
 * model answers, so the constraint and its enforcement come from one place.
 */
export function getOfferPolicy(segment: FanSegment): OfferPolicy {
  const rule = POLICY.offers[segment];
  return {
    segment,
    allowedOffers: rule.allowedOffers,
    maxDiscountPercent: rule.maxDiscountPercent,
  };
}
