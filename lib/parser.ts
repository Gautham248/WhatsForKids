// Slot parser. Two paths:
//   1. rulesParse(): ordinary code (regex + word lists in lexicon.ts). Free and instant. It also reads
//      number words, shorthand budgets ("1.5k", "do hazaar"), school stages, common Hinglish and
//      unambiguous typos, so most messages never need a model.
//   2. A model, only for messages the rules cannot cover. By default this is llmParse(), a SIMULATED
//      call (a normaliser in front of the same rules), so the demo needs no API key. With the Ops switch
//      on "Real", app/api/parse calls Claude Haiku with MODEL_SLOT_SCHEMA; its answer is checked by
//      validateModelSlots() and merged below the rules by mergeModelBelowRules().
// Output is always a coded slot object, never free text.

import { Band, BANDS, BudgetCap, BUDGETS, Gender, Occasion, Recipient, Slots, CATEGORIES, INTERESTS, bandLabel, budgetLabel } from "./types";
import {
  BIRTHDAY_WORDS, BOY_WORDS, BUDGET_WORDS, CAT_WORDS, FESTIVAL_WORDS, GIFT_PEOPLE, GIFT_WORDS, GIRL_WORDS, HI_NUM,
  HUNDRED_WORDS, INT_WORDS, LIFE_STAGES, NUM_SCALE, NUM_WORDS, OWN_HINGLISH, OWN_PEOPLE, PRODUCT_NOUNS, SPELLING, STOP,
  THOUSAND_WORDS, YEAR_WORDS, NOT_TYPOS, NEG_BEFORE, NEG_AFTER, NOT_NEGATED_AFTER_NO, SCOPE_END, NEG_FILLER, PRONOUNS,
} from "./lexicon";

export type Intent = "search" | "greeting" | "advice" | "cert" | "out_of_range" | "other";

export interface Parse {
  intent: Intent;
  slots: Slots;
  clear: (keyof Slots)[];
  reset: boolean;
  cert?: string;
  outOfRange?: number;
  matched: string[];
  unexplained: string[];
  /** What the normaliser rewrote before matching (number words, typos). Internal, never stored. */
  fixes: string[];
  /** How sure the rules are of each slot they set. "low" = a guess worth echoing back. */
  confidence: Partial<Record<keyof Slots, "high" | "low">>;
  /** Two or more different age bands in one message ("my 4 and 9 year olds"). No age is set. */
  conflicts?: { ages?: Band[] };
  /** Things the parent said they do NOT want. Not stored; "other" cannot be filtered yet. */
  excluded?: { categories: string[]; interests: string[]; other: string[] };
  /** Slots this message corrected ("actually make it 6"). */
  corrections: (keyof Slots)[];
}

const ADVICE_RE = /\b(tantrum\w*|sleep(ing)?|potty|toilet|screen time|homework|weather|joke|recipe|news|diet|vaccin\w*|doctor|fever|discipline|how do i|how to|why does|capital of|bedtime routine|picky eat\w*)\b/;
const CERT_RE = /\b(isi|bis|certified|certification|certificate|non-?toxic|bpa|gots|ce marked|astm|en ?71|fda|lead[- ]free|safety tested)\b/;
const RESET_RE = /\b(start over|start again|reset|new search|clear (all|filters?)|forget that)\b/;

const esc = (w: string) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/ /g, "\\s+");
const wordRe = (w: string) => new RegExp(`\\b${esc(w)}(?:s|es)?\\b`);
const alt = (ws: string[], plural = false) => ws.map((w) => esc(w) + (plural ? "s?" : "")).join("|");

export const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9₹.,+\- /]/g, " ").replace(/\s+/g, " ").trim();

// ---------- normaliser: numbers, spelling variants and typos, before any matching ----------

const UNIT_AFTER_ONE = new Set(["year", "years", "yr", "yrs", "yo", "month", "months", "and", "rupee", "rupees", "rs", "hundred", "thousand"]);

/** "twenty five hundred" → "2500", "two thousand" → "2000". A lone "one" is kept unless a unit follows ("little one"). */
function wordsToDigits(t: string, fixes: string[]): string {
  const toks = t.split(" ");
  const out: string[] = [];
  for (let i = 0; i < toks.length; ) {
    const first = toks[i].match(/^([a-z]+)([.,]*)$/);
    if (!first || !(first[1] in NUM_WORDS)) {
      out.push(toks[i++]);
      continue;
    }
    let total = 0;
    let cur = 0;
    let j = i;
    let tail = "";
    while (j < toks.length) {
      const m = toks[j].match(/^([a-z]+)([.,]*)$/);
      if (!m) break;
      const w = m[1];
      if (w in NUM_WORDS) cur += NUM_WORDS[w];
      else if (w === "hundred") cur = (cur || 1) * NUM_SCALE.hundred;
      else if (w === "thousand") {
        total += (cur || 1) * NUM_SCALE.thousand;
        cur = 0;
      } else break;
      tail = m[2];
      j++;
      if (tail) break;
    }
    const words = toks.slice(i, j).join(" ").replace(/[.,]+$/, "");
    if (words === "one" && !UNIT_AFTER_ONE.has((toks[j] ?? "").replace(/[.,]+$/, ""))) {
      out.push(toks[i++]);
      continue;
    }
    fixes.push(`number "${words}" → ${total + cur}`);
    out.push(String(total + cur) + tail);
    i = j;
  }
  return out.join(" ");
}

