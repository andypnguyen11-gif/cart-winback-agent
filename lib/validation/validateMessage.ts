import { MESSAGE_RULES } from "../config";
import type { Cart, FanSegment, MessageOutput, StrategistOutput } from "../types";
import { fromChecks, type ValidationCheck, type ValidationResult } from "./result";

/**
 * Deterministic copy checks: literal phrases and numbers only. It does not
 * try to understand the email. It catches the specific ways a win-back email
 * goes wrong that we can name in advance: a different discount, a made-up
 * price, false urgency, seat promises, and history we do not have.
 */

export interface MessageContext {
  offer: StrategistOutput;
  cart: Cart;
  segment: FanSegment;
}

function normalize(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
const DOLLAR_RE = /\$\s*(\d[\d,]*(?:\.\d+)?)/g;

function numbersIn(text: string, re: RegExp): number[] {
  return [...text.matchAll(re)].map((m) => Number(m[1].replace(/,/g, "")));
}

export function validateMessage(message: MessageOutput, ctx: MessageContext): ValidationResult {
  const raw = `${message.subject}\n${message.body}`;
  const text = normalize(raw);
  const checks: ValidationCheck[] = [];

  // Percentages: allowed only when the offer is a discount, and only its exact value.
  const percents = numbersIn(raw, PERCENT_RE);
  const allowedPercent = ctx.offer.offerType === "PERCENT_DISCOUNT" ? ctx.offer.discountPercent : null;
  const badPercents = percents.filter((p) => p !== allowedPercent);
  checks.push({
    name: "message:percentages",
    passed: badPercents.length === 0,
    detail:
      badPercents.length === 0
        ? allowedPercent === null
          ? "No percentage figures in the copy, matching a non-discount offer."
          : `Every percentage in the copy is the approved ${allowedPercent}%.`
        : allowedPercent === null
          ? `Copy mentions ${badPercents.map((p) => `${p}%`).join(", ")} but the offer has no discount.`
          : `Copy mentions ${badPercents.map((p) => `${p}%`).join(", ")} but the approved discount is ${allowedPercent}%.`,
  });

  // Dollar figures: only the cart value.
  const dollars = numbersIn(raw, DOLLAR_RE);
  const badDollars = dollars.filter((d) => d !== ctx.cart.cartValue);
  checks.push({
    name: "message:dollars",
    passed: badDollars.length === 0,
    detail:
      badDollars.length === 0
        ? "Every dollar figure in the copy is the cart value."
        : `Copy mentions ${badDollars.map((d) => `$${d}`).join(", ")} but the cart value is $${ctx.cart.cartValue}.`,
  });

  // Phrase blocklists.
  const hits: string[] = MESSAGE_RULES.blockedForEveryone.filter((phrase) => text.includes(normalize(phrase)));
  for (const pattern of MESSAGE_RULES.blockedPatternsForEveryone) {
    const m = raw.match(pattern);
    if (m) hits.push(m[0]);
  }
  checks.push({
    name: "message:blocked-phrases",
    passed: hits.length === 0,
    detail:
      hits.length === 0
        ? "No urgency, seat-availability, or invented-history phrases."
        : `Blocked phrase${hits.length === 1 ? "" : "s"}: ${hits.map((h) => `"${h}"`).join(", ")}.`,
  });

  if (ctx.segment === "NEW") {
    const newHits = MESSAGE_RULES.blockedForNewFans.filter((phrase) => text.includes(normalize(phrase)));
    checks.push({
      name: "message:new-fan-history",
      passed: newHits.length === 0,
      detail:
        newHits.length === 0
          ? "No returning-fan language for a first-time buyer."
          : `First-time buyer, but copy says ${newHits.map((h) => `"${h}"`).join(", ")}.`,
    });
  }

  return fromChecks(checks);
}
