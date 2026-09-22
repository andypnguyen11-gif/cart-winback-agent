import { COPYWRITER_TOOL_NAME } from "@/lib/agents/copywriter";
import { STRATEGIST_TOOL_NAME } from "@/lib/agents/strategist";
import { loadCarts } from "@/lib/carts";
import { evaluateCart } from "@/lib/pipeline";
import type { Cart, EvaluationResult } from "@/lib/types";
import { scriptedByTool, toolMessage } from "./fakeMessages";

/** Realistic EvaluationResults produced by the real pipeline against scripted model replies. */

export const carts = loadCarts();
export const cartById = (id: string): Cart => {
  const cart = carts.find((c) => c.cartId === id);
  if (!cart) throw new Error(`fixture missing ${id}`);
  return cart;
};

const deps = { now: () => new Date("2026-09-22T18:00:00.000Z") };

export const feeWaiverReply = {
  offerType: "FEE_WAIVER",
  discountPercent: 0,
  reason: "First-time buyer with a $140 cart abandoned for 26 hours.",
  confidence: "medium",
  evidence: [
    { field: "lifetimeTickets", value: 0 },
    { field: "cartValue", value: 140 },
  ],
};

export const cleanEmailReply = {
  subject: "Your 4 Upper Deck seats are still in your cart",
  body: "Hi there,\n\nYour 4 Upper Deck tickets ($140) are waiting. Finish checkout and we'll waive the service fees.\n\nSeattle Seawolves Ticketing",
};

export function suppressedEvaluation(): Promise<EvaluationResult> {
  return evaluateCart(cartById("C-1003"), { ...deps, newId: () => "rec-suppressed", createMessage: scriptedByTool({}).createMessage });
}

export function waitingEvaluation(): Promise<EvaluationResult> {
  return evaluateCart(cartById("C-1004"), { ...deps, newId: () => "rec-wait", createMessage: scriptedByTool({}).createMessage });
}

export function actionableEvaluation(): Promise<EvaluationResult> {
  const { createMessage } = scriptedByTool({
    [STRATEGIST_TOOL_NAME]: [toolMessage(STRATEGIST_TOOL_NAME, feeWaiverReply)],
    [COPYWRITER_TOOL_NAME]: [toolMessage(COPYWRITER_TOOL_NAME, cleanEmailReply)],
  });
  return evaluateCart(cartById("C-1002"), { ...deps, newId: () => "rec-actionable", createMessage });
}

export function needsReviewEvaluation(): Promise<EvaluationResult> {
  const { createMessage } = scriptedByTool({
    [STRATEGIST_TOOL_NAME]: [
      toolMessage(STRATEGIST_TOOL_NAME, {
        offerType: "PERCENT_DISCOUNT",
        discountPercent: 25,
        reason: "Big fan, big discount.",
        confidence: "high",
        evidence: [{ field: "lifetimeTickets", value: 14 }],
      }),
    ],
  });
  return evaluateCart(cartById("C-1001"), { ...deps, newId: () => "rec-review", createMessage });
}
