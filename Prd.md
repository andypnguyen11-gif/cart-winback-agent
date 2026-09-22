# Product Requirements Document

## Cart Win-Back Agent MVP

### 1. Product Summary

Envorso Sports currently operates fan-facing ticketing, website, and mobile experiences for the Seattle Seawolves. A CRM and marketing automation platform do not yet exist.

This project introduces a first agentic marketing feature: a **Cart Win-Back Agent**.

The system will review recently abandoned ticket carts, determine whether each cart is appropriate for outreach, recommend a specific win-back action when appropriate, generate marketer-ready messaging, validate the recommendation against business rules, and present the result in a human review interface.

The first version is intentionally narrow. The goal is not to build a full marketing automation platform. The goal is to prove that an agentic workflow can safely turn stale-cart data into actionable marketer recommendations.

No communication will be automatically sent to fans in the MVP.

---

# 2. Problem

Fans sometimes begin purchasing Seattle Seawolves tickets but leave before completing checkout.

Today:

* stale carts receive no follow-up;
* marketers have no CRM workflow for recovering abandoned carts;
* there is no automated way to determine which carts should receive outreach;
* there is no system for deciding whether a fan should receive a reminder, discount, upgrade, or no outreach at all.

A simple abandoned-cart dashboard would show the problem but would not help the marketer act on it.

The product needs to move one step further:

> Given a stale cart and limited fan history, determine whether the marketer should act, recommend an appropriate offer, explain why, and make the recommendation easy to approve, edit, or reject.

---

# 3. Product Goals

The MVP should demonstrate that Envorso Sports can use an agentic workflow to safely assist a marketer with abandoned-cart recovery.

The system should:

1. Identify carts that are appropriate for outreach.
2. Suppress carts that should not receive outreach.
3. Classify fans into simple behavioral segments.
4. Establish deterministic limits on what offers may be proposed.
5. Use an LLM to select an appropriate offer from the permitted options.
6. Generate marketer-ready email or SMS copy.
7. Validate the recommendation before showing it to the marketer.
8. Explain why the system made each decision.
9. Allow a marketer to approve, edit, or reject the recommendation.
10. Record enough information to evaluate whether the agent is behaving correctly.

---

# 4. Non-Goals

The MVP is not intended to become a production CRM or marketing automation system.

The following are explicitly outside the first version:

* automatic email sending;
* automatic SMS sending;
* Salesforce integration;
* HubSpot integration;
* customer data platform integration;
* campaign scheduling;
* full fan-profile management;
* cross-channel marketing automation;
* dynamic seat inventory management;
* personalized ticket pricing;
* payment processing;
* automatic promotion-code creation;
* machine-learning training pipelines;
* reinforcement learning;
* long-term fan lifetime-value prediction;
* multi-team or multi-league personalization;
* autonomous agents changing business policies;
* real-time streaming cart events;
* production-scale observability infrastructure;
* fine-tuned models;
* vector databases;
* RAG infrastructure;
* complex agent frameworks such as LangGraph unless implementation complexity unexpectedly justifies them.

The MVP should remain understandable and maintainable by one engineer.

---

# 5. Users

## 5.1 Marketing User

The primary user is a non-technical marketer responsible for fan engagement.

The marketer needs to quickly understand:

* which carts deserve attention;
* what the system recommends;
* why the recommendation was made;
* whether the recommendation complies with business rules;
* what message should be sent;
* whether the recommendation should be approved, edited, or rejected.

The marketer should not need to understand prompts, JSON, model providers, or agent internals.

---

## 5.2 Product / Business Stakeholder

A product manager, marketing lead, or business stakeholder may review the system's behavior.

This user needs to understand:

* how the agent makes decisions;
* what safeguards exist;
* when the system chooses not to act;
* what types of offers are allowed;
* how often marketers agree with the agent;
* which recommendations require adjustment.

