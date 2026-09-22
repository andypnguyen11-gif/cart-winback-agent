# Decisions

Product and technical decisions, with the reasoning. The first section is the policy that was locked before implementation after a three-way review (the engineer, Claude, and a second model used as a reviewer). The rest are the "why" questions a reviewer is likely to ask.

## Locked policy (2026-09-22)

| Decision | Value | Why |
|---|---|---|
| Stale threshold | 2 hours | Under that, the fan may still be checking out. One sample cart (C-1004) is 1h old; contacting them would be noise. `WAIT` cards say when to re-check. |
| Loyal and VIP discounts | 0% | A discount to a 14- or 40-ticket fan trains them to wait for one and signals we do not know who they are. They get convenience (fee waiver) and attention (personal outreach). |
| New-fan cap | 10% | Enough to move a first purchase; small enough to be a rounding error on a $140 cart. |
| Lapsed cap | 10% | A lapsed fan is being re-won, like a new one. Not higher: no evidence it needs to be. |
| Returning-fan cap | 0% | Not in the original open questions; my call. An active buyer with 1–9 tickets does not need a price cut to finish a cart. One-line change in `lib/config.ts` if marketing disagrees. |
| Segments | NEW = 0 tickets; VIP = 20+; LOYAL = 10–19; LAPSED = 1–9 and last purchase > 180 days; RETURNING = 1–9 otherwise | Lapsed applies only in the low band. A quiet VIP stays VIP. See REDIRECTS.md; the first draft got this wrong. |
| `SEAT_HOLD` | Removed | No inventory data. Promising seats we cannot see is the fastest way to lose a fan. `PERSONAL_OUTREACH` replaces it. |
| Channels | Email only | One channel, done properly. SMS has consent rules the data does not capture. |
| Confidence | Display only | The strategist's self-assessment is useful context for a human and useless as a gate. Nothing reads it. |
| Marketer edits | Warn, never block | The marketer is the authority on language. Their edit is re-checked and anything flagged is shown, then saved. |
| Approval of policy failures | Blocked | Added during implementation (see below). Money and consent rules are not waivable from a review screen. |
| Persistence | JSON files, local | One customer, five carts, one engineer, one sprint. SQLite is the next step if file writes become a problem. |
| Observability | `runs.jsonl`, tokens not dollars | Prices change; token counts do not. Cost is computed on read from a dated table. |
| Agent plumbing | One helper, `runAgentStep` | Two agents share one code path. Not a framework, not a registry. |
| Message validator | Literal phrases + number match | Cheap, explainable, testable. Explicitly a heuristic. |

## Why Sonnet 5 for the strategist?

The input is tiny and structured: nine cart fields, a segment, a short menu, one number. The task is a judgment call with business consequences: a wrong offer costs money or goodwill. Sonnet is the smallest model I would trust with that judgment, and the deterministic validators mean a bad call is caught rather than sent. Sonnet 5 lists at $2 / $10 per million tokens; a strategist call is roughly 600 input and 150 output tokens, so about a fifth of a cent.

## Why Haiku 4.5 for the copywriter?

By the time the copywriter runs, every decision has been made. It is turning "FEE_WAIVER, 4 seats, Upper Deck, $140" into a warm paragraph. That is language, not judgment, and Haiku does it well at half Sonnet's price. Using the same frontier model for both would double the cost of the cheaper step without adding protection, because the protection comes from the validators, not the model.

## Why not Opus?

The reliability in this system comes from the architecture: constrained menu, deterministic caps, evidence grounding, strict schemas, human approval. A more capable model would make the strategist's *reason* slightly better written and would not change any of those guarantees. It would multiply the per-call cost for no change in the failure modes that matter. If the strategist's judgment turns out to be the weak link in live evals, swapping the model id is one environment variable.

## Why no LangGraph, CrewAI, or a tool registry?

The workflow is a straight line with two model calls and no branching that a human would not want to see. A graph runtime would add a dependency, a mental model, and a debugging surface to a system whose whole value is that a product manager can read `lib/pipeline.ts` top to bottom. Neither agent calls tools in the agentic sense; each has exactly one forced output tool. A registry would be a registry of one. The "verification middleware" idea collapsed to one function, `runAgentStep`, extracted when the second agent arrived.

## Why TypeScript validation instead of an LLM reviewer?

An earlier proposal had a Sonnet reviewer as the final check. For tone that is fine. For `discount <= cap`, `emailOptIn == true`, and `offerType in allowedOffers`, a probabilistic reviewer is strictly weaker than an `if` statement and costs money every time. Worse, an LLM reviewer that approves an invalid discount looks like a working safety system. Every rule touching money, consent, or eligibility is code with a unit test. See REDIRECTS.md.

## Why a forced tool rather than the SDK's structured-output mode?

The SDK exposes a JSON-schema `output_format` with a Zod helper. I used a forced strict tool instead because it is documented for both models in use, the retry-with-errors loop maps naturally onto an error `tool_result`, and the locked plan called for it. The two are interchangeable behind `runAgentStep`; switching is a local change with no effect on validators or the UI.

## Why is the copywriter's input so narrow?

Withholding data is a stronger guard than instructing the model not to use it. The copywriter receives seven fields and none of them are the fan id, the ticket count, the last purchase date, or the consent flag. It cannot write "since your last game" from nothing. The phrase blocklist is the backstop for the cases where the model invents anyway.

