# 02. Database design (latest: v1.1)

Target: Postgres 16. The full DDL is `docs/schema.sql` (loads cleanly; the checks in
`docs/07-experiments.md` exercise the gate, sweep and constraints). The demo has no database; its
`Data` type in `lib/types.ts` is the in-memory equivalent. This doc explains the design and the mapping.

## Principles

1. **Parser and catalogue speak one vocabulary.** Lookup tables (`age_band`, `budget_cap`, `category`,
   `interest_tag`, `occasion`) are the single source. The parser emits slugs from them, products are
   tagged with slugs from them. If either side drifts you get silent zero-result searches.
2. **Raw is separate from curated.** `scrape_snapshot` holds messy immutable extraction and is never read
   by the parent lane. `product` is the clean curated record. A scrape changes `product` only through an
   approved `scrape_diff` or a curator edit.
3. **Matching fields are human-set.** `category_slug`, `age_min/max_months`, `product_interest`,
   reason lines and profiles are curator work. The scraper fills factual fields only (name, price, image,
   description, availability).
4. **Coded only for anything about parents.** `history_entry.slots` and `redirect_event.slots` are
   `jsonb` guarded by `slots_are_coded()`: only the keys `age, category, budget, interests, recipient,
   occasion` are allowed and the value must be under 1 KB. A row containing raw text fails the CHECK.
5. **Rules live in the database.** The publish gate is a trigger-backed function, evidence validity is a
   view, visibility is a view, and expiry is a sweep function. They mirror `lib/gate.ts` so the demo is
   a readable spec for them.

## Entity map

    VOCABULARY   age_band  budget_cap  category  interest_tag  occasion
    PEOPLE       app_user  consent_record  child_profile(+_interest)  saved_item  history_entry  deletion_request
    FILES        asset
    CATALOGUE    brand  brand_authorisation  product  product_interest  product_occasion  product_status_log
    EDITORIAL    editorial_profile  reason_line  evidence   (views: editorial_profile_current, evidence_current)
    COMMERCIAL   purchase_route
    EVENTS       session  redirect_event  llm_usage
    SCRAPER      scrape_site  scrape_fixture  scrape_run  scrape_snapshot  scrape_diff
    PLUMBING     audit_log  catalogue_state (version counter for cache keys)
    VIEWS        product_age_band  product_visible  evidence_current  editorial_profile_current

## Demo type to table mapping

| Demo (`lib/types.ts`) | Table / column | Notes |
| --- | --- | --- |
| `Band`, `BAND_MONTHS` | `age_band` | 5 rows. 13+ means 13-14 years (156-179 months) |
| `BudgetCap` | `budget_cap` | 500, 1000, 2000, 5000. Parser maps a stated number to the largest cap <= it |
| `CATEGORIES` | `category` | `synonyms` replaces `CAT_WORDS` in `lib/parser.ts` |
| `INTERESTS` | `interest_tag` | `synonyms` replaces `INT_WORDS`. Production: ~30-50 tags |
| `Occasion` | `occasion` | birthday, festival, return_gift |
| `Recipient` | `recipient_kind` enum | Only exists as a slot, not on products |
| `Slots` | `jsonb` guarded by `slots_are_coded` | Never any other key |
| `Brand` | `brand` + `brand_authorisation` | Demo inlines `authorisation`; production keeps history of letters |
| `Product.price` (rupees) | `product.price_paise` | Multiply by 100 |
| `Product.ageMin/ageMax` | `age_min_months/age_max_months` | Same unit |
| `Product.interests` | `product_interest` | join table |
| `Product.giftable` | `product.giftable` (+ optional `product_occasion`) | Used for the +8 gift score |
| `Product.boost` | `product.curator_boost` | 0-10 |
| `Product.availability` | `availability_note` | Text "as researched" |
| `Product.live` | not stored | Demo-only: what the fake brand page currently says |
| `Product.lastCheckedAt` | `product.last_checked_at` | Drives the 30-day staleness rule |
| `Status` / `STAGES` | `product_status` enum + `product_status_log` | `skipped_reason` required when a stage is skipped |
| `Evidence` | `evidence` | `status` pending/approved/rejected; `expires_on` null = never |
| `Profile` | `editorial_profile` | Versioned; only latest approved renders |
| `ReasonLine` | `reason_line` | `approved` boolean becomes `approved_at IS NOT NULL` |
| `Route` | `purchase_route` | One active route per product (partial unique index) |
| `Diff` | `scrape_diff` | price and availability only in V1 |
| `StatusLog` | `product_status_log` | |
| `RedirectEvent` | `redirect_event` | |
| `HistoryEntry` | `history_entry` | |
| `ChildProfile`, `Consent` | `child_profile(+_interest)`, `consent_record` | `verification_method` is pluggable |
| `ScrapeRun` | `scrape_run` | Demo keeps free-text `lines`; production keeps status and fields found |
| `Ops` | `llm_usage`, `catalogue_state`, config | Clock offset, kill-switch toggles are demo-only |

