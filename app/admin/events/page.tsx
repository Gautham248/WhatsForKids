"use client";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";

export default function Events() {
  const { d, update } = useApp();
  const byProduct: Record<string, number> = {};
  const byPos: Record<number, number> = {};
  d.events.forEach((e) => {
    byProduct[e.productId] = (byProduct[e.productId] ?? 0) + 1;
    byPos[e.position] = (byPos[e.position] ?? 0) + 1;
  });
  const name = (id: string) => d.products.find((p) => p.id === id)?.name ?? id;
  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Redirect events</h1>
        <span className="badge">{d.events.length} events</span>
        <span className="spacer" />
        {d.events.length > 0 && <button className="btn sm danger" onClick={() => update((x) => void (x.events = []))}>Clear</button>}
      </div>
      <Note>
        B2 &ldquo;redirect event&rdquo;. This is the only analytics in V1: our own table, coded slot values, no raw chat, no child profile text, no third-party analytics provider. Clicks are the revenue signal; order reporting depends on each brand&apos;s deal (sale tracking is a priced change).
      </Note>
      {!d.events.length && <p className="muted">No events yet. Open a product and press &ldquo;View at …&rdquo;.</p>}
      {d.events.length > 0 && (
        <>
          <div className="grid g2">
            <div className="card">
              <h3>Clicks by product</h3>
              <table><tbody>{Object.entries(byProduct).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{name(k)}</td><td><b>{v}</b></td></tr>)}</tbody></table>
            </div>
            <div className="card">
              <h3>Clicks by card position</h3>
              <table><tbody>{Object.entries(byPos).map(([k, v]) => <tr key={k}><td>Position {k}</td><td><b>{v}</b></td></tr>)}</tbody></table>
            </div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>When</th><th>Product</th><th>Route</th><th>Pos</th><th>Session</th><th>Coded slots</th></tr></thead>
              <tbody>
                {d.events.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{new Date(e.at).toLocaleString()}</td>
                    <td>{name(e.productId)}</td>
                    <td><span className="badge">{e.routeKind}</span></td>
                    <td>{e.position}</td>
                    <td className="small">{e.sessionId}</td>
                    <td><code>{JSON.stringify(e.slots)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
