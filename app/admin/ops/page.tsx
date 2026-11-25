"use client";
import { BANDS, CATEGORIES, DEFAULT_LIMITS, bandLabel } from "@/lib/types";
import { exposure } from "@/lib/rank";
import { DEFAULT_CAPS } from "@/lib/admin";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { refreshBrand } from "@/lib/scraper";
import { todayOf } from "@/lib/gate";

const PROVIDERS = [
  ["VPS host (India region)", "Runs app, worker, database", "all app data", "India", "Backups 30 days", "Delete server and snapshots on contract end"],
  ["Cloudflare", "DNS, TLS, CDN cache, bot rules", "request metadata only", "Global edge", "Logs 7 days (plan default)", "Remove zone"],
  ["Object storage (S3-compatible)", "Evidence PDFs, product photos, nightly DB dumps", "documents, dumps", "India or nearest", "Dumps expire after 30 days", "Lifecycle rule plus bucket delete"],
  ["Google (sign-in)", "Login only", "name, email, Google subject ID", "Global", "Per Google policy", "User deletes account in app"],
  ["Model provider (any region, paid API tier)", "Slot parsing per turn; profile drafting at curation", "short chat text, never child profile text; scraped product text at curation", "Recorded in register", "Provider default, no training on inputs", "Per provider; no text stored by us"],
];

