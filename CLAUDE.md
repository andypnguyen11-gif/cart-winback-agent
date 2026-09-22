# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cart Win-Back Agent MVP for Envorso Sports (Seattle Seawolves ticketing). It reviews abandoned ticket carts, decides whether outreach is appropriate, recommends an offer, drafts an email, validates everything against business rules, and presents the result to a marketer for approve / edit / reject. Nothing is ever sent to fans automatically.

The repo currently holds planning docs only. Read them before implementing anything:

- `Prd.md` – product requirements, business rules, failure modes, open decisions (section 31)
- `Architecture.md` – Mermaid flowchart of the intended module graph
- `Tasks.md` – the PR-by-PR implementation plan, file layout, and completion criteria

Work through `Tasks.md` in order. Each PR should be explainable in one sentence and verifiable on its own.

## Commands

Planned stack: Next.js (App Router), TypeScript strict, Tailwind, Zod, Vitest, Anthropic SDK. Once `package.json` exists these are the expected commands (update this section if the scripts differ):

```bash
npm install
npm run dev                          # local dev server
npm run build
npm run lint
npm run typecheck                    # tsc --noEmit
npm test                             # unit tests + evals, mocked, no API calls
npm run eval:live                    # live Anthropic evals (added with the eval harness; paid, optional)
npx vitest run evals/policy.test.ts  # single test file
npx vitest run -t "C-1003"           # single test by name
```

Environment variables live in `.env.example`: `ANTHROPIC_API_KEY`, `STRATEGIST_MODEL`, `COPYWRITER_MODEL`. The app must start and the policy engine must run without an API key.

## Workflow rules

- **Every PR or task must ship with tests.** Policy, validation, and pipeline changes get unit tests under `evals/`; UI changes get component tests where practical. Do not open a PR whose behavior is untested.
- **Commit messages must not mention PR numbers, task numbers, or ticket IDs.** Describe the change itself (e.g. `Add deterministic eligibility and segmentation rules`), not `PR 2` or `Task 2.1`.
- Do not introduce LangGraph, CrewAI, or any orchestration framework. The pipeline is plain TypeScript functions.
- Add genuine AI-redirection examples to `REDIRECTS.md` as they happen during development.

## Architecture

The core principle: **models make judgment and language calls; deterministic code enforces every rule that touches money, consent, or eligibility.** An LLM must never be the thing that decides a discount is within cap or that a fan consented.

Pipeline (`lib/pipeline.ts`), strictly linear:

```
load cart → eligibility → segmentation → offer policy → strategist (LLM)
→ offer + evidence validation → copywriter (LLM) → message validation → review result
```

Layers and where responsibility lives:

- **Policy engine** (`lib/policy/`): `eligibility.ts` returns `SUPPRESSED` when `emailOptIn` is false and `WAIT` when `abandonedHours < 2`. Suppressed and waiting carts never reach an LLM. `segmentation.ts` maps fans to `NEW / RETURNING / LOYAL / VIP / LAPSED`. `offerRules.ts` produces the allowed offer set and max discount per segment (loyal and VIP cap at 0%; new fan cap 10%). All thresholds live in `lib/config.ts`, never inline in components or agents.
- **Agents** (`lib/agents/`): `strategist.ts` (Claude Sonnet 5) picks from the policy's allowed menu and must return structured output with `evidence[]` citing input fields. `copywriter.ts` (Claude Haiku 4.5) writes subject and body only; it cannot change the offer or discount. `toneReviewer.ts` is optional and advisory only.
- **Validation** (`lib/validation/`): runs after each model call. `validateOffer.ts` checks allowlist and cap; `validateEvidence.ts` checks every cited field exists in the source cart with the same value; `validateMessage.ts` rejects seat guarantees, invented deadlines, changed discounts, and invented fan history. Any failure yields `NEEDS_REVIEW`, never a silent fix.
- **Schemas** (`lib/schemas.ts`): Zod schemas for cart input, strategist output, message output, and marketer actions. Model responses are parsed with these; malformed output is an explicit error, not a guess.
- **API** (`app/api/evaluate/route.ts`): `POST /api/evaluate`, returns normalized results for all carts including suppressed and waiting ones, each with a decision trace.
- **UI** (`app/page.tsx`, `components/`): marketer review queue. Suppressed carts stay visible with their reason. Review actions persist to `data/review-actions.json` (move to SQLite only if file writes become a problem in deployment).

Decision statuses: `WAIT`, `SUPPRESSED`, `ACTIONABLE`, `NEEDS_REVIEW`.

Golden dataset expectations (`data/carts.json`, five carts) that the eval harness asserts:

- C-1003 → `SUPPRESSED` (no consent)
- C-1004 → `WAIT` (one hour old)
- C-1001 → no percentage discount (loyal)
- C-1002 → discount ≤ new-fan cap

Consistency evals may rerun the same cart several times: wording may vary, but eligibility, offer allowlist, and discount cap must never.

## Open product decisions

Section 31 of `Prd.md` lists assumptions still under review (stale threshold, lapsed-fan cap, whether `SEAT_HOLD` should exist without inventory data). Prefer `PERSONAL_OUTREACH` over `SEAT_HOLD` and never let generated copy claim seats are available.
