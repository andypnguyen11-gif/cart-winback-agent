import type { EvaluationResult } from "./types";

/**
 * Money and consent rules are not the marketer's to waive from this screen.
 * A recommendation whose offer or evidence failed policy can be rejected or
 * re-run, never approved or edited into shape. Pure: safe to import in the
 * browser and on the server, so both enforce the same rule.
 */
export function canApprove(evaluation: EvaluationResult): { ok: true } | { ok: false; reason: string } {
  if (!evaluation.recommendation) {
    return { ok: false, reason: "There is no recommendation to approve. Re-run the agent or reject." };
  }
  if (evaluation.status !== "ACTIONABLE" && evaluation.status !== "NEEDS_REVIEW") {
    return { ok: false, reason: `A ${evaluation.status.toLowerCase()} cart cannot be approved.` };
  }
  const offerOk = evaluation.validation.offer?.passed ?? false;
  const evidenceOk = evaluation.validation.evidence?.passed ?? false;
  if (!offerOk || !evidenceOk) {
    return {
      ok: false,
      reason: "The offer or its evidence failed a policy check. Approval is blocked; re-run the agent or reject.",
    };
  }
  return { ok: true };
}
