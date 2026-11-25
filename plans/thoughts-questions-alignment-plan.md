# Feature plan: Align the demo with "Thoughts & Questions"

**Repository:** local / whats-for-kids-demo (no git)
**Requested by:** project developer
**Date:** 2026-11-25
**Source:** `docs/docs/Thoughts&Questions.md`

---

## What this feature does

Brings the clickable demo in line with every suggestion in the Thoughts & Questions doc, so designers, engineers and the client can see each proposed policy working, not just read about it. It fills the partial items and adds the missing ones: sponsored slot, several child profiles, shareable wishlist and personalisation tags.

**Deliberate departure from the doc (developer decision, 2026-11-25):** the doc suggests asking only for age. We keep asking for **all** missing details at once (age, budget, interests, gift or own, boy or girl) so the parent can answer in one message or one round of pill picks, not several chats. Gender is asked, but used only in reply wording, never in ranking or filtering.

**Branching:** all work happens on `feature/thoughts-questions`. `main` holds the baseline (the version deployed to whatsforkidsdemo.vercel.app).

## How it fits the existing codebase

- Chat turn logic and replies: `lib/chat.ts` (`runTurn`, `followUpGroups`, `respond`).
- Parsing: `lib/parser.ts` (`rulesParse`, `missingSlots`, `askFor`, advice intent).
- Retrieval, diversity, reason pick, relax options: `lib/rank.ts` (`search`, limit at line ~101).
- Publish gate, visibility, staleness: `lib/gate.ts` (`publishGate`, `visibility`, `STALE_DAYS`).
- Data model and seed: `lib/types.ts` (`Data`, `Ops`, `Product`, `ChildProfile`, `RedirectEvent`), `lib/seed.ts` (`v: 1`).
- Browser state: `lib/store.tsx` (`KEY = "wfk-demo-v1"`, the only file that touches localStorage).
- Pages: `app/page.tsx` (chat), `app/p/[id]/page.tsx` (product), `app/account/page.tsx` (child profile and consent), `app/saved/page.tsx`, `app/admin/ops/page.tsx`, `app/admin/events/page.tsx`, `app/admin/csv/page.tsx`, `app/admin/p/[id]/page.tsx`, `app/how-it-works/page.tsx`.
- Repo rules from `docs/CLAUDE.md` that bind this work: keep `lib/` pure; never store raw chat; the model never writes user-visible text; no record, no claim; controlled vocabulary changes go to parser + seed + `docs/docs/schema.sql` together; bump `v` in `lib/seed.ts` and `KEY` in `lib/store.tsx` when the seed shape changes; add a smoke case for every new behaviour.

## Implementation steps

Five phases. Each phase ends with `npm run test:logic` and `npm run build` green, and is small enough for its own session.

### 1. Chat: refine pills, results and replies (keeps "ask everything at once")

- **Keep the current asking behaviour.** One message names every missing detail and offers a pill group for each one (multi-select, one Apply), and typed text plus picked pills go in one turn. Age-missing replies keep asking for the other details alongside age.
- **Add an Occasion group** (birthday / festival / return gift) using the existing `occasion` slot, shown when it's a gift and no occasion is known.
- **Results count adjustable from Admin.** New `ops.limitSpecific` (default 3) and `ops.limitVague` (default 6) replace the hard-coded `3 : 6` in `lib/rank.ts`. Number inputs go in Admin → Ops.
- **No-match: relax one step at a time.** In `search`/`respond`: when nothing matches and a budget is set, retry with the next budget cap up (₹500 → ₹1,000 → ₹2,000 → ₹5,000). If that finds results, show them with "Nothing under ₹500 for this age. Here are options up to ₹1,000." Otherwise offer the existing one-tap relax pills (any category, any budget). The text is a template, never model-written.
- **Non-product questions: offer a related search.** Add a small fixed map in `lib/parser.ts` from advice topics to a safe search (for example sleep/bedtime → books, screen time → outdoor or puzzles, tantrums → sensory). The reply keeps the polite "I only help find products" line and adds one pill, such as "Bedtime books for 3–5". If age is unknown, the pill asks for age first.

