"use client";
import Link from "next/link";
import { useState } from "react";

const TESTS: { id: string; what: string; how: string; href: string }[] = [
  { id: "B2", what: "Guest discovery and follow-up", how: "In Chat type “something for a 6 year old”. Under the results the reply names what it still doesn’t know (budget, what they like, gift or not, boy or girl) and offers pill groups for just those, built from the results shown.", href: "/" },
  { id: "B2", what: "Pick several pills at once", how: "Tap “Up to ₹1,000”, two interests under “They like” and “It’s a gift”. Taps only select (one per group, up to 2 interests); press “Show ideas” to apply them all in one turn and one search.", href: "/" },
  { id: "B2", what: "Type and tap together", how: "Pick “Up to ₹500”, then type “under 2000, he loves space” and Send. Pills and text go in one turn: pills apply first, the typed words win a conflict (budget becomes ₹2,000). The Inspector lists both.", href: "/" },
  { id: "B2", what: "Gender for wording only", how: "Boy or girl comes from the text (son, niece, he, she…) or a pill. It only changes the reply wording, never the results: the catalogue is not gender-tagged.", href: "/" },
  { id: "B2", what: "Price and age filters", how: "Watch the filter funnel in the Inspector shrink as filters are applied, whether one pill at a time or several together.", href: "/" },
  { id: "B2", what: "No-result response", how: "Type “books under 300 for a 3 year old”. It relaxes one thing at a time: first the next budget up (“Nothing under ₹500… here are options up to ₹1,000”), and only if that is empty too does it offer to drop a filter.", href: "/" },
  { id: "B2", what: "How many results", how: "3 for a specific request (age and kind of thing), up to 6 for a vague one. Change both in Admin → Ops.", href: "/admin/ops" },
  { id: "B2", what: "Gift occasion", how: "Type “gift for my nephew, 6 years”. An Occasion group (birthday, festival, return gift) appears with the other missing details; picking one also marks it as a gift.", href: "/" },
  { id: "B2", what: "Non-product questions", how: "Type “my toddler has tantrums at bedtime”. No advice; one related search is offered instead (“Bedtime books for 0–2”).", href: "/" },
  { id: "B2", what: "Google login, saved items, history", how: "Sign in (top right), tap a heart on a card, then open Saved and History. History stores coded slots (including boy or girl if given), not chat.", href: "/saved" },
  { id: "B2", what: "Optional child profile with consent", how: "Account → child profile. Consent is recorded before the profile saves. Read the amber note on verification.", href: "/account" },
  { id: "B2", what: "Affiliate disclosure and active purchase route", how: "Open a product. Disclosure text differs by route type. In Admin, “Cotton canvas play tent” has an inactive route and cannot publish.", href: "/admin" },
  { id: "B2", what: "Redirect event", how: "Press “View at …” on any product, then look at Admin → Events.", href: "/admin/events" },
  { id: "B2", what: "CSV import and export", how: "Admin → CSV: run the URL batch, download the products CSV, re-import edited rows.", href: "/admin/csv" },
  { id: "B2", what: "Publish and unpublish", how: "Admin → open a published product → Unpublish. Its public page then shows “not available”. Republish needs the gate to pass.", href: "/admin" },
  { id: "B3", what: "Absent or expired evidence", how: "Admin → Ops → +26 days. The wooden rainbow stacker disappears. Add or renew its evidence and it returns.", href: "/admin/ops" },
  { id: "B3", what: "Unsupported certification request", how: "Type “CE marked toys for a 2 year old”. Then try “ISI certified toys for a 2 year old”. Only products with a current evidence record are named.", href: "/" },
  { id: "B3", what: "Required to publish", how: "Admin → Felt fairy wings: the gate lists name and brand, photo, age band, price, link, route, approved profile and evidence. It has no photo yet, so “Photo set” fails until you add one.", href: "/admin" },
  { id: "B3", what: "Thin products: general ideas, hidden gaps", how: "On a product page, “Ways to play together” drafted from the product type says it is general ideas for this kind of toy. Material, pieces or cleaning with nothing confirmed are hidden, not filled in. Admin → product → “Fill from product type” drafts them; an admin still approves.", href: "/admin" },
  { id: "Ops", what: "Same products every time?", how: "Run a few searches, then Admin → Ops → Exposure: the share of cards taken by the top 5 products (warns above 50%), and live products per age band × kind of thing, with thin cells highlighted.", href: "/admin/ops" },
  { id: "B3", what: "Stage skipping with a recorded reason", how: "Admin → a product in Discovered → pick Expert review → Move. It asks for a reason and logs it.", href: "/admin" },
  { id: "B4", what: "Scraper, fixtures, regression", how: "Admin → Scraper: scrape a sample URL, run the regression suite, then tick “simulate an adapter bug” and run it again.", href: "/admin/scraper" },
  { id: "B4", what: "Changed values need approval", how: "Scraper → Run refresh on Tinker & Co, then open Approvals. Until approved the product page keeps the old price.", href: "/admin/diffs" },
  { id: "B5", what: "No raw chat stored, provider register, deletion", how: "Inspector shows what is persisted: coded slots only (age band, budget, category, interests, gift or own, occasion, boy or girl), never chat text. Admin → Ops has the register. Account → Delete account.", href: "/admin/ops" },
  { id: "Cost", what: "Spend cap and alerts", how: "Admin → Ops: set the model daily cap to ₹0.02, then type “five yr old likes dinasaurs” a few times. Alerts fire once at 50%, 80% and 100%; at 100% the model switches itself off and chat carries on with the free rules.", href: "/admin/ops" },
  { id: "Cost", what: "Guest limits", how: "5 typed messages per guest chat, and 15 per device per day across chats (New chat does not reset it). Then the guest is asked to sign in; pills keep working. Both caps are in Admin → Ops.", href: "/admin/ops" },
  { id: "Money", what: "Is it working?", how: "Admin → Events shows the three numbers: share of chats that end in a brand click, clicks per chat, and sales reported by brands (import a sample in Admin → CSV → Brand sales report).", href: "/admin/events" },
  { id: "Money", what: "Sponsored slot", how: "Search for a 9 year old: the gear set shows at position 2, labelled Sponsored. Magnetic tiles pays too but is not published, so it never appears. Payment buys position, never entry: the product must pass the gate and match the search. Switch it off in Admin → Ops.", href: "/" },
  { id: "Cost", what: "Cheap by design", how: "Compare a tapped turn (free), a typed turn the rules parse (free) and “five yr old likes dinasaurs” (a simulated model call, ~₹0.01). Flip the model kill-switch in Ops.", href: "/admin/ops" },
];

