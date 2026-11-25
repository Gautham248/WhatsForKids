# 04. Ranking, reasons, evidence and the publish gate

Files: `lib/rank.ts` (search), `lib/gate.ts` (rules), `lib/admin.ts` (stage moves). All pure TypeScript.

## Search pipeline (`search(d, slots, shown)` in `lib/rank.ts`)

1. **Visibility funnel.** Start from `visibility(d, p).visible` (published, evidence current for every asserted
   claim, refreshed within 30 days, active route). Each later filter appends a row to `funnel` (shown in
   the Inspector).
2. **Filters**: age overlap with the band (`overlapsBand`), `price <= budget cap`, `category ===`.
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
   - diversity: max 2 per brand and max 2 per category
   - limit: 3 results if age and category are both set, otherwise up to 6
5. **Reason pick** (`pickReason`): first approved `ReasonLine` for the product by priority:
   interest (matching slug) > gift (recipient gift or occasion) > budget > skill (category present) > age_fit
   > first approved. The text is curated; nothing is generated at query time.
6. **No-match**: if the filtered list is empty, test dropping budget and dropping category, and offer the
   relaxations that return at least one result ("Any budget (3 ideas)").

No gender filter exists, by design.

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

Eight checks; all must pass; **cannot be skipped by stage-skipping**:

1. Age band set  2. Price and as-of date  3. Source URL  4. Brand authorisation current
5. Editorial profile approved  6. >= 3 approved reason lines  7. Active purchase route + disclosure (> 10 chars)
8. Evidence for every asserted restricted claim

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
`RedirectEvent` (product, route kind, position, session id, coded slots) and then sends the visitor to
the brand URL. The destination is built server-side from the route, never taken from the client.
