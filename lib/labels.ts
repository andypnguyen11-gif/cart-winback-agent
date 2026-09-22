import type { Cart, DecisionStatus, FanSegment, OfferType, RejectionReason, ReviewDecision } from "./types";

/** Marketer-facing words for machine values. Components never print an enum. */

export const OFFER_LABELS: Record<OfferType, string> = {
  REMINDER: "Reminder",
  FEE_WAIVER: "Fee waiver",
  PERCENT_DISCOUNT: "Percent discount",
  PERSONAL_OUTREACH: "Personal outreach",
  NO_ACTION: "No action",
};

export const SEGMENT_LABELS: Record<FanSegment, string> = {
  NEW: "New fan",
  RETURNING: "Returning fan",
  LOYAL: "Loyal fan",
  VIP: "VIP fan",
  LAPSED: "Lapsed fan",
};

export const STATUS_LABELS: Record<DecisionStatus, string> = {
  WAIT: "Waiting",
  SUPPRESSED: "Suppressed",
  ACTIONABLE: "Ready for review",
  NEEDS_REVIEW: "Needs review",
};

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  APPROVED: "Approved",
  EDITED: "Edited and approved",
  REJECTED: "Rejected",
};

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  WRONG_OFFER: "Wrong offer",
  DISCOUNT_TOO_HIGH: "Discount too high",
  POOR_TONE: "Poor tone",
  INCORRECT_REASONING: "Incorrect reasoning",
  DO_NOT_CONTACT: "Do not contact",
  OTHER: "Other",
};

export const FIELD_LABELS: Record<keyof Cart, string> = {
  cartId: "Cart",
  fanId: "Fan",
  seats: "Seats",
  section: "Section",
  cartValue: "Cart value",
  abandonedHours: "Time abandoned",
  lifetimeTickets: "Lifetime tickets",
  lastPurchaseDaysAgo: "Last purchase",
  emailOptIn: "Email opt-in",
};

export function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function formatCost(usd: number | null, digits = 4): string {
  if (usd === null) return "n/a";
  return `$${usd.toFixed(digits)}`;
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  const rounded = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `${rounded} hour${rounded === 1 ? "" : "s"}`;
}

export function formatAbandoned(hours: number): string {
  return `${formatDuration(hours)} ago`;
}

export function formatLastPurchase(daysAgo: number | null): string {
  if (daysAgo === null) return "Never purchased";
  if (daysAgo === 0) return "Today";
  return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
}

export function formatSeats(seats: number, section: string): string {
  return `${seats} seat${seats === 1 ? "" : "s"} · ${section}`;
}

/** Turns an evidence citation into a sentence fragment a marketer can read. */
export function formatEvidence(field: string, value: string | number | boolean | null): string {
  const label = (FIELD_LABELS as Record<string, string>)[field] ?? field;
  switch (field) {
    case "cartValue":
      return `${label}: ${typeof value === "number" ? formatMoney(value) : String(value)}`;
    case "abandonedHours":
      return `${label}: ${typeof value === "number" ? formatDuration(value) : String(value)}`;
    case "lastPurchaseDaysAgo":
      return `${label}: ${value === null ? "never" : typeof value === "number" ? `${value} days ago` : String(value)}`;
    case "emailOptIn":
      return `${label}: ${value === true ? "yes" : value === false ? "no" : String(value)}`;
    default:
      return `${label}: ${value === null ? "none" : String(value)}`;
  }
}
