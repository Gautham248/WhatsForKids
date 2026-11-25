// Business rules: demo clock, current evidence, claim lint, publish gate, visibility.
// In the real build these are a DB view (evidence_current), a DB function (publish gate)
// and a nightly sweep. Here they are derived on read so you can time-travel in Admin > Ops.

import { ClaimType, Data, Evidence, Product, Profile, Status, STAGES, BAND_MONTHS, Band } from "./types";

export const STALE_DAYS = 30;

export const nowOf = (d: Data) => new Date(Date.now() + d.ops.clockOffsetDays * 86400000);
export const todayOf = (d: Data) => nowOf(d).toISOString().slice(0, 10);
export const daysBetween = (aIso: string, bIso: string) => Math.round((Date.parse(bIso) - Date.parse(aIso)) / 86400000);

export const isCurrent = (e: Evidence, d: Data) => e.status === "approved" && (e.expiresOn === null || e.expiresOn >= todayOf(d));
export const evidenceCurrent = (d: Data, productId: string) => d.evidence.filter((e) => e.productId === productId && isCurrent(e, d));
export const evidenceState = (e: Evidence, d: Data): "current" | "expired" | "pending" | "rejected" =>
  e.status === "pending" ? "pending" : e.status === "rejected" ? "rejected" : isCurrent(e, d) ? "current" : "expired";

const SAFETY_RE = /\b(isi|bis|certified|certification|non-?toxic|bpa[- ]?free|safety[- ]tested|lead[- ]free|child[- ]safe)\b/i;
const DEV_RE = /\b(develops?|improves?|boosts?|enhances?|builds? (fine|gross)|helps (your )?(child|kids?) (to )?(learn|develop))\b/i;

export interface Lint {
  claim: ClaimType;
  where: string;
  match: string;
}
/** Which restricted claims does this product's page assert? (age and material are always asserted when present) */
export function assertedClaims(p: Product, profile?: Profile): { claims: Set<ClaimType>; lint: Lint[] } {
  const claims = new Set<ClaimType>(["age_suitability"]);
  const lint: Lint[] = [];
  if (p.material) claims.add("material");
  const texts: [string, string][] = [["short description", p.shortDesc]];
  if (profile) {
    texts.push(["intro", profile.intro], ["why we picked it", profile.why]);
    profile.points.forEach((x, i) => texts.push([`point ${i + 1}`, x.title + " " + x.body]));
    profile.play.forEach((x, i) => texts.push([`play idea ${i + 1}`, x.title + " " + x.prompt]));
  }
  for (const [where, t] of texts) {
    const s = t.match(SAFETY_RE);
    if (s) {
      claims.add("safety_cert");
      lint.push({ claim: "safety_cert", where, match: s[0] });
    }
    const v = t.match(DEV_RE);
    if (v) {
      claims.add("developmental");
      lint.push({ claim: "developmental", where, match: v[0] });
    }
  }
  return { claims, lint };
}

export interface GateItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}
export function publishGate(d: Data, p: Product): GateItem[] {
  const brand = d.brands.find((b) => b.id === p.brandId);
  const profile = d.profiles[p.id];
  const route = d.routes[p.id];
  const today = todayOf(d);
  const { claims } = assertedClaims(p, profile);
  const cur = evidenceCurrent(d, p.id);
  const missing = [...claims].filter((c) => !cur.some((e) => e.type === c));
  const approvedReasons = d.reasons.filter((r) => r.productId === p.id && r.approved);
  return [
    { key: "name", label: "Name and brand set", ok: !!p.name.trim() && !!brand, detail: brand ? `${p.name || "(no name)"} · ${brand.name}` : "no brand on file" },
    { key: "photo", label: "Photo set", ok: !!(p.photo ?? "").trim(), detail: p.photo || "no photo" },
    { key: "age", label: "Age band set", ok: p.ageMax > p.ageMin && p.ageMin >= 0, detail: `${p.ageMin}–${p.ageMax} months` },
    { key: "price", label: "Price and 'as of' date set", ok: p.price > 0 && !!p.priceAsOf, detail: `₹${p.price} as of ${p.priceAsOf}` },
    { key: "url", label: "Source URL set", ok: /^https?:\/\//.test(p.sourceUrl), detail: p.sourceUrl },
    { key: "auth", label: "Brand authorisation current", ok: !!brand?.authorisation && brand.authorisation.expiresOn >= today, detail: brand?.authorisation ? `expires ${brand.authorisation.expiresOn}` : "none on file" },
    { key: "profile", label: "Editorial profile approved", ok: profile?.state === "approved", detail: profile ? profile.state : "no profile" },
    { key: "reasons", label: "At least 3 approved reason lines", ok: approvedReasons.length >= 3, detail: `${approvedReasons.length} approved` },
    { key: "route", label: "Active purchase route and disclosure", ok: route?.status === "active" && route.disclosure.length > 10, detail: route ? `${route.kind}, ${route.status}` : "no route" },
    { key: "evidence", label: "Evidence for every restricted claim", ok: missing.length === 0, detail: missing.length ? `missing or expired: ${missing.join(", ")}` : `covers ${[...claims].join(", ")}` },
  ];
}
export const gatePasses = (d: Data, p: Product) => publishGate(d, p).every((g) => g.ok);

/** Is the product visible to parents right now, and if not why not? (the nightly sweep, derived on read) */
export function visibility(d: Data, p: Product): { visible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (p.status !== "published") reasons.push(p.status === "suspended" ? `Suspended: ${p.suspendedReason ?? "unpublished"}` : `Not published (stage: ${p.status})`);
  else {
    const today = todayOf(d);
    const profile = d.profiles[p.id];
    const { claims } = assertedClaims(p, profile);
    const cur = evidenceCurrent(d, p.id);
    for (const c of claims) if (!cur.some((e) => e.type === c)) reasons.push(`Evidence missing or expired for ${c}`);
    if (daysBetween(p.lastCheckedAt, today) > STALE_DAYS) reasons.push(`Stale: not refreshed for more than ${STALE_DAYS} days`);
    const route = d.routes[p.id];
    if (!route || route.status !== "active") reasons.push("No active purchase route");
  }
  return { visible: reasons.length === 0, reasons };
}

export const nextStage = (s: Status): Status | null => {
  const i = STAGES.indexOf(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
};
export const prevStage = (s: Status): Status | null => {
  const i = STAGES.indexOf(s);
  return i > 0 ? STAGES[i - 1] : null;
};
export const stageIndex = (s: Status) => STAGES.indexOf(s);

export const overlapsBand = (p: Product, b: Band) => p.ageMin <= BAND_MONTHS[b][1] && p.ageMax >= BAND_MONTHS[b][0];