export default function HowItWorks() {
  const [sessions, setSessions] = useState(20000);
  const infra = sessions <= 5000 ? 2000 : sessions <= 50000 ? 3800 : 11500;
  const lo = sessions * 0.022 + infra;
  const hi = sessions * 0.1 + infra;
  const f = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
  return (
    <div className="narrow" style={{ maxWidth: 1000 }}>
      <h1>How this demo works</h1>
      <div className="card">
        <p>
          This is a <b>clickable demo</b> of the What&apos;s for Kids platform for designers and engineers. Everything is dummy data, nothing is sent anywhere, and your changes live only in this browser. Use <b>Annotations</b> (top bar) to see where each piece of the UI gets its data and <b>Inspector</b> (on the Chat page) to see what the system does on each turn.
        </p>
      </div>

      <div className="card">
        <h2>Two lanes meeting at the catalogue</h2>
        <div className="diag">
          <div className="lane cur">
            <b>Curation lane (admin, once per product)</b>
            <div className="flow" style={{ marginTop: 6 }}>
              <div className="box">Brand URL or CSV</div><span className="arrow">→</span>
              <div className="box">Scraper adapter<br /><span className="muted small">Shopify · schema.org · CSV</span></div><span className="arrow">→</span>
              <div className="box">Admin review<br /><span className="muted small">profile · reasons · evidence</span></div><span className="arrow">→</span>
              <div className="box">Publish gate<br /><span className="muted small">age · price · URL · route · evidence</span></div><span className="arrow">→</span>
              <div className="box" style={{ background: "#fff4cf" }}><b>Catalogue</b></div>
            </div>
          </div>
          <div className="lane par">
            <b>Parent lane (every session)</b>
            <div className="flow" style={{ marginTop: 6 }}>
              <div className="box">Chat / taps<br /><span className="muted small">typed text + picked pills</span></div><span className="arrow">→</span>
              <div className="box">Guards<br /><span className="muted small">caps · length</span></div><span className="arrow">→</span>
              <div className="box">Rules parser<br /><span className="muted small">free · taps skip it</span></div><span className="arrow">→</span>
              <div className="box" style={{ borderStyle: "dashed" }}>Small model<br /><span className="muted small">only if rules can&apos;t</span></div><span className="arrow">→</span>
              <div className="box">Filter + rank<br /><span className="muted small">deterministic SQL</span></div><span className="arrow">→</span>
              <div className="box">Result cards<br /><span className="muted small">reason by tag</span></div><span className="arrow">→</span>
              <div className="box">Product page</div><span className="arrow">→</span>
              <div className="box">Redirect log</div><span className="arrow">→</span>
              <div className="box">Brand site</div>
            </div>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>The model is used in two places only: drafting editorial profiles (curation time) and slot parsing (per turn, when needed). Everything else is ordinary code. The chat only ever selects from Published products.</p>
      </div>

      <div className="card">
        <h2>What is real and what is faked</h2>
        <table>
          <thead><tr><th>Part</th><th>In this demo</th><th>In the real build</th></tr></thead>
          <tbody>
            <tr><td>Data store</td><td>Your browser (localStorage)</td><td>Postgres on one India-region VPS</td></tr>
            <tr><td>Rules parser, ranking, diversity, reason pick</td><td><b>Real logic</b></td><td>Same logic, server side</td></tr>
            <tr><td>Model call</td><td>Simulated (fixes number words, typos, slang) with real token and cost maths</td><td>Small model returning a strict JSON slot object</td></tr>
            <tr><td>Scraper adapters and fixtures</td><td><b>Real parsers</b> on saved sample pages; fetch is simulated</td><td>HTTP fetcher with robots, 1 request/s, SSRF guard, CI fixtures</td></tr>
            <tr><td>Evidence, claim lint, publish gate</td><td><b>Real rules</b>, computed on read</td><td>DB view, DB function, nightly sweep</td></tr>
            <tr><td>Google sign-in</td><td>Fake account chooser</td><td>Google OAuth through Auth.js</td></tr>
            <tr><td>Brand sites, photos, certificates</td><td>Invented (emoji art, fake PDFs)</td><td>Real, with authorisation records</td></tr>
            <tr><td>Parental consent</td><td>Tick box placeholder</td><td>Standard to be set by the Client</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Try each acceptance test</h2>
        <table>
          <thead><tr><th>Test</th><th>What to look at</th><th>How</th><th /></tr></thead>
          <tbody>
            {TESTS.map((t, i) => (
              <tr key={i}>
                <td><span className="badge note">{t.id}</span></td>
                <td><b>{t.what}</b></td>
                <td className="small">{t.how}</td>
                <td><Link className="btn sm" href={t.href}>Go</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Monthly cost sketch</h2>
        <p className="small muted">Single VPS plus a small model for parsing. Estimates from the design doc; verify prices before quoting.</p>
        <label className="f">Sessions per month: <b>{sessions.toLocaleString("en-IN")}</b>
          <input type="range" min={1000} max={300000} step={1000} value={sessions} onChange={(e) => setSessions(Number(e.target.value))} />
        </label>
        <div className="grid g3">
          <div><div className="muted small">Infra (VPS, storage, domain)</div><b>{f(infra)}</b></div>
          <div><div className="muted small">Model (rules bypass → no bypass)</div><b>{f(sessions * 0.022)} – {f(sessions * 0.1)}</b></div>
          <div><div className="muted small">Total per month</div><b>{f(lo)} – {f(hi)}</b></div>
        </div>
        <div className="grid g3" style={{ marginTop: 8 }}>
          <div><div className="muted small">Revenue, bear (₹0.07/session)</div>{f(sessions * 0.07)}</div>
          <div><div className="muted small">Revenue, base (₹0.36/session)</div>{f(sessions * 0.36)}</div>
          <div><div className="muted small">Revenue, bull (₹1.80/session)</div>{f(sessions * 1.8)}</div>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Excludes curation labour and engineering time. Revenue assumes 20% of sessions click out, 2% of clicks buy, ₹1,800 order, 5% commission (base), and no brand has signed a deal yet.</p>
      </div>
    </div>
  );
}
