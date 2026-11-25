"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { ProductCard, Note } from "@/components/bits";
import { visibility } from "@/lib/gate";

export default function SavedPage() {
  const { d, setLoginOpen, update } = useApp();
  if (!d.user)
    return (
      <div className="narrow empty">
        <h1>Saved items</h1>
        <p>Guests can chat and browse. Saving items needs a Google sign-in.</p>
        <button className="btn primary" onClick={() => setLoginOpen(true)}>Sign in with Google</button>
      </div>
    );
  const items = d.saved.map((id) => d.products.find((p) => p.id === id)).filter(Boolean);
  return (
    <div className="wrap">
      <h1>Saved items</h1>
      <Note>Table <code>saved_item(user_id, product_id)</code>. Deleted with the account.</Note>
      {!items.length && <p className="muted">Nothing saved yet. Tap the heart on a card in the <Link href="/">chat</Link>.</p>}
      <div className="cards">
        {items.map((p, i) => {
          const v = visibility(d, p!);
          return v.visible ? (
            <ProductCard key={p!.id} p={p!} pos={i + 1} />
          ) : (
            <div key={p!.id} className="pcard">
              <div className="body">
                <b>{p!.name}</b>
                <span className="badge warn">No longer available</span>
                <p className="small muted">This product was unpublished or its evidence expired, so it is hidden from parents.</p>
                <button className="btn sm" onClick={() => update((x) => void (x.saved = x.saved.filter((s) => s !== p!.id)))}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
