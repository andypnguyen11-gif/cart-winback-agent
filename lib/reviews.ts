import path from "node:path";
import { dataDir, readJsonFile, writeJsonAtomic, type StorageOptions } from "./storage";
import type { EvaluationResult, MessageOutput, ReviewAction } from "./types";
import { failures, validateMessage } from "./validation";

/**
 * Marketer decisions. Append-only so the history of a recommendation is
 * kept; the latest action per recommendationId is what the UI shows.
 *
 *   data/review-actions.json
 */

export async function readReviewActions(opts: StorageOptions = {}): Promise<ReviewAction[]> {
  return readJsonFile<ReviewAction[]>(path.join(dataDir(opts), "review-actions.json"), []);
}

export async function appendReviewAction(action: ReviewAction, opts: StorageOptions = {}): Promise<void> {
  const file = path.join(dataDir(opts), "review-actions.json");
  const current = await readJsonFile<ReviewAction[]>(file, []);
  current.push(action);
  await writeJsonAtomic(file, current);
}

export function latestReviewByRecommendation(actions: ReviewAction[]): Record<string, ReviewAction> {
  const latest: Record<string, ReviewAction> = {};
  for (const action of actions) {
    const existing = latest[action.recommendationId];
    if (!existing || action.reviewedAt >= existing.reviewedAt) latest[action.recommendationId] = action;
  }
  return latest;
}

/**
 * Re-runs the deterministic copy checks on a marketer's edit. The result is
 * advice, not a gate: the marketer is the authority on language.
 */
export function checkEditedMessage(evaluation: EvaluationResult, edited: MessageOutput): string[] {
  if (!evaluation.recommendation || !evaluation.segment) return [];
  return failures(
    validateMessage(edited, {
      offer: evaluation.recommendation,
      cart: evaluation.cart,
      segment: evaluation.segment.segment,
    }),
  );
}

export { canApprove } from "./reviewPolicy";
