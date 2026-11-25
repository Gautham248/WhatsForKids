// Tiny CSV helpers. Export prefixes cells that start with = + - @ so a
// spreadsheet never treats them as formulas (CSV injection guard).

import type { Data, SaleReport } from "./types";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export const SALES_HEADER = ["date", "brand_id", "product_id", "order_ref", "amount_inr"];
/** Parse a brand's sales report. Every bad row is rejected with its line number; good rows are returned. */
export function parseSalesCsv(text: string, d: Data): { rows: SaleReport[]; errors: { line: number; msg: string }[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  const rows: SaleReport[] = [];
  const errors: { line: number; msg: string }[] = [];
  if (!grid.length) return { rows, errors: [{ line: 1, msg: "empty file" }] };
  const head = grid[0].map((h) => h.trim().toLowerCase());
  if (SALES_HEADER.some((h, i) => head[i] !== h)) return { rows, errors: [{ line: 1, msg: `header must be: ${SALES_HEADER.join(",")}` }] };
  const seen = new Set((d.sales ?? []).map((s) => `${s.brandId}|${s.orderRef}`));
  grid.slice(1).forEach((r, i) => {
    const line = i + 2;
    const [date, brandId, productId, orderRef, amount] = r.map((c) => (c ?? "").trim());
    const p = d.products.find((x) => x.id === productId);
    const amt = Number(amount.replace(/,/g, ""));
    let msg = "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) msg = `bad date "${date}" (use YYYY-MM-DD)`;
    else if (!d.brands.some((b) => b.id === brandId)) msg = `unknown brand "${brandId}"`;
    else if (!p) msg = `unknown product "${productId}"`;
    else if (p.brandId !== brandId) msg = `product "${productId}" does not belong to brand "${brandId}"`;
    else if (!orderRef) msg = "missing order ref";
    else if (!(amt > 0)) msg = `amount must be more than 0 (got "${amount}")`;
    else if (seen.has(`${brandId}|${orderRef}`)) msg = `duplicate order ref "${orderRef}"`;
    if (msg) return void errors.push({ line, msg });
    seen.add(`${brandId}|${orderRef}`);
    rows.push({ date, brandId, productId, orderRef, amountRs: amt });
  });
  return { rows, errors };
}
