import { formatAbandoned, formatCost, formatDuration, formatEvidence, formatLastPurchase, formatMoney, OFFER_LABELS, SEGMENT_LABELS } from "@/lib/labels";
import type { EvaluationView } from "@/lib/queue";
import type { Cart } from "@/lib/types";
import { DecisionTrace } from "./DecisionTrace";
import { ConfidenceBadge, SegmentBadge, StatusBadge } from "./RecommendationBadge";

export interface CartReviewCardProps {
  cart: Cart;
  evaluation: EvaluationView | null;
  onRun: () => void;
  running: boolean;
}

function RunButton({ evaluated, running, onRun }: { evaluated: boolean; running: boolean; onRun: () => void }) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={running}
      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
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
    <dl data-testid="fan-context" className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
          <dd className="text-zinc-200">{value}</dd>
        </div>
      ))}
      {segmentLabel && (
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Segment</dt>
          <dd>
            <SegmentBadge label={segmentLabel} />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function CartReviewCard({ cart, evaluation, onRun, running }: CartReviewCardProps) {
  const segmentLabel = evaluation?.segment ? SEGMENT_LABELS[evaluation.segment.segment] : null;
  const rec = evaluation?.recommendation ?? null;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold text-zinc-100">{cart.cartId}</h2>
            <span className="font-mono text-xs text-zinc-500">{cart.fanId}</span>
            {evaluation && <StatusBadge status={evaluation.status} />}
          </div>
          {evaluation && (
            <p className="mt-1 text-xs text-zinc-500">
              Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()} · {formatCost(evaluation.costUsd)} est. ·{" "}
              <span className="font-mono">{evaluation.recommendationId.slice(0, 8)}</span>
            </p>
          )}
        </div>
        <RunButton evaluated={evaluation !== null} running={running} onRun={onRun} />
      </header>

      <div className="mt-4">
        <FanContext cart={cart} segmentLabel={segmentLabel} />
      </div>

      {!evaluation && (
        <p className="mt-4 rounded-md border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-400">
          Not evaluated yet. Run the agent to get a recommendation for this cart.
        </p>
      )}

      {evaluation && (evaluation.status === "SUPPRESSED" || evaluation.status === "WAIT") && (
        <div
          data-testid="status-reason"
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            evaluation.status === "SUPPRESSED" ? "border-zinc-700 bg-zinc-900 text-zinc-300" : "border-sky-500/30 bg-sky-500/5 text-sky-100"
          }`}
        >
          <p className="font-medium">{evaluation.statusReason}</p>
          {evaluation.status === "WAIT" && evaluation.recheckInHours !== null && (
            <p className="mt-1 text-sky-200/80">Re-check in {formatDuration(evaluation.recheckInHours)}.</p>
          )}
          {evaluation.status === "SUPPRESSED" && <p className="mt-1 text-zinc-500">No model was called for this cart.</p>}
        </div>
      )}

      {evaluation && (evaluation.status === "ACTIONABLE" || evaluation.status === "NEEDS_REVIEW") && (
        <div className="mt-4 space-y-4">
          {evaluation.issues.length > 0 && (
            <div data-testid="issues" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-semibold text-amber-200">{evaluation.statusReason}</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-amber-100/90">
                {evaluation.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {rec && (
            <section data-testid="recommendation" className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recommended offer</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xl font-bold text-zinc-50">{OFFER_LABELS[rec.offerType]}</p>
                {rec.offerType === "PERCENT_DISCOUNT" && (
                  <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-sm font-semibold text-zinc-100">{rec.discountPercent}% off</span>
                )}
                <ConfidenceBadge confidence={rec.confidence} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">{rec.reason}</p>
              <div data-testid="evidence" className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Used in decision</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {rec.evidence.map((e, i) => (
                    <li key={i} className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-300">
                      {formatEvidence(e.field, e.value)}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {evaluation.message && (
            <section data-testid="email" className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Draft email</p>
              <p className="mt-1 text-sm font-semibold text-zinc-100">{evaluation.message.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{evaluation.message.body}</pre>
            </section>
          )}

          {rec?.offerType === "NO_ACTION" && (
            <p className="text-sm text-zinc-400">No email drafted: the strategist recommends leaving this cart alone.</p>
          )}
        </div>
      )}

      {evaluation && (
        <div className="mt-4">
          <DecisionTrace trace={evaluation.trace} />
        </div>
      )}
    </article>
  );
}
