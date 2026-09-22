// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actionableEvaluation, cartById, needsReviewEvaluation, suppressedEvaluation, waitingEvaluation } from "@/evals/helpers/fixtures";
import type { EvaluationView } from "@/lib/queue";
import { CartReviewCard } from "./CartReviewCard";

let actionable: EvaluationView;
let review: EvaluationView;
let suppressed: EvaluationView;
let waiting: EvaluationView;

beforeAll(async () => {
  const [a, r, s, w] = await Promise.all([actionableEvaluation(), needsReviewEvaluation(), suppressedEvaluation(), waitingEvaluation()]);
  actionable = { ...a, costUsd: 0.0061 };
  review = { ...r, costUsd: 0.0032 };
  suppressed = { ...s, costUsd: 0 };
  waiting = { ...w, costUsd: 0 };
});

describe("CartReviewCard: fan context", () => {
  it("shows the cart facts a marketer needs in words, not field names", () => {
    render(<CartReviewCard cart={cartById("C-1002")} evaluation={actionable} onRun={vi.fn()} running={false} />);
    expect(screen.getByText("C-1002")).toBeInTheDocument();
    const context = within(screen.getByTestId("fan-context"));
    expect(context.getByText(/4 seats/)).toBeInTheDocument();
    expect(context.getByText(/Upper Deck/)).toBeInTheDocument();
    expect(context.getByText("$140")).toBeInTheDocument();
    expect(context.getByText(/26 hours ago/)).toBeInTheDocument();
    expect(context.getByText(/Never purchased/)).toBeInTheDocument();
    expect(screen.getByText("New fan")).toBeInTheDocument();
  });
});

describe("CartReviewCard: statuses", () => {
  it("suppressed carts stay visible with the reason and no recommendation", () => {
    render(<CartReviewCard cart={cartById("C-1003")} evaluation={suppressed} onRun={vi.fn()} running={false} />);
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(screen.getByTestId("status-reason")).toHaveTextContent(/not opted in/i);
    expect(screen.queryByText(/recommended offer/i)).not.toBeInTheDocument();
  });

  it("waiting carts say when to re-check", () => {
    render(<CartReviewCard cart={cartById("C-1004")} evaluation={waiting} onRun={vi.fn()} running={false} />);
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByTestId("status-reason")).toHaveTextContent(/re-check in 1 hour/i);
  });

  it("actionable carts show offer, reason, confidence, evidence in words, and the email", () => {
    render(<CartReviewCard cart={cartById("C-1002")} evaluation={actionable} onRun={vi.fn()} running={false} />);
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
    expect(screen.getByText("Fee waiver")).toBeInTheDocument();
    const recommendation = within(screen.getByTestId("recommendation"));
    expect(recommendation.getByText(/First-time buyer with a \$140 cart/)).toBeInTheDocument();
    expect(screen.getByText(/medium confidence/i)).toBeInTheDocument();
    const evidence = within(screen.getByTestId("evidence"));
    expect(evidence.getByText(/Lifetime tickets: 0/)).toBeInTheDocument();
    expect(evidence.getByText(/Cart value: \$140/)).toBeInTheDocument();
    const email = within(screen.getByTestId("email"));
    expect(email.getByText("Your 4 Upper Deck seats are still in your cart")).toBeInTheDocument();
    expect(email.getByText(/waive the service fees/)).toBeInTheDocument();
    expect(screen.getByText(/why did the agent choose this/i)).toBeInTheDocument();
  });

  it("needs-review carts list what failed and still show the proposed offer", () => {
    render(<CartReviewCard cart={cartById("C-1001")} evaluation={review} onRun={vi.fn()} running={false} />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByTestId("issues")).toHaveTextContent(/exceeds the LOYAL cap of 0%/);
    expect(screen.getByText("Percent discount")).toBeInTheDocument();
    expect(screen.getByTestId("recommendation")).toHaveTextContent(/25%/);
  });

  it("shows the estimated cost of the run", () => {
    render(<CartReviewCard cart={cartById("C-1002")} evaluation={actionable} onRun={vi.fn()} running={false} />);
    expect(screen.getByText(/\$0\.0061/)).toBeInTheDocument();
  });
});

describe("CartReviewCard: running the agent", () => {
  it("offers to run the agent when there is no evaluation yet", () => {
    const onRun = vi.fn();
    render(<CartReviewCard cart={cartById("C-1005")} evaluation={null} onRun={onRun} running={false} />);
    expect(screen.getByText(/not evaluated yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run agent/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("offers an explicit re-run on an evaluated cart and disables it while running", () => {
    const onRun = vi.fn();
    const { rerender } = render(<CartReviewCard cart={cartById("C-1002")} evaluation={actionable} onRun={onRun} running={false} />);
    fireEvent.click(screen.getByRole("button", { name: /re-run agent/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
    rerender(<CartReviewCard cart={cartById("C-1002")} evaluation={actionable} onRun={onRun} running={true} />);
    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
  });
});
