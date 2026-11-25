"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { ProductCard, Note } from "@/components/bits";
import { visibility } from "@/lib/gate";
import { useState } from "react";
import { WISHLIST_TITLES, encodeWishlist } from "@/lib/wishlist";

export default function SavedPage() {
  const { d, setLoginOpen, update, toast } = useApp();
  const [title, setTitle] = useState(0);
  const [link, setLink] = useState("");
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
      {items.length > 0 && (
        <div className="card">
          <h2>Share as a wishlist</h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select value={title} onChange={(e) => { setTitle(Number(e.target.value)); setLink(""); }} aria-label="List title">
              {WISHLIST_TITLES.map((t, i) => <option key={t} value={i}>{t}</option>)}
            </select>
            <button className="btn primary sm" onClick={() => setLink(`${window.location.origin}/w/${encodeWishlist(title, d.saved)}`)}>Create share link</button>
            {link && (
              <>
                <input type="text" readOnly value={link} style={{ flex: "1 1 260px", minWidth: 0 }} onFocus={(e) => e.target.select()} aria-label="Share link" />
                <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch { toast("Select the link and copy it"); } }}>Copy</button>
              </>
            )}
          </div>
          <Note>Family open the link and buy straight from the brand. The link holds only a preset title and product ids: no name, no child details, no account. The real build keeps the list on the server so &ldquo;bought&rdquo; is shared between relatives.</Note>
        </div>
      )}
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
