"use client";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { FIXTURES } from "@/lib/fixtures";
import { addProductFromFixture, refreshBrand, regression, RegressionRow, scrapeUrl, ScrapeOutcome, SAMPLE_URLS } from "@/lib/scraper";
import { todayOf } from "@/lib/gate";

export default function ScraperPage() {
  const { d, update, toast } = useApp();
  const [url, setUrl] = useState(SAMPLE_URLS[2]);
  const [out, setOut] = useState<ScrapeOutcome | null>(null);
  const [reg, setReg] = useState<RegressionRow[] | null>(null);
  const [lastRun, setLastRun] = useState<string[]>([]);
  const today = todayOf(d);

  const run = () => setOut(scrapeUrl(d, url));
  const add = () => {
    let name = "";
    update((x) => {
      const o = scrapeUrl(x, url);
      const p = addProductFromFixture(x, o);
      if (p) name = p.name;
    });
    toast(name ? `Added “${name}” as Discovered` : "Nothing added");
    setOut(null);
  };
  const refresh = (brandId: string) => {
    let lines: string[] = [];
    update((x) => {
      lines = refreshBrand(x, brandId);
      x.scrapeRuns.unshift({ id: "run" + x.scrapeRuns.length, at: today, brandId, kind: "refresh", lines });
    });
    setLastRun(lines);
  };

  return (
    <>
      <h1>Scraper</h1>
      <Note>Adapters per <b>platform type</b> (Shopify, schema.org, CSV), custom only per site and priced separately. Authorised pages only. The fetch here is simulated from dated fixtures; the adapters are real code.</Note>

      <div className="card">
        <h2>Brands and weekly refresh</h2>
        <table>
          <thead><tr><th>Brand</th><th>Adapter</th><th>Authorisation</th><th>Terms</th><th>Products</th><th /></tr></thead>
          <tbody>
            {d.brands.map((b) => {
              const ok = !!b.authorisation && b.authorisation.expiresOn >= today;
              return (
                <tr key={b.id}>
                  <td><b>{b.name}</b><div className="small muted">{b.url}</div></td>
                  <td><span className="badge note">{b.platform}</span></td>
                  <td>{ok ? <span className="badge good">current until {b.authorisation!.expiresOn}</span> : <span className="badge bad">{b.authorisation ? "expired " + b.authorisation.expiresOn : "none"}</span>}</td>
                  <td className="small">{b.terms}</td>
                  <td>{d.products.filter((p) => p.brandId === b.id).length}</td>
                  <td><button className="btn sm" onClick={() => refresh(b.id)}>Run refresh</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lastRun.length > 0 && <pre style={{ marginTop: 10 }}>{lastRun.join("\n")}</pre>}
        <Note>
          Refresh rules: unchanged → only last-checked date moves. Changed price or availability → a pending diff in <b>Approvals</b>; the old approved value stays live. Dead page → product auto-suspended. Not refreshed for 30 days → hidden. Try &ldquo;Run refresh&rdquo; on Nimbus Kids (dead page + availability change) and Tinker &amp; Co (price change). Banyan Books has an expired authorisation, so nothing is fetched.
        </Note>
      </div>

      <div className="card">
        <h2>Scrape one product URL</h2>
        <div className="row">
          <input type="url" list="samples" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 280 }} />
          <datalist id="samples">{SAMPLE_URLS.map((u) => <option key={u} value={u} />)}</datalist>
          <button className="btn primary" onClick={run}>Scrape</button>
        </div>
        <p className="small muted">Sample URLs are in the drop-down. Try an unknown host, <code>http://localhost/admin</code>, or the Banyan Books URL to see refusals.</p>
        {out && (
          <>
            <ol className="steps">
              {out.steps.map((s, i) => <li key={i}><span className={s.ok ? "ok" : "no"}>{s.ok ? "✓" : "✗"}</span> <b>{s.label}</b> <span className="muted small">{s.detail}</span></li>)}
            </ol>
            {out.parsed && (
              <table style={{ maxWidth: 640 }}>
                <thead><tr><th>Field</th><th>Value</th><th>Class</th></tr></thead>
                <tbody>
                  {(Object.keys(out.parsed) as (keyof typeof out.parsed)[]).map((k) => (
                    <tr key={k}><td>{k}</td><td className="small">{String(out.parsed![k])}</td><td><span className={"badge " + (out.fixture!.required.includes(k) ? "good" : "")}>{out.fixture!.required.includes(k) ? "required" : "best effort"}</span></td></tr>
                  ))}
                  <tr><td>material, pieces, age band</td><td className="small muted">not scraped</td><td><span className="badge warn">curator sets</span></td></tr>
                </tbody>
              </table>
            )}
            {out.ageHint && <p className="small">💡 {out.ageHint}</p>}
            {out.ok && out.existing && <p className="small">Already in the catalogue as <b>{out.existing.name}</b>. A refresh would compare it and raise diffs.</p>}
            {out.ok && !out.existing && <button className="btn primary" onClick={add}>Add to catalogue as Discovered</button>}
          </>
        )}
      </div>

      <div className="card">
        <h2>Fixtures and regression tests (the B4 &ldquo;Defect&rdquo; check)</h2>
        <Note>In the real repo: <code>fixtures/&lt;site&gt;/&lt;date&gt;/page.html + expected.json</code>, run in CI. A diff on an unchanged fixture fails the build. A live site changing its markup (drift) raises an alert but is not a Defect.</Note>
        <div className="row" style={{ margin: "8px 0" }}>
          <button className="btn primary" onClick={() => setReg(regression(d.ops.breakAdapter))}>Run regression suite</button>
          <label className="row small"><input type="checkbox" checked={d.ops.breakAdapter} onChange={(e) => update((x) => void (x.ops.breakAdapter = e.target.checked))} /> Simulate an adapter bug (misreads prices and currency)</label>
          {reg && <span className={"badge " + (reg.every((r) => r.ok) ? "good" : "bad")}>{reg.filter((r) => r.ok).length}/{reg.length} passing</span>}
        </div>
        <table>
          <thead><tr><th>Fixture</th><th>Adapter</th><th>Captured</th><th>Required fields</th><th>Result</th></tr></thead>
          <tbody>
            {FIXTURES.map((f) => {
              const r = reg?.find((x) => x.fixture.id === f.id);
              return (
                <tr key={f.id}>
                  <td className="small"><b>{f.id}</b><div className="muted">{f.url}</div></td>
                  <td><span className="badge note">{f.platform}</span></td>
                  <td className="small">{f.capturedOn}</td>
                  <td className="small">{f.required.join(", ")}</td>
                  <td className="small">
                    {!r ? <span className="muted">not run</span> : r.ok ? <span className="badge good">pass</span> : <><span className="badge bad">FAIL (Defect)</span>{r.bad.map((b) => <div key={b.field}>{b.field}: expected {String(b.expected)}, got {String(b.actual)}</div>)}{r.error && <div>{r.error}</div>}</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