## Why does the validator keep the model's bad output?

A `NEEDS_REVIEW` card that says "the strategist proposed 25% for a loyal fan; the cap is 0%" is a training signal for the marketer and a debugging signal for me. A card that just says "error" is neither. Failures are shown, never silently fixed, so the system's mistakes are visible while the stakes are low.

## Why can't a marketer approve a policy failure?

The locked rule was "edits warn, not block; the marketer is the authority." Applied literally, that would let someone approve a 25% discount for a VIP because the copy read nicely. I split the rule during implementation: language failures warn, money and consent failures block approval and editing while leaving reject and re-run available. The check lives in a pure module used by both the browser and the API, so bypassing the button does not bypass the rule. This was an independent scoping decision; it is one function to relax if the product owner disagrees.

## Why does a re-run reset the review?

Each evaluation has a `recommendationId`; each review action references one. After a re-run the stored id changes, the old approval no longer matches, and the card shows as unreviewed. The alternative, an approval that silently carries over to a different draft, is exactly the "approve A, send B" bug the id exists to prevent.

## Why sequential evaluation?

Five carts, two calls each, a few seconds total. Running them in order keeps the run log in cart order and makes scripted tests deterministic. Parallelism is a one-line change if the queue grows.

## Why no automatic sending?

There is no CRM, no send infrastructure, and one small real fan base. The assignment's premise is a marketer with nothing but this screen and a manual send. More importantly, the whole design leans on the marketer as the final validator for the things code cannot check: tone, timing, context. Removing that step would remove the strongest guardrail in the system.

## Why low effort and a 4096-token cap?

Sonnet 5 thinks adaptively by default and thinking counts toward `max_tokens`, so the original 1024 cap, sized for a tool payload alone, could be spent before `recommend_offer` was ever called and turn every eligible cart into `NEEDS_REVIEW`; we set `output_config.effort` to `low` on both agents and raised the cap to 4096 so thinking cannot eat the tool call.

## Why not block the word "again"?

It was on an early draft of the blocklist as a proxy for "invented history." It false-positives on "thanks again" and "see you again," which are exactly the phrases a warm email uses. The blocklist is literal phrases with a clear failure story each, not vibes.

## Where the build strays from the PRD and the plan

Everything below differs from `Prd.md` or `Tasks.md` as written. Each is deliberate and owned; the first two were confirmed by the product owner after review.

| Source said | Built instead | Why |
|---|---|---|
| Tasks.md §0 and PR 8: marketer edits "warn, never block; the marketer is the authority" | Language failures warn. Offer and evidence failures block approve and edit; reject and re-run stay available. `lib/reviewPolicy.ts`, enforced in the UI and the API (422). | The literal rule would let a review screen approve a discount the policy forbids. Money and consent are not waivable from a button. See REDIRECTS.md entry 5. |
| PRD §11 and Tasks.md §0 name caps for NEW, LAPSED, LOYAL, VIP and none for RETURNING | RETURNING cap 0%, no `PERCENT_DISCOUNT` in its menu | The plan left a gap. An active buyer with 1–9 tickets does not need a price cut to finish a cart. One line in `lib/config.ts`. |
| PRD §11 lists `SEAT_HOLD` and `SECTION_UPGRADE` as possible offer types; the Loyal example menu is Reminder + Seat Hold | Neither exists. LOYAL and VIP get `REMINDER`, `FEE_WAIVER`, `PERSONAL_OUTREACH`, `NO_ACTION` | No inventory or seat-map data, so the system cannot promise seats or upgrades. Locked in Tasks.md §0; `PERSONAL_OUTREACH` carries the "we know who you are" signal instead. |
| Tasks.md Task 11.2: "Final PRD sync" edits `docs/PRD.md` | `Prd.md` stays untouched at the repo root as the original artifact; deviations are recorded in this table | Rewriting the PRD after the fact hides what changed. A diff against an unchanged PRD is the more honest record. |
| Tasks.md tree and Architecture.md include `lib/agents/toneReviewer.ts`; optional PR 12 (tone critic) and PR 13 (SQLite) | Not built | §0 made both optional. Core work finished with a working approve path and the owner's call was to stop rather than add a probabilistic reviewer or a database that five carts do not need. |
| Architecture.md: `evals/consistency.test.ts` | Mocked consistency and golden checks in `evals/golden.test.ts`; paid consistency in `evals/live/consistency.test.ts` under a separate Vitest config | `npm test` has to stay free and offline. The live harness skips without a key and never runs in the default test command. |
| CLAUDE.md and Tasks.md PR 6: a single `POST /api/evaluate` that returns all carts | `POST /api/evaluate` accepts an optional `cartId`; `GET /api/evaluate` reads storage without running the agent; `POST` and `GET /api/review` handle marketer actions | Tasks.md §0 requires page loads that never regenerate and a per-cart re-run button. Both need a read-only path and a targeted run. |
| Tasks.md PR 6: "one record per pipeline run" in `runs.jsonl` | One record per cart evaluation | Per-cart records are what `eval:report` needs to attribute tokens and latency; a batch record would blur five carts into one number. |
| No source specifies output limits | Agent calls use `max_tokens: 4096` and `output_config.effort: "low"` (first shipped as 1024 with default effort) | Raised after review for the reasons above. The 1024 value was an implementation guess that ignored adaptive thinking. |