const HI_NUM_RE = new RegExp(`\\b(${alt(Object.keys(HI_NUM))})\\s+(?=(?:${alt([...THOUSAND_WORDS.filter((k) => k !== "k"), ...HUNDRED_WORDS, ...YEAR_WORDS])})\\b)`, "g");
const THOUSAND_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${alt(THOUSAND_WORDS)})\\b`, "g");
const HUNDRED_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${alt(HUNDRED_WORDS)})\\b`, "g");

/** Single words the matcher already understands, so they are never treated as typos or left unexplained. */
const KNOWN = new Set(
  [
    ...Object.values(CAT_WORDS).flat(), ...Object.values(INT_WORDS).flat(), ...GIFT_PEOPLE, ...GIFT_WORDS, ...BOY_WORDS, ...GIRL_WORDS,
    ...YEAR_WORDS, ...THOUSAND_WORDS, ...HUNDRED_WORDS, ...BIRTHDAY_WORDS, ...FESTIVAL_WORDS, ...PRODUCT_NOUNS, ...OWN_PEOPLE, ...OWN_HINGLISH,
  ].flatMap((w) => w.split(" ")),
);
const singulars = (w: string) => [w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, "")].filter((x) => x !== w);
const isKnown = (w: string) => KNOWN.has(w) || singulars(w).some((s) => KNOWN.has(s));

function fixWords(t: string, fixes: string[]): string {
  return t
    .split(" ")
    .map((tok) => {
      const m = tok.match(/^([a-z]+)([.,]*)$/);
      if (!m) return tok;
      const [, w, tail] = m;
      if (SPELLING[w]) return SPELLING[w] + tail;
      if (STOP.has(w) || KNOWN.has(w)) return tok;
      // Irregular plural of a known word ("fairies" → "fairy"); regular plurals are matched as they are.
      const ies = w.endsWith("ies") ? w.slice(0, -3) + "y" : "";
      if (ies && KNOWN.has(ies)) return ies + tail;
      if (isKnown(w)) return tok;
      const fix = nearWord(w) ?? (w.endsWith("s") ? nearWord(w.slice(0, -1)) : null);
      if (fix) {
        fixes.push(`typo "${w}" → ${fix}`);
        return fix + tail;
      }
      return tok;
    })
    .join(" ");
}

/** Lower-case, then rewrite number words, Hindi numbers, "1.5k", "2 thousand", spelling variants and typos. */
export function normalise(text: string): { t: string; fixes: string[] } {
  const fixes: string[] = [];
  let t = norm(text);
  t = t.replace(HI_NUM_RE, (_m, w: string) => {
    fixes.push(`Hindi number "${w}" → ${HI_NUM[w]}`);
    return `${HI_NUM[w]} `;
  });
  t = wordsToDigits(t, fixes);
  t = t.replace(/\b(\d+) and (?:a )?half\b/g, "$1.5");
  t = t.replace(THOUSAND_RE, (m, n: string) => {
    const v = Math.round(parseFloat(n) * 1000);
    fixes.push(`"${m}" → ${v}`);
    return String(v);
  });
  t = t.replace(HUNDRED_RE, (m, n: string) => {
    const v = Math.round(parseFloat(n) * 100);
    fixes.push(`"${m}" → ${v}`);
    return String(v);
  });
  t = fixWords(t, fixes);
  return { t, fixes };
}

// ---------- extractors ----------

function bandFromYears(y: number): Band | null {
  if (y < 3) return "0-2";
  if (y < 6) return "3-5";
  if (y < 9) return "6-8";
  if (y < 13) return "9-12";
  if (y < 15) return "13+";
  return null;
}
function capFrom(n: number): BudgetCap {
  let c: BudgetCap = 500;
  for (const b of BUDGETS) if (n >= b) c = b;
  return c;
}

const YEARS_UNIT = `(?:years?|yrs?|yr|yo|y\\/o|${alt(YEAR_WORDS)})`;
const ORD = "(?:st|nd|rd|th)";
/** School class N = age N + 5 (Indian schools; confirmed by the owner 2026-11-26). */
const SCHOOL_OFFSET = 5;

type AgeHit = { years: number; hit: string };
const NUM_START = "(?<![\\d.,])";

