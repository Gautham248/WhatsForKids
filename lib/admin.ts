// Admin mutations on a Data draft. Returns an error string, or null on success.
import { Data, SpendAlert, STAGE_LABEL, Status, STAGES } from "./types";
import { gatePasses, publishGate, stageIndex, todayOf } from "./gate";

export function moveTo(d: Data, id: string, to: Status, reason = "", actor = "Admin (demo)"): string | null {
  const p = d.products.find((x) => x.id === id);
  if (!p) return "Unknown product";
  const from = p.status;
  if (from === to) return "Already at this stage";
  if (to === "published" && !gatePasses(d, p)) {
    const bad = publishGate(d, p).filter((g) => !g.ok).map((g) => g.label);
    return `Publish gate failed (cannot be skipped): ${bad.join("; ")}`;
  }
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  const skipping = to !== "suspended" && ti > fi + 1 && fi >= 0 ? true : from === "suspended" && to !== "published" && ti > 1;
  if (skipping && !reason.trim()) return "Skipping stages needs a recorded reason (B3).";
  if (to === "suspended") {
    p.suspendedReason = reason.trim() || "Unpublished by admin";
  } else p.suspendedReason = undefined;
  p.status = to;
  d.statusLog.push({
    id: `l-${d.statusLog.length}-${id}`,
    productId: id,
    from,
    to,
    at: todayOf(d),
    actor,
    skippedReason: skipping ? reason.trim() : to === "suspended" ? p.suspendedReason : undefined,
  });
  d.ops.catalogueVersion++;
  return null;
}

export const stageName = (s: Status) => STAGE_LABEL[s];
export const stages = STAGES;

export const DEFAULT_CAPS = { dailyRs: 25, monthlyRs: 500, guestDaily: 15 };

/**
 * Record model spend for the demo day. Raises an alert the first time spend crosses 50%, 80% and 100%
 * of the daily cap or the monthly budget, and switches the model off at 100%. Returns the new alerts.
 */
export function recordSpend(d: Data, costRs: number, today = todayOf(d)): SpendAlert[] {
  const o = d.ops;
  const byDay = (o.spendByDay ??= {});
  byDay[today] = (byDay[today] ?? 0) + costRs;
  const month = today.slice(0, 7);
  const monthSpend = Object.entries(byDay).filter(([k]) => k.startsWith(month)).reduce((t, [, v]) => t + v, 0);
  const alerts = (o.alerts ??= []);
  const fresh: SpendAlert[] = [];
  const check = (scope: "day" | "month", spent: number, cap: number) => {
    if (!(cap > 0)) return;
    for (const pct of [50, 80, 100] as const) {
      const already = alerts.some((a) => a.scope === scope && a.pct === pct && (scope === "day" ? a.at === today : a.at.startsWith(month)));
      if (spent >= (cap * pct) / 100 && !already) fresh.push({ at: today, scope, pct, spentRs: spent, capRs: cap });
    }
  };
  check("day", byDay[today], o.dailyCapRs ?? DEFAULT_CAPS.dailyRs);
  check("month", monthSpend, o.monthlyBudgetRs ?? DEFAULT_CAPS.monthlyRs);
  alerts.push(...fresh);
  if (fresh.some((a) => a.pct === 100)) o.llmDisabled = true;
  return fresh;
}

export interface Metrics {
  chats: number;
  chatsWithClick: number;
  clickShare: number; // 0..1
  clicksPerChat: number;
  sales: number;
  salesRs: number;
  perProduct: Record<string, { clicks: number; sales: number; salesRs: number }>;
}
/** The three numbers to watch: share of chats ending in a brand click, clicks per chat, brand-reported sales. */
export function chatMetrics(d: Data): Metrics {
  const chats = (d.chatSessions ?? []).filter((c) => c.turns > 0);
  const ids = new Set(chats.map((c) => c.id));
  const chatClicks = d.events.filter((e) => e.chatId && ids.has(e.chatId));
  const withClick = new Set(chatClicks.map((e) => e.chatId)).size;
  const sales = d.sales ?? [];
  const perProduct: Metrics["perProduct"] = {};
  const row = (id: string) => (perProduct[id] ??= { clicks: 0, sales: 0, salesRs: 0 });
  d.events.forEach((e) => row(e.productId).clicks++);
  sales.forEach((s) => { row(s.productId).sales++; row(s.productId).salesRs += s.amountRs; });
  return {
    chats: chats.length,
    chatsWithClick: withClick,
    clickShare: chats.length ? withClick / chats.length : 0,
    clicksPerChat: chats.length ? chatClicks.length / chats.length : 0,
    sales: sales.length,
    salesRs: sales.reduce((t, s) => t + s.amountRs, 0),
    perProduct,
  };
}
