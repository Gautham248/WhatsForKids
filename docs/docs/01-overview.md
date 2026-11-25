# 01. Overview

## Product

A parent chats ("gift for my 4 year old niece who loves dinosaurs, under 1000") and gets 3-6 curated
product cards, each with an editorial reason line, a product page with a "What we checked" evidence
block, and a "View at brand" button. The platform does not sell anything. **Money comes only from the
click-out** (affiliate, referral or direct deal). The client owns accounts and pays bills after handoff.

Contract frame (for context when deciding scope): Schedule B (B1-B6) defines acceptance tests; Clause 3
governs changes. B2 = parent lane tests, B3 = curation and evidence tests, B4 = scraper tests,
B5 = privacy and provider register, B6 = operations. The demo's "How it works" page has a click-by-click
script per test.

## Two lanes that meet at the catalogue

    CURATION LANE (admin, slow, human-approved)
      brand URL / product URL / CSV
        -> scraper adapter (proposes factual fields only)
        -> admin review: profile, reason lines, evidence, age band, category, interests
        -> publish gate (hard checks)
        -> CATALOGUE

    PARENT LANE (fast, per turn)
      chat text or tap
        -> guards (length, turn caps, spend cap)
        -> rules parser / pill decoder  -> (small model only if rules cannot explain it)
        -> slots (coded values)
        -> filter + score + diversity over CATALOGUE
        -> templated reply + cards (reason line per card)
        -> product page -> /out/:id (logs redirect) -> brand site

The catalogue is the only shared thing. The parser and the scraper share **no code**; they share a
vocabulary (see `02-database.md`, "The shared vocabulary contract").

## Where an LLM is and is not used

| Use | When | Output |
| --- | --- | --- |
| Slot parsing | Per turn, only if rules cannot explain the message | Strict JSON, enum-validated slots |
| Profile drafting | Curation time | Draft text, labelled "AI draft", human-approved |
| Optional scraper suggestions | Curation time | Suggested category/tags/age band, never auto-applied |
| **Never** | Anything user-visible at query time | n/a |

Consequence: prompt injection can at worst produce a wrong slot, which the enum check drops.

## Hard constraints (design commitments, not preferences)

- **No raw chat stored**, anywhere: DB, analytics, error reports. Only coded slots and product IDs.
- **Child profile** = age band + controlled-vocabulary interests only. No names, no free text. DPDP s9(3)
  forbids tracking children, so it is not used for behavioural history or ads.
- **Consent** record stores notice version/hash, time and a pluggable `verification_method`. A tick box is
  not verifiable parental consent; the client sets the standard.
- **Evidence rule**: no record, no line. A restricted claim (safety cert, material, age suitability,
  developmental) renders only with a current approved evidence row.
- **Unsigned brands** get route `kind = none` with honest disclosure text. Revenue is zero until a deal exists.
- **Providers** (VPS, Cloudflare, object storage, Google login, model provider, optional Sentry) are listed
  in a register with purpose, fields, region, retention and deletion. Use paid model tiers; some free tiers
  train on inputs.
- **English only**, catalogue covers ages 0-14.

## Target production shape (for orientation)

One India-region VPS: Next.js web (Auth.js Google login), a worker (pg-boss queue, no Redis), Postgres 16
(pgvector installed but unused in V1), S3-compatible storage for evidence PDFs, photos and nightly dumps
(30-day lifecycle). Cloudflare free tier in front. In-process LRU cache. No third-party analytics.

## Success measures worth tracking (no raw text needed)

Share of turns handled by rules/pills vs model (target model <= ~20%), zero-slot parses, no-match rate,
click-out rate per session, redirect-to-published ratio, products suspended by sweep per week.
