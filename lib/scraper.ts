// Scraper demo. Adapters are real code that parse the saved fixture pages. The "network" is
// simulated: instead of fetching, we look the URL up in the fixture list. Everything else
// (authorisation check, robots rules, 1 req/s limit, adapters, required fields, diffs) mirrors the design.

import { Data, Product, Platform } from "./types";
import { FIXTURES, Fixture, Parsed } from "./fixtures";
import { parseCsv } from "./csv";
import { rulesParse } from "./parser";
import { todayOf } from "./gate";
import { isoDay } from "./seed";

export function runAdapter(platform: Platform, raw: string, broken = false): Parsed {
  if (platform === "shopify") {
    const j = JSON.parse(raw);
    const v = j.variants?.[0] ?? {};
    let price = parseFloat(v.price);
    if (broken) price = price / 100; // simulated regression: price misread as paise
    return {
      name: String(j.title ?? ""),
      price,
      currency: "INR",
      image: String(j.images?.[0]?.src ?? ""),
      description: String(j.body_html ?? "").replace(/<[^>]+>/g, "").trim(),
      availability: v.available ? "in_stock" : "out_of_stock",
    };
  }
  if (platform === "schema_org") {
    const m = raw.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error("No JSON-LD Product block found");
    const j = JSON.parse(m[1]);
    return {
      name: String(j.name ?? ""),
      price: Number(j.offers?.price),
      currency: broken ? "" : String(j.offers?.priceCurrency ?? ""),
      image: String(j.image ?? ""),
      description: String(j.description ?? ""),
      availability: String(j.offers?.availability ?? "").endsWith("InStock") ? "in_stock" : "out_of_stock",
    };
  }
  if (platform === "csv") {
    const rows = parseCsv(raw);
    const h = rows[0];
    const r = rows[1];
    const at = (k: string) => r[h.indexOf(k)] ?? "";
    return { name: at("name"), price: Number(at("price")), currency: "INR", image: at("image"), description: at("description"), availability: at("availability") };
  }
  const g = (re: RegExp) => raw.match(re)?.[1]?.trim() ?? "";
  return {
    name: g(/class="bk-title">([^<]*)</),
    price: Number(g(/class="bk-price">[^\d]*([\d,]+)/).replace(/,/g, "")),
    currency: "INR",
    image: g(/class="bk-cover" src="([^"]*)"/),
    description: g(/class="bk-blurb">([^<]*)</),
    availability: /Out of stock/.test(raw) ? "out_of_stock" : "in_stock",
  };
}

export interface RegressionRow {
  fixture: Fixture;
  ok: boolean;
  bad: { field: string; expected: unknown; actual: unknown }[];
  error?: string;
}
/** The CI check. Any difference on an unchanged fixture is a Defect under B4. */
export function regression(broken: boolean): RegressionRow[] {
  return FIXTURES.map((f) => {
    try {
      const got = runAdapter(f.platform, f.raw, broken);
      const bad = (Object.keys(f.expected) as (keyof Parsed)[])
        .filter((k) => f.expected[k] !== got[k])
        .map((k) => ({ field: k, expected: f.expected[k], actual: got[k] }));
      return { fixture: f, ok: bad.length === 0, bad };
    } catch (e) {
      return { fixture: f, ok: false, bad: [], error: (e as Error).message };
    }
  });
}

export interface Step {
  label: string;
  ok: boolean;
  detail: string;
}
export interface ScrapeOutcome {
  steps: Step[];
  ok: boolean;
  parsed?: Parsed;
  fixture?: Fixture;
  existing?: Product;
  ageHint?: string;
  reason?: string;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};
const ROBOTS_DISALLOW = ["/cart", "/account", "/checkout", "/admin"];

