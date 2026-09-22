import { appendReviewAction, canApprove, checkEditedMessage, readReviewActions } from "@/lib/reviews";
import { ReviewActionInputSchema } from "@/lib/schemas";
import { readEvaluations } from "@/lib/storage";
import type { ReviewAction } from "@/lib/types";

/**
 * GET  /api/review   every recorded marketer action
 * POST /api/review   record approve / edit / reject against a specific recommendationId
 *
 * The server, not the client, decides whether the recommendation is still
 * current and whether policy allows approval. Edits are re-checked and the
 * result returned as warnings; they are saved either way.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ actions: await readReviewActions() });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = ReviewActionInputSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => i.message).join(" ");
    return Response.json({ error: `Invalid review: ${detail}` }, { status: 400 });
  }
  const input = parsed.data;

  const evaluation = (await readEvaluations())[input.cartId];
  if (!evaluation) {
    return Response.json({ error: `No evaluation stored for ${input.cartId}` }, { status: 404 });
  }
  if (evaluation.recommendationId !== input.recommendationId) {
    return Response.json(
      { error: "This recommendation has been re-run since you loaded it. Reload to review the current one." },
      { status: 409 },
    );
  }

  let warnings: string[] = [];
  if (input.decision === "APPROVED" || input.decision === "EDITED") {
    const verdict = canApprove(evaluation);
    if (!verdict.ok) return Response.json({ error: verdict.reason }, { status: 422 });
  }
  if (input.decision === "EDITED") {
    warnings = checkEditedMessage(evaluation, { subject: input.editedSubject!, body: input.editedBody! });
  }

  const review: ReviewAction = { ...input, reviewedAt: new Date().toISOString() };
  await appendReviewAction(review);
  return Response.json({ review, warnings });
}
