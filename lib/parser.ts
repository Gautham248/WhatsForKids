// Slot parser. Two paths:
//   1. rulesParse(): ordinary code (regex + dictionaries). Free and instant.
//   2. llmParse():  SIMULATED model call. In production a small model (Haiku-class) returns the
//      same JSON for messages the rules cannot cover (number words, typos, slang). Here it is
//      just a normaliser in front of the same rules, so the demo needs no API key.
// Output is always a coded slot object, never free text.

import { Band, BudgetCap, BUDGETS, Gender, Occasion, Recipient, Slots, CATEGORIES, INTERESTS, bandLabel, budgetLabel } from "./types";

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
}

const CAT_WORDS: Record<string, string[]> = {
  building: ["block", "building", "lego", "stacker", "stacking", "construction", "tiles", "magnetic"],
  pretend: ["pretend", "kitchen", "role play", "roleplay", "dress up", "dollhouse", "tent"],
  art: ["art", "craft", "paint", "painting", "watercolour", "watercolor", "clay", "drawing", "colouring", "coloring"],
  books: ["book", "story book", "storybook", "reading", "picture book", "atlas"],
  outdoor: ["outdoor", "outside", "garden", "bike", "kite", "park", "bug"],
  puzzles: ["puzzle", "board game", "game", "jigsaw"],
  music: ["music", "drum", "piano", "instrument", "kalimba", "xylophone", "musical"],
  stem: ["science", "stem", "experiment", "robot", "gear", "lab", "engineering"],
  soft: ["plush", "soft toy", "teddy", "stuffed", "cuddly", "stuffie"],
  sensory: ["sensory", "texture", "textured", "calming", "fidget"],
};
const INT_WORDS: Record<string, string[]> = {
  dinosaurs: ["dino", "dinosaur", "t-rex", "trex"],
  animals: ["animal", "elephant", "dog", "cat", "farm", "zoo", "puppy"],
  music: ["music", "song", "sing", "drum", "piano"],
  art: ["art", "paint", "draw", "craft", "clay", "colour"],
  building: ["build", "blocks", "lego", "construct"],
  vehicles: ["vehicle", "car", "truck", "train", "bus", "plane", "bike"],
  space: ["space", "rocket", "planet", "astronaut", "star", "moon"],
  nature: ["nature", "bug", "insect", "plant", "flower", "garden", "outdoor"],
  stories: ["story", "stories", "book", "mystery", "detective"],
  pretend: ["pretend", "kitchen", "role play", "shop", "fairy"],
};

const STOP = new Set(
  "a an the for my is are am to of and or with me i we want need looking look find show something some good nice best ideas idea gift gifts present toy toys kid kids child children old year years yr yrs under below rs inr please can could you get buy what which recommend suggest any your our he she his her they who that this it in on at be like loves love likes who's whats what's hi hello hey there boy girl son daughter new little something that's thing things option options about around within upto up than less more much too also just only really very so then if when where how do does did would should will have has had been being from into out as by off one".split(" "),
);
const NUM_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16 };

const ADVICE_RE = /\b(tantrum\w*|sleep(ing)?|potty|toilet|screen time|homework|weather|joke|recipe|news|diet|vaccin\w*|doctor|fever|discipline|how do i|how to|why does|capital of|bedtime routine|picky eat\w*)\b/;
const CERT_RE = /\b(isi|bis|certified|certification|certificate|non-?toxic|bpa|gots|ce marked|astm|en ?71|fda|lead[- ]free|safety tested)\b/;
const RESET_RE = /\b(start over|start again|reset|new search|clear (all|filters?)|forget that)\b/;

const esc = (w: string) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/ /g, "\\s+");
const wordRe = (w: string) => new RegExp(`\\b${esc(w)}(?:s|es)?\\b`);

export const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9₹.,+\- /]/g, " ").replace(/\s+/g, " ").trim();

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

