// The parent-lane turn logic as one pure function, so it is easy to read and test.
// Raw text lives only in this in-memory chat object. Only coded slots are ever persisted.

import { Band, BudgetCap, BUDGETS, CATEGORIES, Data, Gender, HistoryEntry, INTERESTS, Occasion, Recipient, Slots, bandLabel, budgetLabel, BANDS } from "./types";
import { askFor, describeSlots, llmParse, mergeSlots, missingSlots, needsLlm, relatedSearch, rulesParse, Parse } from "./parser";
import { certSearch, search, SearchResult } from "./rank";

export type Act =
  | { t: "age"; band: Band }
  | { t: "cat"; cat: string }
  | { t: "budget"; cap: BudgetCap }
  | { t: "interest"; i: string }
  | { t: "recipient"; r: Recipient }
  | { t: "gender"; g: Gender }
  | { t: "occasion"; o: Occasion }
  | { t: "multi"; acts: Act[] }
  | { t: "relax"; what: "budget" | "category" }
  | { t: "profile" }
  | { t: "load"; slots: Slots }
  | { t: "reset" }
  | { t: "login" }
  | { t: "text"; text: string };
export interface Pill {
  label: string;
  act: Act;
  kind?: "try";
}
/** A set of related pills the user can pick from before applying. "one" = pick at most one, "many" = up to max. */
export interface PillGroup {
  key: string;
  label: string;
  mode: "one" | "many";
  max?: number;
  pills: Pill[];
}
export interface CardInfo {
  reason?: string;
  tag?: string;
  note?: string;
}
export interface Msg {
  id: number;
  role: "user" | "bot";
  text: string;
  cards?: string[];
  cardInfo?: Record<string, CardInfo>;
  pills?: Pill[];
  groups?: PillGroup[];
  hint?: string;
}
export interface TurnInfo {
  path: "text-rules" | "text-llm" | "pill" | "guard";
  why: string;
  input?: string;
  picked?: string[];
  intent?: string;
  before: Slots;
  parsed?: Slots;
  after: Slots;
  result?: SearchResult;
  llm?: { tin: number; tout: number; costRs: number; notes: string[] };
  costRs: number;
  notes: string[];
}
export interface Chat {
  msgs: Msg[];
  slots: Slots;
  shown: string[];
  typed: number;
  pillTaps: number;
  sessionCost: number;
  llmCalls: number;
  ruleTurns: number;
  pillTurns: number;
  seq: number;
  info?: TurnInfo;
}

export const TRY: Pill[] = [
  { label: "gift for my 4 year old niece who loves dinosaurs, under 1000", act: { t: "text", text: "gift for my 4 year old niece who loves dinosaurs, under 1000" }, kind: "try" },
  { label: "five yr old likes dinasaurs", act: { t: "text", text: "five yr old likes dinasaurs" }, kind: "try" },
  { label: "ISI certified wooden toys for a 2 year old", act: { t: "text", text: "ISI certified wooden toys for a 2 year old" }, kind: "try" },
  { label: "books under 300 for a 3 year old", act: { t: "text", text: "books under 300 for a 3 year old" }, kind: "try" },
  { label: "my toddler has tantrums at bedtime", act: { t: "text", text: "my toddler has tantrums at bedtime" }, kind: "try" },
];
const OCCASION_LABEL: Record<Occasion, string> = { birthday: "Birthday", festival: "Festival", return_gift: "Return gift" };

export function actLabel(a: Act): string {
  switch (a.t) {
    case "age": return bandLabel(a.band).replace(" years", "");
    case "cat": return CATEGORIES[a.cat];
    case "budget": return budgetLabel(a.cap);
    case "interest": return `Loves ${INTERESTS[a.i].toLowerCase()}`;
    case "recipient": return a.r === "gift" ? "It's a gift" : "For my child";
    case "gender": return a.g === "boy" ? "Boy" : "Girl";
    case "occasion": return OCCASION_LABEL[a.o];
    case "relax": return `Any ${a.what === "budget" ? "budget" : "category"}`;
    case "profile": return "Use my child's profile";
    case "load": return "Re-run a saved search";
    case "login": return "Sign in";
    case "multi": return a.acts.map(actLabel).join(" · ");
    case "reset": return "Start over";
    case "text": return a.text;
  }
}

