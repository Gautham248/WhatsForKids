// Retrieval and ranking. Deterministic ordinary code: filters, score, diversity, reason pick.
// No model is involved from here down.

import { BAND_MONTHS, Data, Product, ReasonLine, ReasonTag, Slots, CATEGORIES } from "./types";
import { evidenceCurrent, overlapsBand, todayOf, visibility } from "./gate";
import { slotKey } from "./parser";

export interface Scored {
  id: string;
  score: number;
  parts: Record<string, number>;
}
export interface Ranked extends Scored {
  reason?: ReasonLine;
  reasonWhy: string;
}
export interface Relax {
  label: string;
  patch: "budget" | "category";
  n: number;
}
export interface SearchResult {
  ranked: Ranked[];
  funnel: { label: string; n: number }[];
  cache: "HIT" | "MISS";
  key: string;
  limit: number;
  relax: Relax[];
  total: number;
}

const cache = new Map<string, Scored[]>(); // in-process LRU in production; a plain Map here
export const clearRankCache = () => cache.clear();
export const cacheSize = () => cache.size;

function candidates(d: Data, s: Slots, skip: { budget?: boolean; category?: boolean } = {}) {
  const funnel: { label: string; n: number }[] = [];
  let list = d.products.filter((p) => visibility(d, p).visible);
  funnel.push({ label: "Published and visible (evidence, route, freshness)", n: list.length });
  if (s.age) {
    list = list.filter((p) => overlapsBand(p, s.age!));
    funnel.push({ label: `Age ${s.age}`, n: list.length });
  }
  if (s.budget && !skip.budget) {
    list = list.filter((p) => p.price <= s.budget!);
    funnel.push({ label: `Price up to ₹${s.budget}`, n: list.length });
  }
  if (s.category && !skip.category) {
    list = list.filter((p) => p.category === s.category);
    funnel.push({ label: `Category ${CATEGORIES[s.category]}`, n: list.length });
  }
  return { list, funnel };
}

function score(p: Product, s: Slots): Scored {
  const parts: Record<string, number> = {};
  if (s.category && p.category === s.category) parts.category = 40;
  const hits = (s.interests ?? []).filter((i) => p.interests.includes(i)).length;
  if (hits) parts.interest = hits * 15;
  if (s.age) {
    const [lo, hi] = BAND_MONTHS[s.age];
    const mid = (lo + hi) / 2;
    const pm = (p.ageMin + p.ageMax) / 2;
    parts.age_fit = Math.max(0, Math.round(20 - Math.abs(mid - pm) / 6));
  }
  if (s.budget) parts.price_fit = Math.round((p.price / s.budget) * 10); // closer to the cap means more substantial
  if (s.recipient === "gift" && p.giftable) parts.gift = 8;
  parts.curator = p.boost;
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { id: p.id, score: total, parts };
}

export function pickReason(d: Data, p: Product, s: Slots): { line?: ReasonLine; why: string } {
  const lines = d.reasons.filter((r) => r.productId === p.id && r.approved);
  const by = (tag: ReasonTag, interest?: string) => lines.find((l) => l.tag === tag && (!interest || l.interest === interest));
  const order: [string, () => ReasonLine | undefined][] = [
    ["query mentions an interest this product is tagged with", () => (s.interests ?? []).map((i) => by("interest", i)).find(Boolean)],
    ["query is a gift or occasion", () => (s.recipient === "gift" || s.occasion ? by("gift") : undefined)],
    ["query has a budget", () => (s.budget ? by("budget") : undefined)],
    ["query has a category", () => (s.category ? by("skill") : undefined)],
    ["default: age fit", () => by("age_fit")],
  ];
  for (const [why, f] of order) {
    const l = f();
    if (l) return { line: l, why: `${l.tag}: ${why}` };
  }
  return { line: lines[0], why: "fallback: first approved line" };
}

export function search(d: Data, slots: Slots, shown: string[] = []): SearchResult {
  const key = `v${d.ops.catalogueVersion}:${todayOf(d)}:${slotKey(slots)}`;
  const { list, funnel } = candidates(d, slots);
  const hit = cache.get(key);
  let scored: Scored[];
  if (hit) scored = hit;
  else {
    scored = list.map((p) => score(p, slots)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 20);
    cache.set(key, scored);
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  }
  const limit = slots.age && slots.category ? 3 : 6;
  // Serve-time steps (not cached, so the cache stays shareable between sessions):
  const adjusted = scored
    .map((r) => (shown.includes(r.id) ? { ...r, score: r.score - 30, parts: { ...r.parts, already_shown: -30 } } : r))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const perBrand: Record<string, number> = {};
  const perCat: Record<string, number> = {};
  const picked: Ranked[] = [];
  for (const r of adjusted) {
    const p = d.products.find((x) => x.id === r.id)!;
    if ((perBrand[p.brandId] ?? 0) >= 2 || (perCat[p.category] ?? 0) >= 2) continue;
    perBrand[p.brandId] = (perBrand[p.brandId] ?? 0) + 1;
    perCat[p.category] = (perCat[p.category] ?? 0) + 1;
    const { line, why } = pickReason(d, p, slots);
    picked.push({ ...r, reason: line, reasonWhy: why });
    if (picked.length >= limit) break;
  }
  const relax: Relax[] = [];
  if (!list.length) {
    if (slots.budget) {
      const n = candidates(d, slots, { budget: true }).list.length;
      if (n) relax.push({ label: "Any budget", patch: "budget", n });
    }
    if (slots.category) {
      const n = candidates(d, slots, { category: true }).list.length;
      if (n) relax.push({ label: "Any category", patch: "category", n });
    }
  }
  return { ranked: picked, funnel, cache: hit ? "HIT" : "MISS", key, limit, relax, total: list.length };
}

/** Certification questions: only answered from current evidence records. */
export function certSearch(d: Data, slots: Slots, token: string) {
  const safety = /^(isi|bis|certified|certification|certificate|safety tested)$/.test(token);
  const re = new RegExp(token.replace(/[-\s]/g, ".?"), "i");
  const { list } = candidates(d, slots);
  const matches: { product: Product; evidence: string }[] = [];
  for (const p of list) {
    const ev = evidenceCurrent(d, p.id).find((e) => (safety ? e.type === "safety_cert" : re.test(e.claimText)));
    if (ev) matches.push({ product: p, evidence: ev.claimText });
  }
  return { safety, matches };
}