function ageFrom(t: string): { band?: Band; years?: number; hit?: string } {
  let m = t.match(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s*(?:years?|yrs?|yo)\b/);
  if (m) return { years: (+m[1] + +m[2]) / 2, hit: m[0] };
  m = t.match(/(\d{1,2}(?:\.\d)?)\s*[- ]?\s*(?:years?|yrs?|yr|yo|y\/o)\b(?:\s*-?\s*old)?/);
  if (m) return { years: +m[1], hit: m[0] };
  m = t.match(/(\d{1,2})\s*(?:months?|mos?)\b(?:\s*old)?/);
  if (m) return { years: +m[1] / 12, hit: m[0] };
  m = t.match(/\b(?:aged?|age of)\s*(\d{1,2})\b/);
  if (m) return { years: +m[1], hit: m[0] };
  if (/\b(newborn|infant|baby|babies|toddler)\b/.test(t)) return { years: 1, hit: t.match(/\b(newborn|infant|baby|babies|toddler)\b/)![0] };
  if (/\b(preschool(er)?|nursery|lkg|ukg|kindergarten)\b/.test(t)) return { years: 4, hit: t.match(/\b(preschool(er)?|nursery|lkg|ukg|kindergarten)\b/)![0] };
  if (/\b(teen(ager)?|tween)\b/.test(t)) return { years: 13, hit: t.match(/\b(teen(ager)?|tween)\b/)![0] };
  return {};
}

function budgetFrom(t: string): { cap?: BudgetCap; clear?: boolean; hit?: string } {
  if (/\b(any budget|no budget|remove budget|no limit)\b/.test(t)) return { clear: true, hit: "any budget" };
  const between = t.match(/between\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)\s*(?:and|to|-)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)/);
  if (between) return { cap: capFrom(parseInt(between[2].replace(/,/g, ""), 10)), hit: between[0] };
  const over = t.match(/(?:over|above|more than)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)/);
  if (over && parseInt(over[1].replace(/,/g, ""), 10) >= 1000) return { cap: 5000, hit: over[0] };
  const pats = [
    /(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of| is)?|around|about|not more than|no more than)\s*(?:rs\.?|inr|₹)?\s*(\d[\d,]*)/,
    /(?:rs\.?|inr|₹)\s*(\d[\d,]*)/,
    /(\d[\d,]*)\s*(?:rs|rupees|inr)\b/,
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      const hasCur = /rs|inr|₹|rupee/.test(m[0]);
      if (n >= 100 || hasCur) return { cap: capFrom(n), hit: m[0] };
    }
  }
  if (/\b(cheap|affordable|inexpensive|low cost)\b/.test(t)) return { cap: 500, hit: t.match(/\b(cheap|affordable|inexpensive|low cost)\b/)![0] };
  return {};
}

