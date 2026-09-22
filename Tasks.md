# Cart Win-Back Agent

## Implementation Task List and PR Plan

---

# 0. Locked Decisions

These resolve the open questions in PRD section 31 and the review gaps found before implementation. They are the source of truth for PR 2 onward. Formalize them in `docs/DECISIONS.md` during PR 10.

## Policy

* Stale threshold: **2 hours**. WAIT cards must say when to re-check.
* Loyal / VIP discounts: **none**.
* New-fan discount cap: **10%**. Lapsed discount cap: **10%**.
* Segments (evaluate in this order):
  * `NEW` = 0 lifetime tickets.
  * `LAPSED` = 1–9 lifetime tickets **and** `lastPurchaseDaysAgo > 180`.
  * `RETURNING` = 1–9 lifetime tickets and not lapsed.
  * `LOYAL` = 10–19 lifetime tickets.
  * `VIP` = 20+ lifetime tickets.
  * Lapsed does **not** apply at 10+ tickets. A quiet VIP stays VIP. (Review redirect: an earlier "lapsed-first" rule would have made a quiet 20-ticket fan discount-eligible while an active VIP got nothing.)
* `SEAT_HOLD` is dropped: no inventory data, so never promise seats.
* Allowed offer types: `REMINDER`, `FEE_WAIVER`, `PERCENT_DISCOUNT`, `PERSONAL_OUTREACH`, `NO_ACTION`.
* Email only. No SMS.

## Product

* Confidence is **display-only**: a badge, no pipeline effect.
* Marketer edits re-run the deterministic message checks as a **warning, not a block**. The marketer is the authority.
* Persist the last evaluation per `cartId` with a `recommendationId`. Review actions reference that ID. Page load reads storage. Re-running the agent is an explicit button. **Do not regenerate on refresh.**

## Implementation

* No tool registry. Each agent uses one forced structured-output tool whose input schema is the Zod schema.
* `runAgentStep` is one helper function (call model → Zod parse → one retry on schema failure → injected validators → record result). Extract it in PR 4 when the second agent lands. Not a framework, not a PR 1 deliverable.
* `data/runs.jsonl` is the observability layer: one record per pipeline run. Store **tokens, not dollars**. Cost is computed at read time from a dated per-model price table in `lib/config.ts`. No dashboard.
* Message validator is a **literal phrase blocklist** plus number matching. No semantic "implied history" check. README calls this heuristic.
* `npm test` is mocked and free. `npm run eval:live` is optional and paid.
* No SQLite. No tone critic unless core work is finished. Local only. JSON files.

---

This document converts the Cart Win-Back Agent PRD into an implementation plan organized around GitHub pull requests.

Each PR should represent a coherent, reviewable unit of work.

The goal is to make the repository history clearly show how the product evolved from:

```text
project setup
→ domain model
→ deterministic policy engine
→ AI strategist
→ AI copywriter
→ validation
→ full pipeline
→ marketer UI
→ feedback persistence
→ evaluations
→ documentation
→ final polish
```

---

# 1. Proposed Project Structure

