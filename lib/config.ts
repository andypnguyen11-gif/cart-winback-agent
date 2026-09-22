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

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const DEFAULT_MODELS = {
  /** Picks an offer from the policy menu. Sonnet: small structured input, but the choice has business consequences. */
  strategist: "claude-sonnet-5",
  /** Writes subject and body for an already-chosen offer. Haiku: language only, no decisions. */
  copywriter: "claude-haiku-4-5-20251001",
} as const;

/** Read at call time so tests and deployments can override per process. */
export function getModel(role: keyof typeof DEFAULT_MODELS): string {
  const envKey = role === "strategist" ? "STRATEGIST_MODEL" : "COPYWRITER_MODEL";
  return process.env[envKey]?.trim() || DEFAULT_MODELS[role];
}

/** Hard ceiling per model call. Both agents return a few hundred tokens at most. */
export const AGENT_MAX_OUTPUT_TOKENS = 1024;

/** One retry when the model's output fails schema validation. A second failure is an explicit error. */
export const AGENT_SCHEMA_RETRIES = 1;

// ---------------------------------------------------------------------------
// Message rules (deterministic copy checks)
// ---------------------------------------------------------------------------

/**
 * Literal phrase blocklists for the message validator. Matching is
 * case-insensitive after whitespace and apostrophes are normalized. This is a
 * heuristic, and the README says so: it catches the phrases we have seen or
 * expect, not every way to imply something false. The marketer is the final
 * check.
 *
 * "again" is deliberately absent: it false-positives on "thanks again".
 */
export const MESSAGE_RULES = {
  /** Urgency, scarcity, and seat-availability claims. We have no inventory data and never invent deadlines. */
  blockedForEveryone: [
    "last chance",
    "expires tonight",
    "limited time",
    "still available",
    "seats available",
    "seats left",
    "seats remaining",
    "held your seats",
    "seats are held",
    "on hold for you",
    "reserved for you",
    "guaranteed",
    // Fan history we do not have.
    "you attended",
    "last game",
    "last week's match",
    "favorite player",
  ],
  /** Regex patterns for phrases with a variable inside, e.g. "only 3 left". */
  blockedPatternsForEveryone: [/\bonly\s+\d+\s+(seats?\s+)?left\b/i],
  /** Phrases that presume purchase history. Blocked only when the fan has none. */
  blockedForNewFans: ["welcome back", "season ticket", "last season", "as a returning"],
} as const;

// ---------------------------------------------------------------------------
// Prices (for read-time cost estimates; never stored)
// ---------------------------------------------------------------------------

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * USD per million tokens. Run logs store token counts only; cost is computed
 * against this table when displayed, so a price change never rewrites
 * history. Update `asOf` whenever the numbers change.
 */
export const MODEL_PRICES = {
  asOf: "2026-09-22",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  perMillionTokens: {
    "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  } satisfies Record<string, ModelPrice>,
} as const;
