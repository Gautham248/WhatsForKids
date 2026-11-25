# CLAUDE.md: start here

This repo is a **clickable demo** of the "What's for Kids" discovery platform (a curated kids-product
catalogue with a chat front door). It is **dummy data only, no backend, no database, no API keys**.
All state lives in the browser (localStorage key `wfk-demo-v1`). Its purpose is to show designers and
engineers how the real system is meant to work, and to be a place to experiment with the logic before
it is rebuilt on Postgres.

The real system is a separate build (Next.js + Postgres + worker on one VPS). The logic in `lib/` is
deliberately plain TypeScript with no browser dependencies so it can be lifted into the real backend.

## Read these in order

| Doc | Read it to learn |
| --- | --- |
| `docs/01-overview.md` | What the product is, the two lanes, the money rule, the hard constraints |
| `docs/02-database.md` + `docs/schema.sql` | The production database design (latest), and how demo types map to tables |
| `docs/03-parser.md` | How a chat message becomes slots (implemented vs target design) |
| `docs/04-ranking-and-gate.md` | Filter/score/diversity, reason lines, evidence rule, publish gate, visibility |
| `docs/05-scraper.md` | Adapters, fixtures, regression, refresh/diff queue, safety guards |
| `docs/06-demo-internals.md` | File map, state model, Ops switches, how to run and test |
| `docs/07-experiments.md` | Concrete things to try, change and extend, with the files to touch |

## Commands

    npm install
    npm run dev          # http://localhost:3000
    npm run test:logic   # scripts/smoke.ts: parser, ranking, gate, scraper (no browser needed)
    npm run build        # must stay green

Node >= 20. Next 16, React 19, TypeScript, plain CSS. There is no test runner other than `tsx scripts/smoke.ts`.

## Rules for working in this repo

1. **Keep `lib/` pure.** No `window`, no React, no fetch inside `lib/parser.ts`, `rank.ts`, `gate.ts`,
   `chat.ts`, `scraper.ts`, `admin.ts`, `csv.ts`. Only `lib/store.tsx` touches the browser.
2. **Never store raw chat.** The `Slots` object is the only thing persisted about a conversation.
   Do not add a field that keeps the user's text.
3. **The model never writes user-visible text.** It returns slots only. Replies are templates in
   `lib/chat.ts`; card reasons are curated `ReasonLine` rows.
4. **No record, no line.** "What we checked" comes only from current evidence (`evidenceCurrent` in
   `lib/gate.ts`). Do not render a safety, material or developmental claim without an evidence row.
5. **Age band is curator-set, never scraped.** The scraper may *suggest* one; it must not set it.
6. **Controlled vocabulary.** Category, interest, band and budget values come from `lib/types.ts`.
   If you add one, update the parser dictionaries, seed data, and `docs/schema.sql` seed rows together.
7. **Run `npm run test:logic` and `npm run build` after any change in `lib/`.** Add a case to
   `scripts/smoke.ts` for any new behaviour.
8. If you change seed data shape, bump `v` in `lib/seed.ts` and the `KEY` in `lib/store.tsx` so existing
   browsers reseed.

## Known simplifications (do not mistake these for the design)

- The "LLM" in `llmParse` is a simulated normaliser (number words, typos, "bday", "turning N") in front of
  the same rules. Token counts and rupee cost are computed realistically; no API is called.
- The network fetch in the scraper is a lookup into saved fixture pages (`lib/fixtures.ts`).
- Google login, consent and every brand, photo and certificate are fake.
- Visibility, evidence expiry and staleness are derived on read from a demo clock (`ops.clockOffsetDays`).
  In production they are a DB view, a DB function and a nightly sweep.
- The demo vocabulary is 10 categories and 10 interests; production targets about 30-50 interest tags.