This user cares primarily about business risk, revenue impact, and fan trust.

---

## 5.3 Engineer

The engineer is responsible for maintaining the agentic pipeline.

The engineer needs:

* structured model outputs;
* reproducible evaluation cases;
* logged decision traces;
* deterministic business policies;
* schema validation;
* protection against unsupported model claims;
* clear failure states;
* the ability to swap models without rewriting the entire application.

---

# 6. User Stories

## Marketing User

### US-M1 — Review recommended offers

As a marketer, I want to see stale carts that the system believes are worth acting on so that I can decide which fans should receive outreach.

### US-M2 — Understand the recommendation

As a marketer, I want each recommendation to explain why it was selected so that I can judge whether the recommendation makes sense.

### US-M3 — Approve an offer

As a marketer, I want to approve an agent recommendation so that I can use the suggested message for outreach.

### US-M4 — Edit an offer

As a marketer, I want to change the proposed message or offer before approving it so that I retain control over fan communication.

### US-M5 — Reject an offer

As a marketer, I want to reject an inappropriate recommendation and optionally record why so that poor recommendations are not used.

### US-M6 — See suppressed carts

As a marketer, I want carts that cannot receive outreach to remain visible with an explanation so that I know the system did not silently ignore them.

Example:

> Suppressed — fan has not opted into email communication.

### US-M7 — See pending carts

As a marketer, I want recently abandoned carts that are not yet considered stale to show a waiting state so that I do not contact fans prematurely.

---

## Product / Business Stakeholder

### US-P1 — Understand business safeguards

As a business stakeholder, I want to know what restrictions the agent operates under so that discounts and customer outreach cannot exceed approved limits.

### US-P2 — Understand agent decisions

As a business stakeholder, I want to see the decision path behind an offer so that I can trust that recommendations are grounded in actual customer data.

### US-P3 — Evaluate system quality

As a business stakeholder, I want to know how often marketers approve, edit, or reject agent recommendations so that I can determine whether the feature is useful.

---

## Engineer

### US-E1 — Validate structured output

As an engineer, I want all LLM responses to follow predefined schemas so that the application can safely consume agent output.

### US-E2 — Prevent policy violations

As an engineer, I want financial and consent restrictions implemented in application code so that an LLM cannot override them.

### US-E3 — Detect unsupported reasoning

As an engineer, I want the agent to identify which input fields support its recommendation so that fabricated claims can be detected.

### US-E4 — Evaluate behavior

As an engineer, I want deterministic evaluation tests for known carts so that changes to prompts or models can be checked for regressions.

### US-E5 — Inspect failures

As an engineer, I want decision traces and validation errors recorded so that I can diagnose why a recommendation failed.

---

# 7. MVP Workflow

The MVP will use a multi-step agentic pipeline rather than a single prompt.

```text
Stale Cart Data
       ↓
Policy Engine
       ↓
Offer Strategist
       ↓
Message Writer
       ↓
Safety Validator
       ↓
Marketer Review
       ↓
Approve / Edit / Reject
```

Not every stage needs an LLM.

A core design principle of this project is:

> Use models for judgment and language generation. Use deterministic code for rules that must always be enforced.

---

# 8. Step 1 — Policy Engine

### Type

Deterministic TypeScript.

### Responsibilities

The policy engine determines whether an abandoned cart is eligible to continue through the agentic workflow.

It will evaluate:

* communication opt-in;
* time since cart abandonment;
* simple fan segmentation;
* permitted offer types;
* maximum discount;
* situations requiring human review.

### Example Segments

Initial segments may include:

* New Fan
* Returning Fan
* Loyal Fan
* VIP Fan
* Lapsed Fan

These classifications are intentionally simple and rule-based.

Example:

```text
lifetimeTickets = 0
→ New Fan
```

```text
lifetimeTickets >= 20
→ VIP / High Loyalty
```

Exact thresholds should remain configurable rather than embedded throughout the application.

