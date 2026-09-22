import { formatAbandoned, formatCost, formatDuration, formatEvidence, formatLastPurchase, formatMoney, OFFER_LABELS, SEGMENT_LABELS } from "@/lib/labels";
import type { EvaluationView } from "@/lib/queue";
import type { Cart, ReviewAction, ReviewActionInput } from "@/lib/types";
import { DecisionTrace } from "./DecisionTrace";
import { ConfidenceBadge, SegmentBadge, StatusBadge } from "./RecommendationBadge";
import { ReviewActions, type ReviewSubmitResult } from "./ReviewActions";
import { card, eyebrow, panel, pill, pillSize } from "./ui";

export interface CartReviewCardProps {
  cart: Cart;
  evaluation: EvaluationView | null;
  onRun: () => void;
  running: boolean;
  review?: ReviewAction | null;
  onReview?: (input: ReviewActionInput) => Promise<ReviewSubmitResult>;
}

function RunButton({ evaluated, running, onRun }: { evaluated: boolean; running: boolean; onRun: () => void }) {
  return (
    <button type="button" onClick={onRun} disabled={running} className={`${pill.agent} ${pillSize.sm}`}>
      {running ? "Running…" : evaluated ? "Re-run agent" : "Run agent"}
    </button>
  );
}

function FanContext({ cart, segmentLabel }: { cart: Cart; segmentLabel: string | null }) {
  const facts: Array<[string, string]> = [
    ["Seats", `${cart.seats} seat${cart.seats === 1 ? "" : "s"}`],
    ["Section", cart.section],
    ["Cart value", formatMoney(cart.cartValue)],
    ["Abandoned", formatAbandoned(cart.abandonedHours)],
    ["Lifetime tickets", String(cart.lifetimeTickets)],
    ["Last purchase", formatLastPurchase(cart.lastPurchaseDaysAgo)],
    ["Email opt-in", cart.emailOptIn ? "Yes" : "No"],
  ];
  return (
    <dl data-testid="fan-context" className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className={eyebrow}>{label}</dt>
          <dd className="mt-0.5 text-white/90">{value}</dd>
        </div>
      ))}
      {segmentLabel && (
        <div>
          <dt className={eyebrow}>Segment</dt>
          <dd className="mt-0.5">
            <SegmentBadge label={segmentLabel} />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function CartReviewCard({ cart, evaluation, onRun, running, review = null, onReview }: CartReviewCardProps) {
  const segmentLabel = evaluation?.segment ? SEGMENT_LABELS[evaluation.segment.segment] : null;
  const rec = evaluation?.recommendation ?? null;
  const reviewable = evaluation !== null && (evaluation.status === "ACTIONABLE" || evaluation.status === "NEEDS_REVIEW");
  const showOriginalEmail = evaluation?.message && review?.decision !== "EDITED";

  return (
    <article className={card}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold text-white">{cart.cartId}</h2>
            <span className="font-mono text-xs text-white/40">{cart.fanId}</span>
            {evaluation && <StatusBadge status={evaluation.status} />}
          </div>
          {evaluation && (
            <p className="mt-1 text-xs text-white/40">
              Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()} ·{" "}
              {evaluation.calls.some((c) => c.attempts > 0) ? `${formatCost(evaluation.costUsd)} est.` : "no model calls"} ·{" "}
              <span className="font-mono">{evaluation.recommendationId.slice(0, 8)}</span>
            </p>
          )}
        </div>
        <RunButton evaluated={evaluation !== null} running={running} onRun={onRun} />
      </header>

      <div className="mt-5">
        <FanContext cart={cart} segmentLabel={segmentLabel} />
      </div>

      {!evaluation && (
        <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm text-white/60">
          Not evaluated yet. Run the agent to get a recommendation for this cart.
        </p>
      )}

      {evaluation && (evaluation.status === "SUPPRESSED" || evaluation.status === "WAIT") && (
        <div
          data-testid="status-reason"
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            evaluation.status === "SUPPRESSED" ? "border-white/10 bg-ink-deep/60 text-white/80" : "border-accent/30 bg-accent/5 text-accent"
          }`}
        >
          <p className="font-medium">{evaluation.statusReason}</p>
          {evaluation.status === "WAIT" && evaluation.recheckInHours !== null && (
            <p className="mt-1 text-accent/80">Re-check in {formatDuration(evaluation.recheckInHours)}.</p>
          )}
          {evaluation.status === "SUPPRESSED" && <p className="mt-1 text-white/40">No model was called for this cart.</p>}
        </div>
      )}

      {evaluation && (evaluation.status === "ACTIONABLE" || evaluation.status === "NEEDS_REVIEW") && (
        <div className="mt-5 space-y-4">
          {(evaluation.issues.length > 0 || evaluation.agentError) && (
            <div data-testid="issues" className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-200">{evaluation.statusReason}</p>
              {evaluation.issues.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-amber-100/90">
                  {evaluation.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
              {evaluation.agentError && evaluation.issues.length === 0 && (
                <p className="mt-1 text-amber-100/80">Nothing was sent and no recommendation was made. Fix the cause, then re-run this cart.</p>
              )}
            </div>
          )}

          {rec && (
            <section data-testid="recommendation" className={panel}>
              <p className={eyebrow}>Recommended offer</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xl font-bold tracking-tight text-white">{OFFER_LABELS[rec.offerType]}</p>
                {rec.offerType === "PERCENT_DISCOUNT" && (
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold text-white">{rec.discountPercent}% off</span>
                )}
                <ConfidenceBadge confidence={rec.confidence} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{rec.reason}</p>
              <div data-testid="evidence" className="mt-3">
                <p className={eyebrow}>Used in decision</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {rec.evidence.map((e, i) => (
                    <li key={i} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/80">
                      {formatEvidence(e.field, e.value)}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {showOriginalEmail && evaluation.message && (
            <section data-testid="email" className={panel}>
              <p className={eyebrow}>Draft email</p>
              <p className="mt-1.5 text-sm font-semibold text-white">{evaluation.message.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/75">{evaluation.message.body}</pre>
            </section>
          )}

          {rec?.offerType === "NO_ACTION" && (
            <p className="text-sm text-white/60">No email drafted: the strategist recommends leaving this cart alone.</p>
          )}

          {reviewable && onReview && (
            <ReviewActions key={`${evaluation.recommendationId}:${review?.reviewedAt ?? "none"}`} evaluation={evaluation} review={review} onSubmit={onReview} />
          )}
        </div>
      )}

      {evaluation && (
        <div className="mt-5">
          <DecisionTrace trace={evaluation.trace} />
        </div>
      )}
    </article>
  );
}