export function rulesParse(text: string): Parse {
  const t = norm(text);
  const matched: string[] = [];
  const slots: Slots = {};
  const clear: (keyof Slots)[] = [];
  const hit = (s?: string) => s && matched.push(s);

  const reset = RESET_RE.test(t);
  if (reset) hit(t.match(RESET_RE)![0]);

  const age = ageFrom(t);
  let outOfRange: number | undefined;
  if (age.years !== undefined) {
    const b = bandFromYears(age.years);
    if (b) slots.age = b;
    else outOfRange = age.years;
    hit(age.hit);
  }
  const bud = budgetFrom(t);
  if (bud.clear) clear.push("budget");
  else if (bud.cap) slots.budget = bud.cap;
  hit(bud.hit);

  for (const [cat, words] of Object.entries(CAT_WORDS)) {
    const w = words.find((x) => wordRe(x).test(t));
    if (w) {
      slots.category = cat;
      hit(t.match(wordRe(w))![0]);
      break;
    }
  }
  const ints: string[] = [];
  for (const [i, words] of Object.entries(INT_WORDS)) {
    const w = words.find((x) => wordRe(x).test(t));
    if (w) {
      ints.push(i);
      hit(t.match(wordRe(w))![0]);
    }
  }
  if (ints.length) slots.interests = ints.slice(0, 2);

  let recipient: Recipient | undefined;
  if (/\bmy (nephew|niece|cousin|friend|grandson|granddaughter|godson|goddaughter)/.test(t) || /\b(gift|present|birthday|bday|return gifts?|nephew|niece|friends?|cousin|grandson|granddaughter|godson|goddaughter|neighbou?r|classmate)\b/.test(t)) recipient = "gift";
  else if (/\bmy (son|daughter|kid|child|toddler|baby|boy|girl|little one)\b/.test(t)) recipient = "own";
  if (recipient) {
    slots.recipient = recipient;
    hit(t.match(/\b(gift|present|birthday|bday|return gifts?|nephew|niece|friends?|cousin|grandson|granddaughter|godson|goddaughter|neighbou?r|classmate|my (son|daughter|kid|child|toddler|baby|boy|girl|little one))\b/)?.[0]);
  }
  let occasion: Occasion | undefined;
  if (/\breturn gifts?\b/.test(t)) occasion = "return_gift";
  else if (/\b(birthday|bday)\b/.test(t)) occasion = "birthday";
  else if (/\b(diwali|festival|christmas|eid|holi|rakhi|puja)\b/.test(t)) occasion = "festival";
  if (occasion) slots.occasion = occasion;

  const BOY_RE = /\b(boy|son|nephew|grandson|godson|brother|him|he|his)\b/;
  const GIRL_RE = /\b(girl|daughter|niece|granddaughter|goddaughter|sister|her|she)\b/;
  const boy = t.match(BOY_RE)?.[0];
  const girl = t.match(GIRL_RE)?.[0];
  if (boy && !girl) slots.gender = "boy" as Gender;
  else if (girl && !boy) slots.gender = "girl" as Gender;
  if (slots.gender) hit(boy ?? girl);

  const cert = t.match(CERT_RE)?.[0];
  const hasSlots = Object.keys(slots).length > 0 || clear.length > 0;
  let intent: Intent = "other";
  if (outOfRange !== undefined) intent = "out_of_range";
  else if (cert) intent = "cert";
  else if (ADVICE_RE.test(t) && !(slots.category || slots.budget || slots.interests)) intent = "advice";
  else if (hasSlots || reset) intent = "search";
  else if (/^(hi+|hello|hey|namaste|good (morning|evening|afternoon))\b/.test(t)) intent = "greeting";

  const consumed = new Set(matched.flatMap((m) => m.split(/\s+/)));
  const known = new Set([...Object.values(CAT_WORDS).flat(), ...Object.values(INT_WORDS).flat()].flatMap((w) => w.split(" ")));
  const unexplained = t
    .split(" ")
    .map((w) => w.replace(/[.,]+$/g, ""))
    .filter((w) => w && !/^[\d₹.,+\-/]+$/.test(w) && !STOP.has(w) && !consumed.has(w) && !known.has(w.replace(/(es|s)$/, "")) && !known.has(w));
  return { intent, slots, clear, reset, cert, outOfRange, matched, unexplained };
}

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const DICT = [...new Set([...Object.values(CAT_WORDS).flat(), ...Object.values(INT_WORDS).flat()].filter((w) => !w.includes(" ") && w.length >= 5))];
function nearWord(w: string): string | null {
  if (w.length < 5 || DICT.includes(w)) return null;
  const lim = w.length >= 8 ? 2 : 1;
  let best: [string, number] | null = null;
  for (const d of DICT) {
    const x = lev(w, d);
    if (x <= lim && (!best || x < best[1])) best = [d, x];
  }
  return best ? best[0] : null;
}

/** Decide whether the rules are enough or a model call is needed. */
export function needsLlm(p: Parse): { llm: boolean; why: string } {
  if (p.reset) return { llm: false, why: "reset phrase matched by rules" };
  if (["advice", "greeting", "cert", "out_of_range"].includes(p.intent)) return { llm: false, why: `intent '${p.intent}' matched by rules` };
  const hasSlots = Object.keys(p.slots).length > 0 || p.clear.length > 0;
  if (!hasSlots) return { llm: true, why: "rules found no slot" };
  const odd = p.unexplained.filter((w) => nearWord(w) || w in NUM_WORDS || ["turning", "turned", "bday"].includes(w));
  if (odd.length) return { llm: true, why: `possible typo or number word: ${odd.join(", ")}` };
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
  [`age=${s.age ?? ""}`, `cat=${s.category ?? ""}`, `max=${s.budget ?? ""}`, `int=${[...(s.interests ?? [])].sort().join("+")}`, `for=${s.recipient ?? ""}`, `occ=${s.occasion ?? ""}`, `g=${s.gender ?? ""}`].join("|");

export function describeSlots(s: Slots): string {
  const parts: string[] = [];
  if (s.age) parts.push(`ages ${bandLabel(s.age).replace(" years", "")}`);
  if (s.category) parts.push(CATEGORIES[s.category]);
  if (s.budget) parts.push(budgetLabel(s.budget).toLowerCase());
  if (s.interests?.length) parts.push(`loves ${s.interests.map((i) => INTERESTS[i].toLowerCase()).join(" and ")}`);
  if (s.recipient === "gift") parts.push(s.occasion === "birthday" ? "birthday gift" : s.occasion === "return_gift" ? "return gift" : s.occasion === "festival" ? "festival gift" : "gift");
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