export default function Ops() {
  const { d, update, reset, toast } = useApp();
  const today = todayOf(d);
  const ex = exposure(d);
  const pname = (id: string) => d.products.find((p) => p.id === id)?.name ?? id;
  const clock = (n: number) => update((x) => void (x.ops.clockOffsetDays = n === 0 ? 0 : x.ops.clockOffsetDays + n));
  return (
    <>
      <h1>Ops and demo controls</h1>
      <div className="grid g2">
        <div className="card">
          <h2>Demo clock</h2>
          <p>Today in the demo: <b>{today}</b> {d.ops.clockOffsetDays ? <span className="badge warn">+{d.ops.clockOffsetDays} days</span> : null}</p>
          <div className="row">
            {[1, 7, 14, 26, 30].map((n) => <button key={n} className="btn sm" onClick={() => clock(n)}>+{n} days</button>)}
            <button className="btn sm danger" onClick={() => clock(0)}>Back to today</button>
          </div>
          <Note>Stands in for the nightly sweep. Try: <b>+7 days</b> → Dinosaur floor puzzle goes stale (last refreshed 24 days ago) and disappears. <b>+26 days</b> → the wooden rainbow stacker&apos;s ISI evidence expires. Its description claims &ldquo;ISI-marked&rdquo;, so it vanishes from search and its page. Renew the evidence in its editor and it returns. The drum set&apos;s safety evidence lasts longer (about 41 days); its page just loses the safety line because its copy makes no safety claim. &ldquo;Refresh all brands&rdquo; clears staleness.</Note>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => { update((x) => x.brands.forEach((b) => refreshBrand(x, b.id))); toast("Refreshed all brands (see Approvals)"); }}>Refresh all brands now</button>
        </div>
        <div className="card">
          <h2>Cost and abuse controls</h2>
          <label className="row"><input type="checkbox" checked={d.ops.llmDisabled} onChange={(e) => update((x) => void (x.ops.llmDisabled = e.target.checked))} /> <b>Model kill-switch</b> (simulates the daily spend cap being hit)</label>
          <p className="small muted">When on, messages the rules cannot parse fall back to tap options. Try a typo query in the chat.</p>
          <div className="row">
            <label className="f" style={{ width: 150 }}>Guest turn cap<input type="number" min={1} value={d.ops.guestCap} onChange={(e) => update((x) => void (x.ops.guestCap = Math.max(1, Number(e.target.value))))} /></label>
            <label className="f" style={{ width: 150 }}>Signed-in turn cap<input type="number" min={1} value={d.ops.userCap} onChange={(e) => update((x) => void (x.ops.userCap = Math.max(1, Number(e.target.value))))} /></label>
            <label className="f" style={{ width: 170 }} title="Results when age and category are both known">Results, specific request<input type="number" min={1} max={12} value={d.ops.limitSpecific ?? DEFAULT_LIMITS.specific} onChange={(e) => update((x) => void (x.ops.limitSpecific = Math.min(12, Math.max(1, Number(e.target.value)))))} /></label>
            <label className="f" style={{ width: 170 }} title="Results for anything less specific">Results, vague request<input type="number" min={1} max={12} value={d.ops.limitVague ?? DEFAULT_LIMITS.vague} onChange={(e) => update((x) => void (x.ops.limitVague = Math.min(12, Math.max(1, Number(e.target.value)))))} /></label>
          </div>
          <p className="small">Model calls so far in this browser: <b>{d.ops.llmCalls}</b>, simulated cost <b>₹{d.ops.llmCostRs.toFixed(4)}</b>.</p>
          <Note>Real build: hard monthly cap at the provider (client sets the budget, B6), plus an app-level daily counter in <code>llm_usage</code>, plus per-IP and per-device daily caps. The 5-turn guest cap is a proposal.</Note>
        </div>
      </div>

      <div className="card">
        <h2>Provider register (B5)</h2>
        <Note>B5: every provider needs purpose, allowed fields, region, retention and deletion period recorded, with client approval for new ones. Training on submitted data must be off. This table is the register format. Values here are examples.</Note>
        <table>
          <thead><tr><th>Provider</th><th>Purpose</th><th>Allowed fields</th><th>Region</th><th>Retention</th><th>Deletion</th></tr></thead>
          <tbody>{PROVIDERS.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className="small">{i === 0 ? <b>{c}</b> : c}</td>)}</tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <h2>Spend caps, guest limit, sponsored slot</h2>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="f" style={{ width: 170 }}>Model daily cap (₹)<input type="number" min={0} step={0.01} value={d.ops.dailyCapRs ?? DEFAULT_CAPS.dailyRs} onChange={(e) => update((x) => void (x.ops.dailyCapRs = Math.max(0, Number(e.target.value))))} /></label>
          <label className="f" style={{ width: 170 }}>Model monthly budget (₹)<input type="number" min={0} step={1} value={d.ops.monthlyBudgetRs ?? DEFAULT_CAPS.monthlyRs} onChange={(e) => update((x) => void (x.ops.monthlyBudgetRs = Math.max(0, Number(e.target.value))))} /></label>
          <label className="f" style={{ width: 200 }}>Guest messages per device per day<input type="number" min={1} value={d.ops.guestDailyCap ?? DEFAULT_CAPS.guestDaily} onChange={(e) => update((x) => void (x.ops.guestDailyCap = Math.max(1, Number(e.target.value))))} /></label>
          <label className="row"><input type="checkbox" checked={d.ops.sponsoredOn !== false} onChange={(e) => update((x) => void (x.ops.sponsoredOn = e.target.checked))} /> Sponsored slot on</label>
        </div>
        <p className="small">Model spend today: <b>₹{(d.ops.spendByDay?.[today] ?? 0).toFixed(4)}</b> of ₹{d.ops.dailyCapRs ?? DEFAULT_CAPS.dailyRs} · this month: <b>₹{Object.entries(d.ops.spendByDay ?? {}).filter(([k]) => k.startsWith(today.slice(0, 7))).reduce((t, [, v]) => t + v, 0).toFixed(4)}</b> of ₹{d.ops.monthlyBudgetRs ?? DEFAULT_CAPS.monthlyRs}</p>
        {(d.ops.alerts ?? []).length > 0 && (
          <ul className="small">
            {[...(d.ops.alerts ?? [])].reverse().slice(0, 8).map((a, i) => (
              <li key={i}><span className={"badge " + (a.pct === 100 ? "bad" : "warn")}>{a.pct}%</span> {a.at}: {a.scope === "day" ? "daily cap" : "monthly budget"} ₹{a.spentRs.toFixed(4)} of ₹{a.capRs}{a.pct === 100 ? " → model switched off, rules only" : ""}</li>
            ))}
          </ul>
        )}
        <Note>Alerts fire once at 50%, 80% and 100%; at 100% the model kill-switch turns on by itself and the chat carries on with the free rules parser. Try a daily cap of ₹0.02, then type “five yr old likes dinasaurs” a few times. The guest limit counts typed messages per device per day across chats (New chat does not reset it); pills always work. Real build: email alerts plus a hard cap at the provider.</Note>
      </div>

      <div className="card">
        <h2>Exposure and catalogue depth</h2>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="f" style={{ width: 200 }}>Warn when top 5 take over (%)<input type="number" min={10} max={100} value={d.ops.exposureWarnPct ?? 50} onChange={(e) => update((x) => void (x.ops.exposureWarnPct = Math.min(100, Math.max(10, Number(e.target.value)))))} /></label>
          <label className="f" style={{ width: 200 }}>Minimum products per cell<input type="number" min={1} max={20} value={d.ops.minPerCell ?? 3} onChange={(e) => update((x) => void (x.ops.minPerCell = Math.min(20, Math.max(1, Number(e.target.value)))))} /></label>
          <button className="btn sm" onClick={() => update((x) => void (x.impressions = {}))}>Reset impression counts</button>
        </div>
        {ex.total === 0 ? (
          <p className="small muted">No impressions yet. Run a few searches in Chat.</p>
        ) : (
          <>
            <p>
              {ex.total} cards shown. The top 5 products took <b>{Math.round(ex.topShare * 100)}%</b>{" "}
              {ex.warn ? <span className="badge warn">Too concentrated: the catalogue is thin for what parents ask</span> : <span className="badge good">Spread looks healthy</span>}
            </p>
            <ol className="small">{ex.top.map((t) => <li key={t.id}>{pname(t.id)}: {t.n}</li>)}</ol>
          </>
        )}
        <b className="small">Live products per age band × kind of thing</b>
        <div style={{ overflowX: "auto" }}>
          <table className="small">
            <thead><tr><th></th>{BANDS.map((b) => <th key={b}>{bandLabel(b).replace(" years", "")}</th>)}</tr></thead>
            <tbody>
              {Object.keys(CATEGORIES).map((c) => (
                <tr key={c}>
                  <td>{CATEGORIES[c]}</td>
                  {BANDS.map((b) => {
                    const cell = ex.grid.find((g) => g.band === b && g.category === c)!;
                    return <td key={b} style={cell.low ? { background: "var(--warn-soft, #fff4d6)", fontWeight: 600 } : undefined}>{cell.n}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note>Repetition is usually a catalogue problem, not a code problem. Highlighted cells have fewer live products than the agreed minimum, so parents asking there will keep seeing the same few items. Impressions are product ids and counts only: no search terms, no chat text.</Note>
      </div>

      <div className="card">
        <h2>Reset</h2>
        <p className="small muted">Clears everything you did in this browser (edits, events, saved items, account) and restores the seed data.</p>
        <button className="btn danger" onClick={() => { if (confirm("Reset all demo data in this browser?")) reset(); }}>Reset demo data</button>
      </div>
    </>
  );
}