/** Apply one coded tap to the slot object. No parsing, no model. */
function applyAct(d: Data, s: Slots, a: Act): Slots {
  switch (a.t) {
    case "age": return mergeSlots(s, { age: a.band });
    case "cat": return mergeSlots(s, { category: a.cat });
    case "budget": return mergeSlots(s, { budget: a.cap });
    case "interest": return mergeSlots(s, { interests: [a.i] });
    case "recipient": return mergeSlots(s, { recipient: a.r });
    case "gender": return mergeSlots(s, { gender: a.g });
    case "occasion": return mergeSlots(s, { occasion: a.o, recipient: "gift" }); // an occasion implies a gift
    case "relax": return mergeSlots(s, {}, [a.what === "budget" ? "budget" : "category"]);
    case "load": return { ...a.slots };
    case "profile": return d.child ? mergeSlots(s, { age: d.child.ageBand, interests: d.child.interests.slice(0, 2), recipient: "own" }) : s;
    case "multi": {
      // Interests picked together replace the old ones (up to 2) instead of being pushed out one by one.
      const ints = a.acts.filter((x): x is { t: "interest"; i: string } => x.t === "interest").map((x) => x.i);
      let next = s;
      for (const x of a.acts) if (x.t !== "interest") next = applyAct(d, next, x);
      if (ints.length) next = { ...next, interests: [...new Set(ints)].slice(0, 2) };
      return next;
    }
    default: return s;
  }
}

const ageGroup = (): PillGroup => ({ key: "age", label: "Age", mode: "one", pills: BANDS.map((b) => ({ label: bandLabel(b).replace(" years", ""), act: { t: "age", band: b } as Act })) });
const budgetGroup = (): PillGroup => ({ key: "budget", label: "Budget", mode: "one", pills: BUDGETS.map((c) => ({ label: budgetLabel(c), act: { t: "budget", cap: c } as Act })) });
const recipientGroup = (): PillGroup => ({ key: "recipient", label: "Who it's for", mode: "one", pills: [{ label: "It's a gift", act: { t: "recipient", r: "gift" } }, { label: "For my child", act: { t: "recipient", r: "own" } }] });
const genderGroup = (): PillGroup => ({ key: "gender", label: "Boy or girl", mode: "one", pills: [{ label: "Boy", act: { t: "gender", g: "boy" } }, { label: "Girl", act: { t: "gender", g: "girl" } }] });
const occasionGroup = (): PillGroup => ({ key: "occasion", label: "Occasion", mode: "one", pills: (Object.keys(OCCASION_LABEL) as Occasion[]).map((o) => ({ label: OCCASION_LABEL[o], act: { t: "occasion", o } as Act })) });
const interestGroup = (ids: string[]): PillGroup => ({ key: "interests", label: "They like", mode: "many", max: 2, pills: ids.map((i) => ({ label: INTERESTS[i], act: { t: "interest", i } as Act })) });
const categoryGroup = (ids: string[]): PillGroup => ({ key: "category", label: "Kind of thing", mode: "one", pills: ids.map((c) => ({ label: CATEGORIES[c], act: { t: "cat", cat: c } as Act })) });

/** Interests that actually occur in the catalogue for what is already known (age, category), most common first. */
function relevantInterests(d: Data, s: Slots, from?: string[]): string[] {
  const pool = from ? d.products.filter((p) => from.includes(p.id)) : d.products.filter((p) => !s.category || p.category === s.category);
  const n: Record<string, number> = {};
  pool.forEach((p) => p.interests.forEach((i) => (n[i] = (n[i] ?? 0) + 1)));
  return Object.keys(n).filter((i) => INTERESTS[i] && !(s.interests ?? []).includes(i)).sort((a, b) => n[b] - n[a]);
}