### 2. Catalogue, curation and the product page

- **Count how often each product is shown.** New `Data.impressions: Record<productId, number>`, incremented in `runTurn` for each card shown. Product ids only, no slots or text. New Admin → Exposure panel (on the Ops page) shows:
  - the share of all impressions taken by the top 5 products, with a warning above a set limit (default 50%);
  - a catalogue-depth grid of age band × category with product counts, flagging cells below `ops.minPerCell` (default 3). This makes "repetition is a catalogue problem" visible.
- **Diversity.** Keep at most 2 per brand and 2 per category. The demo has no sub-category, so category stands in; the plan notes this rather than inventing sub-categories.
- **Publish gate: required fields from the doc.** Add gate checks in `lib/gate.ts` for **name and brand set** and **photo set**. Products use an emoji as the photo placeholder, so we add a `photo` field (a placeholder value in the seed) and leave one seeded product without one so the gate visibly blocks it.
- **Hide empty sections.** On `app/p/[id]/page.tsx`, Material, Pieces and Cleaning rows (and any expert-input block) are hidden when empty instead of showing "Not yet confirmed" / "Not listed".
- **"Ways to play" generated from the product type, labelled.** Add `Profile.playSource: "product" | "type"`. When it's `"type"`, the section is titled "General ideas for this kind of toy" with a one-line note. Admin product editing gets a "Fill from product type" button that inserts a fixed per-category template set as a draft. The admin still has to approve it, so the gate's "profile approved" check still applies.

### 3. Money, cost and limits

- **Spend cap that triggers itself, plus alerts.** New `ops.monthlyBudgetRs` and `ops.dailyCapRs`. In the store, after each turn's model cost:
  - at 50% / 80% / 100% of the daily cap, record an alert (shown as a banner on Admin → Ops and as a toast);
  - at 100%, set `llmDisabled` automatically, so the existing rules-only fallback takes over.

  The existing manual kill-switch stays.
- **Guest daily limit per device.** In `lib/store.tsx` only: a random device id plus a per-day counter of guest typed turns across chats, in localStorage. When it reaches `ops.guestDailyCap` (default 15), the guest is asked to sign in. Pills still work. `runTurn` stays pure: it gets the "device cap reached" flag as an input.
- **The three success numbers.** New `Data.chatSessions: { sessionId, startedAt, turns, clicks }[]` (coded counts only, no text), updated by the store. Admin → Events gets a summary row:
  - share of chats that ended in a click to a brand;
  - clicks per chat;
  - brand-reported sales.
- **Brand-reported sales.** Admin → CSV gets a "Brand sales report" import (columns: date, brand, product id, order ref, amount). Rows go to `Data.sales`, and Events shows sales count and value per product next to its clicks. These are reported by brands, not tracked by us, and the page says so.
- **Sponsored slot.**
  - Add `Product.sponsored?: { until: string }`, toggled in Admin → product.
  - `search` may put **at most one** sponsored product into a result set, at position 2, labelled **"Sponsored"** on the card.
  - Only products that already pass the publish gate, are visible, and match the parent's filters qualify. Payment can't add an unvetted or off-filter product, and the code and the How it works page both say so.
  - A smoke test proves a sponsored but unpublished product never appears.

### 4. Accounts and children's data

- **Several child profiles.** `Data.child` becomes `Data.children: ChildProfile[]`. Each profile has an id, an age band, interests, and a label picked from a fixed list ("Child 1", "Child 2"…), so there's no name field. One consent record covers the profiles, re-confirmed when a profile is added. Account page: add, delete each one, withdraw all. Chat: one "Use profile: Child 1 (3–5)" pill per profile. Bump `v` and `KEY`.
- **Shareable wishlist.**
  - A signed-in parent turns saved items into a wishlist with a preset title ("Birthday list", "Festival list", so no free text) and gets a share link at a new public route `/w/[code]`.
  - The code encodes only the product ids, so it works in any browser without a backend, because every browser seeds the same catalogue.
  - The page lists the products with "View at …" buttons, which log redirect events with `source: "wishlist"`.
  - "Mark as bought" is local-only in the demo; the page notes that the real build keeps it on the server.