/** Every explicit age in the message ("my 4 and 9 year olds" → 4 and 9). A range counts once, at its midpoint. */
function explicitAges(t: string): AgeHit[] {
  const found: AgeHit[] = [];
  let s = t;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => number[]) => {
    for (const m of s.matchAll(re)) for (const years of f(m)) found.push({ years, hit: m[0] });
    s = s.replace(re, " ");
  };
  const nums = (m: RegExpMatchArray) => m[1].match(/\d{1,2}/g)!.map(Number);
  take(new RegExp(`${NUM_START}(\\d{1,2})\\s*(?:-|to)\\s*(\\d{1,2})\\s*${YEARS_UNIT}\\b(?:\\s*-?\\s*olds?)?`, "g"), (m) => [(+m[1] + +m[2]) / 2]);
  take(new RegExp(`(?:\\baged?\\s*)?${NUM_START}(\\d{1,2}(?:\\s*(?:,|and|&)\\s*(?:an?\\s+)?\\d{1,2})+)\\s*-?\\s*${YEARS_UNIT}\\b(?:\\s*-?\\s*olds?)?`, "g"), nums);
  take(/\baged?\s*(\d{1,2}(?:\s*(?:,|and|&)\s*\d{1,2})+)\b/g, nums);
  take(new RegExp(`${NUM_START}(\\d{1,2}(?:\\.\\d)?)\\s*[- ]?\\s*${YEARS_UNIT}\\b(?:\\s*-?\\s*olds?)?`, "g"), (m) => [+m[1]]);
  take(new RegExp(`${NUM_START}(\\d{1,2})\\s*-?\\s*(?:months?|mos?)\\b(?:\\s*-?\\s*old)?`, "g"), (m) => [+m[1] / 12]);
  take(/\b(?:aged?|age of)\s*(\d{1,2})\b/g, (m) => [+m[1]]);
  return found;
}

/** One age when no explicit "N years" is given: "5th birthday", "turning 7", "class 2", life stages. */
function impliedAge(t: string): { years?: number; hit?: string; low?: boolean } {
  let m = t.match(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:${alt(BIRTHDAY_WORDS)})\\b`));
  if (m) return { years: +m[1], hit: m[0] };
  m = t.match(/\b(?:turning|turns|turned|will be|is going to be)\s+(\d{1,2})\b(?!\s*(?:rs|rupees|%|\d))/);
  if (m) return { years: +m[1], hit: m[0] };
  m = t.match(new RegExp(`\\b(?:class|grade|std|standard)\\s*(\\d{1,2})${ORD}?\\b`)) ?? t.match(new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:class|grade|std|standard)\\b`));
  if (m) return { years: +m[1] + SCHOOL_OFFSET, hit: m[0] };
  for (const s of LIFE_STAGES) {
    const x = t.match(s.re);
    if (x) return { years: s.years, hit: x[0], low: true };
  }
  return {};
}

const AMOUNT = "(\\d[\\d,]*)";
const CUR = "(?:rs\\.?|inr|₹)";
const BUDGET_PATTERNS = [
  new RegExp(`(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of| is)?|around|about|not more than|no more than)\\s*${CUR}?\\s*${AMOUNT}`),
  new RegExp(`${CUR}\\s*${AMOUNT}`),
  new RegExp(`${AMOUNT}\\s*(?:rs|rupees|inr|bucks)\\b`),
  new RegExp(`${AMOUNT}\\s*(?:\\/-\\s*)?(?:budget|max|maximum|tak|ke andar|ke under|mein|me|total|only)\\b`),
];
/** A bare 3-6 digit number that is not an age, a year or a count. In this chat it is almost always money. */
const BARE_AMOUNT = /(?<![\d.])(?<!\b(?:born|in|since|year|class|grade|std|no|number)\s)(\d{1,3}(?:,\d{2,3})+|\d{3,6})(?![\d.,])(?!\s*(?:-\s*)?(?:months?|mos?|years?|yrs?|yr|yo|saal|days?|weeks?|pieces?|pcs|%|cm|mm|kg)\b)/;

function budgetFrom(t: string): { cap?: BudgetCap; clear?: boolean; hit?: string; low?: boolean } {
  if (/\b(any budget|no budget|remove budget|no limit)\b/.test(t)) return { clear: true, hit: "any budget" };
  const num = (s: string) => parseInt(s.replace(/,/g, ""), 10);
  const between = t.match(new RegExp(`between\\s*${CUR}?\\s*${AMOUNT}\\s*(?:and|to|-)\\s*${CUR}?\\s*${AMOUNT}`));
  if (between) return { cap: capFrom(num(between[2])), hit: between[0] };
  const over = t.match(new RegExp(`(?<!\\b(?:no|not|nothing)\\s)(?:over|above|more than)\\s*${CUR}?\\s*${AMOUNT}`));
  if (over && num(over[1]) >= 1000) return { cap: 5000, hit: over[0] };
  for (const re of BUDGET_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const n = num(m[1]);
      const hasCur = /rs|inr|₹|rupee|bucks/.test(m[0]);
      if (n >= 100 || hasCur) return { cap: capFrom(n), hit: m[0] };
    }
  }
  const bare = t.match(BARE_AMOUNT);
  if (bare && num(bare[1]) >= 100) return { cap: capFrom(num(bare[1])), hit: bare[0] };
  for (const w of BUDGET_WORDS) {
    const x = t.match(w.re);
    if (x) return { cap: w.cap, hit: x[0], low: true };
  }
  return {};
}

const GIFT_RE = new RegExp(`\\b(${alt([...GIFT_WORDS, ...GIFT_PEOPLE], true)})\\b`);
const OWN_RE = new RegExp(`\\bmy (?:[\\d.]+\\s*-?\\s*(?:${YEARS_UNIT}|months?|mos?)?\\s*-?\\s*(?:old\\s+)?)?(${alt(OWN_PEOPLE)})s?\\b|\\b(${alt(OWN_HINGLISH)})\\b`);
const BOY_RE = new RegExp(`\\b(${alt(BOY_WORDS)})\\b`);
const GIRL_RE = new RegExp(`\\b(${alt(GIRL_WORDS)})\\b`);
const BIRTHDAY_RE = new RegExp(`\\b(${alt(BIRTHDAY_WORDS)})\\b`);
const FESTIVAL_RE = new RegExp(`\\b(${alt(FESTIVAL_WORDS)})\\b`);
const PRODUCT_RE = new RegExp(`\\b(${alt(PRODUCT_NOUNS)})\\b`);

