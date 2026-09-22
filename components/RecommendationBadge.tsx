import { STATUS_LABELS } from "@/lib/labels";
import type { Confidence, DecisionStatus } from "@/lib/types";

const badgeBase = "inline-flex items-center rounded-full ring-1 ring-inset";

/** Semantic status colors: green ready, amber needs review, cyan waiting, muted suppressed. */
const STATUS_STYLES: Record<DecisionStatus, string> = {
  ACTIONABLE: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  NEEDS_REVIEW: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  WAIT: "bg-accent/15 text-accent ring-accent/30",
  SUPPRESSED: "bg-white/10 text-white/60 ring-white/15",
};

export function StatusBadge({ status }: { status: DecisionStatus }) {
  return <span className={`${badgeBase} px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: "text-emerald-300 ring-emerald-500/30",
  medium: "text-white/70 ring-white/20",
  low: "text-amber-300 ring-amber-500/30",
};

/** Display only. Nothing in the pipeline or the review actions reads confidence. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span
      title="The strategist's self-reported confidence. It does not affect any check or action."
      className={`${badgeBase} px-2 py-0.5 text-[11px] font-medium capitalize ${CONFIDENCE_STYLES[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}

export function SegmentBadge({ label }: { label: string }) {
  return <span className={`${badgeBase} bg-purple/25 px-2.5 py-0.5 text-xs font-semibold text-purple-soft ring-purple-soft/40`}>{label}</span>;
}
