import { formatCost, formatMoney } from "@/lib/labels";
import type { QueueItem } from "@/lib/queue";
import { eyebrow } from "./ui";

interface Metric {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "wait" | "muted";
}

const TONE: Record<NonNullable<Metric["tone"]>, string> = {
  default: "text-white",
  good: "text-emerald-300",
  warn: "text-amber-300",
  wait: "text-accent",
  muted: "text-white/50",
};

export function SummaryMetrics({ items }: { items: QueueItem[] }) {
  const evaluated = items.filter((i) => i.evaluation !== null);
  const count = (status: string) => evaluated.filter((i) => i.evaluation?.status === status).length;
  const cartValue = items.reduce((sum, i) => sum + i.cart.cartValue, 0);
  const costs = evaluated.map((i) => i.evaluation?.costUsd ?? null);
  const cost = costs.some((c) => c === null) ? null : costs.reduce<number>((sum, c) => sum + (c ?? 0), 0);

  const metrics: Metric[] = [
    { key: "evaluated", label: "Evaluated", value: String(evaluated.length), hint: `of ${items.length} carts` },
    { key: "actionable", label: "Ready for review", value: String(count("ACTIONABLE")), tone: "good" },
    { key: "needs-review", label: "Needs review", value: String(count("NEEDS_REVIEW")), tone: "warn" },
    { key: "waiting", label: "Waiting", value: String(count("WAIT")), tone: "wait" },
    { key: "suppressed", label: "Suppressed", value: String(count("SUPPRESSED")), tone: "muted" },
    { key: "cart-value", label: "Cart value in queue", value: formatMoney(cartValue) },
    { key: "cost", label: "Model cost, last runs", value: formatCost(cost, 2), hint: "estimated" },
  ];

  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {metrics.map((m) => (
        <div key={m.key} data-testid={`metric-${m.key}`} className="rounded-2xl border border-white/10 bg-ink-surface px-4 py-3">
          <p className={eyebrow}>{m.label}</p>
          <p className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${TONE[m.tone ?? "default"]}`}>{m.value}</p>
          {m.hint && <p className="text-xs text-white/40">{m.hint}</p>}
        </div>
      ))}
    </section>
  );
}