// ---------- negation ----------

type Excluded = NonNullable<Parse["excluded"]>;
const startsCue = (bare: string[], ends: boolean[], i: number, cue: string[]) =>
  cue.every((w, k) => bare[i + k] === w) && !ends.slice(i, i + cue.length - 1).some(Boolean);

/**
 * NegEx-style scopes. A cue ("no", "doesnt like", "without") negates up to 4 words after it, stopping at
 * punctuation, "but", "for" and similar, or "and" when a new clause starts. Hinglish "nahi" / "mat do"
 * negate up to 3 words before them. Negated words are masked so they are not matched as wanted, and
 * are reported in `excluded`. Ages and budgets are read from the unmasked text, so "nothing noisy for a
 * 3 year old" still gives 3-5.
 */
function negations(t: string): { masked: string; excluded?: Excluded; hits: string[] } {
  const toks = t.split(" ");
  const bare = toks.map((x) => x.replace(/[.,]+$/, ""));
  const ends = toks.map((x) => /[.,]$/.test(x));
  const masked = new Set<number>();
  const scopes: number[][] = [];
  const hits: string[] = [];
  const isCue = (j: number) => NEG_BEFORE.some((c) => startsCue(bare, ends, j, c));
  for (let i = 0; i < toks.length; i++) {
    if (masked.has(i)) continue;
    const pre = NEG_BEFORE.find((c) => startsCue(bare, ends, i, c));
    if (pre) {
      const after = i + pre.length;
      const next = bare[after];
      const single = pre.length === 1 && ["no", "not", "never"].includes(pre[0]);
      if (single && (next === undefined || NOT_NEGATED_AFTER_NO.has(next) || /^\d/.test(next) || ends[i])) continue;
      for (let k = i; k < after; k++) masked.add(k);
      hits.push(pre.join(" "));
      const scope: number[] = [];
      if (!ends[after - 1])
        for (let j = after; j < toks.length && scope.length < 4; j++) {
          const w = bare[j];
          if (SCOPE_END.has(w) || isCue(j)) break;
          if (w === "and" && (isCue(j + 1) || ["he", "she", "they", "likes", "loves", "wants", "but"].includes(bare[j + 1]))) break;
          scope.push(j);
          if (ends[j]) break;
        }
      scope.forEach((j) => masked.add(j));
      scopes.push(scope);
      i = after - 1;
      continue;
    }
    const post = NEG_AFTER.find((c) => startsCue(bare, ends, i, c));
    if (post) {
      const scope: number[] = [];
      for (let j = i - 1; j >= 0 && scope.length < 3; j--) {
        if (ends[j] || masked.has(j) || SCOPE_END.has(bare[j]) || bare[j] === "and") break;
        scope.unshift(j);
      }
      if (!scope.length) continue;
      for (let k = i; k < i + post.length; k++) masked.add(k);
      scope.forEach((j) => masked.add(j));
      scopes.push(scope);
      hits.push(post.join(" "));
      i += post.length - 1;
    }
  }
  if (!scopes.length) return { masked: t, hits };

  const ex: Excluded = { categories: [], interests: [], other: [] };
  for (const scope of scopes) {
    const phrase = scope.map((j) => bare[j]).join(" ");
    for (const [cat, words] of Object.entries(CAT_WORDS)) if (words.some((w) => wordRe(w).test(phrase)) && !ex.categories.includes(cat)) ex.categories.push(cat);
    for (const [i, words] of Object.entries(INT_WORDS)) if (words.some((w) => wordRe(w).test(phrase)) && !ex.interests.includes(i)) ex.interests.push(i);
    let run: string[] = [];
    const flush = () => {
      if (run.length) ex.other.push(run.join(" ").slice(0, 30));
      run = [];
    };
    for (const j of scope) {
      const w = bare[j];
      if (!w || STOP.has(w) || NEG_FILLER.has(w) || isKnown(w) || /^[\d₹.,+\-/]+$/.test(w)) flush();
      else run.push(w);
    }
    flush();
  }
  ex.other = [...new Set(ex.other)].slice(0, 3);
  const empty = !ex.categories.length && !ex.interests.length && !ex.other.length;
  const out = toks.map((x, i) => (masked.has(i) ? (ends[i] ? "~," : "~") : x)).join(" ");
  return { masked: out, excluded: empty ? undefined : ex, hits };
}

// ---------- corrections ----------

