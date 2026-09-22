// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { actionableEvaluation, cartById, needsReviewEvaluation, suppressedEvaluation, waitingEvaluation } from "@/evals/helpers/fixtures";
import type { QueueItem } from "@/lib/queue";
import { SummaryMetrics } from "./SummaryMetrics";

let items: QueueItem[];

beforeAll(async () => {
  const [a, r, s, w] = await Promise.all([actionableEvaluation(), needsReviewEvaluation(), suppressedEvaluation(), waitingEvaluation()]);
  items = [
    { cart: cartById("C-1001"), evaluation: { ...r, costUsd: 0.004 }, review: null },
    { cart: cartById("C-1002"), evaluation: { ...a, costUsd: 0.006 }, review: null },
    { cart: cartById("C-1003"), evaluation: { ...s, costUsd: 0 }, review: null },
    { cart: cartById("C-1004"), evaluation: { ...w, costUsd: 0 }, review: null },
    { cart: cartById("C-1005"), evaluation: null, review: null },
  ];
});

const metric = (label: string) => screen.getByTestId(`metric-${label}`);

describe("SummaryMetrics", () => {
  it("counts each status and the carts not yet evaluated", () => {
    render(<SummaryMetrics items={items} />);
    expect(metric("evaluated")).toHaveTextContent("4");
    expect(metric("evaluated")).toHaveTextContent("of 5");
    expect(metric("actionable")).toHaveTextContent("1");
    expect(metric("needs-review")).toHaveTextContent("1");
    expect(metric("waiting")).toHaveTextContent("1");
    expect(metric("suppressed")).toHaveTextContent("1");
  });

  it("sums cart value across the queue and the estimated model cost of the stored runs", () => {
    render(<SummaryMetrics items={items} />);
    expect(metric("cart-value")).toHaveTextContent("$904");
    expect(metric("cost")).toHaveTextContent("$0.01");
  });
});
