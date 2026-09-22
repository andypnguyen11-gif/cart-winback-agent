"use client";

import { useState } from "react";
import type { QueueResponse } from "@/lib/queue";
import type { ReviewAction, ReviewActionInput } from "@/lib/types";
import { CartReviewCard } from "./CartReviewCard";
import type { ReviewSubmitResult } from "./ReviewActions";
import { EmptyState } from "./EmptyState";
import { SummaryMetrics } from "./SummaryMetrics";

/**
 * The marketer's queue. Renders whatever is stored; the agent runs only when
 * a button is pressed. A page refresh re-reads storage and never regenerates.
 */
export function ReviewQueue({ initialQueue }: { initialQueue: QueueResponse }) {
  const [queue, setQueue] = useState(initialQueue);
  const [running, setRunning] = useState<"all" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const evaluatedCount = queue.results.filter((r) => r.evaluation !== null).length;

  async function run(cartId?: string) {
    setRunning(cartId ?? "all");
    setError(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cartId ? { cartId } : {}),
      });
      const json = (await res.json()) as QueueResponse | { error: string };
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : `Request failed (${res.status})`);
      }
      setQueue(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  async function submitReview(input: ReviewActionInput): Promise<ReviewSubmitResult> {
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as { review: ReviewAction; warnings: string[] } | { error: string };
      if (!res.ok || "error" in json) {
        return { ok: false, error: "error" in json ? json.error : `Request failed (${res.status})` };
      }
      setQueue((q) => ({
        ...q,
        results: q.results.map((r) => (r.cart.cartId === input.cartId ? { ...r, review: json.review } : r)),
      }));
      return { ok: true, warnings: json.warnings };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Envorso Sports · Seattle Seawolves</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50">Cart Win-Back Review</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            The agent proposes an offer and drafts an email for each stale cart. You decide what happens. Nothing is sent
            from here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => run()}
          disabled={running !== null}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running === "all" ? "Running on all carts…" : "Run agent on all carts"}
        </button>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <SummaryMetrics items={queue.results} />

      <div className="mt-6 space-y-4">
        {evaluatedCount === 0 && <EmptyState />}
        {queue.results.map(({ cart, evaluation, review }) => (
          <CartReviewCard
            key={cart.cartId}
            cart={cart}
            evaluation={evaluation}
            review={review}
            onReview={submitReview}
            onRun={() => run(cart.cartId)}
            running={running === "all" || running === cart.cartId}
          />
        ))}
      </div>

      <footer className="mt-10 text-xs text-zinc-600">
        Cost estimates use list prices as of {queue.pricing.asOf}. Token counts are logged; dollars are computed on display.
      </footer>
    </main>
  );
}
