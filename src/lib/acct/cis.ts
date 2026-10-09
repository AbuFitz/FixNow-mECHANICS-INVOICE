import type { Bill, Contact } from "../types";
import { inRange } from "./ledger";

export const CIS_RATE: Record<Contact["cis_status"], number> = { none: 0, gross: 0, standard: 0.2, unmatched: 0.3 };

/** CIS deduction: rate × labour element only (materials, equipment and VAT are not deducted from). */
export function cisDeduction(lines: Bill["lines"], status: Contact["cis_status"]): number {
  const labour = lines.filter((l) => l.is_labour).reduce((a, l) => a + l.net_pence, 0);
  return Math.round(labour * CIS_RATE[status]);
}

/** Monthly CIS return period runs from the 6th to the 5th. */
export function cisPeriod(anyDate: string): { start: string; end: string; label: string } {
  const [y, m, d] = anyDate.split("-").map(Number) as [number, number, number];
  const p = (n: number) => String(n).padStart(2, "0");
  // Start month is this month from the 6th onward, otherwise last month.
  let sy = d >= 6 ? y : m === 1 ? y - 1 : y;
  let sm = d >= 6 ? m : m === 1 ? 12 : m - 1;
  const ey = sm === 12 ? sy + 1 : sy;
  const em = sm === 12 ? 1 : sm + 1;
  sy = Math.trunc(sy);
  sm = Math.trunc(sm);
  return { start: `${sy}-${p(sm)}-06`, end: `${ey}-${p(em)}-05`, label: `${ey}-${p(em)}` };
}

export interface CisRow {
  contact_id: string | null;
  name: string;
  utr: string;
  status: Contact["cis_status"];
  gross_pence: number;
  materials_pence: number;
  labour_pence: number;
  deduction_pence: number;
  net_paid_pence: number;
}

export function cisReport(bills: Bill[], contacts: Contact[], from: string, to: string): CisRow[] {
  const rows = new Map<string, CisRow>();
  for (const b of bills) {
    if (b.status === "draft" || b.status === "void" || !inRange(b.bill_date, from, to)) continue;
    const c = contacts.find((x) => x.id === b.contact_id);
    if (!c || c.cis_status === "none") continue;
    const labour = b.lines.filter((l) => l.is_labour).reduce((a, l) => a + l.net_pence, 0);
    const net = b.lines.reduce((a, l) => a + l.net_pence, 0);
    const r = rows.get(c.id) ?? { contact_id: c.id, name: c.name, utr: c.cis_utr, status: c.cis_status, gross_pence: 0, materials_pence: 0, labour_pence: 0, deduction_pence: 0, net_paid_pence: 0 };
    r.gross_pence += net;
    r.labour_pence += labour;
    r.materials_pence += net - labour;
    r.deduction_pence += b.cis_deduction_pence;
    r.net_paid_pence += net - b.cis_deduction_pence;
    rows.set(c.id, r);
  }
  return [...rows.values()];
}
