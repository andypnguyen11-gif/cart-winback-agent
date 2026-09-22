import { z } from "zod";

/**
 * Runtime schemas for every boundary the application crosses:
 * fixture data in, model output in, marketer actions in.
 *
 * Model responses are parsed with these and rejected on failure.
 * Nothing here guesses at missing fields.
 */

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export const SECTIONS = ["Lower Bowl", "Upper Deck", "Club"] as const;

export const FAN_SEGMENTS = ["NEW", "RETURNING", "LOYAL", "VIP", "LAPSED"] as const;

/** SEAT_HOLD was deliberately dropped: there is no inventory data, so we never promise seats. */
export const OFFER_TYPES = [
  "REMINDER",
  "FEE_WAIVER",
  "PERCENT_DISCOUNT",
  "PERSONAL_OUTREACH",
  "NO_ACTION",
] as const;

export const DECISION_STATUSES = ["WAIT", "SUPPRESSED", "ACTIONABLE", "NEEDS_REVIEW"] as const;

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export const REVIEW_DECISIONS = ["APPROVED", "EDITED", "REJECTED"] as const;

export const REJECTION_REASONS = [
  "WRONG_OFFER",
  "DISCOUNT_TOO_HIGH",
  "POOR_TONE",
  "INCORRECT_REASONING",
  "DO_NOT_CONTACT",
  "OTHER",
] as const;

// ---------------------------------------------------------------------------
// Cart input
// ---------------------------------------------------------------------------

/**
 * Strict: unknown fields are rejected so the model can only ever see the
 * fields we chose to give it. This is the first grounding guard.
 */
export const CartSchema = z
  .object({
    cartId: z.string().regex(/^C-\d+$/),
    fanId: z.string().regex(/^F-\d+$/),
    seats: z.number().int().positive(),
    section: z.enum(SECTIONS),
    cartValue: z.number().nonnegative(),
    abandonedHours: z.number().nonnegative(),
    lifetimeTickets: z.number().int().nonnegative(),
    /** null means the fan has never purchased. */
    lastPurchaseDaysAgo: z.number().int().nonnegative().nullable(),
    emailOptIn: z.boolean(),
  })
  .strict();

export const CartsSchema = z.array(CartSchema).min(1);

/** Field names the strategist is allowed to cite as evidence. */
export const CART_EVIDENCE_FIELDS = CartSchema.keyof().options;

// ---------------------------------------------------------------------------
// Strategist output (LLM step 1)
// ---------------------------------------------------------------------------

export const EvidenceItemSchema = z
  .object({
    field: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .strict();

export const StrategistOutputSchema = z
  .object({
    offerType: z.enum(OFFER_TYPES),
    /** 0 unless offerType is PERCENT_DISCOUNT. The cap is enforced later by the validator, not here. */
    discountPercent: z.number().int().min(0).max(100),
    reason: z.string().min(1).max(500),
    confidence: z.enum(CONFIDENCE_LEVELS),
    /** At least one cited input field. Verified against the source cart by validateEvidence. */
    evidence: z.array(EvidenceItemSchema).min(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// Copywriter output (LLM step 2)
// ---------------------------------------------------------------------------

export const MessageOutputSchema = z
  .object({
    subject: z.string().min(1).max(120),
    body: z.string().min(1).max(2000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Marketer review actions
// ---------------------------------------------------------------------------

export const ReviewActionSchema = z
  .object({
    cartId: z.string().regex(/^C-\d+$/),
    /** The recommendation this decision was made against. Prevents approving A and sending B. */
    recommendationId: z.string().min(1),
    decision: z.enum(REVIEW_DECISIONS),
    rejectionReason: z.enum(REJECTION_REASONS).optional(),
    rejectionNote: z.string().max(500).optional(),
    editedSubject: z.string().max(120).optional(),
    editedBody: z.string().max(2000).optional(),
    reviewedAt: z.string().datetime(),
  })
  .strict();
