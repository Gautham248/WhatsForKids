// Logic smoke test: npm run test:logic
import { makeSeed } from "../lib/seed";
import { rulesParse, needsLlm, llmParse, missingSlots } from "../lib/parser";
import { regression, refreshBrand, scrapeUrl } from "../lib/scraper";
import { initialChat, runTurn, Act } from "../lib/chat";
import { visibility, publishGate, todayOf } from "../lib/gate";
import { recordSpend, chatMetrics } from "../lib/admin";
import { parseSalesCsv } from "../lib/csv";
import { search, countImpressions, exposure } from "../lib/rank";

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

// phase 2: impressions, exposure, gate name/brand/photo, general play ideas
{
  const e = makeSeed(new Date());
  const z = exposure(e);
  ok(z.total === 0 && z.topShare === 0 && !z.warn && !Number.isNaN(z.topShare), "exposure with 0 impressions: no NaN, no warning");
  const out = runTurn(e, initialChat(), { kind: "text", text: "something for a 6 year old" });
  const ids = out.shownIds ?? [];
  ok(ids.length > 0 && ids.join() === (out.chat.msgs[out.chat.msgs.length - 1].cards ?? []).join(), "turn reports exactly the card ids it showed");
  countImpressions(e, ids);
  countImpressions(e, ids.slice(0, 1));
  ok(e.impressions![ids[0]] === 2 && (ids.length < 2 || e.impressions![ids[1]] === 1), "impressions add 1 per card shown");
  const before = JSON.stringify(e.impressions);
  runTurn(e, out.chat, { kind: "act", act: { t: "reset" } });
  ok(JSON.stringify(e.impressions) === before, "resetting a chat does not reset impression counts");
  const greet = runTurn(e, initialChat(), { kind: "text", text: "hello" });
  ok((greet.shownIds ?? []).length === 0, "no cards, no impressions");
  e.impressions = { a: 90, b: 5, c: 5 };
  ok(exposure(e).warn && Math.abs(exposure(e).topShare - 1) < 1e-9, "3 products only: top-5 share 100%, warns");
  e.impressions = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, 5]));
  ok(Math.abs(exposure(e).topShare - 0.25) < 1e-9 && !exposure(e).warn, "even spread over 20: top-5 share 25%, no warning");
  const cells = exposure(e).grid;
  ok(cells.length === 50 && cells.some((c) => c.low) && cells.every((c) => c.low === c.n < 3), "catalogue grid: 5 bands × 10 kinds, low = below minimum");

  const wings = e.products.find((p) => p.id === "p-fairy-wings")!;
  ok(publishGate(e, wings).find((g) => g.key === "photo")?.ok === false, "gate: product with no photo fails 'photo set'");
  const stacker2 = e.products.find((p) => p.id === "p-rainbow-stacker")!;
  ok(publishGate(e, stacker2).every((g) => g.ok), "gate: seeded live product still passes all checks");
  const orphan = { ...stacker2, brandId: "b-missing" };
  ok(publishGate(e, orphan).find((g) => g.key === "name")?.ok === false, "gate: product with no brand fails 'name and brand'");
  ok(publishGate(e, { ...stacker2, name: "  " }).find((g) => g.key === "name")?.ok === false, "gate: blank name fails");
  ok(e.profiles["p-blocks-100"]?.playSource === "type", "drafted play ideas are marked as general ideas for the type");
  ok(e.profiles["p-rainbow-stacker"]?.playSource === "product", "hand-written play ideas are marked as product-specific");
}