```text
cart-winback-agent/
│
├── app/
│   ├── api/
│   │   └── evaluate/
│   │       └── route.ts
│   │
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── CartReviewCard.tsx
│   ├── DecisionTrace.tsx
│   ├── EmptyState.tsx
│   ├── RecommendationBadge.tsx
│   ├── ReviewActions.tsx
│   └── SummaryMetrics.tsx
│
├── data/
│   ├── carts.json
│   └── review-actions.json
│
├── lib/
│   ├── agents/
│   │   ├── copywriter.ts
│   │   ├── strategist.ts
│   │   └── toneReviewer.ts
│   │
│   ├── policy/
│   │   ├── eligibility.ts
│   │   ├── offerRules.ts
│   │   └── segmentation.ts
│   │
│   ├── validation/
│   │   ├── validateEvidence.ts
│   │   ├── validateMessage.ts
│   │   └── validateOffer.ts
│   │
│   ├── config.ts
│   ├── pipeline.ts
│   ├── schemas.ts
│   └── types.ts
│
├── evals/
│   ├── consistency.test.ts
│   ├── golden.test.ts
│   ├── grounding.test.ts
│   └── policy.test.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   └── PRD.md
│
├── .env.example
├── .gitignore
├── REDIRECTS.md
├── README.md
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

Some files may move slightly depending on the exact Next.js version or testing setup, but the separation of concerns should remain consistent.

---

# PR 1 — Bootstrap Application and Domain Model

## Goal

Create the Next.js application, establish the base repository structure, load the supplied stale-cart dataset, and define shared TypeScript types and schemas.

This PR should contain no AI behavior yet.

## High-Level Checklist

* [ ] Initialize Next.js application with TypeScript.
* [ ] Add Tailwind CSS.
* [ ] Add Zod.
* [ ] Add testing framework.
* [ ] Create initial directory structure.
* [ ] Add supplied five-cart dataset.
* [ ] Define domain types.
* [ ] Define Zod schemas for cart data.
* [ ] Validate fixture data at startup or load time.
* [ ] Add environment-variable template.
* [ ] Add baseline README with local setup instructions.

---

## Task 1.1 — Initialize Project

### Tasks

* [ ] Create Next.js project using App Router.
* [ ] Confirm TypeScript strict mode.
* [ ] Configure Tailwind.
* [ ] Confirm local development server runs.
* [ ] Add Vitest or equivalent lightweight test runner.

### Files Created / Updated

```text
package.json
tsconfig.json
tailwind.config.ts
vitest.config.ts
app/layout.tsx
app/page.tsx
app/globals.css
.gitignore
```

---

## Task 1.2 — Add Stale Cart Dataset

### Tasks

* [ ] Create `data/carts.json`.
* [ ] Add the five provided cart records.
* [ ] Normalize numeric fields where useful.
* [ ] Represent abandonment time as a numeric value such as `abandonedHours`.
* [ ] Represent `lastPurchaseDaysAgo` consistently.
* [ ] Represent "Never" using a nullable field rather than a magic string where possible.

### Files Created

```text
data/carts.json
```

Example internal representation:

```json
{
  "cartId": "C-1002",
  "fanId": "F-511",
  "seats": 4,
  "section": "Upper Deck",
  "cartValue": 140,
  "abandonedHours": 26,
  "lifetimeTickets": 0,
  "lastPurchaseDaysAgo": null,
  "emailOptIn": true
}
```

---

## Task 1.3 — Create Domain Types

### Tasks

* [ ] Create `Cart` type.
* [ ] Create `FanSegment` type.
* [ ] Create `OfferType` enum/union.
* [ ] Create decision status type:

  * `WAIT`
  * `SUPPRESSED`
  * `ACTIONABLE`
  * `NEEDS_REVIEW`
* [ ] Create shared types for agent outputs.
* [ ] Create marketer review action types.

### Files Created

```text
lib/types.ts
```

---

## Task 1.4 — Add Runtime Schemas

### Tasks

* [ ] Add Zod schema for cart input.
* [ ] Add schema for cart collection.
* [ ] Add initial strategist output schema.
* [ ] Add message output schema.
* [ ] Add marketer action schema.

### Files Created

```text
lib/schemas.ts
```

---

## PR 1 Completion Criteria

* [ ] App launches locally.
* [ ] Dataset loads successfully.
* [ ] Invalid cart data fails validation.
* [ ] Shared domain types exist.
* [ ] No AI API is required to run the application.

---

# PR 2 — Deterministic Policy Engine

## Goal

Implement all rules that should not depend on an LLM.

This PR establishes the most important architectural boundary in the project.

---

## High-Level Checklist

* [ ] Implement eligibility rules.
* [ ] Implement stale-cart timing rule.
* [ ] Implement communication consent rule.
* [ ] Implement fan segmentation.
* [ ] Implement allowed offers by segment.
* [ ] Implement maximum discount caps.
* [ ] Add unit tests for policy behavior.

---

## Task 2.1 — Implement Eligibility

### Rules

Initial proposed behavior:

```text
emailOptIn = false
→ SUPPRESSED

