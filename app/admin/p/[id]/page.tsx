"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { assertedClaims, evidenceCurrent, evidenceState, publishGate, visibility } from "@/lib/gate";
import { moveTo } from "@/lib/admin";
import { disclosureFor, playForType, profileFor, reasonsFor } from "@/lib/seed";
import { CATEGORIES, CLAIM_LABEL, ClaimType, INTERESTS, Product, ReasonTag, RouteKind, STAGES, STAGE_LABEL, Status } from "@/lib/types";

const TAGS: ReasonTag[] = ["gift", "age_fit", "budget", "skill", "interest"];

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const { d, update, toast } = useApp();
  const [err, setErr] = useState("");
  const [skipTo, setSkipTo] = useState<Status>("expert_review");
  const [why, setWhy] = useState("");
  const [ev, setEv] = useState({ type: "safety_cert" as ClaimType, text: "", doc: "", issued: new Date().toISOString().slice(0, 10), expires: "" });
  const [rl, setRl] = useState({ tag: "gift" as ReasonTag, interest: "", text: "" });

  const p = d.products.find((x) => x.id === id);
  if (!p) return <p>Unknown product. <Link href="/admin">Back</Link></p>;
  const brand = d.brands.find((b) => b.id === p.brandId)!;
  const profile = d.profiles[p.id];
  const route = d.routes[p.id];
  const vis = visibility(d, p);
  const gate = publishGate(d, p);
  const { lint } = assertedClaims(p, profile);
  const cur = evidenceCurrent(d, p.id);
  const evs = d.evidence.filter((e) => e.productId === p.id);
  const reasons = d.reasons.filter((r) => r.productId === p.id);
  const log = d.statusLog.filter((l) => l.productId === p.id).slice().reverse();
  const si = STAGES.indexOf(p.status);

  const upd = (fn: (q: Product) => void) => update((x) => { fn(x.products.find((q) => q.id === id)!); x.ops.catalogueVersion++; });
  const move = (to: Status, reason = "") => {
    let e: string | null = null;
    update((x) => { e = moveTo(x, id, to, reason); });
    setErr(e ?? "");
    if (!e) toast(`Moved to ${STAGE_LABEL[to]}`);
  };
  const editProfile = (fn: (pr: NonNullable<typeof profile>) => void) => update((x) => { const pr = x.profiles[id]; if (!pr) return; fn(pr); pr.state = "draft"; x.ops.catalogueVersion++; });
  const draft = () => update((x) => {
    const q = x.products.find((z) => z.id === id)!;
    x.profiles[id] = { ...profileFor(q, brand.name, "llm:haiku-5.5 (simulated draft)"), state: "draft" };
    if (!x.reasons.some((r) => r.productId === id)) x.reasons.push(...reasonsFor(q, false));
    x.ops.catalogueVersion++;
  });

  return (
    <>
      <p className="small"><Link href="/admin">← Pipeline</Link></p>
      <div className="row">
        <h1 style={{ margin: 0 }}>{p.emoji} {p.name}</h1>
        <span className="badge">{STAGE_LABEL[p.status]}</span>
        <span className={"badge " + (vis.visible ? "good" : "warn")}>{vis.visible ? "Live to parents" : "Not visible"}</span>
        {vis.visible && <Link className="btn sm" href={`/p/${p.id}`}>Open public page</Link>}
      </div>
      {!vis.visible && <p className="small" style={{ color: "var(--warn)" }}>{vis.reasons.join("; ")}</p>}

      <div className="grid g2" style={{ marginTop: 12 }}>
        <div className="card">
          <h2>Stage</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            {STAGES.map((s, i) => (
              <span key={s} className={"badge " + (s === p.status ? "good" : i < si ? "note" : "")}>{STAGE_LABEL[s]}</span>
            ))}
            {p.status === "suspended" && <span className="badge bad">Suspended</span>}
          </div>
          <div className="row">
            {STAGES[si + 1] && <button className="btn primary sm" onClick={() => move(STAGES[si + 1])}>Advance to {STAGE_LABEL[STAGES[si + 1]]}</button>}
            {si > 0 && <button className="btn sm" onClick={() => move(STAGES[si - 1])}>Move back</button>}
            {p.status === "published" && <button className="btn danger sm" onClick={() => move("suspended", why || "Unpublished by admin")}>Unpublish</button>}
            {p.status === "suspended" && <button className="btn primary sm" onClick={() => move("published")}>Republish</button>}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <select value={skipTo} onChange={(e) => setSkipTo(e.target.value as Status)}>
              {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            <input type="text" placeholder="Reason (required to skip stages, or to unpublish)" value={why} onChange={(e) => setWhy(e.target.value)} style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => move(skipTo, why)}>Move</button>
          </div>
          {err && <p className="small" style={{ color: "var(--bad)", marginTop: 8 }}>{err}</p>}
          <Note>Every move writes <code>product_status_log</code> with actor, time and the skip reason. The publish gate (right) is enforced in a DB function, not just in this UI.</Note>
        </div>
        <div className="card gate">
          <h2>Publish gate</h2>
          <ul>
            {gate.map((g) => (
              <li key={g.key}><span className={g.ok ? "ok" : "no"}>{g.ok ? "✓" : "✗"}</span> {g.label} <span className="muted small">— {g.detail}</span></li>
            ))}
          </ul>
          <Note>Try: open <b>Magnetic building tiles</b>. Its draft says &ldquo;ISI certified&rdquo; and &ldquo;improves…&rdquo; with no evidence, so the gate blocks it.</Note>
        </div>
      </div>

      <div className="card">
        <h2>Details (from scrape, curator-corrected)</h2>
        <div className="grid g4">
          <label className="f">Name<input type="text" value={p.name} onChange={(e) => upd((q) => void (q.name = e.target.value))} /></label>
          <label className="f">Photo URL<input type="text" value={p.photo ?? ""} placeholder="required to publish" onChange={(e) => upd((q) => void (q.photo = e.target.value))} /></label>
          <label className="f">Price (₹)<input type="number" value={p.price} onChange={(e) => upd((q) => { q.price = Number(e.target.value); q.priceAsOf = new Date().toISOString().slice(0, 10); })} /></label>
          <label className="f">Age from (months)<input type="number" value={p.ageMin} onChange={(e) => upd((q) => void (q.ageMin = Number(e.target.value)))} /></label>
          <label className="f">Age to (months)<input type="number" value={p.ageMax} onChange={(e) => upd((q) => void (q.ageMax = Number(e.target.value)))} /></label>
          <label className="f">Category
            <select value={p.category} onChange={(e) => upd((q) => void (q.category = e.target.value))}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="f">Material<input type="text" value={p.material} onChange={(e) => upd((q) => void (q.material = e.target.value))} /></label>
          <label className="f">Pieces<input type="text" value={p.pieces} onChange={(e) => upd((q) => void (q.pieces = e.target.value))} /></label>
          <label className="f">Source URL<input type="url" value={p.sourceUrl} onChange={(e) => upd((q) => void (q.sourceUrl = e.target.value))} /></label>
        </div>
        <label className="f">Short description<textarea value={p.shortDesc} onChange={(e) => upd((q) => void (q.shortDesc = e.target.value))} /></label>
        <div className="row small">
          <span className="muted">Interests:</span>
          {Object.entries(INTERESTS).map(([k, v]) => (
            <label key={k} className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={p.interests.includes(k)} onChange={(e) => upd((q) => void (q.interests = e.target.checked ? [...q.interests, k] : q.interests.filter((i) => i !== k)))} /> {v}
            </label>
          ))}
        </div>
        <Note>Age band is never trusted from a scrape: the curator sets it. Price edits stamp <code>price_as_of</code>. Material is a restricted claim: if it is set, an approved material evidence record is needed to publish.</Note>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Editorial profile</h2>
          {profile && <span className={"badge " + (profile.state === "approved" ? "good" : "warn")}>{profile.state}</span>}
          {profile && <span className="muted small">source: {profile.source}</span>}
          <span className="spacer" />
          <button className="btn sm" onClick={draft}>{profile ? "Re-draft with AI (simulated)" : "Draft with AI (simulated)"}</button>
          {profile && profile.state === "draft" && <button className="btn primary sm" onClick={() => update((x) => { x.profiles[id].state = "approved"; x.profiles[id].source = "Curator (approved)"; x.ops.catalogueVersion++; })}>Approve profile</button>}
        </div>
        <Note>Drafted once per product at curation time, never at query time. Scraped text goes to the model as delimited data with a schema-validated output; nothing is auto-approved. Any edit sets the profile back to draft.</Note>
        {!profile && <p className="muted">No profile yet.</p>}
        {profile && (
          <>
            <label className="f">Intro<textarea value={profile.intro} onChange={(e) => editProfile((x) => void (x.intro = e.target.value))} /></label>
            <div className="grid g3">
              {profile.points.map((pt, i) => (
                <div key={i}>
                  <label className="f">Point {i + 1} title<input type="text" value={pt.title} onChange={(e) => editProfile((x) => void (x.points[i].title = e.target.value))} /></label>
                  <textarea value={pt.body} onChange={(e) => editProfile((x) => void (x.points[i].body = e.target.value))} />
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8 }}>
              <span className="small">Ways to play: <b>{profile.playSource === "type" ? "general ideas for this kind of toy (labelled on the page)" : "written for this product"}</b></span>
              <button className="btn sm" onClick={() => editProfile((x) => { x.play = playForType(p.category); x.playSource = "type"; })}>Fill from product type</button>
            </div>
            <div className="grid g3" style={{ marginTop: 8 }}>
              {profile.play.map((pt, i) => (
                <div key={i}>
                  <label className="f">Play idea {i + 1} title<input type="text" value={pt.title} onChange={(e) => editProfile((x) => { x.play[i].title = e.target.value; x.playSource = "product"; })} /></label>
                  <textarea value={pt.prompt} onChange={(e) => editProfile((x) => { x.play[i].prompt = e.target.value; x.playSource = "product"; })} />
                </div>
              ))}
            </div>
            <label className="f" style={{ marginTop: 8 }}>Why we picked it<textarea value={profile.why} onChange={(e) => editProfile((x) => void (x.why = e.target.value))} /></label>
          </>
        )}
        <h3 style={{ marginTop: 8 }}>Claim lint</h3>
        {!lint.length ? <p className="small ok">✓ No restricted claims found in the text.</p> : (
          <table>
            <thead><tr><th>Claim</th><th>Where</th><th>Matched</th><th>Evidence</th></tr></thead>
            <tbody>
              {lint.map((l, i) => {
                const has = cur.some((e) => e.type === l.claim);
                return <tr key={i}><td>{CLAIM_LABEL[l.claim]}</td><td>{l.where}</td><td><code>{l.match}</code></td><td><span className={"badge " + (has ? "good" : "bad")}>{has ? "current record" : "none: blocks publishing"}</span></td></tr>;
              })}
            </tbody>
          </table>
        )}
        <Note>Keyword lint finds restricted claims (safety, certification, developmental outcomes) in text and requires a matching current evidence record.</Note>
      </div>

      <div className="card">
        <h2>Reason lines (shown on result cards)</h2>
        <Note>Approved lines are tagged. At query time the card shows the line whose tag best matches the query (interest → gift → budget → skill → age fit). No text is generated per query.</Note>
        <table>
          <thead><tr><th>Tag</th><th>Text</th><th>Approved</th><th /></tr></thead>
          <tbody>
            {reasons.map((r) => (
              <tr key={r.id}>
                <td><span className="badge note">{r.tag}{r.interest ? `:${r.interest}` : ""}</span></td>
                <td><input type="text" style={{ width: "100%" }} value={r.text} onChange={(e) => update((x) => { const q = x.reasons.find((z) => z.id === r.id)!; q.text = e.target.value; x.ops.catalogueVersion++; })} /></td>
                <td><input type="checkbox" checked={r.approved} onChange={(e) => update((x) => { x.reasons.find((z) => z.id === r.id)!.approved = e.target.checked; x.ops.catalogueVersion++; })} /></td>
                <td><button className="btn sm danger" onClick={() => update((x) => { x.reasons = x.reasons.filter((z) => z.id !== r.id); x.ops.catalogueVersion++; })}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 8 }}>
          <select value={rl.tag} onChange={(e) => setRl({ ...rl, tag: e.target.value as ReasonTag })}>{TAGS.map((t) => <option key={t}>{t}</option>)}</select>
          {rl.tag === "interest" && <select value={rl.interest} onChange={(e) => setRl({ ...rl, interest: e.target.value })}><option value="">interest…</option>{Object.entries(INTERESTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          <input type="text" placeholder="Reason text" style={{ flex: 1 }} value={rl.text} onChange={(e) => setRl({ ...rl, text: e.target.value })} />
          <button className="btn sm" disabled={!rl.text} onClick={() => { update((x) => { x.reasons.push({ id: "r-" + Math.random().toString(36).slice(2, 8), productId: id, tag: rl.tag, interest: rl.tag === "interest" ? rl.interest || undefined : undefined, text: rl.text, approved: false }); }); setRl({ ...rl, text: "" }); }}>Add</button>
        </div>
      </div>

      <div className="card">
        <h2>Evidence</h2>
        <Note>Table <code>evidence</code> (claim type, document, issued, expires, approver). The <b>client</b> approves. Only approved, unexpired rows feed &ldquo;What we checked&rdquo;. Move the demo clock in Ops to see expiry.</Note>
        <table>
          <thead><tr><th>Type</th><th>Claim</th><th>Document</th><th>Issued</th><th>Expires</th><th>State</th><th /></tr></thead>
          <tbody>
            {evs.map((e) => {
              const st = evidenceState(e, d);
              return (
                <tr key={e.id}>
                  <td>{CLAIM_LABEL[e.type]}</td>
                  <td className="small">{e.claimText}</td>
                  <td className="small">📎 {e.docName}</td>
                  <td className="small">{e.issuedOn}</td>
                  <td className="small">{e.expiresOn ?? "—"}</td>
                  <td><span className={"badge " + (st === "current" ? "good" : st === "pending" ? "warn" : "bad")}>{st}</span></td>
                  <td>
                    <div className="row">
                      {e.status !== "approved" && <button className="btn sm" onClick={() => update((x) => { const q = x.evidence.find((z) => z.id === e.id)!; q.status = "approved"; q.approver = "Client approver (demo)"; x.ops.catalogueVersion++; })}>Approve</button>}
                      {e.status === "pending" && <button className="btn sm" onClick={() => update((x) => { x.evidence.find((z) => z.id === e.id)!.status = "rejected"; })}>Reject</button>}
                      <button className="btn sm danger" onClick={() => update((x) => { x.evidence = x.evidence.filter((z) => z.id !== e.id); x.ops.catalogueVersion++; })}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="grid g4" style={{ marginTop: 8 }}>
          <label className="f">Claim type
            <select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value as ClaimType })}>{(Object.keys(CLAIM_LABEL) as ClaimType[]).map((t) => <option key={t} value={t}>{CLAIM_LABEL[t]}</option>)}</select>
          </label>
          <label className="f">Claim text<input type="text" value={ev.text} onChange={(e) => setEv({ ...ev, text: e.target.value })} placeholder="e.g. ISI mark verified, licence no. …" /></label>
          <label className="f">Document (upload)<input type="file" onChange={(e) => setEv({ ...ev, doc: e.target.files?.[0]?.name ?? "" })} /></label>
          <div className="row">
            <label className="f">Issued<input type="date" value={ev.issued} onChange={(e) => setEv({ ...ev, issued: e.target.value })} /></label>
            <label className="f">Expires<input type="date" value={ev.expires} onChange={(e) => setEv({ ...ev, expires: e.target.value })} /></label>
          </div>
        </div>
        <button className="btn sm" disabled={!ev.text} onClick={() => { update((x) => void x.evidence.push({ id: "e-" + Math.random().toString(36).slice(2, 8), productId: id, type: ev.type, claimText: ev.text, docName: ev.doc || "document-placeholder.pdf", issuedOn: ev.issued, expiresOn: ev.expires || null, approver: "", status: "pending" })); setEv({ ...ev, text: "" }); toast("Evidence added as pending"); }}>Add evidence (pending)</button>
      </div>

      <div className="card">
        <h2>Purchase route and commercial disclosure</h2>
        <Note>Table <code>purchase_route</code>. A product cannot publish without an active route and disclosure. Unsigned brands use kind &ldquo;none&rdquo; with honest wording.</Note>
        {!route ? (
          <button className="btn" onClick={() => update((x) => { const k: RouteKind = "none"; x.routes[id] = { productId: id, kind: k, status: "inactive", disclosure: disclosureFor(k, brand.name), url: p.sourceUrl }; })}>Create route</button>
        ) : (
          <div className="grid g2">
            <label className="f">Kind
              <select value={route.kind} onChange={(e) => update((x) => { const r = x.routes[id]; r.kind = e.target.value as RouteKind; r.disclosure = disclosureFor(r.kind, brand.name); x.ops.catalogueVersion++; })}>
                <option value="affiliate">affiliate</option><option value="referral">referral</option><option value="direct">direct</option><option value="none">none (no deal)</option>
              </select>
            </label>
            <label className="f">Status
              <select value={route.status} onChange={(e) => update((x) => { x.routes[id].status = e.target.value as "active" | "inactive"; x.ops.catalogueVersion++; })}>
                <option value="active">active</option><option value="inactive">inactive</option>
              </select>
            </label>
            <label className="f">Destination URL (built server-side)<input type="url" value={route.url} onChange={(e) => update((x) => void (x.routes[id].url = e.target.value))} /></label>
            <label className="f">Disclosure text<textarea value={route.disclosure} onChange={(e) => update((x) => void (x.routes[id].disclosure = e.target.value))} /></label>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Status log</h2>
        <table>
          <thead><tr><th>When</th><th>From → To</th><th>Who</th><th>Reason</th></tr></thead>
          <tbody>
            {log.map((l) => <tr key={l.id}><td className="small">{l.at}</td><td className="small">{l.from ? STAGE_LABEL[l.from] : "—"} → {STAGE_LABEL[l.to]}</td><td className="small">{l.actor}</td><td className="small">{l.skippedReason ?? ""}</td></tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