---

# 9. Stale-Cart Threshold

The supplied dataset labels the records as stale carts, but one record was abandoned only one hour ago.

The MVP will independently define a minimum waiting period before an abandoned cart becomes actionable.

Initial proposed rule:

```text
Abandoned less than 2 hours:
WAIT
```

Reason:

A fan may still be completing checkout. Contacting them immediately could feel intrusive or unnecessarily aggressive.

This is an intentional product-scoping decision rather than blindly accepting the dataset's definition of "stale."

---

# 10. Consent Rule

Fans without communication consent must not proceed to offer generation.

Example:

```text
emailOptIn = false
→ SUPPRESSED
```

The cart remains visible in the marketer interface, but the system will not send the record to the offer strategist.

This prevents the LLM from ever having the opportunity to override a consent restriction.

---

# 11. Offer Policy

The policy engine produces an allowed offer set rather than allowing the LLM to invent arbitrary promotions.

Possible MVP offer types:

```text
REMINDER
SEAT_HOLD
FEE_WAIVER
SECTION_UPGRADE
PERCENT_DISCOUNT
NO_ACTION
```

For example:

```text
New Fan
Allowed:
- Reminder
- Fee Waiver
- Up to 10% Discount
```

```text
Loyal Fan
Allowed:
- Reminder
- Seat Hold

Maximum Discount:
0%
```

```text
VIP Fan
Allowed:
- Reminder
- Personal Outreach

Maximum Discount:
0%
```

These examples are initial product assumptions and should be reviewed before implementation.

---

# 12. Step 2 — Offer Strategist

### Type

LLM reasoning step.

### Proposed Model

Claude Sonnet 5.

### Responsibility

The strategist evaluates the eligible cart and chooses the most appropriate option from the offer menu generated by the policy engine.

The model does not determine:

* whether the user consented to outreach;
* the maximum discount;
* whether an offer type exists;
* whether the cart is eligible;
* whether financial policy may be overridden.

The model chooses between already-approved options.

---

# 13. Strategist Output

The strategist must return structured output.

Example:

```json
{
  "offerType": "FEE_WAIVER",
  "reason": "This is a first-time buyer with a relatively high-value cart that has remained abandoned for more than one day.",
  "confidence": "medium",
  "evidence": [
    {
      "field": "lifetimeTickets",
      "value": 0
    },
    {
      "field": "cartValue",
      "value": 140
    },
    {
      "field": "abandonedHours",
      "value": 26
    }
  ]
}
```

The model must cite which supplied fields influenced the recommendation.

The evidence is later checked against the original cart object.

---

# 14. Step 3 — Message Writer

### Type

LLM generation step.

### Proposed Model

Claude Haiku 4.5.

### Responsibilities

The message writer converts the selected offer into short marketer-ready copy.

Potential outputs:

* email subject;
* email body;
* SMS message.

The message writer does not choose the promotion.

Its job is language generation only.

This separation reduces the consequence of using a smaller and cheaper model.

---

# 15. Step 4 — Safety Validator

### Type

Primarily deterministic TypeScript.

An optional LLM-based tone check may be added if time permits.

### Responsibilities

The validator confirms:

* discount does not exceed the policy cap;
* offer type is allowed;
* evidence fields exist in the original record;
* values cited by the strategist match the source record;
* consent remains valid;
* required structured fields exist;
* messaging does not claim unavailable inventory;
* messaging does not invent fan history;
* suppressed or waiting carts cannot accidentally become sendable.

Validation failures should result in:

```text
NEEDS_REVIEW
```

rather than silently failing or silently correcting the output.

---

# 16. Optional Tone Critic

If implementation time permits, a secondary model may review language for qualitative concerns such as:

* tone-deaf treatment of loyal fans;
* unnecessarily aggressive urgency;
* misleading language;
* inappropriate assumptions.

This should not replace deterministic validation.