abandonedHours < 2
→ WAIT

otherwise
→ eligible for evaluation
```

### Files Created

```text
lib/policy/eligibility.ts
```

### Files Updated

```text
lib/types.ts
lib/schemas.ts
```

---

## Task 2.2 — Implement Fan Segmentation

### Tasks

* [ ] Define rule-based segments.
* [ ] Keep thresholds centralized.
* [ ] Avoid scattering numeric rules across components.

Possible initial segments:

```text
NEW
RETURNING
LOYAL
VIP
LAPSED
```

### Files Created

```text
lib/policy/segmentation.ts
```

### Files Updated

```text
lib/config.ts
lib/types.ts
```

---

## Task 2.3 — Implement Offer Rules

### Tasks

* [ ] Define allowed offer types.
* [ ] Define offer set per segment.
* [ ] Define discount caps.
* [ ] Ensure loyal/VIP restrictions are explicit.
* [ ] Avoid seat-hold promises unless inventory data exists.
* [ ] Consider replacing `SEAT_HOLD` with `PERSONAL_OUTREACH`.

### Files Created

```text
lib/policy/offerRules.ts
```

### Files Updated

```text
lib/config.ts
lib/types.ts
```

---

## Task 2.4 — Add Policy Tests

### Required Tests

* [ ] C-1003 always suppressed.
* [ ] C-1004 waits because only one hour has passed.
* [ ] Loyal fan discount cap is zero.
* [ ] New-fan discount cap is enforced.
* [ ] Every eligible segment receives at least one allowed action.

### Files Created

```text
evals/policy.test.ts
```

---

## PR 2 Completion Criteria

* [ ] All hard business rules work without AI.
* [ ] The model cannot override email consent.
* [ ] The model cannot determine its own discount ceiling.
* [ ] Policy tests pass.

---

# PR 3 — Claude Offer Strategist

## Goal

Introduce the first LLM-powered step.

The strategist selects the best option from a deterministic menu rather than inventing unrestricted promotions.

---

## High-Level Checklist

* [ ] Install Anthropic SDK.
* [ ] Configure model environment variables.
* [ ] Implement strategist prompt.
* [ ] Require structured output.
* [ ] Include allowed offers in prompt context.
* [ ] Require evidence fields.
* [ ] Parse and validate strategist response.
* [ ] Handle API failures explicitly.

---

## Task 3.1 — Configure Anthropic Integration

### Environment Variables

```text
ANTHROPIC_API_KEY
STRATEGIST_MODEL
COPYWRITER_MODEL
```

### Files Created / Updated

```text
.env.example
lib/config.ts
package.json
```

---

## Task 3.2 — Implement Strategist

### Inputs

The strategist receives:

* cart data;
* fan segment;
* allowed offer types;
* maximum permitted discount.

### Outputs

The strategist returns:

```text
offerType
discountPercent
reason
confidence
evidence[]
```

### Files Created

```text
lib/agents/strategist.ts
```

### Files Updated

```text
lib/schemas.ts
lib/types.ts
```

---

## Task 3.3 — Add Structured Output Validation

### Tasks

* [ ] Reject malformed model responses.
* [ ] Reject unknown offer types.
* [ ] Ensure evidence entries follow schema.
* [ ] Do not silently guess missing fields.
* [ ] Surface model/API errors clearly.

### Files Updated

```text
lib/agents/strategist.ts
lib/schemas.ts
```

---

## PR 3 Completion Criteria

* [ ] Eligible carts can receive structured recommendations.
* [ ] Suppressed/waiting carts never call the strategist.
* [ ] Model output passes Zod validation.
* [ ] Agent failure produces an explicit error state.

---

# PR 4 — Message Writer Agent

## Goal

Add a lower-cost LLM step responsible only for communication copy.

This PR demonstrates deliberate model tiering.

---

## High-Level Checklist

* [ ] Implement Haiku message writer.
* [ ] Generate email subject.
* [ ] Generate email body.
* [ ] Keep offer decision immutable.
* [ ] Prevent copywriter from changing discount or offer.
* [ ] Validate output structure.
* [ ] Copywriter input is **only**: segment, offer type, discount, seats, section, cart value, abandoned hours. Not the raw cart, not unused history fields.
* [ ] Extract `runAgentStep` (call model → Zod parse → one retry → injected validators → record result) now that two agents exist. Strategist and copywriter both use it.

---

## Task 4.1 — Implement Copywriter

### Inputs

* approved strategist recommendation;
* fan/cart context;
* writing constraints.

### Outputs

```text
subject
body
```

### Files Created

```text
lib/agents/copywriter.ts
```

### Files Updated

```text
lib/schemas.ts
lib/types.ts
```

---

## Task 4.2 — Add Messaging Constraints

### Rules

* [ ] Do not claim inventory exists.
* [ ] Do not claim seat availability.
* [ ] Do not invent fan history.
* [ ] Do not modify offer percentage.
* [ ] Avoid false urgency.
* [ ] Keep language appropriate for a sports marketer.

### Files Updated

```text
lib/agents/copywriter.ts
```

---

## PR 4 Completion Criteria

* [ ] Strategist and copywriter are clearly separate.
* [ ] Haiku only writes copy.
* [ ] The copywriter cannot invent a different offer.
* [ ] Structured message output is validated.

---

# PR 5 — Deterministic Safety Validator

## Goal

Implement post-model validation for financial, policy, and grounding constraints.

This is one of the most important PRs for both technical quality and the assignment narrative.

---

## High-Level Checklist

* [ ] Validate selected offer against allowed offers.
* [ ] Validate discount against cap.
* [ ] Validate strategist evidence.
* [ ] Validate cited values against original record.
* [ ] Validate generated message against known unsafe claims.
* [ ] Return `NEEDS_REVIEW` when validation fails.
* [ ] Add validator unit tests.

---

## Task 5.1 — Offer Validation

### Files Created

```text
lib/validation/validateOffer.ts
```

### Checks

* [ ] Offer exists in policy-generated allowlist.
* [ ] Percentage discount does not exceed cap.
* [ ] Zero-discount segments cannot receive discounts.
* [ ] Required offer fields are present.

---

## Task 5.2 — Evidence Validation

### Files Created

```text
lib/validation/validateEvidence.ts
```

### Checks

For every evidence item:

```text
field exists
AND
source value matches cited value
```

Reject:

```text
"attendedLastGame": true
```

if that field does not exist in the input.

---

## Task 5.3 — Message Validation

### Files Created

```text
lib/validation/validateMessage.ts
```

### Checks

Deterministic only. Literal phrase match and number match. No semantic "implied history" check.

* [ ] Any `%` or `$` figure in subject/body must match the offer discount or the cart value. Any other number is a failure.
* [ ] Urgency / scarcity blocklist (everyone): `last chance`, `expires tonight`, `only X left`, `limited time`, seats-remaining claims.
* [ ] History blocklist (everyone): `you attended`, `last game`, `last week's match`, `favorite player`.
* [ ] History blocklist (NEW segment only): `welcome back`, `season ticket`, `last season`, `as a returning`.
* [ ] Do **not** block `again` (false-positives on "thanks again", "see you again").
* [ ] README states this validator is heuristic and names "as a season ticket holder" sent to a first-time buyer as the looks-right-but-wrong example.

