"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { evidenceCurrent, visibility } from "@/lib/gate";
import { CATEGORIES, CLAIM_LABEL, ClaimType, ageText, inr } from "@/lib/types";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { d, update, requireLogin, toast } = useApp();
  const [pos, setPos] = useState("1");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("pos");
    if (q) setPos(q);
  }, []);
  const p = d.products.find((x) => x.id === id);
  if (!p) return <div className="narrow empty"><h1>404</h1><p>No product with this ID.</p><Link href="/">Back to chat</Link></div>;
  const vis = visibility(d, p);
  if (!vis.visible)
    return (
      <div className="narrow empty">
        <h1>This product isn&apos;t available</h1>
        <p>It may have been unpublished or removed. Parents never see why; the unpublished ID simply returns not found.</p>
        <div className="card small" style={{ textAlign: "left", borderColor: "#d6d1fb", background: "#fcfbff" }}>
          <b>Demo note (parents would not see this):</b> {vis.reasons.join("; ")}
        </div>
        <p style={{ marginTop: 16 }}><Link href="/">Back to chat</Link></p>
      </div>
    );
  const brand = d.brands.find((b) => b.id === p.brandId)!;
  const profile = d.profiles[p.id];
  const route = d.routes[p.id];
  const ev = evidenceCurrent(d, p.id);
  const evFor = (t: ClaimType) => ev.find((e) => e.type === t);
  const saved = d.saved.includes(p.id);
  const lines: { label: string; type: ClaimType | "purchase"; text: string; src: string }[] = [];
  (["age_suitability", "material", "safety_cert", "developmental"] as ClaimType[]).forEach((t) => {
    const e = evFor(t);
    if (e) lines.push({ label: CLAIM_LABEL[t], type: t, text: e.claimText, src: `${e.docName}, issued ${e.issuedOn}${e.expiresOn ? `, valid until ${e.expiresOn}` : ""}` });
  });
  if (route?.status === "active") lines.push({ label: "Purchase information", type: "purchase", text: `Price as researched on ${p.priceAsOf}; sold by ${brand.name} on their own site.`, src: "price_as_of + active purchase route" });
  const missing = (["safety_cert", "developmental"] as ClaimType[]).filter((t) => !evFor(t));

  return (
    <div className="wrap">
      <p className="small"><Link href="/">← Back to chat</Link></p>
      <div className="product">
        <div>
          <div className="hero" style={{ background: p.color }}>{p.emoji}</div>
          <Note>Photo comes from the product&apos;s photo asset (dummy emoji here).</Note>
        </div>
        <div>
          <div className="muted small">{brand.name}</div>
          <h1>{p.name}</h1>
          <div style={{ fontSize: "1.3rem" }}>
            <b>{inr(p.price)}</b>
          </div>
          <div className="small muted">As researched on {p.priceAsOf}. Please confirm the price on the brand&apos;s site before you buy.</div>
          <Note>Price and date from the last <b>approved</b> scrape. A newer price waits in the admin approval queue and never appears here until approved.</Note>
          <p style={{ marginTop: 10 }}>{p.shortDesc}</p>
          <div className="row">
            <Link className="btn primary" href={`/out/${p.id}?pos=${pos}`}>
              View at {brand.name} →
            </Link>
            <button
              className="btn"
              onClick={() =>
                requireLogin(() => {
                  update((x) => {
                    x.saved = x.saved.includes(p.id) ? x.saved.filter((i) => i !== p.id) : [p.id, ...x.saved];
                  });
                  toast(saved ? "Removed from saved" : "Saved");
                })
              }
            >
              {saved ? "♥ Saved" : "♡ Save"}
            </button>
          </div>
          {route && <div className="disclosure" style={{ marginTop: 8 }}>{route.disclosure}</div>}
          <Note>The link goes to <code>/out/…</code>, which logs a redirect event (coded slots, no raw chat) and then forwards to the destination built on the server.</Note>
        </div>
      </div>

      {profile && (
        <>
          <div className="section card">
            <h2>Why we think it&apos;s worth a look</h2>
            <p>{profile.intro}</p>
            <div className="grid g3">
              {profile.points.map((x, i) => (
                <div key={i}>
                  <b>{x.title}</b>
                  <p className="small">{x.body}</p>
                </div>
              ))}
            </div>
            <p className="disclaimer">These are possible play experiences, not guarantees, based on the product type and the seller&apos;s description.</p>
            <Note>Editorial profile (LLM-drafted at curation time, approved by an admin). The disclaimer is fixed text.</Note>
          </div>
          <div className="section card">
            <h2>Ways to play together</h2>
            {profile.playSource === "type" && <p className="small muted" style={{ marginTop: -4 }}>General ideas for this kind of toy, not specific to this product.</p>}
            <div className="grid g3">
              {profile.play.map((x, i) => (
                <div key={i}>
                  <b>{x.title}</b>
                  <p className="small">{x.prompt}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {p.personalisation && (
        <div className="section card">
          <h2>Can be personalised</h2>
          <p>{p.personalisation}.</p>
          <p className="small muted">You choose the name or message on the brand&apos;s site when you buy. We never ask for your child&apos;s name.</p>
        </div>
      )}

      <div className="section card">
        <h2>Product details</h2>
        <dl className="kvt">
          <dt>Type</dt><dd>{CATEGORIES[p.category]}</dd>
          <dt>Brand</dt><dd>{brand.name}</dd>
          <dt>Price</dt><dd>{inr(p.price)} (as researched {p.priceAsOf})</dd>
          <dt>Recommended age</dt><dd>{ageText(p.ageMin, p.ageMax)}</dd>
          {p.material && <><dt>Material</dt><dd>{p.material}</dd></>}
          {p.pieces && <><dt>Pieces</dt><dd>{p.pieces}</dd></>}
          <dt>Availability</dt><dd>{p.availability}</dd>
          {p.cleaning && <><dt>Cleaning</dt><dd>{p.cleaning}</dd></>}
        </dl>
        <Note>Rows with nothing confirmed (material, pieces, cleaning) are hidden rather than filled in. An empty section is better than a made-up one.</Note>
        <Note>Fixes the sample page: recommended age is its own row, and availability no longer mentions real-time scraping (B4 offers weekly refresh only).</Note>
      </div>

      {profile && (
        <div className="section card">
          <h2>Why we picked it</h2>
          <p>{profile.why}</p>
        </div>
      )}

      <div className="section card">
        <h2>What we checked</h2>
        <ul className="checked">
          {lines.map((l) => (
            <li key={l.label}>
              <b>{l.label}:</b> {l.text}
              <div className="small muted">Evidence: {l.src}</div>
            </li>
          ))}
        </ul>
        <Note>
          Every line here renders only from a <b>current, approved evidence record</b> (view <code>evidence_current</code>). No record, no line.
          {missing.length > 0 && <> Not shown for this product because no current record exists: {missing.map((m) => CLAIM_LABEL[m]).join(", ")}.</>} Try Admin → Ops → move the demo clock forward and watch lines disappear.
        </Note>
      </div>

      <div className="section card">
        <h2>Where to buy</h2>
        <p>
          Sold by <b>{brand.name}</b>.{" "}
          <Link href={`/out/${p.id}?pos=${pos}`}>Go to the product on {brand.name}&apos;s site</Link>
        </p>
        {route && <div className="disclosure">{route.disclosure}</div>}
      </div>
    </div>
  );
}
