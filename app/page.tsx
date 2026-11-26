"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { ProductCard, Note } from "@/components/bits";
import Inspector from "@/components/Inspector";
import { Act, Pill, PillGroup, profilePills } from "@/lib/chat";
import { bandLabel } from "@/lib/types";

export default function ChatPage() {
  const { d, chat, send, thinking, act, newChat } = useApp();
  const [text, setText] = useState("");
  const [sentText, setSentText] = useState(""); // shown while the real model reads it
  const end = useRef<HTMLDivElement>(null);
  const cap = d.user ? d.ops.userCap : d.ops.guestCap;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.msgs.length, thinking]);
  const last = chat.msgs[chat.msgs.length - 1];
  // Multi-select state for the latest message's pill groups: group key -> picked pill indexes.
  // Picks are tied to the message they were made on, so a new message never reads stale indexes.
  const [picks, setPicks] = useState<{ msg?: number; by: Record<string, number[]> }>({ by: {} });
  const sel = picks.msg === last?.id ? picks.by : {};
  const setSel = (by: Record<string, number[]>) => setPicks({ msg: last?.id, by });
  const picked: Act[] = (last?.groups ?? []).flatMap((g) => (sel[g.key] ?? []).flatMap((i) => (g.pills[i] ? [g.pills[i].act] : [])));
  const toggle = (g: PillGroup, i: number) => {
    const now = sel[g.key] ?? [];
    let next: number[];
    if (now.includes(i)) next = now.filter((x) => x !== i);
    else if (g.mode === "one") next = [i];
    else next = [...now, i].slice(-(g.max ?? 99));
    setSel({ ...sel, [g.key]: next });
  };
  const apply = () => {
    if (!picked.length) return;
    act(picked.length === 1 ? picked[0] : { t: "multi", acts: picked });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (thinking) return;
    if (!text.trim()) return apply();
    setSentText(text.trim());
    send(text, picked.length ? picked : undefined);
    setText("");
  };
  const renderGroups = (groups: PillGroup[] | undefined, live: boolean) =>
    groups?.length ? (
      <div className="pgroups">
        {groups.map((g) => (
          <div key={g.key} className="pgroup">
            <span className="pgroup-label">
              {g.label}
              {g.mode === "many" ? ` (up to ${g.max ?? "any"})` : ""}
            </span>
            {g.pills.map((p, i) => {
              const on = live && (sel[g.key] ?? []).includes(i);
              return (
                <button key={i} className={"pill" + (on ? " on" : "")} disabled={!live} aria-pressed={on} onClick={() => toggle(g, i)}>
                  {p.label}
                </button>
              );
            })}
          </div>
        ))}
        {live && (
          <div className="apply-row">
            <button className="btn primary sm" disabled={!picked.length} onClick={apply}>
              {picked.length ? `Show ideas (${picked.length} picked)` : "Pick options above"}
            </button>
            {picked.length > 0 && (
              <>
                <button className="btn sm" onClick={() => setSel({})}>
                  Clear
                </button>
                <span className="small muted">You can also type below; your picks are sent with your message.</span>
              </>
            )}
          </div>
        )}
      </div>
    ) : null;
  const renderPills = (pills: Pill[] | undefined, live: boolean) =>
    pills?.length ? (
      <div className="pills">
        {pills.map((p, i) => (
          <button key={i} className={"pill" + (p.kind ? " " + p.kind : "")} disabled={!live} style={!live ? { opacity: 0.5, cursor: "default" } : undefined} onClick={() => act(p.act)}>
            {p.kind === "try" ? "Try: " : ""}
            {p.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="wrap">
      <div className={"chat-layout" + (d.ops.inspector ? "" : " no-insp")}>
        <div className="chat-box">
          <div className="row" style={{ marginBottom: 8 }}>
            <h1 style={{ margin: 0 }}>Find something for a child</h1>
            <span className="spacer" />
            <span className="counter">
              {chat.typed}/{cap} messages{d.user ? "" : " (guest)"}
            </span>
            <button className="btn sm" onClick={newChat}>
              New chat
            </button>
          </div>
          <Note>
            Parent lane, every turn: guards → rules parser or tap → (model only if needed) → SQL filters + ranking → templated reply. Open the <b>Inspector</b> to follow each step.
          </Note>
          {d.children.length > 0 && !chat.slots.age && (
            <div className="card small" style={{ marginBottom: 8 }}>
              {d.children.length === 1 ? "Child profile found" : `${d.children.length} child profiles found`}. A profile only pre-fills the search; it is never used for ads or tracking.{" "}
              {profilePills(d).map((p, i) => (
                <button key={i} className="btn sm" style={{ marginLeft: 4 }} onClick={() => act(p.act)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <div className="msgs">
            {chat.msgs.map((m) => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div className={"bubble " + m.role}>{m.text}</div>
                {m.cards && (
                  <div className="cards" style={{ width: "100%" }}>
                    {m.cards.map((id, i) => {
                      const p = d.products.find((x) => x.id === id);
                      return p ? <ProductCard key={id} p={p} pos={i + 1} info={m.cardInfo?.[id]} /> : null;
                    })}
                  </div>
                )}
                {renderGroups(m.groups, m === last)}
                {renderPills(m.pills, m === last)}
              </div>
            ))}
            {thinking && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div className="bubble user">{sentText}</div>
                </div>
                <div className="bubble bot muted" aria-live="polite">Thinking…</div>
              </>
            )}
            <div ref={end} />
          </div>
          <form className="composer" onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={last?.hint ?? "e.g. a birthday gift for my 6 year old who likes space, under 1500"} maxLength={400} aria-label="Message" disabled={thinking} />
            <button className="btn primary" type="submit" disabled={thinking}>
              {picked.length && !text.trim() ? "Apply" : "Send"}
            </button>
          </form>
        </div>
        {d.ops.inspector && <Inspector />}
      </div>
    </div>
  );
}