---

## Task 5.4 — Validator Tests

### Files Updated / Created

```text
evals/grounding.test.ts
evals/policy.test.ts
evals/adversarial.test.ts
```

* [ ] Adversarial test: a mocked strategist returns `PERCENT_DISCOUNT` at 25% for a LOYAL fan. Assert the pipeline result is `NEEDS_REVIEW` and the validator names the cap violation. (May land in PR 9 if the pipeline entry point does not exist yet.)

---

## PR 5 Completion Criteria

* [ ] Invalid recommendations cannot be marked ready automatically.
* [ ] Financial caps are enforced deterministically.
* [ ] Hallucinated evidence is detectable.
* [ ] Failures become `NEEDS_REVIEW`.

---

# PR 6 — End-to-End Agent Pipeline

## Goal

Connect policy, strategist, copywriter, and validator into one application workflow.

---

## High-Level Checklist

* [ ] Build orchestration function.
* [ ] Skip AI for suppressed carts.
* [ ] Skip AI for waiting carts.
* [ ] Call strategist for eligible carts.
* [ ] Validate strategist recommendation.
* [ ] Call copywriter.
* [ ] Validate generated message.
* [ ] Produce decision trace.
* [ ] Return normalized result objects.
* [ ] Assign a `recommendationId` to every evaluation result.
* [ ] Persist the last evaluation per `cartId` (e.g. `data/evaluations.json`). `GET` reads storage; the agent runs only on explicit request.
* [ ] Append one record per pipeline run to `data/runs.jsonl`: cart ID, recommendation ID, model IDs, prompt version, raw model response, parsed output, validator results, input/output tokens, latency ms. Store tokens, not dollars.
* [ ] Add a dated per-model price table to `lib/config.ts`; compute cost at read time. Pull current model IDs and prices from the Anthropic docs when writing the table.