const CORRECTION_RE = /\b(actually|instead|no wait|wait|sorry|i meant|i mean|make it|change (?:it|the \w+|\w+) to|rather)\b/;
const NOT_NUM_RE = /\bnot (\d{1,2})\s*,?\s+(?:(?:shes|hes|she is|he is|its|it is|make it|but|rather)\s+)?(\d{1,2})\b(?![\d.,]|\s*(?:k|thousand|rs|rupees)\b)/;
const CUE_NUM_RE = /\b(?:actually|instead|no wait|wait|sorry|i meant|i mean|make it|change (?:it|the age|age) to)\b\D{0,20}?(?<![\d.,])(\d{1,2})(?![\d.,]|\s*(?:k|thousand|rs|rupees)\b)/;
const ANY_CATEGORY_RE = /\bany (type|kind|category|sort)\b|^anything( is (fine|ok|okay|good)| works| goes)?$/;
const ANY_INTEREST_RE = /\bany interests?\b/;

export function rulesParse(text: string): Parse {
  const n = normalise(text);
  let t = n.t;
  const fixes = n.fixes;
  const typoTargets = new Set(fixes.map((f) => f.match(/^typo ".*" → (.+)$/)?.[1]).filter(Boolean));
  const matched: string[] = [];
  const slots: Slots = {};
  const clear: (keyof Slots)[] = [];
  const confidence: Parse["confidence"] = {};
  const hit = (s?: string) => s && matched.push(s);

  const reset = RESET_RE.test(t);
  if (reset) hit(t.match(RESET_RE)![0]);

  // Corrections: "not 5, 6" names the new value right after the old one.
  const correcting = CORRECTION_RE.test(t);
  if (correcting) hit(t.match(CORRECTION_RE)![0]);
  let correctedYears: number | undefined;
  const notNum = t.match(NOT_NUM_RE);
  if (notNum) {
    correctedYears = +notNum[2];
    hit(notNum[0]);
    t = t.replace(notNum[0], notNum[0].replace(/^not \d{1,2}\s*,?/, ""));
  }
  // "not for a boy" only removes that word; the rest of the message says who it is for.
  t = t.replace(/\bnot for an? (boy|girl)\b/, " ");

  const neg = negations(t);
  neg.hits.forEach(hit);
  const tm = neg.masked; // wanted things are matched on this; ages and budgets on t

  // Ages: every explicit age; two different bands is a conflict, not a guess.
  let outOfRange: number | undefined;
  let conflict: Band[] | undefined;
  const ages = explicitAges(t);
  if (ages.length) {
    ages.forEach((a) => hit(a.hit));
    const bands = [...new Set(ages.map((a) => bandFromYears(a.years)).filter((b): b is Band => !!b))];
    if (!bands.length) outOfRange = ages[0].years;
    else if (bands.length > 1) conflict = BANDS.filter((b) => bands.includes(b));
    else {
      slots.age = bands[0];
      confidence.age = "high";
    }
  } else {
    const cueNum = correctedYears === undefined ? t.match(CUE_NUM_RE) : null;
    const imp = correctedYears !== undefined ? { years: correctedYears } : cueNum ? { years: +cueNum[1], hit: cueNum[0] } : impliedAge(t);
    if (imp.years !== undefined) {
      const b = bandFromYears(imp.years);
      if (b) {
        slots.age = b;
        confidence.age = "low" in imp && imp.low ? "low" : "high";
      } else outOfRange = imp.years;
      hit(imp.hit);
    }
  }

  const bud = budgetFrom(t);
  if (bud.clear) clear.push("budget");
  else if (bud.cap) {
    slots.budget = bud.cap;
    confidence.budget = bud.low ? "low" : "high";
  }
  hit(bud.hit);

  for (const [cat, words] of Object.entries(CAT_WORDS)) {
    const w = words.find((x) => wordRe(x).test(tm));
    if (w) {
      slots.category = cat;
      confidence.category = typoTargets.has(w) ? "low" : "high";
      hit(tm.match(wordRe(w))![0]);
      break;
    }
  }
  const ints: string[] = [];
  let intTypo = false;
  for (const [i, words] of Object.entries(INT_WORDS)) {
    const w = words.find((x) => wordRe(x).test(tm));
    if (w) {
      ints.push(i);
      if (typoTargets.has(w)) intTypo = true;
      hit(tm.match(wordRe(w))![0]);
    }
  }
  if (ints.length) {
    slots.interests = ints.slice(0, 2);
    confidence.interests = intTypo ? "low" : "high";
  }

  if (ANY_CATEGORY_RE.test(t)) {
    clear.push("category");
    hit(t.match(ANY_CATEGORY_RE)![0]);
  }
  if (ANY_INTEREST_RE.test(t)) {
    clear.push("interests");
    hit(t.match(ANY_INTEREST_RE)![0]);
  }

  let recipient: Recipient | undefined;
  const gift = tm.match(GIFT_RE)?.[0];
  const own = gift ? undefined : tm.match(OWN_RE)?.[0];
  if (gift) recipient = "gift";
  else if (own) recipient = "own";
  if (recipient) {
    slots.recipient = recipient;
    confidence.recipient = "high";
    hit(gift ?? own);
  }
  let occasion: Occasion | undefined;
  if (/\breturn gifts?\b/.test(tm)) occasion = "return_gift";
  else if (BIRTHDAY_RE.test(tm)) occasion = "birthday";
  else if (FESTIVAL_RE.test(tm)) occasion = "festival";
  if (occasion) {
    slots.occasion = occasion;
    confidence.occasion = "high";
  }

  const boys = [...tm.matchAll(new RegExp(BOY_RE.source, "g"))].map((m) => m[0]);
  const girls = [...tm.matchAll(new RegExp(GIRL_RE.source, "g"))].map((m) => m[0]);
  if (boys.length && !girls.length) slots.gender = "boy" as Gender;
  else if (girls.length && !boys.length) slots.gender = "girl" as Gender;
  if (slots.gender) {
    const words = boys.length ? boys : girls;
    confidence.gender = words.every((w) => PRONOUNS.has(w)) ? "low" : "high";
    hit(words[0]);
  }

  const pers = t.match(/\b(personali[sz]\w*|customi[sz]ed?|engrav\w*|name on (it|the \w+)|with (their|his|her|a) name)\b/)?.[0];
  if (pers) {
    slots.personalisable = true;
    confidence.personalisable = "high";
    hit(pers);
  }

  const corrections = correcting || notNum ? [...new Set([...(Object.keys(slots) as (keyof Slots)[]), ...clear])] : [];

  const cert = t.match(CERT_RE)?.[0];
  const hasSlots = Object.keys(slots).length > 0 || clear.length > 0 || !!conflict || !!neg.excluded;
  let intent: Intent = "other";
  if (outOfRange !== undefined) intent = "out_of_range";
  else if (cert) intent = "cert";
  else if (ADVICE_RE.test(t) && !(slots.category || slots.budget || slots.interests)) intent = "advice";
  else if (hasSlots || reset || PRODUCT_RE.test(t)) intent = "search";
  else if (/^(hi+|hello|hey|namaste|good (morning|evening|afternoon))\b/.test(t)) intent = "greeting";

  const consumed = new Set(matched.flatMap((m) => m.split(/\s+/)));
  const unexplained = tm
    .split(" ")
    .map((w) => w.replace(/[.,]+$/g, ""))
    .filter((w) => w && w !== "~" && !/^[\d₹.,+\-/]+$/.test(w) && !STOP.has(w) && !consumed.has(w) && !isKnown(w));
  return {
    intent, slots, clear, reset, cert, outOfRange, matched, unexplained, fixes, confidence, corrections,
    ...(conflict ? { conflicts: { ages: conflict } } : {}),
    ...(neg.excluded ? { excluded: neg.excluded } : {}),
  };
}