/** The follow-up pill groups: one per missing detail, plus refinements drawn from the current results. */
function followUpGroups(d: Data, s: Slots, resultIds?: string[]): PillGroup[] {
  const g: PillGroup[] = [];
  if (!s.age) g.push(ageGroup());
  if (!s.budget) g.push(budgetGroup());
  const ints = relevantInterests(d, s, resultIds);
  const fill = ints.length < 4 ? relevantInterests(d, s).filter((i) => !ints.includes(i)) : [];
  const intIds = [...ints, ...fill].slice(0, 6);
  if (intIds.length) g.push(interestGroup(intIds));
  if (resultIds) {
    const cats = [...new Set(resultIds.map((id) => d.products.find((p) => p.id === id)!.category))].filter((c) => c !== s.category).slice(0, 4);
    if (cats.length) g.push(categoryGroup(cats));
  }
  if (!s.recipient) g.push(recipientGroup());
  // Shown alongside "Who it's for" so a gift and its occasion can be picked in the same round.
  if (s.recipient !== "own" && !s.occasion) g.push(occasionGroup());
  if (!s.gender) g.push(genderGroup());
  return g;
}
const hintFor = (s: Slots) => {
  const gaps = missingSlots(s);
  const ex: Record<string, string> = { age: "she's 6", budget: "under 1000", interests: "loves space", recipient: "it's a birthday gift", gender: "for a boy" };
  return gaps.length ? `e.g. ${gaps.slice(0, 3).map((x) => ex[x]).join(", ")}` : "e.g. something for outdoors instead";
};

const agePills = (): Pill[] => BANDS.map((b) => ({ label: bandLabel(b).replace(" years", ""), act: { t: "age", band: b } as Act }));

export function initialChat(): Chat {
  return {
    msgs: [
      {
        id: 1,
        role: "bot",
        text: "Hi! I find toys, books and gifts for children aged 0–14 from a small, hand-checked catalogue. Tell me about the child: their age, what they like, your budget. Type it, pick a few options below, or try an example.",
        groups: [ageGroup(), genderGroup()],
        pills: TRY,
      },
    ],
    slots: {},
    shown: [],
    typed: 0,
    pillTaps: 0,
    sessionCost: 0,
    llmCalls: 0,
    ruleTurns: 0,
    pillTurns: 0,
    seq: 1,
  };
}

export interface TurnOut {
  chat: Chat;
  shownIds?: string[]; // product ids put on cards this turn, for impression counting
  llmCostRs: number;
  history?: HistoryEntry;
}

export type TurnEvent = { kind: "text"; text: string; acts?: Act[] } | { kind: "act"; act: Act };

