-- What's for Kids: production database schema (Postgres 16), design v1.1
-- This is the target the demo's `lib/types.ts` maps onto. See docs/02-database.md.
--
-- Conventions
--   * uuid primary keys (gen_random_uuid is built in from PG13), timestamptz everywhere
--   * money in paise (integer). The demo stores rupees; multiply by 100 when lifting data.
--   * controlled vocabularies are lookup tables (editable by admin), fixed state machines are PG enums
--   * NO table stores raw chat text. Chat is persisted only as coded slot JSON, enforced by CHECKs.
--
-- Validated by loading into PGlite (real Postgres in WASM) and running the checks in docs/07-experiments.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Enums (fixed state machines and small closed sets)
-- ---------------------------------------------------------------------------
CREATE TYPE platform_type   AS ENUM ('shopify', 'schema_org', 'csv', 'custom');
CREATE TYPE product_status  AS ENUM ('discovered', 'screened', 'selected', 'evidence_check',
                                     'expert_review', 'commercial_onboarding', 'published', 'suspended');
CREATE TYPE claim_type      AS ENUM ('safety_cert', 'material', 'age_suitability', 'developmental');
CREATE TYPE evidence_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE profile_state   AS ENUM ('draft', 'approved');
CREATE TYPE reason_tag      AS ENUM ('gift', 'age_fit', 'budget', 'skill', 'interest');
CREATE TYPE route_kind      AS ENUM ('affiliate', 'referral', 'direct', 'none');
CREATE TYPE route_status    AS ENUM ('active', 'inactive');
CREATE TYPE diff_field      AS ENUM ('price', 'availability');
CREATE TYPE diff_status     AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE recipient_kind  AS ENUM ('own', 'gift');
CREATE TYPE user_role       AS ENUM ('parent', 'curator', 'approver', 'owner');

-- ---------------------------------------------------------------------------
-- 1. Shared vocabulary (THE contract between parser and catalogue)
--    Parser emits these slugs; products are tagged with these slugs; nothing else is valid.
--    `synonyms` feeds the parser dictionary (lib/parser.ts CAT_WORDS / INT_WORDS in the demo).
-- ---------------------------------------------------------------------------
CREATE TABLE age_band (
  slug        text PRIMARY KEY,                 -- '0-2','3-5','6-8','9-12','13+'
  label       text NOT NULL,
  min_months  int  NOT NULL,
  max_months  int  NOT NULL,
  sort        int  NOT NULL UNIQUE,
  CHECK (min_months >= 0 AND max_months > min_months)
);

CREATE TABLE budget_cap (
  cap_inr  int PRIMARY KEY,                     -- 500, 1000, 2000, 5000. Parser maps a stated number to the
  label    text NOT NULL                        -- largest cap <= that number (min 500; >= 5000 -> 5000)
);

