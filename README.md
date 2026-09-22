# Cart Win-Back Agent

An agentic win-back assistant for abandoned Seattle Seawolves ticket carts, built for Envorso Sports as a one-sprint first step before a CRM exists.

It looks at stale carts, decides which are worth acting on, proposes a specific offer, drafts the email, checks every claim and number against policy and source data, and hands the result to a marketer to **approve, edit, or reject**. Nothing is ever sent to a fan from this system.

> **Models make judgment and language calls. Deterministic code enforces every rule that touches money, consent, or eligibility.** An LLM is never the thing that decides a discount is within cap or that a fan consented.

## The problem

Every day some fans start a ticket purchase and abandon it. Nobody follows up. Marketing has no CRM, no automation platform, and one small, real fan base where a tone-deaf offer to a loyal fan costs more than the sale. The team wants an agent that proposes offers a marketer can act on, not a dashboard that counts stale carts.

## What a marketer sees

A review queue with one card per cart. Each card shows the fan context in words, the recommended offer, the reason, the evidence the agent used, the draft email, and a collapsed "Why did the agent choose this?" trace. Suppressed and waiting carts stay visible with their reason. Cards that failed a check say exactly which one. The marketer approves, edits (with the copy re-checked and any flags shown as warnings), or rejects with a reason. Every decision is bound to the exact recommendation it was made on.

## How it works

```
load cart → eligibility → segmentation → offer policy → strategist (Claude Sonnet 5)
→ offer + evidence checks → copywriter (Claude Haiku 4.5) → message checks → review result
```

| Stage | Kind | Decides |
|---|---|---|
| Eligibility | code | No email consent → `SUPPRESSED`. Under 2 hours old → `WAIT`. Neither reaches a model. |
| Segmentation | code | `NEW` / `RETURNING` / `LOYAL` / `VIP` / `LAPSED` from ticket count and recency. |
| Offer policy | code | The allowed offers and maximum discount for that segment. Loyal and VIP: 0%. New and lapsed: 10%. |
| Strategist | Sonnet 5 | Which item on that menu fits, with a reason and cited evidence fields. One forced, strict structured-output tool. |
| Offer + evidence checks | code | Offer on the menu, discount within cap, every cited field exists on the cart with the exact value. |
| Copywriter | Haiku 4.5 | Subject and body. It sees seven fields and no history, and its output has no offer or discount field to change. |
| Message checks | code | Every `%` and `$` must match the offer and cart; literal phrase lists for urgency, seat promises, invented history. |
| Review | marketer | Approve, edit, reject, re-run. Approval is blocked if the offer failed a money rule. |

Any failed check yields `NEEDS_REVIEW` with the model's output kept visible. Nothing is silently fixed.

The full picture, including a failure-mode table, is in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## The five sample carts

| Cart | Fan | Policy outcome | Why |
|---|---|---|---|
| C-1003 | 3 tickets, no email opt-in | `SUPPRESSED`, no model call | Consent is the first check. |
| C-1004 | 40 tickets, 1h old | `WAIT`, re-check in 1h | Still checking out. |
| C-1001 | 14 tickets, 3h old | `LOYAL`, menu without any discount | A loyal fan gets a fee waiver or a personal note, never a price cut. |
| C-1002 | 0 tickets, 26h old | `NEW`, up to 10% | First purchase worth a small nudge. |
| C-1005 | 1 ticket, 300 days silent | `LAPSED`, up to 10% | Being re-won. |

These are asserted by `npm test` through the whole pipeline with scripted model replies, including deliberately bad ones (25% for the loyal fan, invented evidence, "last chance" copy), so the promises rest on code rather than on the model behaving.

## Running locally

```bash
npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY to run the two model steps
npm run dev                    # http://localhost:3000
```

Without a key the app still starts, all five carts render, C-1003 is suppressed, C-1004 waits, and eligible carts show `NEEDS_REVIEW` with a plain "no API key" reason. With a key, press **Run agent on all carts**. Nothing runs on page load or refresh; the agent runs only when asked.

