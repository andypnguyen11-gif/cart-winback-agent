"use client";

import { useState } from "react";
import { DECISION_LABELS, REJECTION_LABELS } from "@/lib/labels";
import type { EvaluationView } from "@/lib/queue";
import { canApprove } from "@/lib/reviewPolicy";
import { REJECTION_REASONS } from "@/lib/schemas";
import type { RejectionReason, ReviewAction, ReviewActionInput } from "@/lib/types";

export type ReviewSubmitResult = { ok: true; warnings: string[] } | { ok: false; error: string };

export interface ReviewActionsProps {
  evaluation: EvaluationView;
  review: ReviewAction | null;
  onSubmit: (input: ReviewActionInput) => Promise<ReviewSubmitResult>;
}

type Mode = "idle" | "edit" | "reject";

const buttonBase = "rounded-md px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${buttonBase} bg-emerald-500 text-emerald-950 hover:bg-emerald-400`;
const secondary = `${buttonBase} border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500`;
const danger = `${buttonBase} border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20`;

/**
 * The human decision. Approve and Edit are gated by policy on the server and
 * mirrored here; Reject is always available. Edits are re-checked and the
 * result shown as a warning the marketer may ignore.
 */
export function ReviewActions({ evaluation, review, onSubmit }: ReviewActionsProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const original = evaluation.message;
  const currentSubject = review?.decision === "EDITED" ? review.editedSubject! : (original?.subject ?? "");
  const currentBody = review?.decision === "EDITED" ? review.editedBody! : (original?.body ?? "");

  const [subject, setSubject] = useState(currentSubject);
  const [body, setBody] = useState(currentBody);
  const [reason, setReason] = useState<RejectionReason | "">("");
  const [note, setNote] = useState("");

  const approval = canApprove(evaluation);
  const base = { cartId: evaluation.cartId, recommendationId: evaluation.recommendationId };

  async function submit(input: ReviewActionInput) {
    setBusy(true);
    setError(null);
    const result = await onSubmit(input);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWarnings(result.warnings);
    setMode("idle");
    setChanging(false);
  }

  if (review && !changing) {
    return (
      <div className="space-y-3">
        <div
          data-testid="review-state"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
            review.decision === "REJECTED" ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5"
          }`}
        >
          <div>
            <p className="font-semibold text-zinc-100">
              {DECISION_LABELS[review.decision]}
              {review.decision === "REJECTED" && review.rejectionReason && (
                <span className="font-normal text-zinc-300"> · {REJECTION_LABELS[review.rejectionReason]}</span>
              )}
            </p>
            {review.rejectionNote && <p className="mt-0.5 text-zinc-400">{review.rejectionNote}</p>}
            <p className="mt-0.5 text-xs text-zinc-500">Recorded {new Date(review.reviewedAt).toLocaleString()}</p>
          </div>
          <button type="button" className={secondary} onClick={() => setChanging(true)}>
            Change decision
          </button>
        </div>

        {warnings.length > 0 && (
          <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm text-amber-100">
            Saved. Copy checks flagged: {warnings.join(" ")}
          </p>
        )}

        {review.decision === "EDITED" && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Draft email <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">Edited</span>
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{review.editedSubject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{review.editedBody}</pre>
            {original && (
              <details className="mt-3 text-xs text-zinc-500">
                <summary className="cursor-pointer">Show original</summary>
                <p className="mt-2 font-semibold text-zinc-400">{original.subject}</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-zinc-400">{original.body}</pre>
              </details>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      {warnings.length > 0 && mode === "idle" && (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm text-amber-100">
          Saved. Copy checks flagged: {warnings.join(" ")}
        </p>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={primary} disabled={busy || !approval.ok} onClick={() => submit({ ...base, decision: "APPROVED" })}>
            Approve
          </button>
          <button type="button" className={secondary} disabled={busy || !approval.ok || !original} onClick={() => setMode("edit")}>
            Edit
          </button>
          <button type="button" className={danger} disabled={busy} onClick={() => setMode("reject")}>
            Reject
          </button>
          {changing && (
            <button type="button" className="text-sm text-zinc-400 hover:text-zinc-200" onClick={() => setChanging(false)}>
              Keep current decision
            </button>
          )}
          {!approval.ok && <p className="basis-full text-xs text-amber-200/90">{approval.reason}</p>}
        </div>
      )}

      {mode === "edit" && (
        <form
          className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ ...base, decision: "EDITED", editedSubject: subject, editedBody: body });
          }}
        >
          <label className="block text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={8}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-sans text-zinc-100"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Your edit is re-checked for wrong numbers and blocked phrases. Anything flagged is shown as a warning; it never blocks you.
          </p>
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={busy || !subject.trim() || !body.trim()}>
              Save edit
            </button>
            <button type="button" className={secondary} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "reject" && (
        <form
          className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason) return;
            void submit({ ...base, decision: "REJECTED", rejectionReason: reason, ...(note.trim() ? { rejectionNote: note.trim() } : {}) });
          }}
        >
          <label className="block text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RejectionReason | "")}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            >
              <option value="">Choose a reason</option>
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={danger} disabled={busy || !reason}>
              Confirm reject
            </button>
            <button type="button" className={secondary} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