A tone model can advise:

> This message may sound overly promotional for a highly loyal fan.

It cannot decide:

> A 20% discount is permitted.

---

# 17. Human-in-the-Loop Requirement

No recommendation will automatically reach a fan.

Every actionable recommendation requires marketer review.

Available actions:

* Approve
* Edit
* Reject

Rejecting a recommendation should optionally capture a reason such as:

* Wrong offer
* Discount too high
* Poor tone
* Incorrect reasoning
* Fan should not be contacted
* Other

This feedback may be used for evaluation but will not automatically retrain a model in the MVP.

---

# 18. MVP User Interface

The primary UI is a marketer review queue.

## Summary Section

Potential metrics:

* carts evaluated;
* actionable carts;
* suppressed carts;
* waiting carts;
* recommendations requiring review;
* total cart value represented.

---

## Recommendation Card

Each cart should display:

### Fan Context

* Cart ID
* Fan segment
* Seats
* Section
* Cart value
* Time since abandonment
* Lifetime tickets
* Last purchase

### Agent Recommendation

Example:

```text
Recommended Offer
Fee Waiver
```

### Reason

Example:

```text
First-time buyer with a $140 cart that has remained
abandoned for 26 hours.
```

### Evidence

Example:

```text
Used in decision:

Lifetime Tickets: 0
Cart Value: $140
Time Abandoned: 26 hours
```

### Generated Message

Editable text area containing the email or SMS.

### Actions

```text
Approve
Edit
Reject
```

---

# 19. Decision Trace

Each recommendation should include a collapsible:

```text
Why did the agent choose this?
```

Example trace:

```text
Policy Engine

✓ Email consent
✓ Cart stale enough
Segment: New Fan
Maximum Discount: 10%

Strategist

Selected Offer:
Fee Waiver

Reason:
First-time buyer with a high-value cart.

Validator

✓ Offer allowed
✓ Financial limit respected
✓ Evidence matched source data
✓ No unsupported claims detected
```

This is intended for trust and debugging without exposing raw prompts to marketers.

---

# 20. Proposed Technology Stack

## Front End

### Next.js

Use Next.js with the App Router.

Reasons:

* React-based as requested in the assignment;
* easy server/API integration;
* appropriate for a small full-stack proof of concept;
* one repository can contain both UI and server-side agent calls.

---

## Language

### TypeScript

Use TypeScript across both frontend and backend.

Advantages:

* shared types between UI and pipeline;
* stronger validation;
* easier structured-agent output handling;
* appropriate fit for the assignment;
* reduces unnecessary context switching for a one-engineer MVP.

---

## Styling

### Tailwind CSS

Use Tailwind for rapid UI development.

The interface should visually reference Envorso Sports' design system where practical:

* typography;
* spacing;
* dark/light treatment;
* large statistics;
* compact uppercase section labels;
* restrained sports-tech aesthetic.

Exact copying is not necessary if reproducing proprietary styling becomes time-consuming.

The MVP should prioritize usability over pixel-perfect cloning.

---

# 21. LLM Provider

### Anthropic API

Initial models:

```text
Offer Strategist:
Claude Sonnet 5

Message Writer:
Claude Haiku 4.5
```

Potential tone review:

```text
Claude Haiku 4.5
or
Claude Sonnet 5
```

depending on implementation quality and available time.

The model names should be configurable through environment variables so models can be changed without modifying pipeline logic.

---

# 22. Schema Validation

### Zod

Use Zod to validate:

* incoming cart objects;
* strategist responses;
* message-writer responses;
* API payloads;
* persisted marketer actions.

The application should reject malformed model responses rather than attempting to infer missing fields.

---

# 23. Persistence

For the assignment MVP, avoid introducing a full database unless implementation progresses faster than expected.

Potential options:

### Option A — JSON / Local Data

Use the supplied cart fixture and an in-memory or local JSON representation of marketer actions.