export function scrapeUrl(d: Data, url: string): ScrapeOutcome {
  const steps: Step[] = [];
  const fail = (label: string, detail: string): ScrapeOutcome => {
    steps.push({ label, ok: false, detail });
    return { steps, ok: false, reason: detail };
  };
  if (!/^https?:\/\//.test(url)) return fail("URL check", "Only http and https URLs are allowed.");
  const host = hostOf(url);
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\])/.test(host)) return fail("SSRF guard", `Refused: ${host} is a private or loopback address.`);
  steps.push({ label: "SSRF guard", ok: true, detail: `${host} resolves to a public address (simulated)` });
  const brand = d.brands.find((b) => hostOf(b.url) === host);
  if (!brand) return fail("Brand lookup", `No brand with host ${host}. Only brands with an authorisation record can be scraped.`);
  steps.push({ label: "Brand lookup", ok: true, detail: `${brand.name} (${brand.platform})` });
  const today = todayOf(d);
  if (!brand.authorisation || brand.authorisation.expiresOn < today) return fail("Authorisation", `${brand.name}'s authorisation ${brand.authorisation ? "expired on " + brand.authorisation.expiresOn : "is missing"}. Scrape refused.`);
  steps.push({ label: "Authorisation", ok: true, detail: `current until ${brand.authorisation.expiresOn}` });
  const path = new URL(url).pathname;
  const blocked = ROBOTS_DISALLOW.find((p) => path.startsWith(p));
  if (blocked) return fail("robots.txt", `Disallow: ${blocked}. Not fetched.`);
  steps.push({ label: "robots.txt", ok: true, detail: "path allowed (simulated)" });
  steps.push({ label: "Rate limit", ok: true, detail: "1 request per second per host (simulated wait 1000 ms)" });
  const fx = FIXTURES.find((f) => f.url === url);
  if (!fx) return fail("Fetch", "No saved page for this URL in the demo. Use one of the sample URLs on this screen.");
  steps.push({ label: "Fetch", ok: true, detail: `HTTP 200, ${fx.raw.length} bytes, fixture dated ${fx.capturedOn}` });
  let parsed: Parsed;
  try {
    parsed = runAdapter(fx.platform, fx.raw, d.ops.breakAdapter);
  } catch (e) {
    return fail(`Adapter: ${fx.platform}`, (e as Error).message);
  }
  steps.push({ label: `Adapter: ${fx.platform}`, ok: true, detail: "parsed" });
  const missing = fx.required.filter((k) => !parsed[k] && parsed[k] !== 0);
  steps.push({ label: "Required fields", ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(", ")}` : `all present (${fx.required.join(", ")})` });
  const ageHint = parsed.description.match(/ages?\s*(\d+)\s*\+/i)?.[1];
  const existing = d.products.find((p) => p.sourceUrl === url);
  return { steps, ok: missing.length === 0, parsed, fixture: fx, existing, ageHint: ageHint ? `Ages ${ageHint}+ found in the description (suggestion only; the curator sets the age band)` : undefined };
}

export function addProductFromFixture(d: Data, o: ScrapeOutcome): Product | null {
  if (!o.ok || !o.parsed || !o.fixture || o.existing) return null;
  const f = o.fixture;
  const cat = rulesParse(o.parsed.name + " " + o.parsed.description).slots.category ?? "pretend";
  const hint = o.parsed.description.match(/ages?\s*(\d+)\s*\+/i)?.[1];
  const ageMin = hint ? Math.round(+hint * 12) : 36;
  const today = todayOf(d);
  const p: Product = {
    id: "p-" + f.id,
    brandId: f.brandId,
    name: o.parsed.name,
    sourceUrl: f.url,
    price: o.parsed.price,
    priceAsOf: today,
    emoji: "🎁",
    color: "#ececf4",
    category: cat,
    ageMin,
    ageMax: Math.min(ageMin + 60, 179),
    interests: [],
    material: "",
    pieces: "",
    availability: o.parsed.availability === "in_stock" ? "In stock at the brand (as researched)" : "Out of stock at the brand (as researched)",
    cleaning: "",
    shortDesc: o.parsed.description,
    status: "discovered",
    lastCheckedAt: today,
    giftable: true,
    boost: 0,
    live: { price: o.parsed.price, availability: o.parsed.availability === "in_stock" ? "In stock" : "Out of stock", http: 200 },
  };
  d.products.push(p);
  d.statusLog.push({ id: "l-" + d.statusLog.length + "-" + p.id, productId: p.id, from: null, to: "discovered", at: today, actor: "Scraper" });
  d.ops.catalogueVersion++;
  return p;
}

/** Weekly refresh for a brand. Changed values become pending diffs; dead pages auto-suspend. */
export function refreshBrand(d: Data, brandId: string): string[] {
  const out: string[] = [];
  const brand = d.brands.find((b) => b.id === brandId)!;
  const today = todayOf(d);
  out.push(`Refresh ${brand.name} (${brand.platform}) on ${today}`);
  if (!brand.authorisation || brand.authorisation.expiresOn < today) {
    out.push(`✗ Authorisation ${brand.authorisation ? "expired " + brand.authorisation.expiresOn : "missing"}: nothing fetched.`);
    return out;
  }
  let unchanged = 0;
  for (const p of d.products.filter((x) => x.brandId === brandId && x.status !== "discovered")) {
    if (p.live.http !== 200) {
      out.push(`✗ ${p.name}: HTTP ${p.live.http}`);
      if (p.status === "published") {
        p.status = "suspended";
        p.suspendedReason = `Dead page (HTTP ${p.live.http}), auto-suspended on ${today}`;
        d.statusLog.push({ id: `l-${d.statusLog.length}-${p.id}`, productId: p.id, from: "published", to: "suspended", at: today, actor: "Scraper", skippedReason: p.suspendedReason });
        out.push(`  → auto-suspended and hidden from parents`);
      }
      d.ops.catalogueVersion++;
      continue;
    }
    let changed = false;
    const pend = (f: string) => d.diffs.some((x) => x.productId === p.id && x.field === f && x.status === "pending");
    if (p.live.price !== p.price && !pend("price")) {
      d.diffs.push({ id: `d-${d.diffs.length}-${p.id}-price`, productId: p.id, field: "price", oldValue: String(p.price), newValue: String(p.live.price), status: "pending", at: today });
      out.push(`△ ${p.name}: price ₹${p.price} → ₹${p.live.price} (pending approval, old value stays live)`);
      changed = true;
    }
    if (!p.availability.toLowerCase().startsWith(p.live.availability.toLowerCase()) && !pend("availability")) {
      d.diffs.push({ id: `d-${d.diffs.length}-${p.id}-av`, productId: p.id, field: "availability", oldValue: p.availability, newValue: `${p.live.availability} at the brand (as researched)`, status: "pending", at: today });
      out.push(`△ ${p.name}: availability changed (pending approval)`);
      changed = true;
    }
    p.lastCheckedAt = today;
    if (!changed) unchanged++;
  }
  out.push(`✓ ${unchanged} product(s) unchanged (only last-checked date updated)`);
  d.ops.catalogueVersion++;
  return out;
}

export function approveDiff(d: Data, id: string, approve: boolean) {
  const x = d.diffs.find((q) => q.id === id);
  if (!x || x.status !== "pending") return;
  x.status = approve ? "approved" : "rejected";
  if (approve) {
    const p = d.products.find((q) => q.id === x.productId)!;
    if (x.field === "price") {
      p.price = Number(x.newValue);
      p.priceAsOf = todayOf(d);
    } else p.availability = x.newValue;
  }
  d.ops.catalogueVersion++;
}

export const SAMPLE_URLS = FIXTURES.map((f) => f.url);
export const dayStr = (n: number) => isoDay(new Date(Date.now() + n * 86400000));
