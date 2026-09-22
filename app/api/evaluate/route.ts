import { z } from "zod";
import { loadCarts } from "@/lib/carts";
import { getModel, MODEL_PRICES } from "@/lib/config";
import { estimateRunCostUsd } from "@/lib/cost";
import { evaluateCarts } from "@/lib/pipeline";
import { appendRun, readEvaluations, saveEvaluation, toRunRecord } from "@/lib/storage";
import type { Cart, EvaluationResult } from "@/lib/types";

/**
 * GET  /api/evaluate            stored evaluations for every cart (no model calls)
 * POST /api/evaluate {cartId?}  run the pipeline for one cart or all, persist, return the queue
 *
 * The agent runs only on POST. Refreshing the page never regenerates.
 */

export const dynamic = "force-dynamic";

export interface EvaluationView extends EvaluationResult {
  /** Computed now from the dated price table; null if a model is unpriced. */
  costUsd: number | null;
}

export interface QueueResponse {
  results: Array<{ cart: Cart; evaluation: EvaluationView | null }>;
  pricing: { asOf: string; source: string };
}

const RequestSchema = z.object({ cartId: z.string().regex(/^C-\d+$/).optional() }).strict();

async function buildQueue(carts: Cart[]): Promise<QueueResponse> {
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

export async function GET(): Promise<Response> {
  return Response.json(await buildQueue(loadCarts()));
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Expected { cartId?: string }" }, { status: 400 });
  }

  const carts = loadCarts();
  const targets = parsed.data.cartId ? carts.filter((c) => c.cartId === parsed.data.cartId) : carts;
  if (targets.length === 0) {
    return Response.json({ error: `Unknown cart ${parsed.data.cartId}` }, { status: 404 });
  }

  const models = { strategist: getModel("strategist"), copywriter: getModel("copywriter") };
  const results = await evaluateCarts(targets, { models });
  for (const result of results) {
    await saveEvaluation(result);
    await appendRun(toRunRecord(result, models));
  }

  return Response.json(await buildQueue(carts));
}
