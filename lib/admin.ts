// Admin mutations on a Data draft. Returns an error string, or null on success.
import { Data, STAGE_LABEL, Status, STAGES } from "./types";
import { gatePasses, publishGate, stageIndex, todayOf } from "./gate";

export function moveTo(d: Data, id: string, to: Status, reason = "", actor = "Admin (demo)"): string | null {
  const p = d.products.find((x) => x.id === id);
  if (!p) return "Unknown product";
  const from = p.status;
  if (from === to) return "Already at this stage";
  if (to === "published" && !gatePasses(d, p)) {
    const bad = publishGate(d, p).filter((g) => !g.ok).map((g) => g.label);
    return `Publish gate failed (cannot be skipped): ${bad.join("; ")}`;
  }
  const fi = stageIndex(from);
  const ti = stageIndex(to);
  const skipping = to !== "suspended" && ti > fi + 1 && fi >= 0 ? true : from === "suspended" && to !== "published" && ti > 1;
  if (skipping && !reason.trim()) return "Skipping stages needs a recorded reason (B3).";
  if (to === "suspended") {
    p.suspendedReason = reason.trim() || "Unpublished by admin";
  } else p.suspendedReason = undefined;
  p.status = to;
  d.statusLog.push({
    id: `l-${d.statusLog.length}-${id}`,
    productId: id,
    from,
    to,
    at: todayOf(d),
    actor,
    skippedReason: skipping ? reason.trim() : to === "suspended" ? p.suspendedReason : undefined,
  });
  d.ops.catalogueVersion++;
  return null;
}

export const stageName = (s: Status) => STAGE_LABEL[s];
export const stages = STAGES;