export function runTurn(d: Data, prev: Chat, ev: TurnEvent, now = new Date()): TurnOut {
  const chat: Chat = { ...prev, msgs: [...prev.msgs], shown: [...prev.shown] };
  const shownIds: string[] = [];
  const say = (m: Omit<Msg, "id" | "role">) => {
    if (m.cards) shownIds.push(...m.cards);
    chat.msgs.push({ id: ++chat.seq, role: "bot", ...m });
  };
  const before = { ...prev.slots, interests: prev.slots.interests ? [...prev.slots.interests] : undefined };
  const notes: string[] = [];
  let llmCostRs = 0;
  let history: HistoryEntry | undefined;
  const cap = d.user ? d.ops.userCap : d.ops.guestCap;

  const finish = (info: Omit<TurnInfo, "before" | "after" | "costRs" | "notes"> & { costRs?: number }) => {
    chat.info = { ...info, before, after: chat.slots, costRs: info.costRs ?? 0, notes };
    chat.sessionCost += info.costRs ?? 0;
  };

  // ---- respond: ask for age, or search and show results
  const respond = (via: Omit<TurnInfo, "before" | "after" | "costRs" | "notes">, costRs = 0) => {
    const s = chat.slots;
    if (!s.age) {
      const profile = d.child ? [{ label: `Use my child's profile (${bandLabel(d.child.ageBand).replace(" years", "")})`, act: { t: "profile" } as Act }] : [];
      const more = missingSlots(s).filter((x) => x !== "age");
      const tail = more.length ? ` If you like, also tell me ${askFor(more)}.` : "";
      say({ text: `${describeSlots(s) ? `Got it: ${describeSlots(s)}. ` : ""}How old is the child?${tail} Type it, or pick below.`, groups: followUpGroups(d, s), pills: profile, hint: hintFor(s) });
      return finish({ ...via, costRs });
    }
    let res = search(d, s, chat.shown);
    let stepped = "";
    if (!res.ranked.length && s.budget && s.budget < 5000) {
      // Relax one thing at a time: try the next budget cap up before offering anything else.
      const next = BUDGETS[BUDGETS.indexOf(s.budget) + 1];
      const wider = search(d, { ...s, budget: next }, chat.shown);
      if (wider.ranked.length) {
        stepped = `Nothing ${budgetLabel(s.budget).replace("Up to", "under")} for ${describeSlots({ ...s, budget: undefined }) || "this search"}. Here are options ${budgetLabel(next).toLowerCase()}.`;
        notes.push(`No match at ${budgetLabel(s.budget)}; stepped the budget up one cap to ${budgetLabel(next)}.`);
        chat.slots = { ...s, budget: next };
        res = wider;
      }
    }
    if (!res.ranked.length) {
      say({
        text: `Nothing matches ${describeSlots(s)} right now. ${res.relax.length ? "I can relax one filter:" : "Try a different age, or start over."}`,
        pills: [...res.relax.map((r) => ({ label: `${r.label} (${r.n} ideas)`, act: { t: "relax", what: r.patch } as Act })), { label: "Start over", act: { t: "reset" } }],
      });
      return finish({ ...via, result: res, costRs });
    }
    const info: Record<string, CardInfo> = {};
    res.ranked.forEach((r) => (info[r.id] = { reason: r.reason?.text, tag: r.reason?.tag }));
    const n = res.ranked.length;
    const gaps = missingSlots(chat.slots);
    const follow = gaps.length ? ` To narrow it down, tell me ${askFor(gaps)}. Type it, or pick as many as you like below.` : " Tap a card for details, or refine below.";
    say({
      text: `${stepped ? stepped + " " : ""}${n === 1 ? "Here is 1 idea" : `Here are ${n} ideas`} for ${describeSlots(chat.slots)}.${res.total <= n ? " That is everything that matches right now." : ""}${follow}`,
      cards: res.ranked.map((r) => r.id),
      cardInfo: info,
      groups: followUpGroups(d, chat.slots, res.ranked.map((r) => r.id)),
      pills: [{ label: "Start over", act: { t: "reset" } }],
      hint: hintFor(chat.slots),
    });
    res.ranked.forEach((r) => chat.shown.push(r.id));
    if (d.user) history = { id: `h-${now.getTime()}`, at: now.toISOString(), slots: chat.slots, productIds: res.ranked.map((r) => r.id) };
    finish({ ...via, result: res, costRs });
  };

  // ---- pill / tap path: coded updates, no parsing, no model
  if (ev.kind === "act" && ev.act.t !== "text") {
    const a = ev.act;
    chat.pillTaps++;
    chat.pillTurns++;
    if (a.t === "reset") {
      const fresh = initialChat();
      return { chat: { ...fresh, typed: prev.typed, pillTaps: chat.pillTaps, sessionCost: prev.sessionCost, llmCalls: prev.llmCalls, ruleTurns: prev.ruleTurns, pillTurns: chat.pillTurns, seq: fresh.seq, info: { path: "pill", why: "reset: filters cleared", before, after: {}, costRs: 0, notes: [] } }, llmCostRs: 0 };
    }
    if (a.t === "multi" && !a.acts.length) return { chat: prev, llmCostRs: 0 };
    chat.msgs.push({ id: ++chat.seq, role: "user", text: actLabel(a) });
    if (chat.pillTaps > 40) {
      say({ text: "That's a lot of taps for one chat. Start a new chat to keep going." });
      return { chat, shownIds, llmCostRs: 0 };
    }
    chat.slots = applyAct(d, chat.slots, a);
    notes.push(a.t === "multi" ? `${a.acts.length} pills applied together in one turn as coded slot updates. Nothing to parse, no model call.` : "Pill taps send coded slot updates. Nothing to parse, no model call.");
    respond({ path: "pill", why: a.t === "multi" ? "multi-select taps, bypass the parser entirely" : "coded tap, bypasses the parser entirely", intent: "search", picked: a.t === "multi" ? a.acts.map(actLabel) : undefined });
    return { chat, shownIds, llmCostRs: 0, history };
  }

  // ---- typed text path
  const raw = ev.kind === "text" ? ev.text : (ev.act as { t: "text"; text: string }).text;
  let text = raw.trim();
  if (!text) return { chat: prev, llmCostRs: 0 };
  if (text.length > 300) {
    text = text.slice(0, 300);
    notes.push("Input trimmed to 300 characters (guard).");
  }
  const picks = ev.kind === "text" ? (ev.acts ?? []).filter((a) => a.t !== "multi" && a.t !== "text" && a.t !== "reset" && a.t !== "login") : [];
  chat.msgs.push({ id: ++chat.seq, role: "user", text: picks.length ? `${text}  (picked: ${picks.map(actLabel).join(", ")})` : text });
  if (chat.typed >= cap) {
    say({
      text: `You've reached the ${cap}-message limit for ${d.user ? "this chat" : "guest chats"}. ${d.user ? "" : "Sign in for a longer chat, or "}start a new chat — the pills and cards above still work.`,
      pills: [...(d.user ? [] : [{ label: "Sign in", act: { t: "login" } as Act }]), { label: "Start over", act: { t: "reset" } }],
    });
    notes.push(`Guard: ${chat.typed}/${cap} typed turns used (guest cap ${d.ops.guestCap}, signed-in cap ${d.ops.userCap}). No parsing, no model call.`);
    finish({ path: "guard", why: "turn cap reached" });
    return { chat, shownIds, llmCostRs: 0 };
  }
  chat.typed++;
  if (picks.length) {
    // Taps go in first as coded slots; anything the text says is merged after, so the words win a conflict.
    chat.slots = applyAct(d, chat.slots, { t: "multi", acts: picks });
    chat.pillTaps += picks.length;
    notes.push(`${picks.length} selected pill${picks.length === 1 ? "" : "s"} applied as coded slots before parsing the text (the text wins any conflict).`);
  }

  const rules = rulesParse(text);
  const dec = needsLlm(rules);
  let parse: Parse = rules;
  let path: TurnInfo["path"] = "text-rules";
  let why = dec.why;
  let llm: TurnInfo["llm"];
  if (dec.llm) {
    if (d.ops.llmDisabled) {
      notes.push("Model calls are switched off (daily spend cap reached). Falling back to rules only.");
      why = `${dec.why}; model disabled, using rules result`;
    } else {
      const r = llmParse(text, chat.slots);
      parse = r.parse;
      path = "text-llm";
      llm = { tin: r.tokensIn, tout: r.tokensOut, costRs: r.costRs, notes: r.notes };
      llmCostRs = r.costRs;
      chat.llmCalls++;
    }
  }
  if (path === "text-rules") chat.ruleTurns++;
  const via = { path, why, input: text, picked: picks.length ? picks.map(actLabel) : undefined, intent: parse.intent, parsed: parse.slots, llm } as Omit<TurnInfo, "before" | "after" | "costRs" | "notes">;
  const cost = llm?.costRs ?? 0;

  if (parse.intent === "out_of_range") {
    say({ text: `I only curate for children up to 14, so I can't suggest anything for ${parse.outOfRange} years. If you're buying for a younger sibling or relative, tell me their age.`, pills: agePills() });
    finish({ ...via, costRs: cost });
    return { chat, shownIds, llmCostRs };
  }
  if (parse.intent === "advice") {
    const rel = relatedSearch(text);
    const age = parse.slots.age ?? chat.slots.age;
    if (rel) {
      const label = `${rel.label}${age ? ` for ${bandLabel(age).replace(" years", "")}` : ""}`;
      const acts: Act[] = [...(age && !chat.slots.age ? [{ t: "age", band: age } as Act] : []), { t: "cat", cat: rel.cat }];
      notes.push(`Advice topic mapped to a related search (${CATEGORIES[rel.cat]}). No advice given.`);
      say({ text: "That's a good question, but I only help find products, so a paediatrician or a trusted parenting site will serve you better. I can show something related instead:", pills: [{ label, act: acts.length === 1 ? acts[0] : { t: "multi", acts } }] });
    } else
      say({ text: "That's a good question, but I only help find products, so a paediatrician or a trusted parenting site will serve you better. If you'd like, I can look for something to play with instead. How old is the child?", pills: chat.slots.age ? [{ label: "Show ideas again", act: { t: "relax", what: "category" } }] : agePills() });
    finish({ ...via, costRs: cost });
    return { chat, shownIds, llmCostRs };
  }
  if (picks.length && (parse.intent === "greeting" || parse.intent === "other")) {
    // The words added nothing, but the picked pills did: search on those.
    notes.push(`Text intent '${parse.intent}' ignored because pills were picked alongside it.`);
    respond(via, cost);
    return { chat, shownIds, llmCostRs, history };
  }
  if (parse.intent === "greeting") {
    say({ text: "Hello! How old is the child you're shopping for?", pills: agePills() });
    finish({ ...via, costRs: cost });
    return { chat, shownIds, llmCostRs };
  }
  if (parse.intent === "other") {
    say({ text: "I can help with toys, books and gifts for children aged 0–14. Tell me the child's age, and anything else you know: a budget, an interest, or whether it's a gift.", pills: [...agePills(), ...TRY.slice(0, 2)] });
    finish({ ...via, costRs: cost });
    return { chat, shownIds, llmCostRs };
  }

  const merged = mergeSlots(chat.slots, parse.slots, parse.clear, parse.reset);
  if (parse.intent === "cert") {
    chat.slots = merged;
    const token = parse.cert!;
    const { matches } = certSearch(d, merged, token);
    const info: Record<string, CardInfo> = {};
    matches.slice(0, 6).forEach((m) => (info[m.product.id] = { note: m.evidence, tag: "evidence" }));
    if (matches.length) {
      say({
        text: `I only mention a certification when we hold a current evidence record for it. ${matches.length} product${matches.length === 1 ? "" : "s"} ${merged.age ? `for ${bandLabel(merged.age).replace(" years", "")} ` : ""}have one on file for "${token.toUpperCase()}". The record is shown under each card:`,
        cards: matches.slice(0, 6).map((m) => m.product.id),
        cardInfo: info,
        pills: merged.age ? [{ label: "Start over", act: { t: "reset" } }] : agePills(),
      });
      matches.slice(0, 6).forEach((m) => chat.shown.push(m.product.id));
    } else {
      say({
        text: `We don't hold a current evidence record for "${token.toUpperCase()}" on any matching product, so I can't say that any of them has it. I can show ideas without making that claim.`,
        pills: merged.age ? [{ label: "Show ideas without the claim", act: { t: "relax", what: "category" } }] : agePills(),
      });
    }
    notes.push("Certification questions are answered only from evidence_current. No record, no claim.");
    finish({ ...via, costRs: cost, result: undefined });
    return { chat, shownIds, llmCostRs };
  }

  chat.slots = merged;
  respond(via, cost);
  return { chat, shownIds, llmCostRs, history };
}