Advantages:

* fast;
* easy to demonstrate;
* minimal infrastructure.

Disadvantages:

* not durable;
* unsuitable for production.

### Option B — SQLite

Use SQLite if durable marketer actions become important during implementation.

Advantages:

* real persistence;
* minimal setup;
* appropriate for a single-instance demo.

Disadvantages:

* slightly more implementation work.

### MVP recommendation

Start with fixture-based cart input and lightweight persistence.

Do not let database setup consume meaningful sprint time.

---

# 24. Agent Framework

Do not introduce LangGraph, CrewAI, or another orchestration framework for the MVP unless implementation reveals a genuine need.

The workflow is linear:

```text
policy
→ strategist
→ writer
→ validator
```

Plain TypeScript functions provide:

* easier debugging;
* easier unit testing;
* lower complexity;
* easier explanation during the walkthrough.

An orchestration framework would add abstraction without currently solving a meaningful problem.

---

# 25. Suggested Repository Structure

```text
/app
  /api
    /evaluate
      route.ts

  page.tsx

/components
  CartReviewCard.tsx
  DecisionTrace.tsx
  SummaryMetrics.tsx

/data
  carts.json

/lib
  /agents
    strategist.ts
    copywriter.ts
    toneReviewer.ts

  /policy
    eligibility.ts
    segmentation.ts
    offerRules.ts

  /validation
    validateOffer.ts
    validateEvidence.ts

  pipeline.ts
  schemas.ts

/evals
  golden.test.ts
  grounding.test.ts

README.md
REDIRECTS.md
```

---

# 26. Evaluation Strategy

Agent output should not be evaluated purely by whether it sounds reasonable.

The MVP should contain concrete checks.

---

## Golden Dataset

The five supplied carts will serve as an initial evaluation dataset.

Expected safety properties include:

### C-1003

Must always be:

```text
SUPPRESSED
```

because the fan has not opted into email.

---

### C-1004

Should initially be:

```text
WAIT
```

because the cart was abandoned only one hour ago.

---

### C-1001

Should not receive a discount under the initial loyal-fan policy.

---

### C-1002

Any percentage discount must remain below the configured new-fan cap.

---

# 27. Grounding Evaluation

A recommendation may sound correct while still being wrong.

Example:

> "This fan attended last week's match."

This sounds plausible but the dataset contains no attendance information.

The strategist therefore returns structured evidence describing the fields used in the decision.

The validator compares this evidence to the original cart data.

Unknown fields or mismatched values cause validation failure.

This addresses one of the most dangerous agent failure modes:

> believable fabricated reasoning.

---

# 28. Consistency Evaluation

The same test case should be run multiple times.

The exact wording may change.

However:

* eligibility should never change;
* offer constraints should never change;
* suppressed carts should remain suppressed;
* discounts should never exceed policy;
* the available offer set should remain consistent.

Variation in wording is acceptable.

Variation in business policy is not.

---

# 29. Human Feedback Metrics

For each recommendation record:

```text
Approved
Edited
Rejected
```

Potential MVP metrics:

* approval rate;
* edit rate;
* rejection rate;
* most common rejection reason.

These metrics provide a lightweight way to evaluate whether the feature is actually helping marketers.

---

# 30. Important Failure Modes

## Hallucinated Customer Facts

Risk:

The model invents fan history that does not exist.

Mitigation:

* structured evidence;
* source validation;
* restricted input fields.

---

## Excessive Discounts

Risk:

The model generates an unnecessarily generous promotion.

Mitigation:

* maximum discount configured before the model is called;
* model chooses only from allowed offers;
* deterministic post-validation.

---

## Contacting Non-Consenting Fans

Risk:

A fan without consent receives marketing outreach.

Mitigation:

* consent check occurs before any LLM call;
* suppressed carts never enter offer generation.

---

## Contacting Fans Too Quickly

Risk:

The system contacts someone who is still completing checkout.

