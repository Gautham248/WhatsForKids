"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { visibility } from "@/lib/gate";
import { RedirectEvent } from "@/lib/types";

// Stands in for the real redirect endpoint: log a coded event, then forward to the brand.
export default function OutPage() {
  const { id } = useParams<{ id: string }>();
  const { d, update, chat, sessionId, chatId } = useApp();
  const [ev, setEv] = useState<RedirectEvent | null>(null);
  const done = useRef(false);
  const p = d.products.find((x) => x.id === id);
  const route = d.routes[id];
  const vis = p ? visibility(d, p) : { visible: false, reasons: ["unknown product"] };

  useEffect(() => {
    if (done.current || !p || !vis.visible || !route || route.status !== "active" || sessionId === "s_pending") return;
    done.current = true;
    const pos = Number(new URLSearchParams(window.location.search).get("pos") ?? "1") || 1;
    const e: RedirectEvent = { id: "ev_" + Math.random().toString(36).slice(2, 9), at: new Date().toISOString(), productId: p.id, routeKind: route.kind, position: pos, sessionId, chatId, source: "chat", slots: chat.slots };
    update((x) => void x.events.unshift(e));
    setEv(e);
  }, [p, vis.visible, route, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p || !vis.visible || !route || route.status !== "active")
    return (
      <div className="narrow empty">
        <h1>Link not available</h1>
        <p>No active purchase route for this product, so no redirect is made and no event is logged.</p>
        <Link href="/">Back to chat</Link>
      </div>
    );
  const brand = d.brands.find((b) => b.id === p.brandId)!;
  const dest = ev ? `${route.url}${route.url.includes("?") ? "&" : "?"}e=${ev.id}` : route.url;
  return (
    <div className="narrow">
      <div className="card">
        <h1>Taking you to {brand.name}…</h1>
        <p className="muted">In the real build this is a 302 redirect and parents never see this page. It is shown here so you can see what gets recorded.</p>
        <h3>Redirect event recorded</h3>
        <pre>{ev ? JSON.stringify(ev, null, 2) : "…"}</pre>
        <p className="small muted" style={{ marginTop: 8 }}>
          Stored: product, route type, card position, session ID, and the coded slot object. <b>Not stored:</b> raw chat text, child profile text, name or email.
        </p>
        <h3 style={{ marginTop: 12 }}>Destination (built on the server, never from the browser)</h3>
        <pre>{dest}</pre>
        <div className="disclosure" style={{ margin: "10px 0" }}>{route.disclosure}</div>
        <div className="row">
          <a className="btn primary" href={dest} target="_blank" rel="noreferrer" onClick={(e) => e.preventDefault()} title="Dummy brand sites do not exist">
            Continue to {brand.name} (dummy link, disabled)
          </a>
          <Link href={`/p/${p.id}`} className="btn">
            Back to product
          </Link>
          <Link href="/admin/events" className="btn">
            See all events in Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
