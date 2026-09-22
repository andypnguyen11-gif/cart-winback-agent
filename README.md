# Cart Win-Back Agent

An agentic win-back assistant for abandoned Seattle Seawolves ticket carts, built for Envorso Sports.

It reviews stale carts, decides which ones are worth acting on, proposes a specific offer, drafts the email, validates everything against business rules, and hands the result to a marketer to **approve, edit, or reject**. Nothing is ever sent to a fan automatically.

> Status: early. This commit ships the app shell, the cart dataset, and the domain model. The policy engine, agents, validators, and review UI land in subsequent pull requests. See [`Tasks.md`](./Tasks.md) for the plan and [`Prd.md`](./Prd.md) for the product requirements.

## Design principle

**Models make judgment and language calls. Deterministic code enforces every rule that touches money, consent, or eligibility.**

An LLM is never the thing that decides a discount is within cap or that a fan consented.

## Running locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY when the agent steps land
npm run dev                  # http://localhost:3000
```

The app starts and the dataset loads without an API key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests and evals (mocked, no API calls) |

## Repository layout

```text
app/          Next.js App Router pages and API routes
data/         Stale-cart fixture (the five supplied records)
lib/          Domain types, Zod schemas, and (soon) policy, agents, validation, pipeline
evals/        Vitest suites: golden dataset, grounding, policy, consistency
Prd.md        Product requirements
Architecture.md  Mermaid module graph
Tasks.md      PR-by-PR implementation plan and locked decisions
```

## Documentation

- [`Prd.md`](./Prd.md): product requirements, business rules, failure modes
- [`Architecture.md`](./Architecture.md): intended module graph
- [`Tasks.md`](./Tasks.md): implementation plan with locked policy and product decisions
