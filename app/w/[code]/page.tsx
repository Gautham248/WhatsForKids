"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { visibility } from "@/lib/gate";
import { ageText, inr } from "@/lib/types";
import { decodeWishlist } from "@/lib/wishlist";

// Public wishlist page. Anyone with the link can open it; it shows only products that are live right now.
export default function WishlistPage() {
  const { code } = useParams<{ code: string }>();
  const { d } = useApp();
  const live = d.products.filter((p) => visibility(d, p).visible);
  const list = decodeWishlist(decodeURIComponent(code ?? ""), live.map((p) => p.id));
  // "Bought" marks live in this browser only in the demo.
  const KEY = `wfk-bought-${code}`;
  const [bought, setBought] = useState<string[]>([]);
  useEffect(() => {
    try {
      setBought(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {}
  }, [KEY]);
  const toggle = (id: string) => {
    const next = bought.includes(id) ? bought.filter((x) => x !== id) : [...bought, id];
    setBought(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  if (!list)
    return (
      <div className="narrow empty">
        <h1>List not found</h1>
        <p>This wishlist link is incomplete or broken. Ask for the link again.</p>
        <Link href="/" className="btn">Find something for a child</Link>
      </div>
    );
  const items = list.productIds.map((id) => d.products.find((p) => p.id === id)!);
  return (
    <div className="narrow">
      <h1>{list.title}</h1>
      <p className="muted">Someone shared this list with you. Each item is bought on the brand&apos;s own site.</p>
      {list.dropped > 0 && <p className="small muted">{list.dropped} item{list.dropped === 1 ? " is" : "s are"} no longer available and {list.dropped === 1 ? "was" : "were"} left out.</p>}
      {!items.length && <p>Nothing on this list is available right now.</p>}
      {items.map((p, i) => {
        const brand = d.brands.find((b) => b.id === p.brandId);
        const done = bought.includes(p.id);
        return (
          <div key={p.id} className="card row" style={{ gap: 12, opacity: done ? 0.6 : 1, flexWrap: "wrap" }}>
            <span style={{ fontSize: 32, background: p.color, borderRadius: 8, padding: "4px 10px" }} aria-hidden>{p.emoji}</span>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <b>{p.name}</b>
              <div className="small muted">{brand?.name} · {ageText(p.ageMin, p.ageMax)} · {inr(p.price)} as researched</div>
              {p.personalisation && <div className="small"><span className="badge">Can be personalised</span> {p.personalisation}</div>}
            </div>
            <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={done} onChange={() => toggle(p.id)} /> Bought</label>
            <Link className="btn primary sm" href={`/out/${p.id}?pos=${i + 1}&src=wishlist`}>View at {brand?.name ?? "brand"}</Link>
          </div>
        );
      })}
      <Note>Demo: the link carries only product ids. &ldquo;Bought&rdquo; is remembered in this browser only; the real build stores it with the list so every relative sees it.</Note>
    </div>
  );
}