Mitigation:

* minimum stale-cart threshold.

---

## Tone-Deaf Loyalty Treatment

Risk:

A long-time fan receives an aggressive discount or impersonal message.

Mitigation:

* loyalty-aware offer policies;
* marketer review;
* optional tone critic.

---

## Model API Failure

Risk:

Anthropic API becomes unavailable during the demo.

Mitigation:

Potential fallback behavior:

```text
Agent unavailable
Manual review required
```

Optional deterministic demo fixtures may be included so the UI remains demonstrable.

The fallback should not fabricate that an LLM decision occurred.

---

# 31. Technical Decisions Still Open for Review

Before implementation, the following assumptions should be reviewed:

1. What is the minimum stale-cart duration?

Proposed:

```text
2 hours
```

2. Should loyal and VIP fans ever receive percentage discounts?

Proposed MVP:

```text
No.
```

3. Maximum new-fan percentage discount?

Proposed:

```text
10%.
```

4. Should lapsed fans receive a larger allowable discount than new fans?

Open decision.

5. Should "seat hold" exist when actual inventory availability is unavailable?

Potential issue:

Without inventory data, the system should avoid promising that seats remain available.

It may be safer to remove seat-hold language from the MVP or phrase it as a recommendation for marketer review rather than a guaranteed action.

6. Should the system generate both email and SMS?

Recommendation:

Start with email only unless the UI is completed ahead of schedule.

---

# 32. Technical Pitfalls and Decision Notes

## Pitfall: Fake Multi-Agent Complexity

It would be easy to create four LLM calls and label them four agents simply to satisfy the assignment.

That adds:

* latency;
* cost;
* nondeterminism;
* debugging difficulty.

The architecture should separate responsibilities only where the separation creates real value.

---

## Pitfall: Asking an LLM to Validate Its Own Constraints

An LLM reviewer may incorrectly approve an invalid discount.

Rules affecting money, consent, or eligibility should therefore be enforced in code.

An LLM may supplement these checks but should not replace them.

---

## Pitfall: Using AI Where Plain Code Is Better

Examples:

```text
"Does this fan have email consent?"
```

does not require an LLM.

Neither does:

```text
"Is 15% greater than the configured 10% limit?"
```

Using a model for these decisions would reduce reliability while increasing cost.

---

## Pitfall: Overengineering Persistence

Introducing PostgreSQL, Redis, queues, or distributed services would make the MVP look more technically sophisticated while reducing the likelihood of shipping the actual feature.

The architecture should reflect the scale:

```text
one customer
five sample records
one engineer
one sprint
```

---

## Pitfall: Building a Dashboard Instead of a Workflow

A polished analytics dashboard alone does not satisfy the product requirement.

The primary unit of the UI should be:

```text
recommendation → decision
```

rather than:

```text
chart → observation
```

---

# 33. Architecture Trade-Off: Claude Proposal vs Final MVP Direction

An earlier AI-assisted architecture suggested:

```text
Policy Gate
→ Sonnet Strategist
→ Haiku Copywriter
→ Sonnet Reviewer
```

This was useful because it clearly separated agent responsibilities.

However, after reviewing the business risk, the architecture was adjusted.

---

## Trade-Off 1 — LLM Reviewer vs Deterministic Validator

### Initial Proposal

Use Claude Sonnet as the reviewer responsible for identifying invalid or inappropriate offers.

### Concern

This creates a situation where one probabilistic model is responsible for verifying the output of another probabilistic model.

For subjective issues such as tone, that is appropriate.

For hard restrictions such as:

```text
discount <= 10%
emailOptIn == true
offerType in allowedOffers
```

it is unnecessary and weaker than deterministic validation.

### Final Decision

Use TypeScript for business-rule validation.

Use an LLM only for optional qualitative review.

### Rationale

This provides stronger guarantees for decisions that affect:

