"use client";

import Image from "next/image";
import { useState } from "react";
import type { QueueResponse } from "@/lib/queue";
import type { ReviewAction, ReviewActionInput } from "@/lib/types";
import { CartReviewCard } from "./CartReviewCard";
import type { ReviewSubmitResult } from "./ReviewActions";
import { EmptyState } from "./EmptyState";
import { SummaryMetrics } from "./SummaryMetrics";
import { eyebrow, pill, pillSize } from "./ui";

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
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-deep/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="inline-flex shrink-0 items-center rounded-md bg-white px-2 py-1.5">
              <Image src="/envorso-sports.svg" alt="Envorso Sports" width={87} height={28} priority unoptimized className="h-7 w-auto" />
            </span>
            <span aria-hidden="true" className="hidden h-8 w-px bg-white/15 sm:block" />
            <div>
              <p className={eyebrow}>Seattle Seawolves · Ticketing</p>
              <h1 className="text-lg font-bold tracking-tight text-white sm:text-xl">Cart Win-Back Review</h1>
            </div>
          </div>
          <button type="button" onClick={() => run()} disabled={running !== null} className={`${pill.agent} ${pillSize.lg}`}>
            {running === "all" ? "Running on all carts…" : "Run agent on all carts"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <p className="mb-6 max-w-2xl text-sm text-white/60">
          The agent proposes an offer and drafts an email for each stale cart. You decide what happens. Nothing is sent
          from here.
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
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

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-white/40">
          Cost estimates use list prices as of {queue.pricing.asOf}. Token counts are logged; dollars are computed on display.
        </footer>
      </main>
    </>
  );
}