- **Personalisation.**
  - Add `Product.personalisation?: string`, a curator-written note such as "Name printed on the lid, chosen on the brand's site".
  - Products with it show a "Can be personalised" badge on the card and the product page.
  - The refine groups get a "Can be personalised" pill, which needs a new `personalisable?: boolean` slot, added to the parser, seed and schema together.
  - We never collect the name ourselves: personalisation happens on the brand's site, and the product page says so.

### 5. Docs, How it works, and tests

- **Docs.** Update `docs/docs/03-parser.md` (gender policy, asking everything at once, related search, occasion pills), `docs/docs/04-ranking-and-gate.md` (adjustable limits, stepwise relax, sponsored rule, impressions, new gate checks), `docs/docs/06-demo-internals.md` (new state, Ops switches) and `docs/docs/schema.sql` (new columns and tables: product photo / sponsored / personalisation, impressions, chat sessions, sales reports, wishlists, multiple child profiles; seed rows for the new slot).
- **How it works.** `app/how-it-works/page.tsx` gets test entries for each new behaviour.

**Tests** (added to `scripts/smoke.ts`):

- **Asking (phase 1)**
  - Existing cases still pass: the follow-up names every missing detail, several pills apply in one turn, and text plus pills merge with the text winning.
  - The occasion group appears for "it's a gift" with no occasion, and not once an occasion is known.
  - "5 year old boy": gender is set but the results equal those for "5 year old".
- **Result limits**
  - `limitSpecific = 2` gives 2 results for age + category; `limitVague = 4` gives at most 4 for age only.
  - A limit of 0 or below is clamped to 1.
- **No-match steps**
  - "books under 300 for a 3 year old": shows ₹1,000 results with the "Nothing under ₹500… up to ₹1,000" wording, or relax pills if ₹1,000 is still empty.
  - Already at ₹5,000 with no results: relax pills only, with no further budget step.
- **Related search:** "my toddler has tantrums at bedtime" keeps the advice refusal and adds exactly one related-search pill. An unmapped advice topic gets no pill.
- **Impressions**
  - Each card shown adds 1; a reset chat doesn't reset the counts.
  - The top-5 share is computed correctly at 0 impressions (no divide by zero).
- **Gate:** a product with no photo fails "photo set"; a product with no brand fails "name and brand".
- **Spend cap**
  - At 49% no alert; at 50% one alert; repeated turns at 60% don't duplicate the 50% alert.
  - At 100%, `llmDisabled` turns on and the next typo message takes the rules path.
- **Guest device cap:** `runTurn` with the "device cap reached" flag returns the sign-in prompt and doesn't parse; a signed-in user is not affected.
- **Metrics:** 2 chats, one with 2 clicks: click share = 50%, clicks per chat = 1.0. With 0 chats, no NaN.
- **Sales import:** a valid CSV row is stored; a row with an unknown product id is rejected with its line number; an amount ≤ 0 is rejected.
- **Sponsored**
  - At most 1 sponsored item per result set, always labelled.
  - A sponsored product that is unpublished, stale, missing evidence or outside the filters never appears.
  - An expired `until` date is ignored.
- **Child profiles**
  - Two profiles give two profile pills; deleting one leaves the other.
  - Withdrawing consent deletes all profiles.
  - Old saved data with a single `child` is reseeded because of the `KEY` bump.
- **Wishlist**
  - Encode then decode gives back the same product ids.
  - A code with an unknown id skips that id; a malformed code shows "list not found" rather than crashing.
  - The decoded data contains no user or child data.
- **Personalisation:** "personalised name puzzle for a 4 year old" sets `personalisable`, and every result has a personalisation note.

## Files to change

