export function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-ink-surface/60 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-white">No recommendations yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
        Run the agent to evaluate the stale carts below. Carts without email consent or under two hours old are handled
        by policy without a model call. Nothing is ever sent to a fan from this screen.
      </p>
    </div>
  );
}
