"use client";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { chatMetrics } from "@/lib/admin";
import { inr } from "@/lib/types";

export default function Events() {
  const { d, update } = useApp();
  const byProduct: Record<string, number> = {};
  const byPos: Record<number, number> = {};
  d.events.forEach((e) => {
    byProduct[e.productId] = (byProduct[e.productId] ?? 0) + 1;
    byPos[e.position] = (byPos[e.position] ?? 0) + 1;
  });
  const name = (id: string) => d.products.find((p) => p.id === id)?.name ?? id;
  const m = chatMetrics(d);
  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Redirect events</h1>
        <span className="badge">{d.events.length} events</span>
        <span className="spacer" />
        {d.events.length > 0 && <button className="btn sm danger" onClick={() => update((x) => void (x.events = []))}>Clear</button>}
      </div>
      <Note>
        B2 &ldquo;redirect event&rdquo;. This is the only analytics in V1: our own table, coded slot values, no raw chat, no child profile text, no third-party analytics provider. Clicks are the revenue signal; sales are whatever brands report back (CSV import).
      </Note>
      <div className="card">
        <h3>The three numbers to watch</h3>
        <div className="grid g3">
          <div><div className="muted small">Chats ending in a brand click</div><b>{m.chats ? `${Math.round(m.clickShare * 100)}%` : "–"}</b> <span className="small muted">({m.chatsWithClick} of {m.chats} chats)</span></div>
          <div><div className="muted small">Clicks per chat</div><b>{m.chats ? m.clicksPerChat.toFixed(2) : "–"}</b></div>
          <div><div className="muted small">Sales reported by brands</div><b>{m.sales}</b> <span className="small muted">({inr(m.salesRs)})</span></div>
        </div>
        <Note>A chat is one conversation (New chat starts another); only counts are kept, never text. Sales come from brands&apos; own reports, imported in Admin → CSV. We do not track purchases on brand sites.</Note>
        {Object.keys(m.perProduct).length > 0 && (
          <table className="small" style={{ marginTop: 8 }}>
            <thead><tr><th>Product</th><th>Clicks</th><th>Reported sales</th><th>Value</th></tr></thead>
            <tbody>{Object.entries(m.perProduct).sort((a, b) => b[1].clicks - a[1].clicks).map(([id, r]) => <tr key={id}><td>{name(id)}</td><td>{r.clicks}</td><td>{r.sales}</td><td>{r.salesRs ? inr(r.salesRs) : ""}</td></tr>)}</tbody>
          </table>
        )}
      </div>
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
