import { randomUUID } from "node:crypto";
import { buildCopywriterInput, runCopywriter } from "./agents/copywriter";
import type { CreateMessage } from "./agents/client";
import { runStrategist } from "./agents/strategist";
import { POLICY } from "./config";
import { checkEligibility } from "./policy/eligibility";
import { getOfferPolicy } from "./policy/offerRules";
import { segmentFan } from "./policy/segmentation";
import type {
  AgentCallRecord,
  AgentError,
  Cart,
  EvaluationResult,
  TraceStep,
  ValidationCheck,
  ValidationResult,
} from "./types";
import { fromChecks, messageValidators, strategistValidators } from "./validation";

/**
 * The whole workflow for one cart, as a straight line:
 *
 *   eligibility → segmentation → offer policy → strategist → offer + evidence
 *   checks → copywriter → message checks → normalized result
 *
 * Deterministic steps run first and decide whether a model is called at all.
 * Every failure after that becomes NEEDS_REVIEW with the offending output kept.
 * Nothing here throws for a model problem; the marketer sees it instead.
 */

export interface PipelineDeps {
  createMessage?: CreateMessage;
  now?: () => Date;
  newId?: () => string;
  models?: { strategist?: string; copywriter?: string };
}

const mark = (check: ValidationCheck) => `${check.passed ? "✓" : "✗"} ${check.detail}`;

function splitChecks(checks: ValidationCheck[]): { offer: ValidationResult; evidence: ValidationResult } {
  return {
    offer: fromChecks(checks.filter((c) => c.name.startsWith("offer:"))),
    evidence: fromChecks(checks.filter((c) => c.name.startsWith("evidence:"))),
  };
}

function describeCall(call: AgentCallRecord): string {
  const { usage } = call;
  return `Model: ${call.model} (${call.promptVersion}), ${call.attempts} attempt${call.attempts === 1 ? "" : "s"}, ${usage.inputTokens} in / ${usage.outputTokens} out tokens, ${call.durationMs} ms`;
}

