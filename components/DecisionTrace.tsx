import type { TraceStep } from "@/lib/types";

const STATUS_STYLES: Record<TraceStep["status"], string> = {
  ok: "border-emerald-500/50",
  failed: "border-amber-500/60",
  skipped: "border-white/15 opacity-70",
};

const STATUS_TEXT: Record<TraceStep["status"], string> = {
  ok: "passed",
  failed: "failed",
  skipped: "skipped",
};

/** The "why" behind a recommendation, stage by stage. No prompts, no JSON. */
export function DecisionTrace({ trace }: { trace: TraceStep[] }) {
  return (
    <details className="group rounded-xl border border-white/10 bg-ink-deep/60">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white">
        Why did the agent choose this?
        <span className="ml-2 font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-white/40">{trace.length} steps</span>
      </summary>
      <ol className="space-y-3 border-t border-white/10 px-4 py-3">
        {trace.map((step) => (
          <li
            key={step.stage}
            data-testid={`trace-${step.stage}`}
            data-status={step.status}
            className={`border-l-2 pl-3 ${STATUS_STYLES[step.status]}`}
          >
            <p className="flex items-baseline gap-2 text-sm font-semibold text-white/90">
              <span>{step.stage}</span>
              <span className="font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-white/40">{STATUS_TEXT[step.status]}</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-white/60">
              {step.lines.map((line, i) => (
                <li key={i} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}
