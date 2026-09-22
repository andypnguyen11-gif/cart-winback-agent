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

// ---------------------------------------------------------------------------
// Agent call bookkeeping (shared by every LLM step)
// ---------------------------------------------------------------------------

export type AgentName = "strategist" | "copywriter";

/** Raw token counts. Dollars are computed at read time from the dated price table, never stored. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export type AgentErrorKind =
  /** No ANTHROPIC_API_KEY in the environment; nothing was attempted. */
  | "MISSING_API_KEY"
  /** The SDK threw (network, auth, rate limit, 5xx). */
  | "API_ERROR"
  /** The model answered without calling the forced tool. */
  | "NO_TOOL_CALL"
  /** The tool input failed Zod validation on every attempt. */
  | "MALFORMED_OUTPUT"
  /** Parsed fine, but a deterministic validator rejected it. The output is kept for the reviewer. */
  | "VALIDATION_FAILED";

export interface AgentError {
  kind: AgentErrorKind;
  message: string;
}

export interface AgentCallRecord {
  agent: AgentName;
  model: string;
  /** Identifies the prompt text used, so eval results can be compared across prompt edits. */
  promptVersion: string;
  /** Number of requests actually sent. 0 when the call was never attempted. */
  attempts: number;
  usage: TokenUsage;
  durationMs: number;
  /** The model's content blocks for each attempt, kept verbatim for the run log. */
  rawResponses: unknown[];
}

// ---------------------------------------------------------------------------
// Validation (deterministic checks on model output)
// ---------------------------------------------------------------------------

export interface ValidationCheck {
  /** Stable machine name, e.g. "offer:allowed", "evidence:cartValue". */
  name: string;
  passed: boolean;
  /** One sentence a marketer can read. */
  detail: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
}

// ---------------------------------------------------------------------------
// Pipeline result (what the API returns and the UI renders)
// ---------------------------------------------------------------------------

export interface TraceStep {
  stage: string;
  status: "ok" | "failed" | "skipped";
  lines: string[];
}

export interface EvaluationResult {
  /** Identifies this exact recommendation. Review actions reference it so a marketer never approves A and sends B. */
  recommendationId: string;
  cartId: string;
  cart: Cart;
  status: DecisionStatus;
  /** One sentence explaining the status. */
  statusReason: string;
  /** Only for WAIT: hours until the cart crosses the stale threshold. */
  recheckInHours: number | null;
  segment: SegmentResult | null;
  offerPolicy: OfferPolicy | null;
  recommendation: StrategistOutput | null;
  message: MessageOutput | null;
  validation: {
    offer: ValidationResult | null;
    evidence: ValidationResult | null;
    message: ValidationResult | null;
  };
  /** Failed-check details and agent errors. Empty for ACTIONABLE, WAIT, SUPPRESSED. */
  issues: string[];
  agentError: AgentError | null;
  trace: TraceStep[];
  calls: AgentCallRecord[];
  evaluatedAt: string;
  latencyMs: number;
}

/** One line in data/runs.jsonl. Tokens only; dollars are computed when read. */
export interface RunRecord {
  runId: string;
  cartId: string;
  recommendationId: string;
  evaluatedAt: string;
  status: DecisionStatus;
  latencyMs: number;
  models: { strategist: string; copywriter: string };
  calls: AgentCallRecord[];
  recommendation: StrategistOutput | null;
  message: MessageOutput | null;
  validation: EvaluationResult["validation"];
  issues: string[];
  agentError: AgentError | null;
}
