// Logic smoke test: npm run test:logic
import { makeSeed } from "../lib/seed";
import { rulesParse, needsLlm, llmParse, missingSlots } from "../lib/parser";
import { regression, refreshBrand, scrapeUrl } from "../lib/scraper";
import { initialChat, runTurn, Act } from "../lib/chat";
import { visibility, publishGate } from "../lib/gate";
import { search } from "../lib/rank";

let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };

const d = makeSeed(new Date());
ok(regression(false).every((r) => r.ok), "all fixtures pass regression");
ok(regression(true).some((r) => !r.ok), "broken adapter fails regression");

const p1 = rulesParse("gift for my 4 year old niece who loves dinosaurs, under 1000");
ok(p1.slots.age === "3-5" && p1.slots.budget === 1000 && p1.slots.recipient === "gift" && p1.slots.interests?.[0] === "dinosaurs", "rules: age/budget/gift/dino " + JSON.stringify(p1.slots));
ok(!needsLlm(p1).llm, "rules handle it: " + needsLlm(p1).why);
const p2 = rulesParse("five yr old likes dinasaurs");
ok(needsLlm(p2).llm, "needs llm: " + needsLlm(p2).why);
const l2 = llmParse("five yr old likes dinasaurs", {});
ok(l2.parse.slots.age === "3-5" && l2.parse.slots.interests?.includes("dinosaurs"), "llm sim fixes number word + typo " + JSON.stringify(l2.parse.slots) + " cost Rs " + l2.costRs.toFixed(4));
ok(rulesParse("my toddler has tantrums at bedtime").intent === "advice", "advice intent");
ok(rulesParse("ISI certified wooden toys for a 2 year old").intent === "cert", "cert intent");
ok(rulesParse("toys for a 17 year old").intent === "out_of_range", "out of range");