---

## Task 6.1 — Implement Pipeline

### Files Created

```text
lib/pipeline.ts
```

### Expected Flow

```text
load cart
↓
eligibility
↓
segmentation
↓
offer policy
↓
strategist
↓
offer validation
↓
copywriter
↓
message validation
↓
normalized review result
```

---

## Task 6.2 — Add Decision Trace

Each stage should append an understandable trace entry.

Example:

```text
Policy Engine
Segment: New Fan
Allowed Offers: Reminder, Fee Waiver, 10% Discount

Strategist
Selected: Fee Waiver

Validator
Offer valid
Evidence verified
```

### Files Updated

```text
lib/pipeline.ts
lib/types.ts
```

---

## Task 6.3 — Add API Route

### Endpoint

```text
POST /api/evaluate
```

Possible request:

```json
{
  "cartId": "C-1002"
}
```

or initially:

```text
evaluate all carts
```

### Files Created

```text
app/api/evaluate/route.ts
```

---

## PR 6 Completion Criteria

* [ ] Entire backend workflow works end-to-end.
* [ ] All carts return normalized results.
* [ ] Suppression and waiting states remain visible.
* [ ] Decision trace is included.

---

# PR 7 — Marketer Review Queue UI

## Goal

Build the primary non-technical user experience.

This should look like an actionable workflow, not a developer dashboard.

---

## High-Level Checklist

* [ ] Build summary metrics.
* [ ] Build cart review cards.
* [ ] Display recommendation.
* [ ] Display rationale.
* [ ] Display generated message.
* [ ] Add decision trace drawer.
* [ ] Show suppressed and waiting states.
* [ ] Add responsive styling.
* [ ] Match Envorso visual direction where practical.

---

## Task 7.1 — Build Summary Metrics

Potential values:

```text
Evaluated
Actionable
Suppressed
Waiting
Needs Review
Cart Value at Risk
```

### Files Created

```text
components/SummaryMetrics.tsx
```

### Files Updated

```text
app/page.tsx
```

---

## Task 7.2 — Build Recommendation Card

### Files Created

```text
components/CartReviewCard.tsx
components/RecommendationBadge.tsx
```

Display:

* cart details;
* fan segment;
* offer;
* reason;
* confidence;
* evidence;
* generated email.

---

## Task 7.3 — Build Decision Trace

### Files Created

```text
components/DecisionTrace.tsx
```

---

## Task 7.4 — Build Suppressed / Waiting States

### Files Created / Updated

```text
components/EmptyState.tsx
components/CartReviewCard.tsx
```

Important:

Suppressed carts should not disappear.

Example:

```text
Suppressed
No email marketing consent
```

---

## Task 7.5 — Styling

### Files Updated

```text
app/globals.css
tailwind.config.ts
app/page.tsx
components/*.tsx
```

Priorities:

* clear hierarchy;
* readable decisions;
* prominent offer state;
* visible human controls;
* usable by a non-engineer.

---

## PR 7 Completion Criteria

* [ ] A marketer can understand each recommendation without reading JSON.
* [ ] Suppressed and waiting carts are understandable.
* [ ] Decision reasoning is visible.
* [ ] UI is polished enough for walkthrough/demo.

---

# PR 8 — Marketer Approve / Edit / Reject Workflow

## Goal

Complete the human-in-the-loop interaction.

---

## High-Level Checklist

* [ ] Add approve action.
* [ ] Add editable email body.
* [ ] Add reject action.
* [ ] Add rejection reason.
* [ ] Track review status.
* [ ] Persist review state locally.
* [ ] Show reviewed/unreviewed state visually.
* [ ] Review actions reference the `recommendationId` they were made against.
* [ ] Add an explicit "Re-run agent" button per cart (and optionally for all). Page load never regenerates.
* [ ] Re-run deterministic message checks on marketer edits and show the result as a warning, never a block.
* [ ] Confidence renders as a badge only; it has no effect on actions.

---

## Task 8.1 — Review Actions Component

### Files Created

```text
components/ReviewActions.tsx
```

### Files Updated

```text
components/CartReviewCard.tsx
```

---

## Task 8.2 — Editable Message

### Tasks

* [ ] Allow marketer to edit subject/body.
* [ ] Preserve original generated message for traceability if practical.
* [ ] Mark modified output as edited.

### Files Updated

```text
components/CartReviewCard.tsx
lib/types.ts
```

---

## Task 8.3 — Rejection Reasons

Suggested values:

```text
WRONG_OFFER
DISCOUNT_TOO_HIGH
POOR_TONE
INCORRECT_REASONING
DO_NOT_CONTACT
OTHER
```

### Files Updated

```text
lib/types.ts
lib/schemas.ts
components/ReviewActions.tsx
```

---

## Task 8.4 — Lightweight Persistence

Initial implementation may use:

```text
data/review-actions.json
```

or a lightweight server-side in-memory implementation for demo purposes.

If file mutation becomes awkward in deployed Next.js environments, move to SQLite.

### Potential Files

```text
data/review-actions.json
lib/reviewRepository.ts
```

---

## PR 8 Completion Criteria

* [ ] Marketer can approve.
* [ ] Marketer can edit.
* [ ] Marketer can reject.
* [ ] Rejection reasons are captured.
* [ ] UI reflects current state.

---

# PR 9 — Evaluation Harness

## Goal

Make agent quality measurable and demonstrate that changes can be regression tested.

---

## High-Level Checklist

* [ ] Add golden tests.
* [ ] Add grounding tests.
* [ ] Add consistency tests.
* [ ] Add policy tests.
* [ ] Record clear expected outcomes.
* [ ] Make evals runnable from one command.

---

## Task 9.1 — Golden Dataset Tests

### Files Created

```text
evals/golden.test.ts
```

Required assertions:

```text
C-1003 → SUPPRESSED
C-1004 → WAIT
C-1001 → no percentage discount
C-1002 → discount <= configured cap
```

---

## Task 9.2 — Grounding Tests

### Files Created / Updated

```text
evals/grounding.test.ts
```

