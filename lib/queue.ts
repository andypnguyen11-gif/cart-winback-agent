import { MODEL_PRICES } from "./config";
import { estimateRunCostUsd } from "./cost";
import { readEvaluations } from "./storage";
import type { Cart, EvaluationResult } from "./types";

/** The shape the page and the API both serve: every cart, with its stored evaluation if any. */

export interface EvaluationView extends EvaluationResult {
  /** Computed now from the dated price table; null if a model is unpriced. */
  costUsd: number | null;
}

export interface QueueItem {
  cart: Cart;
  evaluation: EvaluationView | null;
}

export interface QueueResponse {
  results: QueueItem[];
  pricing: { asOf: string; source: string };
}

export async function buildQueue(carts: Cart[]): Promise<QueueResponse> {
  const stored = await readEvaluations();
  return {
    results: carts.map((cart) => {
      const evaluation = stored[cart.cartId];
      return {
        cart,
        evaluation: evaluation ? { ...evaluation, costUsd: estimateRunCostUsd(evaluation.calls) } : null,
      };
    }),
    pricing: { asOf: MODEL_PRICES.asOf, source: MODEL_PRICES.source },
  };
}