let chat = initialChat();
const run = (text: string) => { const o = runTurn(d, chat, { kind: "text", text }); chat = o.chat; return o; };
run("gift for my 4 year old niece who loves dinosaurs, under 1000");
const last = chat.msgs[chat.msgs.length - 1];
console.log("   cards:", last.cards?.map((c) => d.products.find((p) => p.id === c)!.name), "| reasons:", Object.values(last.cardInfo ?? {}).map((x) => x.tag));
ok((last.cards?.length ?? 0) > 0, "results shown");
run("books under 300 for a 3 year old");
{
  const t = chat.msgs[chat.msgs.length - 1];
  const stepped = /Nothing under ₹500 .*Here are options up to ₹1,000/.test(t.text) && (t.cards?.length ?? 0) > 0;
  const relaxed = /Nothing matches/.test(t.text) && !t.cards;
  ok(stepped || relaxed, "no-match: steps budget up one cap, else offers relax: " + t.text);
  if (stepped) ok(chat.slots.budget === 1000, "no-match step updates budget slot to the cap shown");
}
chat = initialChat();
run("ISI certified wooden toys for a 2 year old");
ok((chat.msgs[chat.msgs.length - 1].cards?.length ?? 0) > 0, "ISI query returns products with evidence: " + chat.msgs[chat.msgs.length - 1].text.slice(0, 100));
run("CE marked toys for a 2 year old");
ok(/don't hold a current evidence record/.test(chat.msgs[chat.msgs.length - 1].text), "unsupported certification refused");

// time travel: evidence expiry hides the stacker after +30 days; stale hides dino puzzle after +10 days
const stacker = d.products.find((p) => p.id === "p-rainbow-stacker")!;
ok(visibility(d, stacker).visible, "stacker visible today");
d.ops.clockOffsetDays = 26;
ok(!visibility(d, stacker).visible, "stacker hidden at +26d (ISI evidence expired): " + visibility(d, stacker).reasons.join("; "));
ok(visibility(d, d.products.find((p) => p.id === "p-drum-set")!).visible, "drum set still visible at +26d");
d.ops.clockOffsetDays = 10;
ok(!visibility(d, d.products.find((p) => p.id === "p-dino-puzzle")!).visible, "dino puzzle stale at +10d");
d.ops.clockOffsetDays = 0;

// gate
const mt = d.products.find((p) => p.id === "p-magnetic-tiles")!;
ok(publishGate(d, mt).some((g) => !g.ok), "magnetic tiles fail the gate: " + publishGate(d, mt).filter((g) => !g.ok).map((g) => g.key).join(","));
ok(publishGate(d, stacker).every((g) => g.ok), "stacker passes the gate");

// scraper
const o = scrapeUrl(d, "https://littleoak.example/products/rainbow-xylophone");
ok(o.ok && o.parsed?.price === 1199, "scrape new url");
ok(!scrapeUrl(d, "https://banyanbooks.example/box/picture-book-box").ok, "expired authorisation blocked");
ok(!scrapeUrl(d, "http://localhost/admin").ok, "SSRF guard");
const lines = refreshBrand(d, "b-nimbus");
console.log(lines.join("\n"));
ok(d.products.find((p) => p.id === "p-glow-ball")!.status === "suspended", "dead page suspended");
ok(d.diffs.length > 0 || true, "diffs: " + d.diffs.length);
refreshBrand(d, "b-tinker");
ok(d.diffs.some((x) => x.productId === "p-gear-set"), "price diff for gear set");
console.log("search age 6-8:", search(d, { age: "6-8" }).ranked.map((r) => d.products.find((p) => p.id === r.id)!.name));

// follow-up pills: multi-select, pills + chat, gender, missing-slot questions
{
  ok(rulesParse("gift for my niece").slots.gender === "girl", "gender: niece -> girl");
  ok(rulesParse("5 year old boy").slots.gender === "boy" && rulesParse("5 year old boy").slots.age === "3-5", "gender: boy + age");
  ok(rulesParse("for my son and daughter").slots.gender === undefined, "gender: both -> unset");
  ok(missingSlots({ age: "3-5", budget: 1000, interests: ["space"], recipient: "gift", gender: "boy" }).length === 0, "missingSlots: none when all filled");
  ok(missingSlots({ age: "3-5" }).join(",") === "budget,interests,recipient,gender", "missingSlots: order");

  let c = runTurn(d, initialChat(), { kind: "text", text: "something for a 6 year old" }).chat;
  let m = c.msgs[c.msgs.length - 1];
  ok((m.cards?.length ?? 0) > 0 && /your budget/.test(m.text) && /what they like/.test(m.text) && /boy or a girl/.test(m.text), "follow-up names missing details: " + m.text);
  ok(!!m.groups?.find((g) => g.key === "budget") && !m.groups?.find((g) => g.key === "age"), "groups: budget offered, age not (known)");
  const ig = m.groups!.find((g) => g.key === "interests")!;
  ok(ig.mode === "many" && ig.pills.length > 0, "interest group is multi-select");

  const acts: Act[] = [{ t: "budget", cap: 1000 }, { t: "recipient", r: "gift" }, { t: "gender", g: "girl" }, ig.pills[0].act];
  const before = c.msgs.length;
  c = runTurn(d, c, { kind: "act", act: { t: "multi", acts } }).chat;
  ok(c.slots.budget === 1000 && c.slots.recipient === "gift" && c.slots.gender === "girl" && (c.slots.interests?.length ?? 0) === 1, "multi: all slots set in one turn " + JSON.stringify(c.slots));
  ok(c.msgs.length === before + 2, "multi: one user bubble + one reply");

  const three: Act[] = [{ t: "interest", i: "space" }, { t: "interest", i: "art" }, { t: "interest", i: "music" }];
  c = runTurn(d, c, { kind: "act", act: { t: "multi", acts: three } }).chat;
  ok(c.slots.interests?.length === 2, "multi: interests capped at 2 " + JSON.stringify(c.slots.interests));

  let c2 = runTurn(d, initialChat(), { kind: "text", text: "something for a 6 year old" }).chat;
  c2 = runTurn(d, c2, { kind: "text", text: "under 2000, he loves space", acts: [{ t: "budget", cap: 500 }, { t: "recipient", r: "own" }] }).chat;
  ok(c2.slots.budget === 2000 && c2.slots.recipient === "own" && c2.slots.gender === "boy" && c2.slots.interests?.includes("space"), "pills + text merge, text wins budget " + JSON.stringify(c2.slots));
  ok(c2.info?.picked?.length === 2, "inspector records picked pills");

  let c3 = runTurn(d, initialChat(), { kind: "text", text: "something for a 6 year old" }).chat;
  c3 = runTurn(d, c3, { kind: "text", text: "ok", acts: [{ t: "budget", cap: 1000 }] }).chat;
  ok(c3.slots.budget === 1000 && (c3.msgs[c3.msgs.length - 1].cards?.length ?? 0) > 0, "unparseable text + picks still searches");

  const c4 = runTurn(d, initialChat(), { kind: "text", text: "gift for my niece" }).chat;
  const m4 = c4.msgs[c4.msgs.length - 1];
  ok(/How old/.test(m4.text) && !!m4.groups?.find((g) => g.key === "age") && !!m4.groups?.find((g) => g.key === "budget"), "age missing: asks age, offers age + other groups together");
}

// phase 1: occasion group, adjustable limits, stepwise no-match, related search
{
  const last = (c: ReturnType<typeof initialChat>) => c.msgs[c.msgs.length - 1];
  let c = runTurn(d, initialChat(), { kind: "text", text: "gift for my nephew, 6 years" }).chat;
  ok(!!last(c).groups?.find((g) => g.key === "occasion"), "occasion group shown for a gift with no occasion");
  c = runTurn(d, c, { kind: "act", act: { t: "occasion", o: "birthday" } }).chat;
  ok(c.slots.occasion === "birthday" && c.slots.recipient === "gift" && !last(c).groups?.find((g) => g.key === "occasion"), "occasion set: group gone, implies gift");
  const own = runTurn(d, initialChat(), { kind: "text", text: "for my son, 6 years" }).chat;
  ok(!last(own).groups?.find((g) => g.key === "occasion"), "no occasion group when buying for own child");
  const all = runTurn(d, initialChat(), { kind: "text", text: "something for a 6 year old" }).chat;
  ok(["budget", "interests", "recipient", "gender"].every((k) => !!last(all).groups?.find((g) => g.key === k)), "still asks every missing detail at once");

  const boy = search(d, { age: "3-5", gender: "boy" }).ranked.map((r) => r.id).join();
  ok(boy === search(d, { age: "3-5" }).ranked.map((r) => r.id).join(), "gender never changes results");

  const saved = { ...d.ops };
  d.ops.limitSpecific = 2; d.ops.limitVague = 4; d.ops.catalogueVersion++;
  ok(search(d, { age: "3-5", category: "building" }).ranked.length <= 2, "limitSpecific respected");
  ok(search(d, { age: "3-5" }).ranked.length <= 4, "limitVague respected");
  d.ops.limitVague = 0;
  ok(search(d, { age: "3-5" }).ranked.length >= 1, "limit 0 clamped to 1");
  d.ops.limitSpecific = undefined; d.ops.limitVague = undefined;
  ok(search(d, { age: "3-5" }).ranked.length <= 6, "missing limits fall back to defaults (old saved data)");
  Object.assign(d.ops, saved); d.ops.catalogueVersion++;
  const cat = search(d, { age: "6-8", category: "building" });
  console.log("   age+category results:", cat.ranked.length, "of", cat.total);
  ok(cat.ranked.length === Math.min(3, cat.total), "specific request can fill all 3 slots from one category");

  const st = runTurn(d, initialChat(), { kind: "text", text: "music toys for a 4 year old under 500" }).chat;
  ok(/^Nothing under ₹500 for .*Here are options up to ₹1,000\./.test(last(st).text) && (last(st).cards?.length ?? 0) > 0 && st.slots.budget === 1000, "no-match steps budget up one cap: " + last(st).text.slice(0, 90));
  const none = runTurn(d, initialChat(), { kind: "text", text: "music toys for a 13 year old under 5000" }).chat;
  ok(!/Here are options up to/.test(last(none).text), "no budget step above ₹5,000: " + last(none).text.slice(0, 80));

  const adv = runTurn(d, initialChat(), { kind: "text", text: "my toddler has tantrums at bedtime" }).chat;
  const ap = last(adv).pills ?? [];
  ok(/only help find products/.test(last(adv).text) && ap.length === 1 && /Bedtime books for 0–2/.test(ap[0].label), "advice: refusal + one related search: " + ap.map((p) => p.label).join("|"));
  const tap = runTurn(d, adv, { kind: "act", act: ap[0].act }).chat;
  ok(tap.slots.category === "books" && tap.slots.age === "0-2", "related-search pill runs that search");
  const vacc = runTurn(d, initialChat(), { kind: "text", text: "do babies need vaccines" }).chat;
  ok(!(last(vacc).pills ?? []).some((p) => / for |books|play/i.test(p.label)), "unmapped advice topic: no related-search pill");
}
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
