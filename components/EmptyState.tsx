export function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-zinc-100">No recommendations yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        Run the agent to evaluate the stale carts below. Carts without email consent or under two hours old are handled
        by policy without a model call. Nothing is ever sent to a fan from this screen.
      </p>
    </div>
  );
}
