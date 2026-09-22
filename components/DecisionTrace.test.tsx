// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { actionableEvaluation, needsReviewEvaluation } from "@/evals/helpers/fixtures";
import type { EvaluationResult } from "@/lib/types";
import { DecisionTrace } from "./DecisionTrace";

let ok: EvaluationResult;
let bad: EvaluationResult;
beforeAll(async () => {
  [ok, bad] = await Promise.all([actionableEvaluation(), needsReviewEvaluation()]);
});

describe("DecisionTrace", () => {
  it("is collapsed behind a plain-language question", () => {
    render(<DecisionTrace trace={ok.trace} />);
    expect(screen.getByText(/why did the agent choose this/i)).toBeInTheDocument();
  });

  it("lists every stage and its lines", () => {
    render(<DecisionTrace trace={ok.trace} />);
    for (const stage of ["Policy engine", "Strategist", "Offer and evidence checks", "Copywriter", "Message checks"]) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
    expect(screen.getByText(/✓ Email consent/)).toBeInTheDocument();
  });

  it("marks failed and skipped stages", () => {
    render(<DecisionTrace trace={bad.trace} />);
    expect(screen.getByTestId("trace-Offer and evidence checks")).toHaveAttribute("data-status", "failed");
    expect(screen.getByTestId("trace-Copywriter")).toHaveAttribute("data-status", "skipped");
  });
});
