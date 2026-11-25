"use client";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { approveDiff } from "@/lib/scraper";

export default function Diffs() {
  const { d, update, toast } = useApp();
  const pending = d.diffs.filter((x) => x.status === "pending");
  const done = d.diffs.filter((x) => x.status !== "pending");
  const name = (id: string) => d.products.find((p) => p.id === id)?.name ?? id;
  const decide = (id: string, ok: boolean) => {
    update((x) => approveDiff(x, id, ok));
    toast(ok ? "Approved: now live" : "Rejected");
  };
  return (
    <>
      <h1>Change approvals</h1>
      <Note>B4: changed values are flagged for admin approval <b>before publication</b>. Until approved, the product page keeps showing the old approved value and date.</Note>
      {!pending.length && <p className="muted">Nothing waiting. Run a refresh on the <a href="/admin/scraper">Scraper</a> page (try Tinker &amp; Co or Nimbus Kids).</p>}
      {pending.length > 0 && (
        <div className="card">
          <div className="row">
            <b>{pending.length} pending</b>
            <span className="spacer" />
            <button className="btn sm primary" onClick={() => { update((x) => x.diffs.filter((q) => q.status === "pending").forEach((q) => approveDiff(x, q.id, true))); toast("All approved"); }}>Approve all</button>
          </div>
          <table>
            <thead><tr><th>Product</th><th>Field</th><th>Approved value (live now)</th><th>New value from brand site</th><th>Seen</th><th /></tr></thead>
            <tbody>
              {pending.map((x) => (
                <tr key={x.id}>
                  <td><b>{name(x.productId)}</b></td>
                  <td>{x.field}</td>
                  <td>{x.field === "price" ? `₹${x.oldValue}` : x.oldValue}</td>
                  <td><b>{x.field === "price" ? `₹${x.newValue}` : x.newValue}</b></td>
                  <td className="small">{x.at}</td>
                  <td><div className="row"><button className="btn sm primary" onClick={() => decide(x.id, true)}>Approve</button><button className="btn sm" onClick={() => decide(x.id, false)}>Reject</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {done.length > 0 && (
        <div className="card">
          <h2>Decided</h2>
          <table>
            <tbody>
              {done.map((x) => <tr key={x.id}><td>{name(x.productId)}</td><td>{x.field}</td><td className="small">{x.oldValue} → {x.newValue}</td><td><span className={"badge " + (x.status === "approved" ? "good" : "bad")}>{x.status}</span></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
