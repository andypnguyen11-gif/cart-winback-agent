import type { z } from "zod";
import type {
  CartSchema,
  EvidenceItemSchema,
  MessageOutputSchema,
  ReviewActionSchema,
  StrategistOutputSchema,
} from "./schemas";
import type {
  CONFIDENCE_LEVELS,
  DECISION_STATUSES,
  FAN_SEGMENTS,
  OFFER_TYPES,
  REJECTION_REASONS,
  REVIEW_DECISIONS,
  SECTIONS,
} from "./schemas";

/**
 * Shared domain types. Everything here is inferred from the Zod schemas in
 * ./schemas so runtime validation and compile-time types cannot drift.
 */

export type Section = (typeof SECTIONS)[number];
export type FanSegment = (typeof FAN_SEGMENTS)[number];
export type OfferType = (typeof OFFER_TYPES)[number];
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type Cart = z.infer<typeof CartSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;
export type MessageOutput = z.infer<typeof MessageOutputSchema>;
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

// ---------------------------------------------------------------------------
// Policy engine results (deterministic, no model involved)
// ---------------------------------------------------------------------------

export type EligibilityResult =
  | { status: "ELIGIBLE"; reason: string }
  | { status: "SUPPRESSED"; reason: string }
  | { status: "WAIT"; reason: string; recheckInHours: number };

export interface SegmentResult {
  segment: FanSegment;
  reason: string;
}

export interface OfferPolicy {
  segment: FanSegment;
  allowedOffers: readonly OfferType[];
  maxDiscountPercent: number;
}
