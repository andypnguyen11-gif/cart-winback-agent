import type { OfferPolicy, StrategistOutput } from "../types";
import { fromChecks, type ValidationCheck, type ValidationResult } from "./result";

/**
 * Money and menu. The strategist was shown the same OfferPolicy; this checks
 * it stayed inside it. Runs on the parsed output, so shape is already known
 * to be valid.
 */
export function validateOffer(output: StrategistOutput, policy: OfferPolicy): ValidationResult {
  const checks: ValidationCheck[] = [];
  const { offerType, discountPercent } = output;
  const { allowedOffers, maxDiscountPercent, segment } = policy;

  const allowed = allowedOffers.includes(offerType);
  checks.push({
    name: "offer:allowed",
    passed: allowed,
    detail: allowed
      ? `${offerType} is on the ${segment} menu.`
      : `${offerType} is not allowed for ${segment} (allowed: ${allowedOffers.join(", ")}).`,
  });

  const withinCap = discountPercent <= maxDiscountPercent;
  checks.push({
    name: "offer:cap",
    passed: withinCap,
    detail: withinCap
      ? `Discount ${discountPercent}% is within the ${segment} cap of ${maxDiscountPercent}%.`
      : `Discount ${discountPercent}% exceeds the ${segment} cap of ${maxDiscountPercent}%.`,
  });

  if (offerType === "PERCENT_DISCOUNT") {
    const coherent = discountPercent > 0;
    checks.push({
      name: "offer:discount-present",
      passed: coherent,
      detail: coherent
        ? `PERCENT_DISCOUNT carries a ${discountPercent}% discount.`
        : "PERCENT_DISCOUNT was chosen with a 0% discount, which is not a real offer.",
    });
  } else {
    const noStray = discountPercent === 0;
    checks.push({
      name: "offer:no-stray-discount",
      passed: noStray,
      detail: noStray
        ? `${offerType} carries no discount, as expected.`
        : `${offerType} must not carry a discount, but ${discountPercent}% was attached.`,
    });
  }

  return fromChecks(checks);
}
