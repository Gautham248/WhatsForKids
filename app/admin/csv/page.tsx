"use client";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { todayOf } from "@/lib/gate";
import { Note } from "@/components/bits";
import { parseCsv, parseSalesCsv, SALES_HEADER, toCsv } from "@/lib/csv";
import { addProductFromFixture, scrapeUrl, SAMPLE_URLS } from "@/lib/scraper";

const BATCH_LIMIT = 100;
const RECORD_LIMIT = 500;

interface Row { url: string; result: string; ok: boolean }

export default function CsvPage() {
  const { d, update, toast } = useApp();
  const [urls, setUrls] = useState(["product_url", SAMPLE_URLS[2], SAMPLE_URLS[5], SAMPLE_URLS[7], SAMPLE_URLS[0], "https://banyanbooks.example/box/picture-book-box", "https://unknown-shop.example/toy/1", "not a url"].join("\n"));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [batchErr, setBatchErr] = useState("");
  const [rec, setRec] = useState("");
  const [salesText, setSalesText] = useState("");
  const [salesOut, setSalesOut] = useState<string[]>([]);
  const [recOut, setRecOut] = useState<string[]>([]);

  const runBatch = () => {
    const list = urls.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s !== "product_url");
    if (list.length > BATCH_LIMIT) return setBatchErr(`Batch rejected: ${list.length} URLs, limit is ${BATCH_LIMIT}.`);
    setBatchErr("");
    const out: Row[] = [];
    update((x) => {
      for (const u of list) {
        const o = scrapeUrl(x, u);
        if (!o.ok) out.push({ url: u, ok: false, result: "Refused: " + (o.reason ?? o.steps.find((s) => !s.ok)?.detail ?? "error") });
        else if (o.existing) out.push({ url: u, ok: true, result: `Already in catalogue (${o.existing.name})` });
        else {
          const p = addProductFromFixture(x, o);
          out.push({ url: u, ok: !!p, result: p ? `Created “${p.name}” as Discovered` : "Not created" });
        }
      }
    });
    setRows(out);
  };

  const exportCsv = () => {
    const head = ["id", "name", "brand", "price_inr", "age_min_months", "age_max_months", "category", "status", "source_url"];
    const body = d.products.map((p) => [p.id, p.name, d.brands.find((b) => b.id === p.brandId)?.name ?? "", p.price, p.ageMin, p.ageMax, p.category, p.status, p.sourceUrl]);
    const blob = new Blob([toCsv([head, ...body])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "whats-for-kids-products.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Exported products CSV");
  };
  const importRecords = (text: string) => {
    const t = parseCsv(text);
    if (t.length < 2) return setRecOut(["Nothing to import."]);
    if (t.length - 1 > RECORD_LIMIT) return setRecOut([`Rejected: ${t.length - 1} rows, limit is ${RECORD_LIMIT}.`]);
    const h = t[0].map((s) => s.trim());
    const col = (r: string[], k: string) => r[h.indexOf(k)];
    const log: string[] = [];
    update((x) => {
      t.slice(1).forEach((r, i) => {
        const p = x.products.find((q) => q.id === col(r, "id"));
        if (!p) return void log.push(`Row ${i + 2}: unknown id "${col(r, "id")}": skipped`);
        const price = Number(col(r, "price_inr"));
        const a = Number(col(r, "age_min_months"));
        const b = Number(col(r, "age_max_months"));
        if (!(price > 0) || !(b > a)) return void log.push(`Row ${i + 2} (${p.id}): invalid price or age range: skipped`);
        const changed: string[] = [];
        if (col(r, "name") && col(r, "name") !== p.name) { p.name = col(r, "name"); changed.push("name"); }
        if (price !== p.price) { p.price = price; p.priceAsOf = new Date().toISOString().slice(0, 10); changed.push("price"); }
        if (a !== p.ageMin || b !== p.ageMax) { p.ageMin = a; p.ageMax = b; changed.push("age"); }
        log.push(`Row ${i + 2} (${p.id}): ${changed.length ? "updated " + changed.join(", ") : "no change"}`);
      });
      x.ops.catalogueVersion++;
    });
    setRecOut(log);
  };

  return (
    <>
      <h1>CSV import and export</h1>
      <div className="card">
        <h2>1. Scrape from a CSV of product URLs</h2>
        <Note>B4: product fields can come from a product URL or a CSV of product URLs. Batch limit proposed at {BATCH_LIMIT}. Each URL goes through the same authorisation, robots, rate-limit and adapter steps.</Note>
        <textarea style={{ minHeight: 170, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} value={urls} onChange={(e) => setUrls(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={runBatch}>Run batch</button>
          <span className="small muted">Includes a header row, an expired-authorisation brand, an unknown host and a bad URL on purpose.</span>
        </div>
        {batchErr && <p style={{ color: "var(--bad)" }}>{batchErr}</p>}
        {rows && (
          <table style={{ marginTop: 8 }}>
            <tbody>{rows.map((r, i) => <tr key={i}><td className="small">{r.url}</td><td className="small"><span className={r.ok ? "ok" : "no"}>{r.ok ? "✓" : "✗"}</span> {r.result}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>2. Export and import records</h2>
        <Note>B2: CSV import and export. Export includes the product ID so a round trip works. Cells that start with <code>= + - @</code> are prefixed so spreadsheets cannot run them as formulas. Import limit proposed at {RECORD_LIMIT} rows.</Note>
        <div className="row">
          <button className="btn primary" onClick={exportCsv}>Download products CSV</button>
          <span className="small muted">Edit prices or ages in a spreadsheet, then paste or upload below.</span>
        </div>
        <div className="row" style={{ margin: "10px 0" }}>
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setRec(t); importRecords(t); } }} />
          <button className="btn sm" onClick={() => setRec(toCsv([["id", "name", "price_inr", "age_min_months", "age_max_months"], ["p-kite", "Rainbow kite", 449, 72, 180], ["p-nope", "Unknown", 100, 1, 2], ["p-clay-kit", "Air-dry clay studio kit", -5, 72, 144]]))}>Fill a sample</button>
        </div>
        <textarea style={{ minHeight: 100, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} value={rec} onChange={(e) => setRec(e.target.value)} placeholder="id,name,price_inr,age_min_months,age_max_months" />
        <button className="btn" style={{ marginTop: 8 }} onClick={() => importRecords(rec)} disabled={!rec.trim()}>Import records</button>
        {recOut.length > 0 && <pre style={{ marginTop: 8 }}>{recOut.join("\n")}</pre>}
      </div>

      <div className="card">
        <h2>3. Brand sales report</h2>
        <Note>Brands send what sold through our links; we import it so Admin → Events can show sales next to clicks. Every bad row is rejected with its line number; a repeated order ref is skipped.</Note>
        <div className="row" style={{ margin: "10px 0" }}>
          <button className="btn sm" onClick={() => setSalesText(toCsv([SALES_HEADER, [todayOf(d), "b-tinker", "p-gear-set", "TK-1001", 1299], [todayOf(d), "b-oak", "p-rainbow-stacker", "OK-2002", 1499], [todayOf(d), "b-oak", "p-gear-set", "OK-2003", 1299], [todayOf(d), "b-kiki", "p-rocket-kit", "KK-3004", 0]]))}>Fill a sample</button>
        </div>
        <textarea style={{ minHeight: 100, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} value={salesText} onChange={(e) => setSalesText(e.target.value)} placeholder={SALES_HEADER.join(",")} />
        <button className="btn" style={{ marginTop: 8 }} disabled={!salesText.trim()} onClick={() => {
          const { rows: ok, errors } = parseSalesCsv(salesText, d);
          if (ok.length) update((x) => void (x.sales = [...(x.sales ?? []), ...ok]));
          setSalesOut([`Imported ${ok.length} sale${ok.length === 1 ? "" : "s"}.`, ...errors.map((e) => `Line ${e.line}: ${e.msg}`)]);
        }}>Import sales</button>
        {salesOut.length > 0 && <pre style={{ marginTop: 8 }}>{salesOut.join("\n")}</pre>}
      </div>
    </>
  );
}
