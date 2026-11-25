"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { describeSlots } from "@/lib/parser";

export default function HistoryPage() {
  const { d, setLoginOpen, newChat, act, update } = useApp();
  const router = useRouter();
  if (!d.user)
    return (
      <div className="narrow empty">
        <h1>Search history</h1>
        <p>History is kept for signed-in parents only.</p>
        <button className="btn primary" onClick={() => setLoginOpen(true)}>Sign in with Google</button>
      </div>
    );
  return (
    <div className="narrow">
      <div className="row">
        <h1 style={{ margin: 0 }}>Search history</h1>
        <span className="spacer" />
        {d.history.length > 0 && <button className="btn sm danger" onClick={() => update((x) => void (x.history = []))}>Clear history</button>}
      </div>
      <Note>
        Table <code>history_entry(user_id, at, slots, product_ids)</code>. It stores <b>coded slots and product IDs, never the raw chat</b>, so re-running a search never needs the model. It is not linked to the child profile.
      </Note>
      {!d.history.length && <p className="muted">No history yet. Run a search in the chat while signed in.</p>}
      {d.history.map((h) => (
        <div key={h.id} className="card">
          <div className="row">
            <b>{describeSlots(h.slots) || "Search"}</b>
            <span className="spacer" />
            <span className="muted small">{new Date(h.at).toLocaleString()}</span>
          </div>
          <div className="small muted">{h.productIds.map((id) => d.products.find((p) => p.id === id)?.name).filter(Boolean).join(" · ")}</div>
          <pre style={{ margin: "6px 0" }}>{JSON.stringify(h.slots)}</pre>
          <button
            className="btn sm"
            onClick={() => {
              newChat();
              act({ t: "load", slots: h.slots });
              router.push("/");
            }}
          >
            Re-run this search
          </button>
        </div>
      ))}
    </div>
  );
}