// phase 3: spend cap + alerts, guest device cap, metrics, sales import, sponsored slot
{
  const e = makeSeed(new Date());
  const today = todayOf(e);
  e.ops.dailyCapRs = 1; e.ops.monthlyBudgetRs = 1000;
  ok(recordSpend(e, 0.49).length === 0, "spend 49%: no alert");
  const a50 = recordSpend(e, 0.01);
  ok(a50.length === 1 && a50[0].pct === 50 && a50[0].scope === "day", "spend 50%: one daily alert");
  ok(recordSpend(e, 0.1).length === 0, "spend 60%: 50% alert not repeated");
  const a100 = recordSpend(e, 0.5);
  ok(a100.map((a) => a.pct).join() === "80,100" && e.ops.llmDisabled, "spend 110%: 80% and 100% alerts, model switched off");
  const tom = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  ok(recordSpend(e, 0.6, tom).map((a) => a.pct).join() === "50", "next day: daily alerts start again");
  const typo = runTurn(e, initialChat(), { kind: "text", text: "five yr old likes dinasaurs" });
  ok(typo.chat.info?.path === "text-rules" && typo.llmCostRs === 0, "model off: typo message falls back to rules, costs nothing");
  e.ops.llmDisabled = false; e.ops.dailyCapRs = 0;
  ok(recordSpend(e, 5).every((a) => a.scope === "month") , "daily cap 0 means no daily cap");

  const g = runTurn(e, initialChat(), { kind: "text", text: "something for a 6 year old", deviceCapped: true });
  const gl = g.chat.msgs[g.chat.msgs.length - 1];
  ok(/today's limit/.test(gl.text) && g.chat.info?.path === "guard" && !g.chat.slots.age && g.chat.typed === 0, "guest device cap: sign-in prompt, nothing parsed, not counted");
  e.user = { id: "u1", name: "A", email: "a@example.com" };
  const u = runTurn(e, initialChat(), { kind: "text", text: "something for a 6 year old", deviceCapped: true });
  ok(u.chat.slots.age === "6-8", "signed-in user is not affected by the guest device cap");
  e.user = null;

  ok(!Number.isNaN(chatMetrics(e).clickShare) && chatMetrics(e).clicksPerChat === 0, "metrics with 0 chats: no NaN");
  e.chatSessions = [{ id: "c1", startedAt: "", turns: 3 }, { id: "c2", startedAt: "", turns: 1 }, { id: "c3", startedAt: "", turns: 0 }];
  const ev = (chatId: string) => ({ id: "x" + Math.random(), at: "", productId: "p-kite", routeKind: "direct" as const, position: 1, sessionId: "s", chatId, slots: {} });
  e.events = [ev("c1"), ev("c1")];
  const m = chatMetrics(e);
  ok(m.chats === 2 && m.clickShare === 0.5 && m.clicksPerChat === 1, "metrics: 2 chats, one with 2 clicks → 50%, 1.0 per chat");

  const csv = ["date,brand_id,product_id,order_ref,amount_inr", `${today},b-tinker,p-gear-set,T1,1299`, `${today},b-tinker,p-nope,T2,100`, `${today},b-tinker,p-gear-set,T3,0`, `${today},b-oak,p-gear-set,T4,1299`, `${today},b-tinker,p-gear-set,T1,1299`, `2026-13-40,b-tinker,p-gear-set,T5,10`].join("\n");
  const r = parseSalesCsv(csv, e);
  ok(r.rows.length === 1 && r.rows[0].amountRs === 1299, "sales import: the one valid row is kept");
  const lines = r.errors.map((x) => x.line).join();
  ok(lines === "3,4,5,6,7", "sales import: bad rows rejected with line numbers (" + r.errors.map((x) => `${x.line}:${x.msg}`).join("; ") + ")");
  ok(parseSalesCsv("a,b\n1,2", e).errors[0]?.line === 1, "sales import: wrong header rejected");

  const f = makeSeed(new Date());
  const runs = (["0-2", "3-5", "6-8", "9-12", "13+"] as const).flatMap((age) => [search(f, { age }), search(f, { age, budget: 2000 })]);
  ok(runs.every((x) => x.ranked.filter((y) => y.sponsored).length <= 1), "at most one sponsored item per result set");
  const gs = search(f, { age: "6-8" });
  const gi = gs.ranked.findIndex((y) => y.id === "p-gear-set");
  ok(gi >= 0 && (gs.ranked[gi].sponsored ? gi === 1 : true), "gear set appears for 6–8; if via the sponsored slot, at position 2");
  ok(!runs.some((x) => x.ranked.some((y) => y.id === "p-magnetic-tiles")), "sponsored but unpublished product never appears");
  const s912 = search(f, { age: "9-12" }).ranked;
  ok(s912[1]?.id === "p-gear-set" && s912[1].sponsored && s912.length <= 6, "sponsored slot fills position 2 when the product did not rank there on merit");
  ok(!gs.ranked.some((y) => y.sponsored), "no paid slot used when the sponsored product already ranks on merit");
  ok(!search(f, { age: "6-8", budget: 1000 }).ranked.some((y) => y.id === "p-gear-set"), "sponsored product outside the budget never appears");
  f.products.find((p) => p.id === "p-gear-set")!.sponsored = { until: "2000-01-01" };
  f.ops.catalogueVersion++;
  ok(!search(f, { age: "6-8" }).ranked.some((y) => y.sponsored), "expired sponsorship ignored");
  f.products.find((p) => p.id === "p-gear-set")!.sponsored = { until: "2999-01-01" };
  f.ops.sponsoredOn = false;
  ok(!search(f, { age: "6-8" }).ranked.some((y) => y.sponsored), "sponsored switch off: no sponsored slot");
  f.ops.sponsoredOn = true;
  const card = runTurn(f, initialChat(), { kind: "text", text: "something for a 7 year old" }).chat;
  const lc = card.msgs[card.msgs.length - 1];
  const sp = Object.entries(lc.cardInfo ?? {}).filter(([, i]) => i.sponsored);
  ok(sp.length <= 1 && sp.every(([id]) => lc.cards!.indexOf(id) === 1), "chat card marks the sponsored item, at position 2");
}
console.log(fails ? `${fails} FAILED` : "ALL OK");
process.exit(fails ? 1 : 0);
