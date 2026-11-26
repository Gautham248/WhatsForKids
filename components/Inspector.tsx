"use client";
import { useApp } from "@/lib/store";
import { slotKey } from "@/lib/parser";

export default function Inspector() {
  const { d, chat } = useApp();
  const i = chat.info;
  const cap = d.user ? d.ops.userCap : d.ops.guestCap;
  const name = (id: string) => d.products.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="card insp">
      <h3>Pipeline inspector</h3>
      <p className="muted small">What the system did on the last turn. This panel is demo-only; it is the &ldquo;how it works&rdquo; view for designers and engineers.</p>
      {!i && <p className="small">Send a message or tap an option to see the pipeline.</p>}
      {i && (
        <>
          <div className="kv">
            <span className="k">Path</span>
            <span>
              <span className={"path " + i.path}>{i.path === "pill" ? "PILL (no parse)" : i.path === "text-rules" ? "RULES (free)" : i.path === "text-llm" ? "MODEL (simulated)" : "GUARD"}</span>
            </span>
            <span className="k">Why</span>
            <span>{i.why}</span>
            {i.input && (
              <>
                <span className="k">Raw input</span>
                <span>
                  “{i.input}” <span className="muted">(memory only, never stored)</span>
                </span>
              </>
            )}
            {i.picked && (
              <>
                <span className="k">Pills picked</span>
                <span>{i.picked.join(", ")}</span>
              </>
            )}
            {i.intent && (
              <>
                <span className="k">Intent</span>
                <span>{i.intent}</span>
              </>
            )}
          </div>
          {i.parsed && (
            <>
              <b className="small">Parsed from this message (coded values)</b>
              <pre>{JSON.stringify(i.parsed)}</pre>
            </>
          )}
          {i.parse && (
            <div className="kv">
              {Object.keys(i.parse.confidence).length > 0 && (
                <>
                  <span className="k">Confidence</span>
                  <span>
                    {Object.entries(i.parse.confidence)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")}
                  </span>
                </>
              )}
              {i.parse.excluded && (
                <>
                  <span className="k">Excluded</span>
                  <span>
                    {[...i.parse.excluded.categories, ...i.parse.excluded.interests].join(", ") || "none"}
                    {i.parse.excluded.other.length > 0 && <span className="muted"> · not filterable yet: {i.parse.excluded.other.join(", ")}</span>}
                  </span>
                </>
              )}
              {i.parse.conflicts?.ages && (
                <>
                  <span className="k">Conflict</span>
                  <span>ages {i.parse.conflicts.ages.join(" and ")}: asked which child</span>
                </>
              )}
              {i.parse.corrections.length > 0 && (
                <>
                  <span className="k">Corrected</span>
                  <span>{i.parse.corrections.join(", ")}</span>
                </>
              )}
              {i.parse.fixes.length > 0 && (
                <>
                  <span className="k">Rules fixed</span>
                  <span>{i.parse.fixes.join("; ")}</span>
                </>
              )}
            </div>
          )}
          <b className="small">Slot object after merge</b>
          <pre>{JSON.stringify(i.after)}</pre>
          <div className="small muted" style={{ margin: "4px 0 8px" }}>
            This coded object is the only thing kept: for the cache key, history and redirect events.
          </div>
          {i.llm && (
            <div className="kv">
              <span className="k">Model call</span>
              <span>
                {i.llm.tin} tokens in, {i.llm.tout} out, <b>₹{i.llm.costRs.toFixed(4)}</b> (Haiku-class list price)
              </span>
              <span className="k">Changes</span>
              <span>{i.llm.notes.length ? i.llm.notes.join("; ") : "none"}</span>
            </div>
          )}
          {i.result && (
            <>
              <div className="kv">
                <span className="k">Cache</span>
                <span>
                  <span className={"badge " + (i.result.cache === "HIT" ? "good" : "warn")}>{i.result.cache}</span> <span className="muted">top-20 list per slot tuple</span>
                </span>
                <span className="k">Key</span>
                <span style={{ wordBreak: "break-all" }}>
                  <code>{i.result.key}</code>
                </span>
                <span className="k">Show</span>
                <span>
                  {i.result.limit} max ({i.result.limit === 3 ? "specific query" : "vague query"}), max 2 per brand and category
                </span>
              </div>
              <b className="small">Filter funnel</b>
              <div style={{ margin: "4px 0 10px" }}>
                {i.result.funnel.map((f, k) => (
                  <div key={k} className="small">
                    {f.label}: <b>{f.n}</b>
                    <div className="bar">
                      <i style={{ width: `${(f.n / Math.max(1, i.result!.funnel[0].n)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {i.result.ranked.length > 0 && (
                <>
                  <b className="small">Ranked results</b>
                  <table>
                    <tbody>
                      {i.result.ranked.map((r) => (
                        <tr key={r.id}>
                          <td className="small">
                            <b>{name(r.id)}</b>
                            <br />
                            <span className="muted">
                              {Object.entries(r.parts)
                                .map(([k, v]) => `${k} ${v}`)
                                .join(" · ")}
                            </span>
                            <br />
                            <span style={{ color: "var(--note)" }}>reason → {r.reasonWhy}</span>
                          </td>
                          <td>
                            <b>{r.score}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          {i.notes.map((n, k) => (
            <p key={k} className="small" style={{ color: "var(--warn)" }}>
              ⚠ {n}
            </p>
          ))}
        </>
      )}
      <hr style={{ border: 0, borderTop: "1px solid #e4def8", margin: "12px 0" }} />
      <b className="small">This chat so far</b>
      <div className="kv" style={{ marginTop: 4 }}>
        <span className="k">Typed turns</span>
        <span>
          {chat.typed} / {cap} {d.user ? "(signed in)" : "(guest)"}
        </span>
        <span className="k">Turn types</span>
        <span>
          {chat.pillTurns} pill · {chat.ruleTurns} rules · {chat.llmCalls} model
        </span>
        <span className="k">Model cost</span>
        <span>
          ₹{chat.sessionCost.toFixed(4)} <span className="muted">(target ≤ ₹0.15 per session)</span>
        </span>
        <span className="k">Slot key</span>
        <span style={{ wordBreak: "break-all" }}>
          <code>{slotKey(chat.slots)}</code>
        </span>
      </div>
      <p className="small muted">
        Persisted from this chat: nothing, unless you are signed in (history = slots + product IDs) or you click out to a brand (redirect event = coded slots). Never raw text.
      </p>
    </div>
  );
}