Test fabricated evidence such as:

```text
"lastGameAttended"
"favoritePlayer"
"seatAvailability"
```

These should fail validation.

---

## Task 9.3 — Consistency Evaluation

### Files Created

```text
evals/consistency.test.ts
```

Potential behavior:

Run the same eligible cart several times.

Allow:

```text
different wording
```

Do not allow:

```text
policy violation
offer outside allowlist
discount above cap
```

---

## Task 9.4 — Add NPM Scripts

Example:

```text
npm test            # mocked, free, runs in CI
npm run eval:live   # live Anthropic calls, optional, paid
```

* [ ] Default tests never call the Anthropic API. Strategist and copywriter are mocked.
* [ ] Consistency test lives under `eval:live` only.
* [ ] Adversarial 25%-discount test (see PR 5) runs under `npm test` if not already landed.

### Files Updated

```text
package.json
```

---

## PR 9 Completion Criteria

* [ ] Core safety rules are regression tested.
* [ ] Grounding checks are tested.
* [ ] Eval suite is easy to execute.
* [ ] README can report the evaluation approach.

---

# PR 10 — AI Redirection and Architecture Documentation

## Goal

Document why the architecture looks the way it does and create evidence of thoughtful AI use.

This PR is important for the assignment scoring, not just housekeeping.

---

## High-Level Checklist

* [ ] Add architecture documentation.
* [ ] Add explicit model tradeoffs.
* [ ] Add Claude proposal comparison.
* [ ] Add AI redirection log.
* [ ] Document product assumptions.
* [ ] Document known limitations.
* [ ] Document failure modes.

---

## Task 10.1 — Architecture Document

### Files Created

```text
docs/ARCHITECTURE.md
```

Include:

* pipeline diagram;
* separation of deterministic vs probabilistic logic;
* human-in-the-loop workflow;
* model responsibilities.

---

## Task 10.2 — Decision Log

### Files Created

```text
docs/DECISIONS.md
```

Document decisions such as:

```text
Why Sonnet for strategy?
Why Haiku for copy?
Why not Opus?
Why no LangGraph?
Why TypeScript validation instead of LLM-only review?
Why 2-hour stale threshold?
Why no automatic sending?
```

---

## Task 10.3 — AI Redirection Log

### Files Created

```text
REDIRECTS.md
```

First documented redirection:

### AI Suggestion

Use Sonnet as the final reviewer.

### Decision

Move:

```text
discount validation
consent validation
offer allowlisting
evidence validation
```

into deterministic TypeScript.

### Why

These rules can be guaranteed in code and directly affect revenue and fan trust.

Add further genuine examples during development.

---

## PR 10 Completion Criteria

* [ ] Architectural tradeoffs are explicit.
* [ ] AI redirection is documented.
* [ ] README can point to deeper documentation.
* [ ] Video talking points are now supported by repository history.

---

# PR 11 — README, Demo Readiness, and Final Polish

## Goal

Prepare the repository for reviewer use and video walkthrough.

---

## High-Level Checklist

* [ ] Complete README.
* [ ] Add setup instructions.
* [ ] Add environment setup.
* [ ] Add architecture diagram.
* [ ] Add screenshots if helpful.
* [ ] Add evaluation instructions.
* [ ] Add known limitations.
* [ ] Add model tradeoff explanation.
* [ ] Add failure-mode explanation.
* [ ] Run full test suite.
* [ ] Run application from a clean install.
* [ ] Remove dead code.
* [ ] Verify no API keys are committed.
* [ ] Final UI polish.

---

## Task 11.1 — Final README

### Files Updated

```text
README.md
```

Recommended sections:

```text
Overview
Problem
Architecture
How It Works
Tech Stack
Model Selection
Safety Design
Running Locally
Environment Variables
Running Tests
Running Evals
Known Limitations
AI-Assisted Development
Future Improvements
```

---

## Task 11.2 — Final PRD Sync