/** Edit distance where swapping two neighbouring letters counts as one mistake ("puzzel" → "puzzle"). */
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
const DICT = [...new Set([...Object.values(CAT_WORDS).flat(), ...Object.values(INT_WORDS).flat()].filter((w) => !w.includes(" ") && w.length >= 5))];
/** The dictionary word a typo most likely meant, or null when there is none or it is ambiguous. */
function nearWord(w: string): string | null {
  if (w.length < 5 || DICT.includes(w) || NOT_TYPOS.has(w)) return null;
  const lim = w.length >= 8 ? 2 : 1;
  let best = Infinity;
  let cands: string[] = [];
  for (const d of DICT) {
    if (d[0] !== w[0]) continue; // people rarely mistype the first letter; this avoids "instructions" → "construction"
    const x = lev(w, d);
    if (x > lim) continue;
    if (x < best) {
      best = x;
      cands = [d];
    } else if (x === best) cands.push(d);
  }
  // Two equally close words: a same-length word (one wrong letter) is the likelier typo.
  if (cands.length > 1) cands = cands.filter((d) => d.length === w.length);
  return cands.length === 1 ? cands[0] : null;
}

/** Decide whether the rules are enough or a model call is needed. `text` is the message, for its length. */
export function needsLlm(p: Parse, text = ""): { llm: boolean; why: string } {
  if (p.reset) return { llm: false, why: "reset phrase matched by rules" };
  if (["advice", "greeting", "cert", "out_of_range"].includes(p.intent)) return { llm: false, why: `intent '${p.intent}' matched by rules` };
  if (p.conflicts?.ages) return { llm: false, why: "several ages: the rules ask which child" };
  const nSlots = Object.keys(p.slots).length;
  if (!nSlots && !p.clear.length) return { llm: true, why: "rules found no slot" };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > 15 && nSlots <= 1) return { llm: true, why: `long message (${words} words) with only ${nSlots} slot found` };
  if (p.excluded?.other.length) return { llm: true, why: `negation the rules could not map: ${p.excluded.other.join(", ")}` };
  if (nSlots === 1 && p.confidence.age === "low") return { llm: true, why: "only a guessed age (life-stage word) found" };
  if (p.unexplained.length > 3) return { llm: true, why: `${p.unexplained.length} words left unexplained` };
  return { llm: false, why: "rules explain the message" };
}

export interface LlmResult {
  parse: Parse;
  tokensIn: number;
  tokensOut: number;
  costRs: number;
  notes: string[];
}
const RATE = 95;
export const llmCost = (tin: number, tout: number) => ((tin * 0.1 + tout * 0.5) / 1e6) * RATE; // Haiku 5.5 list price from the design pack

