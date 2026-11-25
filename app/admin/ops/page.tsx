"use client";
import { DEFAULT_LIMITS } from "@/lib/types";
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
        <h2>Reset</h2>
        <p className="small muted">Clears everything you did in this browser (edits, events, saved items, account) and restores the seed data.</p>
        <button className="btn danger" onClick={() => { if (confirm("Reset all demo data in this browser?")) reset(); }}>Reset demo data</button>
      </div>
    </>
  );
}
