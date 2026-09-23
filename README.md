# Cart Win-Back Agent

An agentic win-back assistant for abandoned Seattle Seawolves ticket carts, built for Envorso Sports as a one-sprint first step before a CRM exists.

It looks at stale carts, decides which are worth acting on, proposes a specific offer, drafts the email, checks every claim and number against policy and source data, and hands the result to a marketer to **approve, edit, or reject**. Nothing is ever sent to a fan from this system.

**Live demo:** [cart-winback-agent-production.up.railway.app](https://cart-winback-agent-production.up.railway.app). Every cart renders on load; the run buttons call the real models.

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

## Written analysis (Section A)

**Which carts deserve an offer.** Two checks run before anything else, and both are plain code. A fan who has not opted in to email is suppressed. The cart stays on the marketer's screen with that reason, and no model ever sees it. A cart under two hours old is put on hold, because the fan may still be checking out and a message at that point is noise. Everything that passes those two gates is eligible for outreach. Whether it deserves a discount is a separate question, answered by segment.

**Offer logic.** Ticket history sorts fans into five segments. New fans have never bought. Returning fans hold one to nine tickets and bought recently. Lapsed fans sit in that same band but have been quiet for more than 180 days. Loyal fans hold ten to nineteen tickets and VIPs twenty or more, regardless of how recently they bought. Each segment gets a fixed menu of allowed offers and a maximum discount, all in one config file.

New and lapsed fans can receive up to 10 percent. A first or renewed purchase is worth a small nudge, and 10 percent of a $140 cart is $14, enough to move a decision without training anyone to wait for more. Returning fans get no discount, since an active buyer finishing a cart does not need a price cut. Loyal and VIP fans also get zero. A discount to someone with fourteen or forty tickets teaches them to wait for one and signals that the team does not know who they are. They get a fee waiver or a personal note instead.

The model's job is limited to choosing one item from that menu and explaining the choice with cited evidence from the cart. Code then checks the pick against the allowlist and the cap, and checks every cited field against the source data. A second, cheaper model writes the email from seven fields with no purchase history, so it cannot invent one. The split exists because a wrong offer costs money or goodwill, while wrong wording costs a marketer's edit.

**What I would not do yet.** No SMS, because consent rules differ by channel and the data does not capture them. No seat holds or section upgrades, because there is no inventory data and promising seats the system cannot see is the fastest way to lose a fan. No automatic sending, because there is no CRM and a marketer reading each draft is the strongest guard for tone and timing. No LLM acting as a safety gate, because a probabilistic check on a money rule is weaker than an if statement and looks more trustworthy than it is. No database, since JSON files serve one customer with five carts. No orchestration framework, because the pipeline is a straight line that a product manager can read. Each of these is one config line, function, or module away once the evidence says it is needed.

## Agent quality and failure plan (Section B)

**How I would know the offers are good.** A clean run proves the plumbing, not the judgment. The strategist can return a well-formed, policy-compliant, wrong offer. Three kinds of evidence answer the real question.

1. **Golden expectations that hold regardless of the model.** The test suite asserts that C-1003 is suppressed, C-1004 waits, C-1001 never gets a percentage, and C-1002 stays at or under 10 percent. These run on every change with scripted model replies, including deliberately bad ones.
2. **Consistency under repetition.** The live eval runs each eligible cart three times against the real models. Wording may vary between runs. Segment, menu, cap, and validator outcome may not. A cart whose recommended offer flips between runs is the first sign of a prompt or model regression, and the eval prints it per run.
3. **What the marketer does with each draft.** Every approve, edit, and reject is stored with the recommendation id and the marketer's reason. Edit rate per segment and the text of reject reasons show whether the strategist's judgment matches the human's. If loyal-fan drafts get rewritten every time, the prompt or the menu is wrong even though no validator fired. Once a send path exists, the measure becomes recovered carts per offer type per segment, compared against a plain reminder as the control.

**What could produce a bad offer without anyone noticing.**

- The strategist picks an allowed offer for the wrong reason, such as a fee waiver for a new fan who needed the discount to convert. Every validator passes because nothing is out of policy. The card shows the cited evidence and the reason, so the marketer can see the logic, and the consistency eval flags any cart that flips.
- The copywriter paraphrases around the phrase list. "You have been with us for years" is not on the blocklist, while "season ticket holder" is. The validator is literal and would miss it. Two stronger guards sit either side of it: the copywriter never receives ticket history, so the claim has to be fabricated from nothing, and the marketer reads every email before anything leaves.
- A model or API change quietly breaks one step. The first live run showed this: Haiku rejected a parameter, every eligible cart became `NEEDS_REVIEW`, and the page rendered fine. The summary metrics count those cards, the run log records the error text, and the live eval fails loudly.
- A field is renamed upstream. The Zod schema rejects the cart at load, so the failure is an explicit error rather than a strategist reasoning over a missing value.

**Catching it before it reaches a fan.** Nothing sends from this system. Every draft passes three deterministic validators and then a human, and approval is blocked outright when the offer failed a money or consent rule. That block lives in one pure module used by both the button and the API, so bypassing the UI does not bypass the rule. Cheaper still: one paid call per model before calling anything code-complete, which is the lesson the first live run taught.

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

## Deployment

The demo runs on Railway at [cart-winback-agent-production.up.railway.app](https://cart-winback-agent-production.up.railway.app), deployed from `main` on every merge. Railway was chosen over Vercel because the app persists state by writing JSON files, and a long-lived container with a volume keeps those writes across restarts where a serverless filesystem would not. A five-cart run also takes several seconds of sequential model calls, which a container does not time out.

The service has a volume mounted at `/data` with `DATA_DIR=/data`, so the evaluation store, run log, and review actions survive redeploys. The cart fixture is bundled at build time and does not live on the volume. The API key and model ids are Railway service variables. The page has no login, so treat the link as shareable with reviewers, not the public.

## Tests and evals

| Command | Cost | What it checks |
|---|---|---|
| `npm test` | free | 227 cases. Policy rules and boundaries, schema strictness, prompt contents, retry and error paths, every validator, the pipeline status matrix, storage, API routes, cost math, and the UI components against real pipeline output. All model calls are scripted. |
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
- The live eval has run once against the real API. That single run caught two contract errors the mocked suite could not, so it is a smoke test, not a track record.

## AI usage log (Section C)

The project was built with Claude in chat for planning, then Claude Code in the terminal for implementation, with a second model used as a reviewer during planning. The moments where AI output was changed are recorded as they happened in [`REDIRECTS.md`](./REDIRECTS.md), each attributed to whoever caught it. The interactions that shaped the result:

**1. Drafting the plan in Claude chat.** I gave Claude the brief and asked for a PRD, an architecture diagram, and a PR-by-PR task list. It returned a four-stage design: policy gate, Sonnet strategist, Haiku copywriter, and a Sonnet reviewer as the final safety check, plus a segmentation rule set and eleven PRs. I kept the linear pipeline, the two-model split, and the PR structure. I rejected the LLM reviewer for money and consent rules, because one probabilistic model checking another for `discount <= cap` is weaker than an if statement and looks more trustworthy than it is. Every such rule became TypeScript with a unit test.

**2. Reviewing the plan in the terminal before writing code.** With the three documents in the repo, I asked Claude Code whether anything needed clarifying, and had a second model review the same plan. This session locked the decisions in `Tasks.md` section 0: Sonnet 5 for the one judgment call, Haiku 4.5 for copy, no Opus because the guarantees come from validators rather than model size, no tool registry or orchestration framework, and a JSONL run log for observability. The review also caught the plan's worst bug. The segmentation rule checked "lapsed" before loyalty, so a quiet 20-ticket fan would be offered a discount while an active VIP got nothing. That rule was inverted so lapsed applies only in the one-to-nine ticket band, and pinned with a test named "a quiet VIP stays VIP."

**3. Building the strategist.** Claude Code's first instinct was to narrow the tool schema per call, so the model would be physically unable to return a disallowed offer. It then argued against its own idea: that would bury the guardrail inside the SDK call, and a 25 percent offer for a loyal fan would surface as a schema error instead of a readable line in the decision trace. I kept the generic schema plus the visible validator. In the same PR it fetched current pricing and SDK docs instead of writing model ids and prices from memory, which is why the price table carries a date and a source URL.

**4. Building the review workflow.** The locked rule said marketer edits warn and never block. While implementing approve, edit, and reject, Claude Code pointed out that the literal reading would let someone approve a recommendation whose offer had failed the cap, and proposed blocking approval for money and consent failures while leaving reject and re-run open. I kept that, and flagged it in `docs/DECISIONS.md` as one function to relax if the product owner disagrees.

**5. The review before any paid call, then the first paid run.** After the code was complete, a review pass pointed out that the 1024-token output cap ignored adaptive thinking, which counts toward `max_tokens` and could exhaust the budget before the tool was ever called. The cap went to 4096 and effort was set to low on both agents. The first paid run then corrected two more things. Haiku rejected the effort parameter with a 400, so effort now goes to the strategist only. The API also rejected `minimum` and `maximum` on the strict tool schema, so those bounds now move into field descriptions while Zod still enforces them locally. Every mocked test had passed with both mistakes in place. What I took from it: mocked evals prove the plumbing, not the contract.

**6. Restyling the UI to the client's brand.** I asked Claude Code to review the Envorso Sports marketing site and make the review queue look like it belongs to the same company. It proposed the palette, type, and card treatment from the site's own CSS. I set the constraints: purple only on the three buttons that run the agent, green for approve, red for reject, status colors kept semantic, no marketing navigation, no logic changes. It kept those, and every existing component test still passed alongside a new header test.

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
| 12 | Lower agent effort and raise the output token cap |
| 13 | Strip strict-mode-rejected schema bounds and send effort only to the strategist |
| 14 | Restyle the review queue to the Envorso Sports brand |

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
