"use client";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { Note } from "@/components/bits";
import { publishGate, visibility } from "@/lib/gate";
import { STAGES, STAGE_LABEL, Status, inr } from "@/lib/types";

export default function Pipeline() {
  const { d } = useApp();
  const cols: Status[] = [...STAGES, "suspended"];
  const live = d.products.filter((p) => visibility(d, p).visible).length;
  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Curation pipeline</h1>
        <span className="badge good">{live} live to parents</span>
        <span className="badge">{d.products.length} products</span>
        <span className="badge warn">{d.diffs.filter((x) => x.status === "pending").length} changes awaiting approval</span>
      </div>
      <Note>
        Lifecycle: Discovered → Screened → Selected → Evidence check → Expert review → Commercial onboarding → Published. Stages can be skipped with a recorded reason (B3); the publish gate cannot. &ldquo;Live&rdquo; is derived: published, every claim backed by current evidence, refreshed within 30 days, active purchase route.
      </Note>
      <p className="small muted">Open a product to edit it, add evidence, approve its profile, and try to publish.</p>
      <div className="board">
        {cols.map((s) => {
          const items = d.products.filter((p) => p.status === s);
          return (
            <div key={s} className="col">
              <h3>
                {STAGE_LABEL[s]} <span>{items.length}</span>
              </h3>
              {items.map((p) => {
                const v = visibility(d, p);
                const g = publishGate(d, p);
                const pass = g.filter((x) => x.ok).length;
                return (
                  <div key={p.id} className="tile">
                    <Link href={`/admin/p/${p.id}`}>
                      <b>
                        {p.emoji} {p.name}
                      </b>
                    </Link>
                    <div className="small muted">
                      {d.brands.find((b) => b.id === p.brandId)?.name} · {inr(p.price)}
                    </div>
                    <div className="row" style={{ marginTop: 4 }}>
                      {s === "published" ? <span className={"badge " + (v.visible ? "good" : "bad")}>{v.visible ? "Live" : "Hidden"}</span> : <span className="badge">Gate {pass}/{g.length}</span>}
                    </div>
                    {s === "published" && !v.visible && <div className="small" style={{ color: "var(--bad)" }}>{v.reasons.join("; ")}</div>}
                    {s === "suspended" && <div className="small muted">{p.suspendedReason}</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}
