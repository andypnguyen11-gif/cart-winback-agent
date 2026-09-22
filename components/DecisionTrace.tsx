import type { TraceStep } from "@/lib/types";

const STATUS_STYLES: Record<TraceStep["status"], string> = {
  ok: "border-emerald-500/40",
  failed: "border-amber-500/60",
  skipped: "border-zinc-700 opacity-70",
};

const STATUS_TEXT: Record<TraceStep["status"], string> = {
  ok: "passed",
  failed: "failed",
  skipped: "skipped",
};

/** The "why" behind a recommendation, stage by stage. No prompts, no JSON. */
export function DecisionTrace({ trace }: { trace: TraceStep[] }) {
  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-950/60">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-zinc-100">
        Why did the agent choose this?
        <span className="ml-2 text-xs font-normal text-zinc-500">{trace.length} steps</span>
      </summary>
      <ol className="space-y-3 border-t border-zinc-800 px-4 py-3">
        {trace.map((step) => (
          <li
            key={step.stage}
            data-testid={`trace-${step.stage}`}
            data-status={step.status}
            className={`border-l-2 pl-3 ${STATUS_STYLES[step.status]}`}
          >
            <p className="flex items-baseline gap-2 text-sm font-semibold text-zinc-200">
              <span>{step.stage}</span>
              <span className="text-[11px] font-normal uppercase tracking-wider text-zinc-500">{STATUS_TEXT[step.status]}</span>
            </p>
            <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-zinc-400">
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
