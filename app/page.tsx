import { loadCarts } from "@/lib/carts";

/**
 * Placeholder review queue. Proves the fixture loads and validates at request time.
 * The real marketer workflow (recommendations, approve / edit / reject) lands in later PRs.
 */
export default function Home() {
  const carts = loadCarts();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Envorso Sports · Seattle Seawolves
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Cart Win-Back Review</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {carts.length} stale carts loaded from the last 7 days. Agent recommendations are not
          wired up yet.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-4 py-3">Cart</th>
              <th className="px-4 py-3">Fan</th>
              <th className="px-4 py-3">Seats</th>
              <th className="px-4 py-3">Section</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Abandoned</th>
              <th className="px-4 py-3">Lifetime</th>
              <th className="px-4 py-3">Last purchase</th>
              <th className="px-4 py-3">Email opt-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {carts.map((cart) => (
              <tr key={cart.cartId} className="hover:bg-zinc-900/60">
                <td className="px-4 py-3 font-mono">{cart.cartId}</td>
                <td className="px-4 py-3 font-mono text-zinc-400">{cart.fanId}</td>
                <td className="px-4 py-3">{cart.seats}</td>
                <td className="px-4 py-3">{cart.section}</td>
                <td className="px-4 py-3">${cart.cartValue}</td>
                <td className="px-4 py-3">{cart.abandonedHours} hrs ago</td>
                <td className="px-4 py-3">{cart.lifetimeTickets}</td>
                <td className="px-4 py-3">
                  {cart.lastPurchaseDaysAgo === null ? "Never" : `${cart.lastPurchaseDaysAgo} days ago`}
                </td>
                <td className="px-4 py-3">{cart.emailOptIn ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
