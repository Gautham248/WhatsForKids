"use client";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { BANDS, Band, INTERESTS, bandLabel, CHILD_LABELS } from "@/lib/types";

const NOTICE_VERSION = "child-profile-notice v1.2";
const NOTICE = "We will save your child's age band and chosen interests so we can pre-fill searches. We will not use them for advertising, tracking or profiling, and we never store your child's name or free text. You can withdraw consent and delete the profile at any time.";
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
};

export default function AccountPage() {
  const { d, update, setLoginOpen, signOut, toast } = useApp();
  const [band, setBand] = useState<Band>("3-5");
  const [ints, setInts] = useState<string[]>([]);
  const [tick, setTick] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (!d.user)
    return (
      <div className="narrow empty">
        <h1>{deleted ? "Account deleted" : "Account"}</h1>
        {deleted ? (
          <p>Your saved items, history, child profile and consent records were deleted. Backups containing them expire within 30 days (this is recorded on the provider register).</p>
        ) : (
          <p>Sign in to manage saved items, history and an optional child profile.</p>
        )}
        <button className="btn primary" onClick={() => setLoginOpen(true)}>Sign in with Google</button>
      </div>
    );

  const consent = d.consents.find((c) => c.id === d.children[0]?.consentId);
  const nextLabel = CHILD_LABELS.find((l) => !d.children.some((c) => c.label === l));
  const save = () => {
    update((x) => {
      // Adding a profile re-confirms consent: a fresh record, and every profile points at it.
      const id = "c_" + Math.random().toString(36).slice(2, 8);
      x.consents.push({ id, at: new Date().toISOString(), noticeVersion: NOTICE_VERSION, noticeHash: hash(NOTICE), verificationMethod: "declaration (tick box) — demo only", withdrawnAt: null });
      x.children.forEach((c) => (c.consentId = id));
      x.children.push({ id: "k_" + Math.random().toString(36).slice(2, 8), label: nextLabel!, ageBand: band, interests: ints, consentId: id });
    });
    setTick(false);
    setInts([]);
    toast("Consent recorded, profile saved");
  };
  const removeOne = (cid: string) => update((x) => void (x.children = x.children.filter((c) => c.id !== cid)));
  const withdraw = () => {
    update((x) => {
      const ids = new Set(x.children.map((c) => c.consentId));
      x.consents.forEach((q) => { if (ids.has(q.id) && !q.withdrawnAt) q.withdrawnAt = new Date().toISOString(); });
      x.children = [];
    });
    toast("Consent withdrawn, all profiles deleted");
  };
  const del = () => {
    if (!confirm("Delete this demo account and all its data?")) return;
    update((x) => {
      x.deletionRequests.push({ at: new Date().toISOString(), note: `account ${x.user?.id} deleted; backups expire within 30 days` });
      x.user = null;
      x.saved = [];
      x.history = [];
      x.children = [];
      x.consents = [];
    });
    setDeleted(true);
  };

  return (
    <div className="narrow">
      <h1>Account</h1>
      <div className="card">
        <div className="row">
          <div>
            <b>{d.user.name}</b>
            <div className="muted small">{d.user.email} · signed in with Google (demo)</div>
          </div>
          <span className="spacer" />
          <button className="btn sm" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div className="card">
        <h2>Child profiles (optional)</h2>
        <Note>
          Table <code>child_profile</code> holds <b>age band + controlled-vocabulary interests only</b>. Saving requires a <code>consent_record</code> first (B5). It only pre-fills searches; it is never used for ads, ranking history or behavioural tracking (DPDP s9(3)).
        </Note>
        {d.children.length > 0 && (
          <>
            <ul>
              {d.children.map((c) => (
                <li key={c.id} className="row" style={{ gap: 8 }}>
                  <span><b>{c.label}</b>: age {bandLabel(c.ageBand)}, interests: {c.interests.length ? c.interests.map((i) => INTERESTS[i]).join(", ") : "none"}</span>
                  <button className="btn sm" onClick={() => removeOne(c.id)}>Delete</button>
                </li>
              ))}
            </ul>
            <p className="small muted">Profiles are labelled Child 1, Child 2… on purpose: no names, birth dates or photos.</p>
            <b className="small">Consent record (covers all profiles)</b>
            <pre>{JSON.stringify(consent, null, 2)}</pre>
            <button className="btn danger" style={{ marginTop: 8 }} onClick={withdraw}>Withdraw consent and delete all profiles</button>
          </>
        )}
        {!nextLabel ? (
          <p className="small muted">Up to {CHILD_LABELS.length} profiles.</p>
        ) : (
          <>
            {d.children.length > 0 && <h3 style={{ marginTop: 16 }}>Add {nextLabel}</h3>}
            <div className="grid g2">
              <label className="f">Age band
                <select value={band} onChange={(e) => setBand(e.target.value as Band)}>
                  {BANDS.map((b) => <option key={b} value={b}>{bandLabel(b)}</option>)}
                </select>
              </label>
              <div>
                <div className="small muted" style={{ marginBottom: 4 }}>Interests (pick any)</div>
                <div className="row">
                  {Object.entries(INTERESTS).map(([k, v]) => (
                    <label key={k} className="small row" style={{ gap: 4 }}>
                      <input type="checkbox" checked={ints.includes(k)} onChange={(e) => setInts(e.target.checked ? [...ints, k] : ints.filter((i) => i !== k))} /> {v}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="card" style={{ background: "#faf7f2" }}>
              <b className="small">{NOTICE_VERSION}</b>
              <p className="small">{NOTICE}</p>
              <label className="small row"><input type="checkbox" checked={tick} onChange={(e) => setTick(e.target.checked)} /> I am this child&apos;s parent or legal guardian and I consent to this.</label>
            </div>
            <div className="card" style={{ background: "var(--warn-soft)", borderColor: "#f3d9a4" }}>
              <b className="small">For the team: this tick box is a placeholder.</b>
              <p className="small" style={{ margin: 0 }}>
                Under DPDP, verifiable parental consent means verifying that the consenting adult is an adult and the parent. A tick box does not do that. Schedule B leaves the consent standard to the Client, so <code>verification_method</code> is a pluggable field. Get the Client&apos;s chosen standard in writing before building the real screen.
              </p>
            </div>
            <button className="btn primary" disabled={!tick} onClick={save}>{d.children.length ? `Add ${nextLabel} and re-confirm consent` : "Save profile and record consent"}</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Delete account</h2>
        <Note>B5 test: deletion cascades live data (saved, history, profile, consents). Backups roll off within 30 days; a <code>deletion_request</code> row is kept.</Note>
        <p className="small muted">Removes saved items, history, child profile and consent records.</p>
        <button className="btn danger" onClick={del}>Delete my account</button>
      </div>
    </div>
  );
}
