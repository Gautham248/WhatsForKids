// Shareable wishlist codes. A code carries only a preset title index and product ids:
// no user, no child, no free text. Pure functions, so they can move to the real backend unchanged.
// In the real build the list lives server-side (so "bought" syncs between relatives); here the
// link works across browsers only because every browser seeds the same catalogue.

export const WISHLIST_TITLES = ["Birthday list", "Festival list", "Wishlist"];
const MAX_ITEMS = 30;

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export function encodeWishlist(titleIdx: number, productIds: string[]): string {
  const ids = [...new Set(productIds)].slice(0, MAX_ITEMS).map((id) => id.replace(/^p-/, ""));
  const t = Number.isInteger(titleIdx) && titleIdx >= 0 && titleIdx < WISHLIST_TITLES.length ? titleIdx : WISHLIST_TITLES.length - 1;
  return `${t}.${b64url(ids.join(","))}`;
}

/** Returns null for a malformed code. Ids not in `known` are dropped, so a stale link still opens. */
export function decodeWishlist(code: string, known: string[]): { title: string; productIds: string[]; dropped: number } | null {
  const m = /^(\d)\.([A-Za-z0-9_-]{1,2000})$/.exec(code ?? "");
  if (!m || +m[1] >= WISHLIST_TITLES.length) return null;
  let raw: string;
  try {
    raw = unb64url(m[2]);
  } catch {
    return null;
  }
  if (!/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(raw)) return null;
  const ids = [...new Set(raw.split(",").map((x) => "p-" + x))].slice(0, MAX_ITEMS);
  const productIds = ids.filter((id) => known.includes(id));
  return { title: WISHLIST_TITLES[+m[1]], productIds, dropped: ids.length - productIds.length };
}
