// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actionableEvaluation, needsReviewEvaluation } from "@/evals/helpers/fixtures";
import type { EvaluationView } from "@/lib/queue";
import type { ReviewAction } from "@/lib/types";
import { ReviewActions } from "./ReviewActions";

let actionable: EvaluationView;
let review: EvaluationView;
beforeAll(async () => {
  const [a, r] = await Promise.all([actionableEvaluation(), needsReviewEvaluation()]);
  actionable = { ...a, costUsd: 0.006 };
  review = { ...r, costUsd: 0.003 };
});

const submitOk = () => vi.fn().mockResolvedValue({ ok: true, warnings: [] as string[] });

describe("ReviewActions: unreviewed", () => {
  it("approve submits APPROVED bound to the recommendation id", async () => {
    const onSubmit = submitOk();
    render(<ReviewActions evaluation={actionable} review={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ cartId: "C-1002", recommendationId: "rec-actionable", decision: "APPROVED" });
  });

  it("edit opens the draft prefilled, saves as EDITED with the new copy, and shows returned warnings", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, warnings: ['Blocked phrase: "last chance".'] });
    render(<ReviewActions evaluation={actionable} review={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const subject = screen.getByLabelText(/subject/i) as HTMLInputElement;
    const body = screen.getByLabelText(/body/i) as HTMLTextAreaElement;
    expect(subject.value).toBe("Your 4 Upper Deck seats are still in your cart");
    expect(body.value).toMatch(/waive the service fees/);

    fireEvent.change(subject, { target: { value: "Last chance for your seats" } });
    fireEvent.click(screen.getByRole("button", { name: /save edit/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ decision: "EDITED", editedSubject: "Last chance for your seats" });
    expect(await screen.findByRole("status")).toHaveTextContent(/last chance/i);
  });

  it("reject requires a reason and submits it with an optional note", async () => {
    const onSubmit = submitOk();
    render(<ReviewActions evaluation={actionable} review={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));

    const confirm = screen.getByRole("button", { name: /confirm reject/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "POOR_TONE" } });
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Too pushy." } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ decision: "REJECTED", rejectionReason: "POOR_TONE", rejectionNote: "Too pushy." });
  });

  it("disables approve when the offer failed a policy check and explains why", () => {
    render(<ReviewActions evaluation={review} review={null} onSubmit={submitOk()} />);
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeDisabled();
    expect(screen.getByText(/policy check/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reject$/i })).toBeEnabled();
  });

  it("shows the submit error and stays editable when the server refuses", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: "Recommendation changed. Reload to review the new one." });
    render(<ReviewActions evaluation={actionable} review={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Recommendation changed/);
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled();
  });
});

describe("ReviewActions: reviewed", () => {
  const approvedAction: ReviewAction = { cartId: "C-1002", recommendationId: "rec-actionable", decision: "APPROVED", reviewedAt: "2026-09-22T18:05:00.000Z" };

  it("shows the decision and lets the marketer change it", () => {
    render(<ReviewActions evaluation={actionable} review={approvedAction} onSubmit={submitOk()} />);
    expect(screen.getByTestId("review-state")).toHaveTextContent(/approved/i);
    fireEvent.click(screen.getByRole("button", { name: /change decision/i }));
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });

  it("shows edited copy as the current draft and keeps the original available", () => {
    const edited: ReviewAction = { ...approvedAction, decision: "EDITED", editedSubject: "New subject", editedBody: "New body." };
    render(<ReviewActions evaluation={actionable} review={edited} onSubmit={submitOk()} />);
    expect(screen.getByTestId("review-state")).toHaveTextContent(/edited/i);
    expect(screen.getByText("New subject")).toBeInTheDocument();
    expect(screen.getByText(/show original/i)).toBeInTheDocument();
    expect(screen.getByText("Your 4 Upper Deck seats are still in your cart")).toBeInTheDocument();
  });

  it("shows the rejection reason in words", () => {
    const rejected: ReviewAction = { ...approvedAction, decision: "REJECTED", rejectionReason: "DISCOUNT_TOO_HIGH", rejectionNote: "Cap is 0." };
    render(<ReviewActions evaluation={actionable} review={rejected} onSubmit={submitOk()} />);
    expect(screen.getByTestId("review-state")).toHaveTextContent(/Discount too high/);
    expect(screen.getByTestId("review-state")).toHaveTextContent(/Cap is 0\./);
  });
});
