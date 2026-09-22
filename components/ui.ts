/**
 * Shared class strings for the brand look. Purple is reserved for running the
 * agent; the marketer's own decisions keep semantic green and red so a model
 * call never looks like a human approval.
 */
const pillBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-deep " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const pill = {
  /** Model call: purple, glows on hover. */
  agent: `${pillBase} bg-purple text-white hover:-translate-y-0.5 hover:bg-purple-bright hover:shadow-glow disabled:hover:translate-y-0 disabled:hover:shadow-none`,
  /** Human approval. */
  approve: `${pillBase} bg-emerald-500 text-emerald-950 hover:bg-emerald-400`,
  /** Human rejection. */
  reject: `${pillBase} border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20`,
  /** Edit, cancel, save, change decision. */
  outline: `${pillBase} border border-white/20 text-white/85 hover:border-white/40 hover:bg-white/5 hover:text-white`,
} as const;

export const pillSize = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
} as const;

export const eyebrow = "font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40";

export const card = "rounded-2xl border border-white/10 bg-ink-surface p-5 transition-all duration-300 hover:border-purple-soft/30 hover:shadow-glow";

export const panel = "rounded-xl border border-white/10 bg-ink-deep/60 p-4";

export const field =
  "mt-1 w-full rounded-xl border border-white/15 bg-ink-deep/80 px-3 py-2 text-white placeholder:text-white/30 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";