/** SIMULATED model call. Normalises number words, typos and slang, then reuses the rules. */
export function llmParse(text: string, prev: Slots): LlmResult {
  const notes: string[] = [];
  let t = norm(text);
  t = t
    .split(" ")
    .map((w) => {
      if (w in NUM_WORDS) {
        notes.push(`number word "${w}" → ${NUM_WORDS[w]}`);
        return String(NUM_WORDS[w]);
      }
      if (w === "bday") {
        notes.push('slang "bday" → birthday');
        return "birthday";
      }
      const fix = nearWord(w);
      if (fix) {
        notes.push(`typo "${w}" → ${fix}`);
        return fix;
      }
      return w;
    })
    .join(" ");
  t = t.replace(/\b(?:turning|turned|turns)\s+(\d{1,2})\b/, (_m, n) => {
    notes.push(`"turning ${n}" → age ${n}`);
    return `${n} years old`;
  });
  t = t.replace(/\b(\d{1,2})\s+(?:and a half|1\/2)\b/, "$1 years");
  const parse = rulesParse(t);
  if (parse.intent === "other") notes.push("no product intent found → off-topic");
  const tin = 650 + Math.ceil(text.length / 4) + Math.ceil(JSON.stringify(prev).length / 4);
  const tout = 120;
  return { parse, tokensIn: tin, tokensOut: tout, costRs: llmCost(tin, tout), notes };
}

// ---------- real model (Ops switch "Real"): the form it fills, the check on its answer, the merge ----------
// Pure, so smoke.ts can test them. The call itself lives in app/api/parse/route.ts.

export type ModelIntent = "search" | "greeting" | "advice" | "other";
const MODEL_INTENTS: ModelIntent[] = ["search", "greeting", "advice", "other"];
const RECIPIENTS: Recipient[] = ["own", "gift"];
const OCCASIONS: Occasion[] = ["birthday", "festival", "return_gift"];
const GENDERS: Gender[] = ["boy", "girl"];
const orNull = (s: Record<string, unknown>) => ({ anyOf: [s, { type: "null" }] });

/** The only shape the model may answer with: the fixed lists from types.ts, nothing free-form. */
export const MODEL_SLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "age", "budget", "category", "interests", "recipient", "occasion", "gender", "personalisable", "ages_mentioned"],
  properties: {
    intent: { type: "string", enum: MODEL_INTENTS },
    age: orNull({ type: "string", enum: BANDS }),
    budget: orNull({ type: "integer", enum: BUDGETS }),
    category: orNull({ type: "string", enum: Object.keys(CATEGORIES) }),
    interests: { type: "array", items: { type: "string", enum: Object.keys(INTERESTS) } },
    recipient: orNull({ type: "string", enum: RECIPIENTS }),
    occasion: orNull({ type: "string", enum: OCCASIONS }),
    gender: orNull({ type: "string", enum: GENDERS }),
    personalisable: { type: "boolean" },
    ages_mentioned: { type: "array", items: { type: "string", enum: BANDS } },
  },
} as const;

export interface ModelSlots {
  intent: ModelIntent;
  slots: Slots;
  agesMentioned: Band[];
  /** Values thrown away because they were outside the fixed lists. */
  dropped: string[];
}

/** Keep only values from the fixed lists; at most 2 interests. Never trusts the model's JSON. */
export function validateModelSlots(raw: unknown): ModelSlots {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dropped: string[] = [];
  const pick = <T,>(k: string, allowed: readonly T[]): T | undefined => {
    const v = r[k];
    if (v === null || v === undefined) return undefined;
    if (allowed.includes(v as T)) return v as T;
    dropped.push(`${k}=${JSON.stringify(v)}`);
    return undefined;
  };
  const list = <T,>(k: string, allowed: readonly T[]): T[] => {
    const v = r[k];
    if (!Array.isArray(v)) return [];
    const ok = v.filter((x) => allowed.includes(x as T)) as T[];
    v.filter((x) => !allowed.includes(x as T)).forEach((x) => dropped.push(`${k}=${JSON.stringify(x)}`));
    return [...new Set(ok)];
  };
  const slots: Slots = {};
  const age = pick("age", BANDS);
  if (age) slots.age = age;
  const budget = pick("budget", BUDGETS);
  if (budget) slots.budget = budget;
  const category = pick("category", Object.keys(CATEGORIES));
  if (category) slots.category = category;
  const interests = list("interests", Object.keys(INTERESTS));
  if (interests.length > 2) dropped.push(`interests beyond 2: ${interests.slice(2).join(", ")}`);
  if (interests.length) slots.interests = interests.slice(0, 2);
  const recipient = pick("recipient", RECIPIENTS);
  if (recipient) slots.recipient = recipient;
  const occasion = pick("occasion", OCCASIONS);
  if (occasion) slots.occasion = occasion;
  const gender = pick("gender", GENDERS);
  if (gender) slots.gender = gender;
  if (r.personalisable === true) slots.personalisable = true;
  const intent = pick("intent", MODEL_INTENTS) ?? "other";
  return { intent, slots, agesMentioned: list("ages_mentioned", BANDS), dropped };
}

