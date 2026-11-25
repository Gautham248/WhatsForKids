# What's for Kids: clickable demo

A demo of how the Kids Discovery Platform is meant to work, for designers and engineers.
**Everything is dummy data.** No backend, no database, no API keys, no environment variables.
Each visitor's state lives in their own browser (localStorage), so a shared Vercel link never
mixes people's changes. Admin > Ops > "Reset demo data" restores the seed.

## Deploy to Vercel

Option A (recommended): push this folder to a GitHub repo, then in Vercel choose
"Add New > Project", import the repo and press Deploy. Framework preset is detected as Next.js.
Leave all settings at their defaults.

Option B: from this folder run `npx vercel` (and `npx vercel --prod` to promote).

Sharing: the pages are marked `noindex`, but the URL is public by default. For a team-only link,
turn on Vercel Authentication or Password Protection for the project (Project > Settings >
Deployment Protection).

## Run locally

    npm install
    npm run dev        # http://localhost:3000
    npm run build && npm start
    npm run test:logic # smoke test of parser, ranking, gate, scraper (no browser needed)

## For engineers and coding agents

Start with `CLAUDE.md`, then `docs/` (overview, database design + `schema.sql`, parser, ranking and gate,
scraper, demo internals, experiments).

## What to look at

Open **How it works** in the top bar. It has the two-lane diagram, a "real vs faked" table,
a click-by-click script for every Schedule B acceptance test, and a cost sketch.
Two toggles in the top bar help explain the screens:

- **Annotations**: dashed callouts saying where each piece of UI gets its data.
- **Inspector** (Chat page): the pipeline on every turn (rules or model path, parsed slots,
  cache key, filter funnel, scores, reason pick, cost).

## Where the logic lives

| File | What it does |
| --- | --- |
| `lib/types.ts` | Types, age bands, categories, interests (controlled vocabulary) |
| `lib/seed.ts`, `lib/fixtures.ts` | All dummy data: brands, products, evidence, profiles, scraper fixtures |
| `lib/parser.ts` | Rules parser, simulated model parser, slot merge and cache key |
| `lib/rank.ts` | Filters, scoring, diversity, reason pick, no-match relaxations, in-process cache |
| `lib/chat.ts` | One pure function per chat turn (guards, parse, respond) |
| `lib/gate.ts` | Demo clock, `evidence_current`, claim lint, publish gate, visibility |
| `lib/scraper.ts` | Adapters (Shopify, schema.org, CSV, custom), regression, refresh, diffs |
| `lib/store.tsx` | Browser-side state and persistence |
| `app/**` | Screens: chat, product, saved, history, account, admin, how-it-works |

To change what the demo shows, edit `lib/seed.ts` (the `PRODUCTS` list) and bump `v` in the
seed and in `lib/store.tsx` if you want existing browsers to reseed.

## What is simulated

The model call (a normaliser in front of the same rules, with real token and cost maths),
the network fetch (looked up from saved sample pages), Google sign-in (fake chooser),
parental consent (tick box placeholder) and every brand, photo and certificate.
