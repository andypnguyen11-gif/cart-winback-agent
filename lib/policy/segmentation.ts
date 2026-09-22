import { POLICY } from "../config";
import type { Cart, SegmentResult } from "../types";

/**
 * Rule-based fan segmentation. Evaluated top to bottom:
 *
 *   NEW        0 lifetime tickets
 *   VIP        vipMinTickets or more
 *   LOYAL      loyalMinTickets up to vipMinTickets - 1
 *   LAPSED     1 to loyalMinTickets - 1 tickets AND silent longer than lapsedAfterDays
 *   RETURNING  1 to loyalMinTickets - 1 tickets, otherwise
 *
 * Lapsed is deliberately confined to the low-ticket band. An earlier draft
 * checked "lapsed" first, which would have made a quiet 20-ticket fan
 * discount-eligible while an active VIP got nothing. See REDIRECTS.md.
 */
export function segmentFan(cart: Cart): SegmentResult {
  const { lapsedAfterDays, loyalMinTickets, vipMinTickets } = POLICY.segmentation;
  const tickets = cart.lifetimeTickets;

  if (tickets === 0) {
    return { segment: "NEW", reason: "No previous ticket purchases." };
  }

  if (tickets >= vipMinTickets) {
    return {
      segment: "VIP",
      reason: `${tickets} lifetime tickets (${vipMinTickets}+ is VIP).`,
    };
  }

  if (tickets >= loyalMinTickets) {
    return {
      segment: "LOYAL",
      reason: `${tickets} lifetime tickets (${loyalMinTickets}–${vipMinTickets - 1} is loyal).`,
    };
  }

  const daysAgo = cart.lastPurchaseDaysAgo;
  if (daysAgo !== null && daysAgo > lapsedAfterDays) {
    return {
      segment: "LAPSED",
      reason: `${tickets} lifetime ticket${tickets === 1 ? "" : "s"}, last purchase ${daysAgo} days ago (over ${lapsedAfterDays}).`,
    };
  }

  return {
    segment: "RETURNING",
    reason:
      daysAgo === null
        ? `${tickets} lifetime tickets with no purchase date on record.`
        : `${tickets} lifetime tickets, last purchase ${daysAgo} days ago.`,
  };
}
