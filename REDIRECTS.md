# Redirects

Moments where an AI suggestion was changed, and why. Recorded as they happened, not reconstructed afterwards. Each entry says who proposed what and who changed it.

## 1. LLM reviewer → deterministic validators

**When:** design phase, before any code.

**AI produced:** a four-stage architecture: Policy Gate → Sonnet Strategist → Haiku Copywriter → Sonnet Reviewer, with the reviewer as the final check on invalid or inappropriate offers.

**What didn't meet the bar:** one probabilistic model checking another for `discount <= cap`, `emailOptIn == true`, and `offerType in allowedOffers`. A reviewer that occasionally approves an invalid discount is worse than no reviewer, because it looks like a working safety system.

**What we did instead:** every rule touching money, consent, or eligibility became TypeScript with a unit test (`lib/policy/*`, `lib/validation/*`). The LLM reviewer was demoted to an optional tone critic and, in the end, not built. The PRD records this in sections 33 and 38.

## 2. "Should we add a tool registry, verification middleware, and observability?"

**When:** planning review, 2026-09-22, before PR 1.

**Proposed by:** the engineer, as options to evaluate.

**AI's evaluation:** two of the three were the wrong shape for this system. A tool registry has nothing to register: each agent has exactly one forced output tool and makes no other tool calls. "Verification middleware" reduces to a single function that calls the model, parses with Zod, retries once, and runs injected checks; that function (`runAgentStep`) was extracted only when the second agent arrived in PR 4, not designed up front. Observability was the real gap and became `data/runs.jsonl` storing tokens, priced at read time.

**Outcome:** the review (engineer, Claude, and a second model as reviewer) locked "no tool registry, no framework, one helper, a JSONL run log" into `Tasks.md` section 0. Recorded here because the AI said no to two abstractions it could have happily built.

## 3. Lapsed-first segmentation (the one for the video)

**When:** planning review, 2026-09-22.

**AI produced:** segmentation rules that checked LAPSED first: any fan with `lastPurchaseDaysAgo > 180` was LAPSED, and LAPSED fans were eligible for up to 10% off.

**What didn't meet the bar:** a 20-ticket fan who had been quiet for 200 days would be classified LAPSED and offered a discount, while a 20-ticket fan who bought last week would be VIP and offered nothing. The rule inverted the loyalty policy for exactly the fans the policy exists to protect. The engineer caught it while reviewing the plan with a second model.

**What we did instead:** LAPSED applies only in the 1–9 ticket band; 10+ tickets is LOYAL or VIP regardless of recency. The rule is in `lib/policy/segmentation.ts` with a comment pointing here, the numbers are in `lib/config.ts`, and `evals/policy.test.ts` has "a quiet VIP stays VIP" as a named test so it cannot regress quietly.

## 4. Enforcing the cap inside the tool schema

**When:** PR 3, writing the strategist.

**AI's first instinct:** narrow the forced tool's JSON schema per call, so the `offerType` enum is only the allowed offers and `discountPercent` has `maximum: cap`. The model would be physically unable to return a disallowed offer.

**Why it was dropped (AI self-correction, recorded):** it would move enforcement into the model call and make the validator invisible. The adversarial path, "strategist returns 25% for a loyal fan," would fail as a schema error deep in the SDK call instead of surfacing as "Discount 25% exceeds the LOYAL cap of 0%" in the decision trace. The generic schema plus deterministic validator keeps the guardrail where a marketer can see it work. The locked plan had said "one forced tool whose input schema is the Zod schema," and this is why that wording matters.

## 5. "The marketer is the authority" has a limit

**When:** PR 8, building approve / edit / reject.

**Locked rule:** marketer edits re-run the copy checks as a warning, never a block.

**What the literal reading would have allowed:** approving a `NEEDS_REVIEW` recommendation whose *offer* failed the cap, because the button was there and the copy was fine.

**What was built instead:** language failures warn; money and consent failures block approve and edit (reject and re-run remain), enforced in `lib/reviewPolicy.ts` and used by both the button and the API, so 422 comes back even if the UI is bypassed. This was the AI's independent scoping decision during implementation and is flagged in DECISIONS.md as one function to relax if the product owner disagrees.

## 6. Docs over memory for model ids and prices

**When:** PR 3.

**What could have happened:** writing model ids, prices, and SDK helper names from training-era memory.

**What was done:** fetched the current pricing page and SDK docs first. Sonnet 5 lists at $2 / $10 (an announced increase had been cancelled); the SDK's Zod tool helper is still a beta import, so the tool schema is generated with Zod 4's native `toJSONSchema` instead. The price table in `lib/config.ts` carries the date and the source URL because this will be wrong again eventually.

## Not a redirect, but worth telling

While writing the golden tests, the scripted strategist reply cited `cartId` with an empty value. Every run came back `NEEDS_REVIEW` and the tests that expected `ACTIONABLE` failed. The evidence validator had rejected the test author's own fabricated evidence. That is the behaviour the validator exists for, exercised by accident before it was exercised on purpose.