export async function evaluateCart(cart: Cart, deps: PipelineDeps = {}): Promise<EvaluationResult> {
  const startedAt = Date.now();
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const trace: TraceStep[] = [];
  const calls: AgentCallRecord[] = [];

  const result: EvaluationResult = {
    recommendationId: newId(),
    cartId: cart.cartId,
    cart,
    status: "NEEDS_REVIEW",
    statusReason: "",
    recheckInHours: null,
    segment: null,
    offerPolicy: null,
    recommendation: null,
    message: null,
    validation: { offer: null, evidence: null, message: null },
    issues: [],
    agentError: null,
    trace,
    calls,
    evaluatedAt: now().toISOString(),
    latencyMs: 0,
  };
  const done = (): EvaluationResult => ({ ...result, latencyMs: Date.now() - startedAt });

  // ---- Policy engine -------------------------------------------------------
  const eligibility = checkEligibility(cart);
  const policyLines: string[] = [];

  if (eligibility.status === "SUPPRESSED") {
    policyLines.push(`✗ Email consent: ${eligibility.reason}`);
    trace.push({ stage: "Policy engine", status: "failed", lines: policyLines });
    result.status = "SUPPRESSED";
    result.statusReason = eligibility.reason;
    return done();
  }
  policyLines.push("✓ Email consent: fan has opted in");

  if (eligibility.status === "WAIT") {
    policyLines.push(`✗ Cart stale enough: ${eligibility.reason}`);
    policyLines.push(`Re-check in ${eligibility.recheckInHours}h`);
    trace.push({ stage: "Policy engine", status: "failed", lines: policyLines });
    result.status = "WAIT";
    result.statusReason = eligibility.reason;
    result.recheckInHours = eligibility.recheckInHours;
    return done();
  }
  policyLines.push(`✓ Cart stale enough: abandoned ${cart.abandonedHours}h ago (threshold ${POLICY.staleThresholdHours}h)`);

  const segment = segmentFan(cart);
  const offerPolicy = getOfferPolicy(segment.segment);
  result.segment = segment;
  result.offerPolicy = offerPolicy;
  policyLines.push(`Segment: ${segment.segment} (${segment.reason})`);
  policyLines.push(`Allowed offers: ${offerPolicy.allowedOffers.join(", ")}`);
  policyLines.push(`Maximum discount: ${offerPolicy.maxDiscountPercent}%`);
  trace.push({ stage: "Policy engine", status: "ok", lines: policyLines });

  const failWithAgentError = (stage: string, error: AgentError, fallbackReason?: string) => {
    trace.push({ stage, status: "failed", lines: [`✗ ${error.kind}: ${error.message}`] });
    result.status = "NEEDS_REVIEW";
    result.agentError = error;
    result.issues.push(error.message);
    result.statusReason = fallbackReason ?? `${stage} failed: ${error.message}`;
  };

  // ---- Strategist ----------------------------------------------------------
  const strategistInput = { cart, segment, offerPolicy };
  const strategist = await runStrategist(strategistInput, {
    createMessage: deps.createMessage,
    model: deps.models?.strategist,
    validators: strategistValidators(strategistInput),
  });
  calls.push(strategist.call);

  if (!strategist.ok && strategist.error.kind !== "VALIDATION_FAILED") {
    failWithAgentError("Strategist", strategist.error);
    trace.push({ stage: "Offer and evidence checks", status: "skipped", lines: ["No recommendation to check"] });
    trace.push({ stage: "Copywriter", status: "skipped", lines: ["No recommendation to write"] });
    return done();
  }

  const recommendation = strategist.ok ? strategist.output : strategist.output!;
  result.recommendation = recommendation;
  trace.push({
    stage: "Strategist",
    status: "ok",
    lines: [
      `Selected: ${recommendation.offerType}`,
      `Discount: ${recommendation.discountPercent}%`,
      `Confidence: ${recommendation.confidence}`,
      `Reason: ${recommendation.reason}`,
      describeCall(strategist.call),
    ],
  });

  const { offer, evidence } = splitChecks(strategist.checks);
  result.validation.offer = offer;
  result.validation.evidence = evidence;
  const offerChecksPassed = offer.passed && evidence.passed;
  trace.push({
    stage: "Offer and evidence checks",
    status: offerChecksPassed ? "ok" : "failed",
    lines: strategist.checks.map(mark),
  });

  if (!offerChecksPassed) {
    result.status = "NEEDS_REVIEW";
    result.issues.push(...strategist.checks.filter((c) => !c.passed).map((c) => c.detail));
    result.statusReason = "The strategist's offer or evidence failed a deterministic check. No email was drafted.";
    trace.push({ stage: "Copywriter", status: "skipped", lines: ["Not run: recommendation failed validation"] });
    return done();
  }

  if (recommendation.offerType === "NO_ACTION") {
    result.status = "ACTIONABLE";
    result.statusReason = "Strategist recommends no outreach for this cart. Confirm or override.";
    trace.push({ stage: "Copywriter", status: "skipped", lines: ["Not run: NO_ACTION needs no email"] });
    return done();
  }

  // ---- Copywriter ----------------------------------------------------------
  const copyInput = buildCopywriterInput(cart, segment.segment, recommendation);
  const messageCtx = { offer: recommendation, cart, segment: segment.segment };
  const copy = await runCopywriter(copyInput, {
    createMessage: deps.createMessage,
    model: deps.models?.copywriter,
    validators: messageValidators(messageCtx),
  });
  calls.push(copy.call);

  if (!copy.ok && copy.error.kind !== "VALIDATION_FAILED") {
    failWithAgentError("Copywriter", copy.error);
    trace.push({ stage: "Message checks", status: "skipped", lines: ["No draft to check"] });
    return done();
  }

  const message = copy.ok ? copy.output : copy.output!;
  result.message = message;
  trace.push({
    stage: "Copywriter",
    status: "ok",
    lines: [`Subject: ${message.subject}`, describeCall(copy.call)],
  });

  const messageResult = fromChecks(copy.checks);
  result.validation.message = messageResult;
  trace.push({
    stage: "Message checks",
    status: messageResult.passed ? "ok" : "failed",
    lines: copy.checks.map(mark),
  });

  if (!messageResult.passed) {
    result.status = "NEEDS_REVIEW";
    result.issues.push(...copy.checks.filter((c) => !c.passed).map((c) => c.detail));
    result.statusReason = "The draft email failed a deterministic copy check. Edit it or reject it.";
    return done();
  }

  result.status = "ACTIONABLE";
  result.statusReason = "Offer, evidence, and copy passed every check. Ready for your decision.";
  return done();
}

/** Sequential on purpose: the run log stays in cart order and scripted tests stay deterministic. */
export async function evaluateCarts(carts: Cart[], deps: PipelineDeps = {}): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];
  for (const cart of carts) {
    results.push(await evaluateCart(cart, deps));
  }
  return results;
}
