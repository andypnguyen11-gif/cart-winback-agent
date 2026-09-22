import { z } from "zod";
import { loadCarts } from "@/lib/carts";
import { getModel } from "@/lib/config";
import { evaluateCarts } from "@/lib/pipeline";
import { buildQueue } from "@/lib/queue";
import { appendRun, saveEvaluation, toRunRecord } from "@/lib/storage";

/**
 * GET  /api/evaluate            stored evaluations for every cart (no model calls)
 * POST /api/evaluate {cartId?}  run the pipeline for one cart or all, persist, return the queue
 *
 * The agent runs only on POST. Refreshing the page never regenerates.
 */

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ cartId: z.string().regex(/^C-\d+$/).optional() }).strict();

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
