"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { Product, ageText, inr } from "@/lib/types";
import { CardInfo } from "@/lib/chat";

/** Designer/engineer callout: shows where a piece of UI gets its data. Toggle with "Annotations". */
export function Note({ children }: { children: React.ReactNode }) {
  const { d } = useApp();
  if (!d.ops.annotate) return null;
  return <div className="note">ⓘ {children}</div>;
}

export function ProductCard({ p, pos, info }: { p: Product; pos: number; info?: CardInfo }) {
  const { d, update, requireLogin, toast } = useApp();
  const brand = d.brands.find((b) => b.id === p.brandId)!;
  const saved = d.saved.includes(p.id);
  const toggle = () =>
    requireLogin(() => {
      update((x) => {
        x.saved = x.saved.includes(p.id) ? x.saved.filter((i) => i !== p.id) : [p.id, ...x.saved];
      });
      toast(saved ? "Removed from saved" : "Saved");
    });
  return (
    <div className="pcard">
      <div className="art" style={{ background: p.color }}>
        <span aria-hidden>{p.emoji}</span>
        <button className="heart" onClick={toggle} aria-label={saved ? "Unsave" : "Save"} title={saved ? "Remove from saved" : "Save (needs sign-in)"}>
          {saved ? "♥" : "♡"}
        </button>
      </div>
      <div className="body">
        {info?.sponsored && <span className="badge warn" title="A brand paid for this position. It still had to pass every check and match your search.">Sponsored</span>}
        <Link href={`/p/${p.id}?pos=${pos}`} className="title">
          {p.name}
        </Link>
        <div className="muted small">
          {brand.name} · {ageText(p.ageMin, p.ageMax)}
        </div>
        <div>
          <b>{inr(p.price)}</b> <span className="muted small">as researched</span>
        </div>
        {p.personalisation && <div><span className="badge" title={p.personalisation}>Can be personalised</span></div>}
        {info?.reason && <div className="reason">{info.reason}</div>}
        {info?.note && <div className="evid">Evidence on file: {info.note}</div>}
        {info?.tag && !info.note && (
          <Note>
            Reason line tag: <b>{info.tag}</b> (chosen from approved reason_line rows for this query)
          </Note>
        )}
      </div>
    </div>
  );
}

export const statusBadge = (s: string) => (s === "published" ? "good" : s === "suspended" ? "bad" : "");
