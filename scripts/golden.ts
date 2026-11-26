// Accuracy report for the rules parser against the golden set (scripts/golden-cases.ts).
//   npm run test:golden              report + fail if worse than the recorded baseline (regression guard)
//   npm run test:golden -- --strict  also enforce the plan's targets (Phase B onwards)
//   npm run test:golden -- --quiet   hide the list of failing cases
// Rules only: no model call, no network, no cost.

import { rulesParse, needsLlm, mergeSlots, type Parse } from "../lib/parser";
import type { Band, Slots } from "../lib/types";
import { CASES, type Bucket, type Expect, type GoldenCase } from "./golden-cases";

// Regression floors: the numbers the parser must not drop below. Raise them as each phase lands.
const FLOOR = { slotAccuracy: 0.959, casesPassed: 174 }; // after Phase B, 2026-11-26 (Phase A baseline: 0.855, 103)
// The plan's targets (step 6), enforced with --strict.
const TARGET = {
  slotAccuracy: 0.9,
  modelRate: 0.2,
  mustPass: ["number formats", "hinglish", "negation", "several children"] as Bucket[],
};

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const quiet = args.includes("--quiet");

// Fields the parser does not produce yet (Phase C). Read loosely so this runner works before and after.
type Extra = {
  conflicts?: { ages?: Band[] };
  excluded?: { categories?: string[]; interests?: string[]; other?: string[] };
};

const STRICT_KEYS = ["age", "budget", "category", "interests"] as const;
const OPTIONAL_KEYS = ["recipient", "occasion", "gender", "personalisable"] as const;
type SlotKey = (typeof STRICT_KEYS)[number] | (typeof OPTIONAL_KEYS)[number];

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const show = (v: unknown) => (v === undefined || v === null ? "—" : Array.isArray(v) ? (v.length ? v.join("+") : "—") : String(v));

function slotEqual(k: SlotKey, want: unknown, got: unknown): boolean {
  const empty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);
  if (empty(want)) return empty(got);
  if (k === "interests") return Array.isArray(got) && sameSet(want as string[], got as string[]);
  return want === got;
}

interface Result {
  c: GoldenCase;
  pass: boolean;
  diffs: string[];
  slotChecks: { k: SlotKey; ok: boolean }[];
  llm: boolean;
  why: string;
}

function score(c: GoldenCase): Result {
  const p = rulesParse(c.text) as Parse & Extra;
  const slots: Slots = c.prev ? mergeSlots(c.prev, p.slots, p.clear, p.reset) : p.slots;
  const e: Expect = c.expect;
  const diffs: string[] = [];
  const slotChecks: Result["slotChecks"] = [];

  const check = (k: SlotKey) => {
    const want = e[k];
    const got = slots[k];
    const ok = slotEqual(k, want, got);
    slotChecks.push({ k, ok });
    if (!ok) diffs.push(`${k}: want ${show(want)}, got ${show(got)}`);
  };
  STRICT_KEYS.forEach(check);
  OPTIONAL_KEYS.forEach((k) => k in e && check(k));

  if (e.intent && e.intent !== p.intent) diffs.push(`intent: want ${e.intent}, got ${p.intent}`);

  const gotConflict = p.conflicts?.ages ?? [];
  if (e.conflict ? !sameSet(e.conflict, gotConflict) : gotConflict.length) diffs.push(`conflict: want ${show(e.conflict)}, got ${show(gotConflict)}`);

  if (e.excluded) {
    for (const kind of ["categories", "interests", "other"] as const) {
      const want = e.excluded[kind] ?? [];
      const got = p.excluded?.[kind] ?? [];
      const missing = want.filter((w) => !got.some((g) => g.includes(w) || w.includes(g)));
      if (missing.length) diffs.push(`excluded.${kind}: missing ${missing.join(", ")}`);
    }
  }

  const { llm, why } = needsLlm(p);
  return { c, pass: diffs.length === 0, diffs, slotChecks, llm, why };
}

const results = CASES.map(score);
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const pad = (s: string, n: number) => s.padEnd(n);

// Per-slot accuracy.
const bySlot = new Map<SlotKey, { ok: number; n: number }>();
for (const r of results) for (const s of r.slotChecks) {
  const v = bySlot.get(s.k) ?? { ok: 0, n: 0 };
  v.n++;
  if (s.ok) v.ok++;
  bySlot.set(s.k, v);
}
const slotOk = [...bySlot.values()].reduce((a, v) => a + v.ok, 0);
const slotN = [...bySlot.values()].reduce((a, v) => a + v.n, 0);

// Per-bucket pass rate.
const buckets = new Map<Bucket, { pass: number; n: number; llm: number }>();
for (const r of results) {
  const v = buckets.get(r.c.bucket) ?? { pass: 0, n: 0, llm: 0 };
  v.n++;
  if (r.pass) v.pass++;
  if (r.llm) v.llm++;
  buckets.set(r.c.bucket, v);
}
const passed = results.filter((r) => r.pass).length;
const llmCount = results.filter((r) => r.llm).length;
const slotAcc = slotOk / slotN;
const modelRate = llmCount / results.length;

if (!quiet) {
  console.log("Failing cases:");
  for (const r of results.filter((x) => !x.pass)) console.log(`  [${r.c.bucket}] "${r.c.text}"\n      ${r.diffs.join(" · ")}${r.llm ? `  (would call model: ${r.why})` : ""}`);
  console.log("");
}

console.log("Per-slot accuracy (rules only):");
for (const [k, v] of bySlot) console.log(`  ${pad(k, 15)} ${pad(pct(v.ok, v.n), 7)} (${v.ok}/${v.n})`);
console.log(`  ${pad("ALL SLOTS", 15)} ${pad(pct(slotOk, slotN), 7)} (${slotOk}/${slotN})`);
console.log("");
console.log("Per-bucket pass rate:");
for (const [b, v] of buckets) console.log(`  ${pad(b, 22)} ${pad(pct(v.pass, v.n), 7)} (${v.pass}/${v.n})   would call model ${v.llm}`);
console.log(`  ${pad("ALL CASES", 22)} ${pad(pct(passed, results.length), 7)} (${passed}/${results.length})`);
console.log("");
console.log(`Would call model: ${pct(llmCount, results.length)} (${llmCount}/${results.length}), target <= ${TARGET.modelRate * 100}%`);

const problems: string[] = [];
if (slotAcc < FLOOR.slotAccuracy) problems.push(`slot accuracy ${pct(slotOk, slotN)} is below the floor ${(FLOOR.slotAccuracy * 100).toFixed(1)}%`);
if (passed < FLOOR.casesPassed) problems.push(`${passed} cases passed, floor is ${FLOOR.casesPassed}`);
if (strict) {
  if (slotAcc < TARGET.slotAccuracy) problems.push(`slot accuracy ${pct(slotOk, slotN)} is below the target ${TARGET.slotAccuracy * 100}%`);
  if (modelRate > TARGET.modelRate) problems.push(`would call model ${pct(llmCount, results.length)}, target <= ${TARGET.modelRate * 100}%`);
  for (const b of TARGET.mustPass) {
    const v = buckets.get(b);
    if (v && v.pass < v.n) problems.push(`bucket "${b}" must fully pass (${v.pass}/${v.n})`);
  }
}
console.log("");
console.log(problems.length ? `FAIL\n  ${problems.join("\n  ")}` : strict ? "PASS (strict)" : "PASS (regression floor)");
process.exit(problems.length ? 1 : 0);