/** The rules win: the model only fills slots the rules left empty, and never undoes a clear, exclusion or conflict. */
export function mergeModelBelowRules(rules: Parse, m: ModelSlots): { parse: Parse; filled: (keyof Slots)[] } {
  const slots: Slots = { ...rules.slots };
  const confidence = { ...rules.confidence };
  const filled: (keyof Slots)[] = [];
  const ex = rules.excluded;
  const blocked = (k: keyof Slots) => rules.clear.includes(k) || (k === "age" && !!rules.conflicts?.ages);
  for (const [k, v] of Object.entries(m.slots) as [keyof Slots, unknown][]) {
    if (slots[k] !== undefined || blocked(k)) continue;
    let val = v;
    if (k === "interests") val = (v as string[]).filter((i) => !ex?.interests.includes(i));
    if (k === "category" && ex?.categories.includes(v as string)) continue;
    if (Array.isArray(val) && !val.length) continue;
    (slots as Record<string, unknown>)[k] = val;
    confidence[k] = "high";
    filled.push(k);
  }
  let conflicts = rules.conflicts;
  const ages = [...new Set(m.agesMentioned)];
  if (!conflicts && !rules.slots.age && ages.length >= 2) {
    conflicts = { ages: BANDS.filter((b) => ages.includes(b)) };
    delete slots.age;
    delete confidence.age;
    const at = filled.indexOf("age");
    if (at >= 0) filled.splice(at, 1);
  }
  // Only an "other" from the rules can be changed, and never to cert or out_of_range (those stay rules-only).
  const intent: Intent = rules.intent === "other" ? (m.intent === "search" && !filled.length && !conflicts ? "other" : m.intent) : rules.intent;
  return { parse: { ...rules, slots, confidence, intent, ...(conflicts ? { conflicts } : {}) }, filled };
}

export function mergeSlots(prev: Slots, inc: Slots, clear: (keyof Slots)[] = [], reset = false): Slots {
  const next: Slots = reset ? {} : { ...prev };
  for (const k of clear) delete next[k];
  for (const [k, v] of Object.entries(inc) as [keyof Slots, unknown][]) {
    if (k === "interests") {
      const merged = [...(v as string[]), ...(next.interests ?? [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 2);
      next.interests = merged;
    } else (next as Record<string, unknown>)[k] = v;
  }
  return next;
}

export const slotKey = (s: Slots) =>
  [`age=${s.age ?? ""}`, `cat=${s.category ?? ""}`, `max=${s.budget ?? ""}`, `int=${[...(s.interests ?? [])].sort().join("+")}`, `for=${s.recipient ?? ""}`, `occ=${s.occasion ?? ""}`, `g=${s.gender ?? ""}`, `pers=${s.personalisable ? 1 : ""}`].join("|");

export function describeSlots(s: Slots): string {
  const parts: string[] = [];
  if (s.age) parts.push(`ages ${bandLabel(s.age).replace(" years", "")}`);
  if (s.category) parts.push(CATEGORIES[s.category]);
  if (s.budget) parts.push(budgetLabel(s.budget).toLowerCase());
  if (s.interests?.length) parts.push(`loves ${s.interests.map((i) => INTERESTS[i].toLowerCase()).join(" and ")}`);
  if (s.recipient === "gift") parts.push(s.occasion === "birthday" ? "birthday gift" : s.occasion === "return_gift" ? "return gift" : s.occasion === "festival" ? "festival gift" : "gift");
  if (s.personalisable) parts.push("can be personalised");
  if (s.gender) parts.push(`for a ${s.gender}`);
  if (s.recipient === "own" && !parts.length) parts.push("for your child");
  return parts.join(" · ");
}

/** Advice questions we can't answer, mapped to a safe related search. Fixed list, never model-written. */
const RELATED: { re: RegExp; cat: string; label: string }[] = [
  { re: /\b(sleep\w*|bedtime|night ?time|wont sleep)\b/, cat: "books", label: "Bedtime books" },
  { re: /\b(screen ?time|tv|phone|tablet|ipad)\b/, cat: "outdoor", label: "Outdoor play" },
  { re: /\b(tantrum\w*|meltdown\w*|anxious|calm\w*)\b/, cat: "sensory", label: "Calming sensory toys" },
  { re: /\b(homework|study|focus|concentrat\w*)\b/, cat: "puzzles", label: "Puzzles and games" },
  { re: /\b(potty|toilet)\b/, cat: "books", label: "Picture books about potty training" },
];
export function relatedSearch(text: string): { cat: string; label: string } | null {
  const t = norm(text);
  const hit = RELATED.find((r) => r.re.test(t));
  return hit ? { cat: hit.cat, label: hit.label } : null;
}

export type SlotGap = "age" | "budget" | "interests" | "recipient" | "gender";
const GAP_TEXT: Record<SlotGap, string> = {
  age: "the child's age",
  budget: "your budget",
  interests: "what they like",
  recipient: "whether it's a gift",
  gender: "whether it's for a boy or a girl",
};
/** Which of the details we ask about are still unknown, in the order we ask for them. */
export function missingSlots(s: Slots): SlotGap[] {
  const out: SlotGap[] = [];
  if (!s.age) out.push("age");
  if (!s.budget) out.push("budget");
  if (!s.interests?.length) out.push("interests");
  if (!s.recipient) out.push("recipient");
  if (!s.gender) out.push("gender");
  return out;
}
export function askFor(gaps: SlotGap[]): string {
  const t = gaps.map((g) => GAP_TEXT[g]);
  if (!t.length) return "";
  return t.length === 1 ? t[0] : `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}
