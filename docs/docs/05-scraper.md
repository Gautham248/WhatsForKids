# 05. Scraper

Files: `lib/scraper.ts`, `lib/fixtures.ts`, `lib/csv.ts`; screens `app/admin/scraper`, `app/admin/diffs`,
`app/admin/csv`. In the demo the "network" is a lookup into saved pages; everything else mirrors the
design.

## Role

The scraper **proposes factual fields only**: name, price, currency, image, description, availability.
It never sets age band, category, interests, reason lines or evidence. Those are curator work (see
`02-database.md`). If a description says "Ages 3+", `scrapeUrl` returns it as `ageHint` (a suggestion).

## Pipeline

    admin: brand URL | product URL | CSV
      -> URL check (http/https only)
      -> SSRF guard (refuse localhost, 127., 10., 192.168., 169.254., [::1]; production also resolves DNS)
      -> brand lookup (host must match a brand)
      -> authorisation check (current row required; expired Banyan Books is blocked on purpose)
      -> robots.txt (demo disallows /cart /account /checkout /admin)
      -> rate limit (1 request/s per host)
      -> fetch (demo: fixture lookup)
      -> adapter (shopify | schema_org | csv | custom) -> Parsed
      -> required fields check
      -> snapshot -> diff vs last approved -> admin queue -> product update -> cache version bump

## Adapters (`runAdapter`)

| Platform | Reads | Notes |
| --- | --- | --- |
| `shopify` | product JSON (`title`, `variants[0].price`, `.available`, `images[0].src`, `body_html`) | simplest, do first |
| `schema_org` | `<script type="application/ld+json">` `Product` + `Offer` | OpenGraph fallback in production |
| `csv` | one row, header-driven | batch limit 100 per scrape batch in production |
| `custom` | per-site regexes (`bk-title`, `bk-price`, ...) | priced per site under Clause 3 |

`Parsed` = `{ name, price, currency, image, description, availability }`.
Required (proposed for B4): name, price, currency, URL, image. Everything else is best effort.

## Fixtures and regression (the B4 test)

- `FIXTURES` (10) are dated saved pages with an `expected` object. In the real repo they are files:
  `fixtures/<site>/<yyyy-mm-dd>/{page.html, meta.json, expected.json}`; fixtures are immutable and a
  re-capture is a **new dated folder**.
- `regression(broken)` runs every adapter against every fixture and compares to `expected`. CI fails on any
  difference. **Unchanged fixture failing = Defect (B4). Live-site drift is not a Defect**; run a separate
  non-blocking weekly job against live pages that alerts on drift.
- The Ops/Scraper screens have `breakAdapter` to simulate a regression (Shopify price read as paise,
  schema.org currency blank) and show the failure.

## Refresh and approval (`refreshBrand`, `approveDiff`)

Weekly per brand in production. Per product:

- HTTP != 200 -> if published, auto-suspend with reason ("Dead page ... auto-suspended"), log it, bump version.
- price differs from live -> create a `price` Diff (**pending**); the **old approved value stays live** with its
  "as of" date until approved. Same for availability.
- nothing changed -> only `lastCheckedAt` updates. Not refreshed for 30 days -> hidden/suspended.
- `approveDiff(d, id, true)` writes the new price and sets `priceAsOf` to today; rejecting leaves it.

## Guard rails to keep

- Treat scraped text as data. If an LLM is later used to *suggest* category/interests/age band, pass the text
  in delimiters, validate output against the vocabulary, label it "AI draft", and never auto-apply.
- Admin-supplied URLs are fetched by the server, hence the SSRF guard. Keep the allowlist of schemes.
- Honest user agent with a contact URL, ETag/If-Modified-Since conditional GET, 10 s timeout, 2 MB cap,
  redirect limit (production fetcher defaults, `scrape_site.fetch_limits`).
- A hosted fetcher (for example Olostep) or a headless browser can sit behind the same `Fetcher` interface
  for a JS-only site, priced as a custom adapter. It does not replace the authorisation check.

## CSV import/export (`lib/csv.ts`)

`parseCsv` handles quotes and embedded newlines. `toCsv` prefixes cells starting with `= + - @` with `'`
(formula injection). The admin CSV screen shows a round trip. Columns: see `02-database.md`.

## Adding an adapter (checklist)

1. Add the platform to `Platform` in `lib/types.ts` (and `platform_type` enum in `schema.sql`).
2. Add a branch in `runAdapter`.
3. Add >= 2 fixtures (listing + product page) to the `specs` in `lib/fixtures.ts` with `expected`.
4. Run `npm run test:logic` (regression must pass; `regression(true)` should still show failures).
5. Add the brand + authorisation in `lib/seed.ts` so `scrapeUrl` can find it.
