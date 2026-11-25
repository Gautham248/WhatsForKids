# 06. Demo internals

## File map

| Path | Role |
| --- | --- |
| `lib/types.ts` | All types, vocabularies (BANDS, BUDGETS, CATEGORIES, INTERESTS), status stages, `Data` root object |
| `lib/seed.ts` | `makeSeed(now)`: 6 brands (Banyan's authorisation expired on purpose), ~27 products across all stages, evidence, profiles, reason lines, routes, status log. `v` = seed version |
| `lib/fixtures.ts` | 10 dated saved brand pages (Shopify JSON, JSON-LD, CSV, custom HTML) generated from specs |
| `lib/parser.ts` | Rules parser, simulated model parser, merge, cache key |
| `lib/rank.ts` | Search, scoring, diversity, reason pick, relaxations, cert search |
| `lib/chat.ts` | `runTurn(d, chat, event)`: the whole turn as a pure function. Pills, guards, intents, responses |
| `lib/gate.ts` | Demo clock, evidence currency, claim lint, publish gate, visibility |
| `lib/admin.ts` | `moveTo` stage transitions |
| `lib/scraper.ts` | Adapters, regression, `scrapeUrl`, `refreshBrand`, `approveDiff` |
| `lib/csv.ts` | CSV parse/serialise |
| `lib/store.tsx` | `AppProvider`, `useApp()`: state + localStorage + login modal + toasts. The only browser-aware lib file |
| `components/` | `Shell` (top bar, toggles), `bits` (cards, badges), `Inspector` (pipeline per turn) |
| `app/page.tsx` | Chat |
| `app/p/[id]`, `app/out/[id]` | Product page, click-out |
| `app/saved`, `history`, `account` | Parent account (fake Google login, consent, child profile, deletion request) |
| `app/how-it-works` | Two-lane diagram, real-vs-faked table, B2/B3/B4/B5 click scripts, cost sketch |
| `app/admin/*` | Pipeline board, product editor (`p/[id]`), scraper, diff queue, CSV, events, ops |
| `scripts/smoke.ts` | The only automated test (`npm run test:logic`) |

## State model

- One `Data` object (type in `lib/types.ts`) holds everything: brands, products, evidence, profiles,
  reasons, routes, diffs, status log, redirect events, scrape runs, user, saved, history, child profile,
  consents, deletion requests, and `ops`.
- `useApp()` exposes `d` (data), `update(fn)` (mutate a draft then persist), `chat`, `send(text)`,
  `act(action)`, `reset()`, login helpers and `toast`.
- Persistence: `localStorage["wfk-demo-v1"]`. Seed version `v` mismatch -> reseed. Every visitor has an
  independent copy, so a shared Vercel link never mixes people's changes.
- `runTurn` returns `{ chat, llmCostRs, history? }`; the store applies cost to `ops.llmCalls/llmCostRs`
  and appends history only when signed in.

## Ops switches (Admin > Ops)

| Switch | Effect |
| --- | --- |
| Demo clock +N days (`clockOffsetDays`) | Time-travels evidence expiry, staleness, scraper dates |
| Model kill-switch (`llmDisabled`) | Typed turns that would call the model fall back to rules |
| Break adapter (`breakAdapter`) | Makes regression fail (simulated adapter bug) |
| Guest / signed-in turn cap | Tests the guard message and sign-in prompt |
| Reset demo data | Reseeds and clears the chat |
| Annotations, Inspector | UI explainers (top-bar toggles) |

## Run and verify

    npm install
    npm run dev
    npm run test:logic       # fast, no browser
    npm run build            # must be green before deploy

Deploy: push to GitHub and import in Vercel (no env vars, no config). Pages are `noindex`; use Vercel
Deployment Protection for a team-only link.

## Conventions

- Plain CSS in `app/globals.css`; no UI library. TypeScript strict.
- Dates in the demo are ISO strings and derive from `todayOf(d)` (never `new Date()` directly in logic), so
  time-travel works everywhere.
- Money in the demo is rupees (integers). Production is paise.
- When changing seed shape: bump `v` in `lib/seed.ts` and `KEY` in `lib/store.tsx`.

## Porting `lib/` to the real backend

| Demo | Production |
| --- | --- |
| `Data` in localStorage | Postgres (see `schema.sql`); `lib/*` functions take a repository instead of `Data` |
| `evidenceCurrent`, `visibility`, `publishGate` | `evidence_current`, `product_visible`, `publish_gate()` + trigger |
| in-process cache `Map` | in-process LRU keyed `version:date:slotKey` |
| `llmParse` simulated | real model call returning slot JSON, validated against lookup tables |
| fixture lookup fetch | `Fetcher` interface (undici, robots, rate limit, SSRF) |
| `runTurn` pure function | same, behind an API route; session caps from `session` table |
| fake login/consent | Auth.js Google + `consent_record` with client-defined verification |
