# 04. Ranking, reasons, evidence and the publish gate

Files: `lib/rank.ts` (search), `lib/gate.ts` (rules), `lib/admin.ts` (stage moves). All pure TypeScript.

## Search pipeline (`search(d, slots, shown)` in `lib/rank.ts`)

1. **Visibility funnel.** Start from `visibility(d, p).visible` (published, evidence current for every asserted
   claim, refreshed within 30 days, active route). Each later filter appends a row to `funnel` (shown in
   the Inspector).
2. **Filters**: age overlap with the band (`overlapsBand`), `price <= budget cap`, personalisable (only
   products with a `personalisation` note, when the slot is set), `category ===`. Gender is never a filter.
3. **Score** (`score()`), all additive and visible in `parts`:

   | Part | Points |
   | --- | --- |
   | category match | +40 |
   | each matching interest | +15 |
   | age fit | up to +20, minus 1 per 6 months between band midpoint and product midpoint |
   | price fit | `round(price / cap * 10)` (closer to the cap = more substantial) |
   | gift | +8 when recipient is gift and product `giftable` |
   | curator boost | 0-10 |

   Sort by score then id (deterministic). Keep top 20 and **cache** under
   `v<catalogueVersion>:<today>:<slotKey>`.
4. **Serve-time steps (not cached, so the cache is shareable across sessions):**
   - "already shown" demotion: -30 for ids in `chat.shown`
   - diversity: max 2 per brand; max 2 per category only when the parent did not ask for a category
     (otherwise a specific request could never fill 3 slots)
   - limit: `ops.limitSpecific` (default 3) if age and category are both set, otherwise `ops.limitVague`
     (default 6). Both set in Admin > Ops, clamped 1–12; older saved data falls back to the defaults
   - **sponsored slot**: at most one product with a current `sponsored.until`, inserted at position 2,
     chosen only from the already-filtered list (visible, evidence current, matches age/budget/category/
     personalisable). Payment buys position, never entry. If the sponsored product already ranks on merit,
     no paid slot is used. Switch: `ops.sponsoredOn`. The card shows a "Sponsored" badge
5. **Reason pick** (`pickReason`): first approved `ReasonLine` for the product by priority:
   interest (matching slug) > gift (recipient gift or occasion) > budget > skill (category present) > age_fit
   > first approved. The text is curated; nothing is generated at query time.
6. **No-match, one step at a time** (`respond` in `lib/chat.ts`): if a budget is set, first retry with the
   next cap up and, if that finds results, show them as "Nothing under ₹500 for … Here are options up to
   ₹1,000." (the budget slot moves to the new cap). Only if that is empty too, offer the relaxations from
   `search` that return at least one result: any budget, any category, not just personalisable.
7. **Impressions** (`countImpressions`, `exposure`): every product put on a chat card is counted
   (`runTurn` returns `shownIds`; the store adds them to `impressions`). Admin > Ops shows the top-5 share
   (warns above `ops.exposureWarnPct`, default 50%) and live products per age band × category, highlighting
   cells below `ops.minPerCell` (default 3). Product ids and counts only.

No gender filter or gender score exists, by design (a smoke test asserts identical results with and without it).

Production differences: the cache is an in-process LRU of ids; scoring can stay in app code over a small
SQL result (see `02-database.md` for the query); `catalogue_state.version` replaces `ops.catalogueVersion`.

## Certification questions (`certSearch`)

"ISI certified wooden toys for a 2 year old" is answered **only** from current evidence rows. A safety
word (isi/bis/certified...) matches any current `safety_cert` evidence; other tokens (e.g. "gots") must
appear in `claimText`. If nothing matches, the reply says it does not hold a current evidence record. Never
answer a certification question from product copy.

## Evidence rule: "no record, no line"

- `evidenceCurrent(d, productId)` = approved and (no expiry or expiry >= today). The product page's
  "What we checked" block renders from this and nothing else.
- `assertedClaims(product, profile)`: `age_suitability` always; `material` if `material` present;
  `safety_cert` and `developmental` if the keyword lists hit the short description or approved profile text.
  - `SAFETY_RE`: isi, bis, certified, certification, non-toxic, BPA-free, safety-tested, lead-free, child-safe
  - `DEV_RE`: develops, improves, boosts, enhances, builds fine/gross, helps your child learn/develop
  - It also returns `lint[]` (claim, where, match) so the approver sees why a claim was flagged.
- A claim in the copy with no current evidence makes the product fail the gate (to publish) or become
  invisible (if already published).

## Publish gate (`publishGate`, `gatePasses`)

Ten checks; all must pass; **cannot be skipped by stage-skipping**:

1. Name and brand set  2. Photo set  3. Age band set  4. Price and as-of date  5. Source URL
6. Brand authorisation current  7. Editorial profile approved  8. >= 3 approved reason lines
9. Active purchase route + disclosure (> 10 chars)  10. Evidence for every asserted restricted claim

Seeded example: Felt fairy wings has no photo, so check 2 fails. Scraped products take the image the
adapter found.

## Thin products

- Material, pieces and cleaning rows are hidden on the product page when empty (no "Not listed").
- `Profile.playSource`: `"type"` means the play ideas came from the product type (`playForType`), and the
  page labels them "General ideas for this kind of toy". Admin "Fill from product type" drafts them; the
  profile returns to draft and still needs approval. Hand-written ideas are `"product"`.
- `Product.personalisation`: curator note shown as a "Can be personalised" badge and section. The name is
  chosen on the brand's site; we never collect it.

`moveTo(d, id, to, reason, actor)` in `lib/admin.ts`: moving to `published` runs the gate; skipping stages
(for example discovered -> evidence_check) requires a non-empty reason (B3); suspending records the reason;
every move appends a `StatusLog` and bumps `catalogueVersion`.

## Visibility and time

`visibility(d, p)` is derived on read from the demo clock (`nowOf`, `todayOf`, `ops.clockOffsetDays`):
not published (with reason), missing/expired evidence per asserted claim, stale (> `STALE_DAYS` = 30 days
since `lastCheckedAt`), no active route. Use Admin > Ops "+N days" buttons to time-travel and watch products
drop out of search. Seeded examples: the rainbow stacker's ISI evidence expires about 26-30 days out
("ISI-marked." in its description makes lint assert the claim); the dino puzzle goes stale at +10 days;
the drum set stays visible at +26.

## Purchase routes and click-out

`Route.kind` is `affiliate | referral | direct | none`. Unsigned brands use `none` with honest disclosure
(`disclosureFor` in `lib/seed.ts`). The product page button goes to `/out/[id]`, which records a
`RedirectEvent` (product, route kind, position, session id, chat id, source `chat` or `wishlist`, coded
slots; wishlist clicks carry no chat id and no slots) and then sends the visitor to the brand URL.

## Success numbers and money (`lib/admin.ts`, `lib/csv.ts`)

- `chatMetrics(d)`: share of chats ending in a brand click, clicks per chat, brand-reported sales, per
  product clicks vs sales. A chat is one conversation (`chatSessions`: id + turn count only).
- `parseSalesCsv(text, d)`: brand sales report import (`date,brand_id,product_id,order_ref,amount_inr`);
  each bad row is rejected with its line number (bad date, unknown brand/product, product not that brand's,
  amount <= 0, duplicate order ref).
- `recordSpend(d, costRs)`: model spend per demo day; alerts once at 50/80/100% of `ops.dailyCapRs` and
  `ops.monthlyBudgetRs`; 100% sets `llmDisabled`, so chat falls back to the free rules parser. The destination is built server-side from the route, never taken from the client.