Environment variables (`.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Enables the strategist and copywriter | unset |
| `STRATEGIST_MODEL` | Model id for offer selection | `claude-sonnet-5` |
| `COPYWRITER_MODEL` | Model id for copy | `claude-haiku-4-5-20251001` |
| `DATA_DIR` | Where JSON state lives | `./data` |

State is three gitignored JSON files under `data/`: the last evaluation per cart, an append-only run log, and the marketer's decisions.

## Tests and evals

| Command | Cost | What it checks |
|---|---|---|
| `npm test` | free | 217 cases. Policy rules and boundaries, schema strictness, prompt contents, retry and error paths, every validator, the pipeline status matrix, storage, API routes, cost math, and the UI components against real pipeline output. All model calls are scripted. |
| `npm run eval:live` | cents | Real calls. Each eligible cart runs 3 times (`EVAL_RUNS=n` to change). Wording may vary; segment, menu, and cap may not, and anything `ACTIONABLE` must pass every validator. Prints a per-run table with cost and writes `data/eval-live-last.json`. Skips cleanly with no key. |
| `npm run eval:report` | free | Tokens, latency, and estimated cost per cart and per model from the run log. |
| `npm run typecheck`, `npm run lint`, `npm run build` | free | The usual. |

### How the agent could look right and be wrong

The email says "As a season ticket holder, you know these seats go fast." It is warm, on brand, and false: the fan has never bought a ticket. No reader would flag it. Three things catch it here: the copywriter is never shown ticket history, so it has to invent it; the message validator blocks "season ticket" for `NEW` fans; and the marketer reads it before anything sends. The validator is a literal phrase list and a number matcher. It is a heuristic, it will miss paraphrases, and the README says so on purpose. The narrow input and the human are the stronger guards.

A second example: the strategist cites `attendedLastGame: true` to justify an offer. The field does not exist. Evidence grounding rejects any cited field that is not on the cart, or whose value differs, and the card shows the reviewer exactly which citation was invented.

### Cost and model trade-off

Two calls per eligible cart, about 600 input and 150 output tokens each. At list prices as of 2026-09-22 that is roughly $0.002 for Sonnet and $0.001 for Haiku, so around a third of a cent per cart, or well under a dollar to re-run this queue a hundred times. Sonnet handles the one decision with business consequences; Haiku handles the language, where a weaker model costs nothing because the decisions are already made. Opus would not change a single guarantee, because the guarantees come from the policy engine and the validators, not from the model. Token counts are logged; dollars are computed on read from a dated price table so a price change never rewrites history.

## Decisions made without a product owner in the room

- **Returning fans get 0% discount.** Not in the original open questions. An active buyer finishing a cart does not need a price cut. One line in `lib/config.ts`.
- **Approval is blocked when the offer failed a money rule.** The brief said "the marketer is the authority; edits warn, never block." I kept that for language and drew the line at money and consent: a 25% discount for a VIP cannot be approved from this screen, only rejected or re-run. One function, `lib/reviewPolicy.ts`, to relax.
- **No seat holds.** There is no inventory data, so the system never promises seats. `PERSONAL_OUTREACH` replaces the idea.
- **Email only, JSON files only, no framework, no tone critic.** One customer, five carts, one engineer, one sprint.

Every decision and its reasoning is in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## Known limitations

- The message validator matches literal phrases and numbers. It does not understand the email.
- JSON files assume a single server instance. SQLite is the documented next step.
- Live consistency is measured, not guaranteed. The deterministic parts are guaranteed; the model's choice among allowed offers can vary run to run, which is why the marketer sees the reason and the evidence.
- No send integration exists, by design. The marketer copies the approved email into whatever they use today.
- The live eval was written and dry-run on this machine without a key; the first paid run is the reviewer's to make.

## AI-assisted development

This was built with Claude Code, with a second model used as a reviewer during planning. The moments where the AI's output was changed are recorded as they happened in [`REDIRECTS.md`](./REDIRECTS.md), each attributed to whoever caught it. The one for the video: the AI's first segmentation rule checked "lapsed" before loyalty, which would have made a quiet 20-ticket fan discount-eligible while an active VIP got nothing. It was caught in review, inverted to "lapsed applies only in the 1–9 ticket band," and pinned with a test named "a quiet VIP stays VIP."

The repository history tells the story in order:

| PR | What it added |
|---|---|
| 1 | App shell, the five carts, strict Zod schemas |
| 2 | Deterministic eligibility, segmentation, offer menus and caps |
| 3 | Sonnet strategist choosing from the menu, with evidence |
| 4 | Haiku copywriter with a seven-field input; the shared `runAgentStep` helper |
| 5 | Offer, evidence, and message validators; adversarial tests |
| 6 | The pipeline, decision trace, persistence, run log, `POST /api/evaluate` |
| 7 | The marketer review queue |
| 8 | Approve / edit / reject bound to recommendation ids |
| 9 | Golden, consistency, and live evals; cost report |
| 10 | Architecture, decisions, and redirects docs |
| 11 | This README and demo polish |

## Repository layout

```text
app/                 Next.js App Router: page, /api/evaluate, /api/review
components/          Review queue, cards, actions, trace, metrics
lib/config.ts        Every business number, phrase list, model id, and price
lib/policy/          eligibility, segmentation, offerRules
lib/agents/          strategist, copywriter, runAgentStep, client
lib/validation/      validateOffer, validateEvidence, validateMessage
lib/pipeline.ts      The straight line that connects them
lib/storage.ts       evaluations.json, runs.jsonl
lib/reviews.ts       review-actions.json; lib/reviewPolicy.ts decides what may be approved
lib/cost.ts, lib/report.ts   Read-time pricing and the run-log report
evals/               Vitest suites; evals/live/ is the paid harness
data/                carts.json (fixture) plus gitignored runtime state
docs/                ARCHITECTURE.md, DECISIONS.md
REDIRECTS.md         Where AI suggestions were changed
Prd.md, Tasks.md, Architecture.md   Original planning documents
```

## Future improvements

An optional tone critic (advisory, never a gate), SQLite when a second instance appears, a send integration once a CRM exists, a "snooze until" for `WAIT` carts, and re-running the golden evals whenever a prompt version changes.