## The shared vocabulary contract (most important rule)

- A slot value is valid only if it exists in the lookup table. Validate model output against the tables
  (the enum check in `llmParse` in production; `slots_are_coded` guards storage).
- Adding an interest tag is a **three-part change**: row in `interest_tag` (with synonyms), the parser
  dictionary loads from it, and products get re-tagged. Changing a slug later means re-tagging and
  re-running the parser golden set, so get the vocabulary signed off by the client early.
- Category is one value per product (single category slot). Interests are many-to-many, max 2 per query.

## Search query (what the parent lane runs)

Filters first, scoring in app code (see `docs/04-ranking-and-gate.md`). The shape:

```sql
SELECT p.id, p.category_slug, p.price_paise, p.curator_boost, p.giftable,
       p.age_min_months, p.age_max_months, p.brand_id,
       COALESCE(i.hits, 0) AS interest_hits
FROM product_visible p
LEFT JOIN LATERAL (
  SELECT count(*) AS hits FROM product_interest pi
  WHERE pi.product_id = p.id AND pi.interest_slug = ANY($interests)
) i ON true
WHERE p.age_min_months <= $band_max AND p.age_max_months >= $band_min        -- overlap with the age band
  AND ($budget_cap IS NULL OR p.price_paise <= $budget_cap * 100)
  AND ($category   IS NULL OR p.category_slug = $category);
```

Cache key: `catalogue_state.version + current_date + normalised slot tuple` (see `slotKey` in
`lib/parser.ts`). The version bumps on any product, evidence, route or reason-line change. Do not cache by
raw message text.

At this scale no search engine, no embeddings and no GIN are needed: the btree
`product_search_idx` (partial, `status = 'published'`) plus the join table is enough. Revisit pgvector
only if logs show many "interest not in vocabulary" parses.

## Evidence rule in SQL

- `evidence_current` view = approved and not expired. The product page's "What we checked" block reads
  only this view.
- `asserted_claims(pid)` = `age_suitability` always, `material` if material present, `safety_cert` and
  `developmental` if keyword lists match the product text or approved profile (same regexes as
  `SAFETY_RE`/`DEV_RE` in `lib/gate.ts`).
- `missing_evidence(pid)` = asserted claims with no current evidence row.
- `publish_gate(pid)` returns 9 checks (age, price, url, category, authorisation, profile, >= 3 reason
  lines, active route + disclosure, evidence). `BEFORE UPDATE OF status` trigger blocks any move to
  `published` that fails. It cannot be skipped by an admin screen, only fixed.
- `sweep_catalogue()` (nightly, worker) suspends published products that fail visibility (stale > 30 days,
  no active route, evidence missing/expired), writes `product_status_log`, and returns ids so the CDN
  cache can be purged.

**Known difference from the demo:** the demo hides such products on read (so time travel is reversible);
production suspends them with a reason, so republishing must pass the gate again. Also the demo gate has
8 checks (no separate `category` check); the SQL adds one.

## CSV import/export contract (catalogue loadable without the scraper)

Columns: `id` (blank for new), `brand`, `source_url`, `name`, `price_inr`, `price_as_of`, `category`,
`age_min_months`, `age_max_months`, `interests` (pipe-separated slugs), `material`, `pieces`,
`availability_note`, `short_description`, `giftable`, `curator_boost`. Validate every slug against the
lookup tables, reject unknown ones with row numbers. Batch limit 500 rows. Export includes `id` so a round
trip updates rather than duplicates. Export prefixes cells starting with `=`, `+`, `-`, `@` to prevent
spreadsheet formula injection (see `toCsv` in `lib/csv.ts`).

## Privacy-related behaviour

- Account deletion cascades all user tables (`ON DELETE CASCADE`) and records a `deletion_request`
  (no FK, because the user row is gone). Backups age out within 30 days; say so in the confirmation.
- `redirect_event` and `history_entry` hold coded slots only. `session` holds salted, daily-rotating hashes
  used only for caps.
- Evidence documents are private objects (`asset.storage_key`), served by signed URL only.

## Not designed yet (deliberately)

Sale/order tracking, sponsored placement, wishlists, multilingual content, realtime stock, SEO landing
pages. All are priced changes under Clause 3.
