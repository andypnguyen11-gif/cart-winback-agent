import type { FanSegment, OfferType } from "./types";

/**
 * Every numeric business rule lives here. Policy code, validators, and
 * components read from this object; none of them carry their own numbers.
 *
 * These values were locked before implementation (Tasks.md section 0).
 * Changing a threshold is a one-line edit followed by `npm test`.
 */

export interface SegmentOfferPolicy {
  /** Offers the strategist may choose from. NO_ACTION is always a legal choice. */
  readonly allowedOffers: readonly OfferType[];
  /** Ceiling for PERCENT_DISCOUNT. 0 means discounts are never offered to this segment. */
  readonly maxDiscountPercent: number;
}

export const POLICY = {
  /** Carts younger than this are still "in progress"; the fan may finish on their own. */
  staleThresholdHours: 2,

  segmentation: {
    /** 1–9 ticket fans silent for longer than this are LAPSED. Exactly this many days is still RETURNING. */
    lapsedAfterDays: 180,
    /** 10+ tickets is LOYAL. Lapsed does not apply at this level: a quiet loyal fan stays loyal. */
    loyalMinTickets: 10,
    /** 20+ tickets is VIP. A quiet VIP stays VIP. */
    vipMinTickets: 20,
  },

  /**
   * Discount philosophy: money goes to fans we have not yet won (NEW) or have
   * lost (LAPSED). Active buyers get convenience (fee waiver) and attention
   * (personal outreach), never a price cut that trains them to wait for one.
   */
  offers: {
    NEW: {
      allowedOffers: ["REMINDER", "FEE_WAIVER", "PERCENT_DISCOUNT", "NO_ACTION"],
      maxDiscountPercent: 10,
    },
    RETURNING: {
      allowedOffers: ["REMINDER", "FEE_WAIVER", "NO_ACTION"],
      maxDiscountPercent: 0,
    },
    LOYAL: {
      allowedOffers: ["REMINDER", "FEE_WAIVER", "PERSONAL_OUTREACH", "NO_ACTION"],
      maxDiscountPercent: 0,
    },
    VIP: {
      allowedOffers: ["REMINDER", "FEE_WAIVER", "PERSONAL_OUTREACH", "NO_ACTION"],
      maxDiscountPercent: 0,
    },
    LAPSED: {
      allowedOffers: ["REMINDER", "FEE_WAIVER", "PERCENT_DISCOUNT", "NO_ACTION"],
      maxDiscountPercent: 10,
    },
  } satisfies Record<FanSegment, SegmentOfferPolicy>,
} as const;