* revenue;
* communication consent;
* fan trust.

---

# 34. Trade-Off 2 — More Capable Model vs Constrained Architecture

An alternative would be to use a higher-capability model such as an Opus-tier model for the strategist.

The MVP instead uses a Sonnet-tier model.

### Rationale

The strategist receives:

* a very small structured record;
* a limited list of offers;
* explicit policy constraints.

The task does not require open-ended research or extremely deep reasoning.

Using a larger model would increase capability, but much of the important reliability comes from system architecture rather than model intelligence.

The design therefore favors:

```text
Strong model
+
constrained task
+
deterministic policy
+
deterministic validation
```

rather than:

```text
Most expensive model
+
more autonomy
```

---

# 35. Trade-Off 3 — Sonnet vs Haiku for Copy Generation

The message-writing step has significantly lower reasoning requirements than offer selection.

The offer has already been selected.

The writer only needs to express it clearly.

Using the same frontier model for both tasks would increase cost without providing meaningful additional protection.

Therefore:

```text
Strategist → Sonnet
Writer → Haiku
```

This demonstrates deliberate model tiering based on task difficulty and business consequence.

---

# 36. Trade-Off 4 — Agent Framework vs Plain TypeScript Pipeline

A framework such as LangGraph could provide formal graph execution, persistence, retries, and advanced branching.

However, the MVP workflow contains only a few sequential stages.

Introducing an agent framework would increase architectural complexity without solving a current requirement.

The MVP will therefore use explicit TypeScript orchestration.

If the workflow later expands to include:

* asynchronous tools;
* branching workflows;
* retry policies;
* multiple external systems;
* long-running state;

then introducing a graph-based orchestration framework can be reconsidered.

---

# 37. Trade-Off 5 — Model Autonomy vs Business Control

The agent could theoretically be allowed to invent its own discount percentage or promotion.

That would demonstrate greater autonomy.

It would also create unnecessary financial and reputational risk.

The MVP intentionally restricts model autonomy.

The model's role is:

```text
Choose the best option from safe options.
```

not:

```text
Invent whatever promotion seems persuasive.
```

This is an intentional product choice rather than a limitation of the model.

---

# 38. AI Redirection Documentation

The project should include:

```text
REDIRECTS.md
```

This file will document meaningful moments where AI-generated implementation or architectural suggestions were changed.

One already identified example is the validation architecture.

### Initial AI Suggestion

Use an LLM reviewer as the primary final check.

### Redirection

Move:

* discount validation;
* consent validation;
* offer allow-list validation;
* evidence validation;

into deterministic application code.

### Reason

Financial and legal/business constraints should not rely on probabilistic model judgment when they can be expressed as deterministic rules.

Additional genuine redirection moments encountered during development should be recorded rather than invented after the project is complete.

---

# 39. Definition of Done

The MVP is complete when:

* the supplied stale carts can be processed;
* non-consenting users are deterministically suppressed;
* recently abandoned carts can be put into a waiting state;
* eligible carts are assigned a permitted offer set;
* the strategist selects a structured recommendation;
* marketer-ready messaging is generated;
* recommendations pass deterministic validation;
* invalid recommendations are clearly flagged;
* marketers can approve, edit, or reject recommendations;
* suppressed records remain visible;
* each recommendation includes an understandable explanation;
* the system contains automated evaluation tests;
* the README explains architecture and tradeoffs;
* at least one real AI redirection is documented for the walkthrough.

---

# 40. Success Criteria for the Assignment

A successful submission should demonstrate the following story:

> The system does not use AI simply because AI is available. Deterministic software controls eligibility, consent, and financial limits. An LLM is introduced where human-like judgment creates value: selecting an appropriate recovery strategy and communicating it clearly. Every recommendation remains explainable and subject to human approval.

The MVP should feel less like an autonomous marketing robot and more like a trustworthy junior marketing assistant operating inside clearly defined boundaries.
