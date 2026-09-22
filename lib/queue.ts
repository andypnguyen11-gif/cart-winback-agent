import { MODEL_PRICES } from "./config";
import { estimateRunCostUsd } from "./cost";
import { latestReviewByRecommendation, readReviewActions } from "./reviews";
import { readEvaluations, type StorageOptions } from "./storage";
import type { Cart, EvaluationResult, ReviewAction } from "./types";

/** The shape the page and the API both serve: every cart, with its stored evaluation if any. */

export interface EvaluationView extends EvaluationResult {
  /** Computed now from the dated price table; null if a model is unpriced. */
  costUsd: number | null;
}

export interface QueueItem {
  cart: Cart;
  evaluation: EvaluationView | null;
  /** The marketer's latest decision on this exact recommendation. Null once the cart is re-run. */
  review: ReviewAction | null;
}

export interface QueueResponse {
  results: QueueItem[];
  pricing: { asOf: string; source: string };
}

export async function buildQueue(carts: Cart[], opts: StorageOptions = {}): Promise<QueueResponse> {
  const [stored, actions] = await Promise.all([readEvaluations(opts), readReviewActions(opts)]);
  const reviews = latestReviewByRecommendation(actions);
  return {
    results: carts.map((cart) => {
      const evaluation = stored[cart.cartId];
      return {
        cart,
        evaluation: evaluation ? { ...evaluation, costUsd: estimateRunCostUsd(evaluation.calls) } : null,
        review: evaluation ? (reviews[evaluation.recommendationId] ?? null) : null,
      };
    }),
    pricing: { asOf: MODEL_PRICES.asOf, source: MODEL_PRICES.source },
  };
}
