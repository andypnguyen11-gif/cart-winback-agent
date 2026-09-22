// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfidenceBadge, StatusBadge } from "./RecommendationBadge";

describe("StatusBadge", () => {
  it.each([
    ["SUPPRESSED", "Suppressed"],
    ["WAIT", "Waiting"],
    ["ACTIONABLE", "Ready for review"],
    ["NEEDS_REVIEW", "Needs review"],
  ] as const)("renders %s as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("ConfidenceBadge", () => {
  it("shows the level and says it is informational", () => {
    render(<ConfidenceBadge confidence="medium" />);
    const badge = screen.getByText(/medium confidence/i);
    expect(badge).toHaveAttribute("title", expect.stringMatching(/does not affect/i));
  });
});