| File | Change |
|---|---|
| `lib/chat.ts` | Occasion group; stepwise no-match reply; related-search pill; impression counting; profile pills per child; device-cap flag |
| `lib/parser.ts` | Advice → related-search map; parse `personalisable` |
| `lib/rank.ts` | Adjustable limits; next-budget-cap retry; sponsored slot; personalisation filter |
| `lib/gate.ts` | Name/brand and photo gate checks; sponsored eligibility helper |
| `lib/types.ts` | `Ops` limits/caps/alerts; `Product.photo/sponsored/personalisation`; `Profile.playSource`; `children[]`; `impressions`, `chatSessions`, `sales`, `wishlists`; `personalisable` slot |
| `lib/seed.ts` | Seed the new fields (one product without photo, one sponsored, two personalisable); bump `v` |
| `lib/store.tsx` | Bump `KEY`; device id and daily guest counter; spend alerts and auto kill-switch; chat-session counts; wishlist helpers |
| `lib/admin.ts` | Mutations for sponsored toggle, "fill from product type", sales import |
| `lib/csv.ts` | Brand sales report parser with row-level errors |
| `app/page.tsx` | Profile pill per child; sponsored and personalisation badges come through the cards |
| `components/bits.tsx` | "Sponsored" and "Can be personalised" badges on `ProductCard` |
| `app/p/[id]/page.tsx` | Hide empty sections; "General ideas" label; personalisation note |
| `app/account/page.tsx` | Multiple child profiles under one consent |
| `app/saved/page.tsx` | Create and share a wishlist from saved items |
| `app/admin/ops/page.tsx` | Result limits, spend caps and alerts, guest daily cap, exposure and catalogue-depth panel |
| `app/admin/events/page.tsx` | Chat share with a click, clicks per chat, brand-reported sales |
| `app/admin/csv/page.tsx` | Brand sales report import |
| `app/admin/p/[id]/page.tsx` | Sponsored toggle, personalisation note, "Fill from product type" |
| `app/how-it-works/page.tsx` | Test entries for every new behaviour |
| `scripts/smoke.ts` | The cases listed under Tests |
| `docs/docs/03-parser.md` | Gender policy, related search, occasion pills, personalisable slot |
| `docs/docs/04-ranking-and-gate.md` | Limits, stepwise relax, sponsored rule, impressions, gate checks |
| `docs/docs/06-demo-internals.md` | New state and Ops switches |
| `docs/docs/schema.sql` | New columns and tables, seed rows |

## Files to create

| File | Purpose |
|---|---|
| `app/w/[code]/page.tsx` | Public shareable wishlist page (decodes product ids, "View at …" buttons) |
| `lib/wishlist.ts` | Pure encode/decode of wishlist codes (product ids only) |

## Risks and open questions

- **Gender (decided).** Asked with the other missing details, used only in wording, never in ranking or filtering.
- **Personalisation (decided).** Products are tagged as personalisable by the curator; the name is entered on the brand's site, never collected by us.
- **Asking everything at once departs from the doc.** The doc warns that several questions up front feel like a form. We mitigate this because results are already shown with the questions, and one round of picks or one message answers them all.
- **Wishlist without a backend.** The share link works across browsers only because every browser seeds the same catalogue. "Bought" status can't sync between relatives in the demo.
- **Sponsored slot is a contract topic.** The demo shows the mechanism and the "no paying past the gate" rule; whether brands pay is the client's decision.
- **The `KEY` bump reseeds every browser,** including the live Vercel demo, so testers lose local edits once. This is expected per `docs/CLAUDE.md`.
- **Business decisions the demo can't make:** who curates and how many products a week; the minimum catalogue per age band × category (the grid only shows the gap); 0–14 vs 0–18 launch range (the demo stays 0–14); the launch brand list and platforms; who pays and the monthly ceiling (the demo has the inputs, the client picks the numbers); the contract list of claims needing proof.

## What this plan does NOT cover

- A real backend, database, email or SMS alerts, or real sales tracking. Everything stays in-browser with dummy data.
- Marketplace links (Amazon, Flipkart, FirstCry) or an Amazon API integration.
- Extending the age range past 14, or new evidence rules for gadgets.
- Real consent verification, real login, or real payment for sponsored placement.
- Redeploying to Vercel. That's a separate step after you've reviewed the changes locally.

---
> 📋 This plan was generated by an AI agent based on the current codebase.
> Verify file paths and assumptions before starting implementation.
