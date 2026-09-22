import { STATUS_LABELS } from "@/lib/labels";
import type { Confidence, DecisionStatus } from "@/lib/types";

const STATUS_STYLES: Record<DecisionStatus, string> = {
  ACTIONABLE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  NEEDS_REVIEW: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  WAIT: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  SUPPRESSED: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
};

export function StatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: "text-emerald-300 ring-emerald-500/30",
  medium: "text-zinc-300 ring-zinc-500/30",
  low: "text-amber-300 ring-amber-500/30",
};

/** Display only. Nothing in the pipeline or the review actions reads confidence. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      title="The strategist's self-reported confidence. It does not affect any check or action."
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${CONFIDENCE_STYLES[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}

export function SegmentBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-200 ring-1 ring-inset ring-indigo-500/30">
      {label}
    </span>
  );
}