Make sure the implementation still matches the original product intent.

### Files

```text
docs/PRD.md
```

Update only where implementation decisions changed.

---

## Task 11.3 — Demo Verification

### Checklist

* [ ] Fresh `npm install` works.
* [ ] `.env.example` is accurate.
* [ ] Application starts.
* [ ] All five carts render.
* [ ] C-1003 shows suppressed.
* [ ] C-1004 shows waiting.
* [ ] Eligible carts can run through agent pipeline.
* [ ] Approve works.
* [ ] Edit works.
* [ ] Reject works.
* [ ] Decision trace works.
* [ ] Tests pass.
* [ ] Evals pass.
* [ ] No secrets committed.

---

# Optional PR 12 — Tone Critic

Do this only if the core application is already polished.

## Goal

Add a qualitative LLM review step for marketer-facing tone.

This should remain clearly secondary to deterministic validation.

---

## Tasks

* [ ] Implement tone-review prompt.
* [ ] Return structured tone warnings.
* [ ] Do not allow critic to override policy.
* [ ] Show warnings in marketer UI.
* [ ] Add tests for critic failure behavior.

### Files Created

```text
lib/agents/toneReviewer.ts
```

### Files Updated

```text
lib/pipeline.ts
lib/schemas.ts
lib/types.ts
components/CartReviewCard.tsx
```

---

# Optional PR 13 — SQLite Persistence

Only add this if lightweight persistence becomes inadequate.

## Goal

Persist marketer review decisions between sessions.

### Potential Work

* [ ] Add SQLite dependency.
* [ ] Create review table.
* [ ] Create repository abstraction.
* [ ] Persist approve/edit/reject events.
* [ ] Load existing review state.
* [ ] Add migration/init script.

### Potential Files

```text
lib/db.ts
lib/reviewRepository.ts
data/app.db
```

Avoid this PR if it distracts from the assignment's agentic requirements.

---

# Recommended PR Order

```text
PR 1  Bootstrap + Domain Model
PR 2  Deterministic Policy Engine
PR 3  Offer Strategist
PR 4  Message Writer
PR 5  Safety Validator
PR 6  End-to-End Pipeline
PR 7  Marketer Review UI
PR 8  Approve / Edit / Reject
PR 9  Evaluation Harness
PR 10 Architecture + AI Redirection Docs
PR 11 README + Demo Polish
```

Optional:

```text
PR 12 Tone Critic
PR 13 SQLite Persistence
```

---

# Suggested Git Branch Names

```text
feat/project-bootstrap
feat/policy-engine
feat/offer-strategist
feat/message-writer
feat/safety-validator
feat/agent-pipeline
feat/marketer-review-ui
feat/review-actions
test/agent-evaluations
docs/architecture-decisions
chore/demo-polish
```

---

# Suggested PR Titles

```text
PR 1
Initialize Cart Win-Back application and domain model

PR 2
Add deterministic eligibility, segmentation, and offer policies

PR 3
Add Claude-based win-back offer strategist

PR 4
Add low-cost AI message generation

PR 5
Add deterministic offer and grounding validation

PR 6
Connect policy and agent stages into end-to-end pipeline

PR 7
Add marketer recommendation review interface

PR 8
Add approve, edit, and reject workflow

PR 9
Add agent quality and regression evaluations

PR 10
Document architecture, model tradeoffs, and AI redirections

PR 11
Finalize README and demo experience
```

---

# Final Implementation Principle

When deciding whether something belongs in a PR, use this rule:

```text
Can I explain the purpose of this PR in one sentence,
and can I verify that purpose independently?
```

If not, the PR is probably doing too much.

The Git history should tell a coherent story:

```text
First we established safe rules.

Then we added AI judgment.

Then we added language generation.

Then we validated AI output.

Then we exposed it to the marketer.

Then we measured whether it worked.
```

That story is valuable both technically and for the assignment walkthrough.
