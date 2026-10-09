import type { DocumentContent, LineItem } from "./types";
import { roundHalfUp } from "./money";

export interface VatBucket {
  rate: number;
  net_pence: number;
  vat_pence: number;
}

export interface Totals {
  subtotal_pence: number;
  discount_pence: number;
  net_pence: number;
  vat_buckets: VatBucket[];
  vat_pence: number;
  total_pence: number;
  /** Internal cost of items that carry a cost. */
  cost_pence: number;
  /** Net sales minus cost (only meaningful when every item carries a cost). */
  margin_pence: number;
}

export function lineNet(item: Pick<LineItem, "qty" | "unit_pence">): number {
  return roundHalfUp((item.qty || 0) * (item.unit_pence || 0));
}

export function defaultVatRate(mode: DocumentContent["vat_mode"]): number {
  switch (mode) {
    case "standard":
      return 20;
    case "reduced":
      return 5;
    default:
      return 0;
  }
}

/**
 * Totals for a document. VAT is calculated per rate bucket AFTER the discount
 * has been spread pro-rata across lines, so mixed-rate invoices stay correct
 * for the VAT return. When the business is not VAT registered, VAT is zero.
 */
export function computeTotals(
  content: Pick<DocumentContent, "items" | "discount_pence" | "vat_mode" | "business">,
): Totals {
  const items = content.items ?? [];
  const nets = items.map(lineNet);
  const subtotal = nets.reduce((a, b) => a + b, 0);
  const discount = Math.min(Math.max(content.discount_pence || 0, 0), Math.max(subtotal, 0));
  const registered = content.business?.vat_registered && content.vat_mode !== "none";

  // Spread discount pro-rata; give the rounding remainder to the largest line.
  const shares = nets.map((n) => (subtotal > 0 ? Math.floor((n * discount) / subtotal) : 0));
  let remainder = discount - shares.reduce((a, b) => a + b, 0);
  if (remainder > 0 && nets.length) {
    let idx = 0;
    nets.forEach((n, i) => {
      if (n > nets[idx]!) idx = i;
    });
    shares[idx] = (shares[idx] ?? 0) + remainder;
    remainder = 0;
  }

  const buckets = new Map<number, VatBucket>();
  items.forEach((item, i) => {
    const rate = registered ? (item.vat_rate ?? defaultVatRate(content.vat_mode)) : 0;
    const net = (nets[i] ?? 0) - (shares[i] ?? 0);
    const b = buckets.get(rate) ?? { rate, net_pence: 0, vat_pence: 0 };
    b.net_pence += net;
    buckets.set(rate, b);
  });
  const vatBuckets = [...buckets.values()]
    .map((b) => ({ ...b, vat_pence: roundHalfUp((b.net_pence * b.rate) / 100) }))
    .sort((a, b) => b.rate - a.rate);
  const vat = vatBuckets.reduce((a, b) => a + b.vat_pence, 0);
  const net = subtotal - discount;

  const cost = items.reduce((a, it) => a + roundHalfUp((it.qty || 0) * (it.cost_pence || 0)), 0);
  return {
    subtotal_pence: subtotal,
    discount_pence: discount,
    net_pence: net,
    vat_buckets: vatBuckets,
    vat_pence: vat,
    total_pence: net + vat,
    cost_pence: cost,
    margin_pence: net - cost,
  };
}

export function vatLabel(content: Pick<DocumentContent, "business" | "vat_mode">, t: Totals): string {
  if (!content.business.vat_registered || content.vat_mode === "none") return "VAT not charged";
  if (t.vat_buckets.length === 1) return `VAT @ ${t.vat_buckets[0]!.rate}%`;
  return "VAT";
}

export interface LineAllocation {
  item: LineItem;
  net_pence: number;
  vat_pence: number;
  rate: number;
}

/**
 * Per-line net (after the pro-rata discount) and VAT, with each rate bucket's
 * VAT distributed by largest remainder so line VAT always sums to the bucket
 * VAT — and therefore to the invoice VAT used on the VAT return.
 */
export function allocateLines(
  content: Pick<DocumentContent, "items" | "discount_pence" | "vat_mode" | "business">,
): LineAllocation[] {
  const items = content.items ?? [];
  const nets = items.map(lineNet);
  const subtotal = nets.reduce((a, b) => a + b, 0);
  const discount = Math.min(Math.max(content.discount_pence || 0, 0), Math.max(subtotal, 0));
  const registered = content.business?.vat_registered && content.vat_mode !== "none";
  const shares = nets.map((n) => (subtotal > 0 ? Math.floor((n * discount) / subtotal) : 0));
  let rem = discount - shares.reduce((a, b) => a + b, 0);
  if (rem > 0 && nets.length) {
    let idx = 0;
    nets.forEach((n, i) => {
      if (n > nets[idx]!) idx = i;
    });
    shares[idx] = (shares[idx] ?? 0) + rem;
    rem = 0;
  }
  const out: LineAllocation[] = items.map((item, i) => ({
    item,
    net_pence: (nets[i] ?? 0) - (shares[i] ?? 0),
    vat_pence: 0,
    rate: registered ? (item.vat_rate ?? defaultVatRate(content.vat_mode)) : 0,
  }));
  const byRate = new Map<number, LineAllocation[]>();
  out.forEach((l) => byRate.set(l.rate, [...(byRate.get(l.rate) ?? []), l]));
  for (const [rate, lines] of byRate) {
    if (rate === 0) continue;
    const bucketNet = lines.reduce((a, l) => a + l.net_pence, 0);
    const bucketVat = roundHalfUp((bucketNet * rate) / 100);
    const raw = lines.map((l) => (l.net_pence * rate) / 100);
    const floors = raw.map(Math.floor);
    let left = bucketVat - floors.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
    lines.forEach((l, i) => (l.vat_pence = floors[i]!));
    for (let k = 0; left > 0 && k < order.length; k++, left--) lines[order[k]!.i]!.vat_pence += 1;
  }
  return out;
}