CREATE TABLE category (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  parent_slug text REFERENCES category(slug),
  synonyms    text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE interest_tag (
  slug      text PRIMARY KEY,
  name      text NOT NULL,
  synonyms  text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE occasion (
  slug  text PRIMARY KEY,                       -- birthday, festival, return_gift
  name  text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}'
);

-- Slot keys allowed anywhere slots are stored. Keep in sync with `Slots` in lib/types.ts.
CREATE FUNCTION slots_are_coded(s jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(s) = 'object'
     AND (s - ARRAY['age','category','budget','interests','recipient','occasion','gender','personalisable']) = '{}'::jsonb
     -- gender ('boy'|'girl') only words replies; it is never a filter or a ranking input.
     AND (NOT s ? 'gender' OR s->>'gender' IN ('boy','girl'))
     AND (NOT s ? 'personalisable' OR jsonb_typeof(s->'personalisable') = 'boolean')
     AND pg_column_size(s) < 1024            -- a coded slot object is tiny; blocks smuggling free text
$$;

-- ---------------------------------------------------------------------------
-- 2. Users, consent, assets
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub  text NOT NULL UNIQUE,
  email       text NOT NULL,
  name        text,
  role        user_role NOT NULL DEFAULT 'parent',   -- staff roles come from an allowlist
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE asset (                                -- evidence PDFs, product photos, authorisation letters
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('evidence_pdf', 'photo', 'authorisation')),
  storage_key  text NOT NULL UNIQUE,                -- private bucket key; served by signed URL only
  mime         text NOT NULL,
  bytes        bigint NOT NULL,
  sha256       text NOT NULL,
  uploaded_by  uuid REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_record (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  notice_version      text NOT NULL,
  notice_text_hash    text NOT NULL,
  given_at            timestamptz NOT NULL DEFAULT now(),
  verification_method text NOT NULL DEFAULT 'declaration',  -- pluggable: client defines the standard
  verification_ref    text,
  withdrawn_at        timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. Catalogue
-- ---------------------------------------------------------------------------
CREATE TABLE brand (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  url        text NOT NULL,
  platform   platform_type NOT NULL,
  terms      text NOT NULL DEFAULT '',              -- commercial terms summary (affiliate, referral, none)
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brand_authorisation (                  -- scraper refuses any brand without a current row
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  document_asset_id  uuid REFERENCES asset(id),
  scope_prefixes     text[] NOT NULL DEFAULT '{}',  -- URL prefixes covered
  granted_on         date NOT NULL,
  expires_on         date NOT NULL,
  recorded_by        uuid REFERENCES app_user(id),
  CHECK (expires_on > granted_on)
);

CREATE TABLE product (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          uuid NOT NULL REFERENCES brand(id),
  source_url        text NOT NULL UNIQUE,
  name              text NOT NULL,
  price_paise       integer NOT NULL CHECK (price_paise > 0),
  price_as_of       date NOT NULL,
  photo_asset_id    uuid REFERENCES asset(id),
  category_slug     text REFERENCES category(slug),        -- curator-set
  age_min_months    integer,                               -- curator-set, NEVER scraped
  age_max_months    integer,
  material          text NOT NULL DEFAULT '',
  pieces            text NOT NULL DEFAULT '',
  availability_note text NOT NULL DEFAULT '',
  cleaning          text NOT NULL DEFAULT '',
  short_description text NOT NULL DEFAULT '',
  giftable          boolean NOT NULL DEFAULT false,
  curator_boost     smallint NOT NULL DEFAULT 0 CHECK (curator_boost BETWEEN 0 AND 10),
  personalisation_note text,                               -- curator-set, e.g. 'Name printed on the lid, chosen on the brand''s site'. NULL = not personalisable. We never collect the name.
  sponsored_until   date,                                  -- paid placement window. Buys position 2 only; the product must still be visible and match the search.
  status            product_status NOT NULL DEFAULT 'discovered',
  last_checked_at   timestamptz NOT NULL DEFAULT now(),
  suspended_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (age_min_months IS NULL OR age_max_months IS NULL OR age_max_months > age_min_months),
  CHECK (age_min_months IS NULL OR age_min_months >= 0),
  CHECK (status <> 'suspended' OR suspended_reason IS NOT NULL)
);

CREATE TABLE product_interest (
  product_id    uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  interest_slug text NOT NULL REFERENCES interest_tag(slug),
  PRIMARY KEY (product_id, interest_slug)
);
CREATE INDEX product_interest_by_tag ON product_interest (interest_slug, product_id);

CREATE TABLE product_occasion (
  product_id    uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  occasion_slug text NOT NULL REFERENCES occasion(slug),
  PRIMARY KEY (product_id, occasion_slug)
);

CREATE TABLE product_status_log (
  id             bigserial PRIMARY KEY,
  product_id     uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  from_status    product_status,
  to_status      product_status NOT NULL,
  actor_id       uuid REFERENCES app_user(id),
  at             timestamptz NOT NULL DEFAULT now(),
  skipped_reason text                                   -- required when a stage is skipped (B3)
);

-- Which age bands does a product overlap? (parser slot `age` is a band slug)
CREATE VIEW product_age_band AS
SELECT p.id AS product_id, b.slug AS band_slug
FROM product p
JOIN age_band b
  ON p.age_min_months <= b.max_months AND p.age_max_months >= b.min_months;

-- Search hot path
CREATE INDEX product_search_idx
  ON product (category_slug, age_min_months, age_max_months, price_paise)
  WHERE status = 'published';
CREATE INDEX product_status_idx ON product (status);

-- ---------------------------------------------------------------------------
-- 4. Editorial and evidence
-- ---------------------------------------------------------------------------
CREATE TABLE editorial_profile (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  state          profile_state NOT NULL DEFAULT 'draft',
  intro          text NOT NULL DEFAULT '',
  points         jsonb NOT NULL DEFAULT '[]',           -- 3 x {title, body}
  play_ideas     jsonb NOT NULL DEFAULT '[]',           -- 3 x {title, prompt}
  play_source    text NOT NULL DEFAULT 'type' CHECK (play_source IN ('product','type')),  -- 'type' renders as "General ideas for this kind of toy"
  why_picked     text NOT NULL DEFAULT '',
  best_for_band  text REFERENCES age_band(slug),
  source_labels  jsonb NOT NULL DEFAULT '{}',           -- per section: 'AI draft' | 'Curator' | 'Brand page'
  drafted_by     text NOT NULL,                         -- 'llm:<model>' or user id
  approved_by    uuid REFERENCES app_user(id),
  approved_at    timestamptz,
  UNIQUE (product_id, version),
  CHECK (state <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE VIEW editorial_profile_current AS               -- only the latest approved version renders
SELECT DISTINCT ON (product_id) *
FROM editorial_profile
WHERE state = 'approved'
ORDER BY product_id, version DESC;

CREATE TABLE reason_line (                              -- card reason is chosen from these; never generated
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  tag           reason_tag NOT NULL,
  interest_slug text REFERENCES interest_tag(slug),
  text          text NOT NULL,
  approved_by   uuid REFERENCES app_user(id),
  approved_at   timestamptz,
  CHECK (tag <> 'interest' OR interest_slug IS NOT NULL)
);
CREATE INDEX reason_line_by_product ON reason_line (product_id) WHERE approved_at IS NOT NULL;

CREATE TABLE evidence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  claim_type         claim_type NOT NULL,
  claim_text         text NOT NULL,
  document_asset_id  uuid REFERENCES asset(id),
  issued_on          date NOT NULL,
  expires_on         date,                                -- null = does not expire
  approver_id        uuid REFERENCES app_user(id),
  approved_at        timestamptz,
  status             evidence_status NOT NULL DEFAULT 'pending',
  CHECK (status <> 'approved' OR (approver_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX evidence_by_product ON evidence (product_id, claim_type);

-- THE source for the "What we checked" block. The template has no other data source.
CREATE VIEW evidence_current AS
SELECT * FROM evidence
WHERE status = 'approved' AND (expires_on IS NULL OR expires_on >= current_date);

-- ---------------------------------------------------------------------------
-- 5. Commercial
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_route (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  url             text NOT NULL CHECK (url ~ '^https?://'),   -- built server-side; client never supplies it
  kind            route_kind NOT NULL,
  disclosure_text text NOT NULL,                               -- 'none' routes say so honestly
  terms           jsonb NOT NULL DEFAULT '{}',
  status          route_status NOT NULL DEFAULT 'active',
  sponsored       boolean NOT NULL DEFAULT false               -- reserved; sponsored placement is out of scope
);
CREATE UNIQUE INDEX one_active_route_per_product ON purchase_route (product_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 6. Parent-side data (coded values only)
-- ---------------------------------------------------------------------------
CREATE TABLE child_profile (                            -- several per user. No name, no birth date, no photo, no free text.
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (label ~ '^Child [1-5]$'),  -- fixed labels, never a name
  age_band    text NOT NULL REFERENCES age_band(slug),
  consent_id  uuid NOT NULL REFERENCES consent_record(id), -- one record covers all of a user's profiles; re-confirmed when one is added
  UNIQUE (user_id, label)
);
CREATE TABLE child_profile_interest (
  child_profile_id uuid NOT NULL REFERENCES child_profile(id) ON DELETE CASCADE,
  interest_slug    text NOT NULL REFERENCES interest_tag(slug),
  PRIMARY KEY (child_profile_id, interest_slug)
);

CREATE TABLE wishlist (                                 -- shareable list built from saved items
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  share_code text NOT NULL UNIQUE,                       -- random token in the link; carries no data
  title      text NOT NULL CHECK (title IN ('Birthday list','Festival list','Wishlist')),  -- preset, no free text
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wishlist_item (
  wishlist_id uuid NOT NULL REFERENCES wishlist(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  bought_at   timestamptz,                               -- set by anyone with the link; shared between relatives
  PRIMARY KEY (wishlist_id, product_id)
);

CREATE TABLE saved_item (
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  saved_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE history_entry (                            -- slots + product ids. Not raw chat. Not linked to child.
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT now(),
  slots       jsonb NOT NULL CHECK (slots_are_coded(slots)),
  product_ids uuid[] NOT NULL
);
CREATE INDEX history_by_user ON history_entry (user_id, at DESC);

CREATE TABLE deletion_request (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,                            -- no FK: the user row is deleted by the request
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- 7. Sessions, events, spend
-- ---------------------------------------------------------------------------
CREATE TABLE session (                                  -- used only for caps (turns per guest chat, per device)
  id          text PRIMARY KEY,                          -- random cookie value
  started_at  timestamptz NOT NULL DEFAULT now(),
  turn_count  integer NOT NULL DEFAULT 0,
  ip_hash     text,                                      -- salted, salt rotates daily
  device_hash text
);

CREATE TABLE chat (                                     -- one conversation; counts only, never text
  id          text PRIMARY KEY,                          -- random per chat
  session_id  text REFERENCES session(id) ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  turn_count  integer NOT NULL DEFAULT 0
);

CREATE TABLE guest_device_day (                          -- guest typed messages per device per day, across chats
  device_hash text NOT NULL,
  day         date NOT NULL,
  typed_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (device_hash, day)
);

CREATE TABLE redirect_event (                           -- the revenue event
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at                timestamptz NOT NULL DEFAULT now(),
  product_id        uuid NOT NULL REFERENCES product(id),
  purchase_route_id uuid NOT NULL REFERENCES purchase_route(id),
  position          smallint,                            -- rank position of the card clicked
  session_id        text REFERENCES session(id) ON DELETE SET NULL,
  chat_id           text REFERENCES chat(id) ON DELETE SET NULL,   -- NULL for wishlist clicks
  source            text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat','wishlist')),
  sponsored         boolean NOT NULL DEFAULT false,       -- clicked while shown in the sponsored slot
  slots             jsonb NOT NULL CHECK (slots_are_coded(slots))
);

CREATE TABLE product_impression_day (                   -- how often each product is shown on a chat card
  day        date NOT NULL,
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  shown      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);

CREATE TABLE brand_sales_report (                       -- sales reported back by brands (CSV import); we do not track purchases
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES brand(id),
  product_id   uuid NOT NULL REFERENCES product(id),
  order_ref    text NOT NULL,
  sold_on      date NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  imported_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, order_ref)
);
CREATE INDEX redirect_by_day ON redirect_event (at);

CREATE TABLE llm_usage (                                -- drives the daily kill switch
  day            date PRIMARY KEY,
  calls          integer NOT NULL DEFAULT 0,
  tokens_in      bigint  NOT NULL DEFAULT 0,
  tokens_out     bigint  NOT NULL DEFAULT 0,
  cost_paise     bigint  NOT NULL DEFAULT 0
);

CREATE TABLE spend_alert (                              -- raised once per period at 50/80/100%; 100% turns the model off
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('day','month')),
  period      text NOT NULL,                             -- 'YYYY-MM-DD' or 'YYYY-MM'
  pct         smallint NOT NULL CHECK (pct IN (50, 80, 100)),
  spent_paise bigint NOT NULL,
  cap_paise   bigint NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, period, pct)
);

CREATE TABLE ops_setting (                              -- admin-tunable limits (Admin > Ops in the demo)
  singleton            boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  limit_specific       smallint NOT NULL DEFAULT 3 CHECK (limit_specific BETWEEN 1 AND 12),
  limit_vague          smallint NOT NULL DEFAULT 6 CHECK (limit_vague BETWEEN 1 AND 12),
  guest_chat_cap       smallint NOT NULL DEFAULT 5,
  user_chat_cap        smallint NOT NULL DEFAULT 10,
  guest_daily_cap      smallint NOT NULL DEFAULT 15,
  llm_daily_cap_paise  bigint NOT NULL DEFAULT 2500,
  llm_monthly_paise    bigint NOT NULL DEFAULT 50000,
  llm_disabled         boolean NOT NULL DEFAULT false,
  sponsored_on         boolean NOT NULL DEFAULT true,
  exposure_warn_pct    smallint NOT NULL DEFAULT 50,
  min_per_cell         smallint NOT NULL DEFAULT 3
);
INSERT INTO ops_setting DEFAULT VALUES;

-- ---------------------------------------------------------------------------
-- 8. Scraper (raw is kept apart from curated)
--    scrape_snapshot is immutable raw extraction. Nothing in the parent lane ever reads it.
--    The scraper only PROPOSES factual fields; scrape_diff is how a change reaches `product`.
-- ---------------------------------------------------------------------------
CREATE TABLE scrape_site (
  brand_id          uuid PRIMARY KEY REFERENCES brand(id) ON DELETE CASCADE,
  adapter           platform_type NOT NULL,
  fetch_limits      jsonb NOT NULL DEFAULT '{"rps":1,"timeout_s":10,"max_bytes":2000000}',
  refresh_interval  interval NOT NULL DEFAULT '7 days',
  enabled           boolean NOT NULL DEFAULT true
);

CREATE TABLE scrape_fixture (                           -- mirrors fixtures/<site>/<yyyy-mm-dd>/ in the repo
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       uuid NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
  path           text NOT NULL,
  captured_on    date NOT NULL,
  required_fields text[] NOT NULL DEFAULT '{name,price,currency,image}',
  expected_json  jsonb NOT NULL,
  UNIQUE (brand_id, path, captured_on)
);

CREATE TABLE scrape_run (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid REFERENCES brand(id) ON DELETE SET NULL,
  product_id   uuid REFERENCES product(id) ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('refresh', 'single', 'csv')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'running',
  fields_found text[],
  error        text
);

CREATE TABLE scrape_snapshot (                          -- immutable
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid REFERENCES product(id) ON DELETE CASCADE,
  source_url   text NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  parsed       jsonb NOT NULL,                           -- {name, price, currency, image, description, availability}
  content_hash text NOT NULL                             -- unchanged hash => only bump last_checked_at
);
CREATE INDEX snapshot_by_product ON scrape_snapshot (product_id, fetched_at DESC);

CREATE TABLE scrape_diff (                              -- approval queue; old approved value stays live meanwhile
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  field       diff_field NOT NULL,
  old_value   text NOT NULL,
  new_value   text NOT NULL,
  status      diff_status NOT NULL DEFAULT 'pending',
  decided_by  uuid REFERENCES app_user(id),
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diff_pending ON scrape_diff (status) WHERE status = 'pending';

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  actor_id  uuid REFERENCES app_user(id),
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  before    jsonb,
  after     jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. Catalogue version (cache key part). Bumped by any change that can alter search results.
-- ---------------------------------------------------------------------------
CREATE TABLE catalogue_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version   bigint NOT NULL DEFAULT 1
);
INSERT INTO catalogue_state DEFAULT VALUES;

CREATE FUNCTION bump_catalogue_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalogue_state SET version = version + 1;
  RETURN NULL;
END $$;

CREATE TRIGGER product_bump AFTER INSERT OR UPDATE OR DELETE ON product
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalogue_version();
CREATE TRIGGER evidence_bump AFTER INSERT OR UPDATE OR DELETE ON evidence
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalogue_version();
CREATE TRIGGER route_bump AFTER INSERT OR UPDATE OR DELETE ON purchase_route
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalogue_version();
CREATE TRIGGER reason_bump AFTER INSERT OR UPDATE OR DELETE ON reason_line
  FOR EACH STATEMENT EXECUTE FUNCTION bump_catalogue_version();

-- ---------------------------------------------------------------------------
-- 10. Claim lint, publish gate, visibility, nightly sweep
--     These mirror lib/gate.ts (assertedClaims, publishGate, visibility).
-- ---------------------------------------------------------------------------

-- Which restricted claims does this product's page assert? age_suitability always; material if present;
-- safety_cert / developmental if the text matches the keyword lists (same regexes as lib/gate.ts).
CREATE FUNCTION asserted_claims(pid uuid) RETURNS claim_type[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  p product%ROWTYPE;
  prof editorial_profile_current%ROWTYPE;
  txt text;
  out claim_type[] := ARRAY['age_suitability']::claim_type[];
BEGIN
  SELECT * INTO p FROM product WHERE id = pid;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  SELECT * INTO prof FROM editorial_profile_current WHERE product_id = pid;
  IF p.material <> '' THEN out := out || 'material'::claim_type; END IF;
  txt := concat_ws(' ', p.short_description, prof.intro, prof.why_picked, prof.points::text, prof.play_ideas::text);
  IF txt ~* '\y(isi|bis|certified|certification|non-?toxic|bpa[- ]?free|safety[- ]tested|lead[- ]free|child[- ]safe)\y' THEN
    out := out || 'safety_cert'::claim_type;
  END IF;
  IF txt ~* '\y(develops?|improves?|boosts?|enhances?|builds? (fine|gross)|helps (your )?(child|kids?) (to )?(learn|develop))' THEN
    out := out || 'developmental'::claim_type;
  END IF;
  RETURN out;
END $$;

-- Claims asserted but not backed by a CURRENT approved evidence row.
CREATE FUNCTION missing_evidence(pid uuid) RETURNS claim_type[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_agg(c), '{}')
  FROM unnest(asserted_claims(pid)) AS c
  WHERE NOT EXISTS (SELECT 1 FROM evidence_current e WHERE e.product_id = pid AND e.claim_type = c)
$$;

CREATE FUNCTION publish_gate(pid uuid)
RETURNS TABLE (key text, label text, ok boolean, detail text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  p product%ROWTYPE;
  miss claim_type[];
  n_reasons int;
  r purchase_route%ROWTYPE;
BEGIN
  SELECT * INTO p FROM product WHERE id = pid;
  SELECT * INTO r FROM purchase_route WHERE product_id = pid AND status = 'active';
  SELECT count(*) INTO n_reasons FROM reason_line WHERE product_id = pid AND approved_at IS NOT NULL;
  miss := missing_evidence(pid);

  RETURN QUERY VALUES
    ('name',    'Name and brand set',                 length(trim(p.name)) > 0 AND p.brand_id IS NOT NULL, p.name),
    ('photo',   'Photo set',                          p.photo_asset_id IS NOT NULL, coalesce(p.photo_asset_id::text, 'no photo')),
    ('age',     'Age band set',                       p.age_min_months IS NOT NULL AND p.age_max_months IS NOT NULL, coalesce(p.age_min_months::text,'?') || '-' || coalesce(p.age_max_months::text,'?') || ' months'),
    ('price',   'Price and as-of date set',           p.price_paise > 0 AND p.price_as_of IS NOT NULL, p.price_paise::text || ' paise as of ' || coalesce(p.price_as_of::text,'?')),
    ('url',     'Source URL set',                     p.source_url ~ '^https?://', p.source_url),
    ('category','Category set',                       p.category_slug IS NOT NULL, coalesce(p.category_slug,'none')),
    ('auth',    'Brand authorisation current',        EXISTS (SELECT 1 FROM brand_authorisation a WHERE a.brand_id = p.brand_id AND a.expires_on >= current_date), 'brand ' || p.brand_id::text),
    ('profile', 'Editorial profile approved',         EXISTS (SELECT 1 FROM editorial_profile_current e WHERE e.product_id = pid), 'latest approved version'),
    ('reasons', 'At least 3 approved reason lines',   n_reasons >= 3, n_reasons::text || ' approved'),
    ('route',   'Active purchase route and disclosure', r.id IS NOT NULL AND length(r.disclosure_text) > 10, coalesce(r.kind::text, 'no route')),
    ('evidence','Evidence for every restricted claim', cardinality(miss) = 0, CASE WHEN cardinality(miss) = 0 THEN 'covered' ELSE 'missing or expired: ' || array_to_string(miss, ', ') END);
END $$;

-- The gate cannot be skipped: any transition to 'published' runs it.
CREATE FUNCTION enforce_publish_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad text;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT string_agg(g.label, '; ') INTO bad FROM publish_gate(NEW.id) g WHERE NOT g.ok;
    IF bad IS NOT NULL THEN
      RAISE EXCEPTION 'Publish gate failed: %', bad USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER product_publish_gate BEFORE INSERT OR UPDATE OF status ON product
  FOR EACH ROW EXECUTE FUNCTION enforce_publish_gate();

-- Parents only ever query this view. (Derived on read like the demo; the nightly sweep below also persists it.)
CREATE VIEW product_visible AS
SELECT p.*
FROM product p
WHERE p.status = 'published'
  AND p.last_checked_at >= now() - interval '30 days'
  AND EXISTS (SELECT 1 FROM purchase_route r WHERE r.product_id = p.id AND r.status = 'active')
  AND cardinality(missing_evidence(p.id)) = 0;

-- Nightly sweep (run by the worker, then purge CDN pages for the returned ids).
-- Differs from the demo on purpose: the demo hides, production suspends with a reason, so
-- re-publishing has to pass the gate again.
CREATE FUNCTION sweep_catalogue() RETURNS TABLE (suspended_id uuid, suspended_why text)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH bad AS (
    SELECT p.id,
           CASE
             WHEN p.last_checked_at < now() - interval '30 days' THEN 'Stale: not refreshed for 30 days'
             WHEN NOT EXISTS (SELECT 1 FROM purchase_route r WHERE r.product_id = p.id AND r.status = 'active') THEN 'No active purchase route'
             ELSE 'Evidence missing or expired: ' || array_to_string(missing_evidence(p.id), ', ')
           END AS why
    FROM product p
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM product_visible v WHERE v.id = p.id)
  ), upd AS (
    UPDATE product p SET status = 'suspended', suspended_reason = bad.why
    FROM bad WHERE p.id = bad.id
    RETURNING p.id, bad.why
  ), logged AS (
    INSERT INTO product_status_log (product_id, from_status, to_status, skipped_reason)
    SELECT id, 'published', 'suspended', why FROM upd
    RETURNING product_id
  )
  SELECT upd.id, upd.why FROM upd;
END $$;

-- ---------------------------------------------------------------------------
-- 11. Seed vocabulary (matches lib/types.ts in the demo; production grows interest_tag to ~30-50)
-- ---------------------------------------------------------------------------
INSERT INTO age_band (slug, label, min_months, max_months, sort) VALUES
  ('0-2',  '0-2 years',   0,   35,  1),
  ('3-5',  '3-5 years',   36,  71,  2),
  ('6-8',  '6-8 years',   72,  107, 3),
  ('9-12', '9-12 years',  108, 155, 4),
  ('13+',  '13-14 years', 156, 179, 5);

INSERT INTO budget_cap (cap_inr, label) VALUES
  (500, 'Up to Rs 500'), (1000, 'Up to Rs 1,000'), (2000, 'Up to Rs 2,000'), (5000, 'Up to Rs 5,000');

INSERT INTO category (slug, name, synonyms) VALUES
  ('building', 'Building & blocks', '{block,building,lego,stacker,stacking,construction,tiles,magnetic}'),
  ('pretend',  'Pretend play',      '{pretend,kitchen,"role play",roleplay,"dress up",dollhouse,tent}'),
  ('art',      'Art & craft',       '{art,craft,paint,painting,watercolour,watercolor,clay,drawing,colouring,coloring}'),
  ('books',    'Books',             '{book,"story book",storybook,reading,"picture book",atlas}'),
  ('outdoor',  'Outdoor',           '{outdoor,outside,garden,bike,kite,park,bug}'),
  ('puzzles',  'Puzzles & games',   '{puzzle,"board game",game,jigsaw}'),
  ('music',    'Music',             '{music,drum,piano,instrument,kalimba,xylophone,musical}'),
  ('stem',     'Science & STEM',    '{science,stem,experiment,robot,gear,lab,engineering}'),
  ('soft',     'Soft toys',         '{plush,"soft toy",teddy,stuffed,cuddly,stuffie}'),
  ('sensory',  'Sensory',           '{sensory,texture,textured,calming,fidget}');

INSERT INTO interest_tag (slug, name, synonyms) VALUES
  ('dinosaurs', 'Dinosaurs',     '{dino,dinosaur,t-rex,trex}'),
  ('animals',   'Animals',       '{animal,elephant,dog,cat,farm,zoo,puppy}'),
  ('music',     'Music',         '{music,song,sing,drum,piano}'),
  ('art',       'Art',           '{art,paint,draw,craft,clay,colour}'),
  ('building',  'Building',      '{build,blocks,lego,construct}'),
  ('vehicles',  'Vehicles',      '{vehicle,car,truck,train,bus,plane,bike}'),
  ('space',     'Space',         '{space,rocket,planet,astronaut,star,moon}'),
  ('nature',    'Nature',        '{nature,bug,insect,plant,flower,garden,outdoor}'),
  ('stories',   'Stories',       '{story,stories,book,mystery,detective}'),
  ('pretend',   'Pretend play',  '{pretend,kitchen,"role play",shop,fairy}');

INSERT INTO occasion (slug, name, synonyms) VALUES
  ('birthday',    'Birthday',    '{birthday,bday,"turning"}'),
  ('festival',    'Festival',    '{festival,diwali,eid,christmas,rakhi}'),
  ('return_gift', 'Return gift', '{"return gift","return gifts","party favour"}');

COMMIT;
