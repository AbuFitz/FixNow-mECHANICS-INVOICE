import type { Bill, BankTransaction, BillingDocument, Expense, Preset } from "../types";
import { balanceDue } from "../status";
import { billBalance } from "./reports";

export interface Suggestion {
  type: "payment" | "bill" | "expense" | "rule";
  target_id: string;
  label: string;
  amount_pence: number;
  confidence: "exact" | "likely" | "rule";
  account?: string;
  vat_rate?: number;
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2);
const overlap = (a: string, b: string) => {
  const A = new Set(tokens(a));
  return tokens(b).filter((t) => A.has(t)).length;
};

export function parseBankCsv(text: string): { date: string; description: string; amount_pence: number }[] {
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return [];
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(rows[0]!).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const di = col("date");
  const desc = col("description", "details", "narrative", "reference", "memo", "name");
  const amt = col("amount", "value");
  const inn = col("paid in", "credit", "money in");
  const out = col("paid out", "debit", "money out");
  const toDate = (s: string) => {
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
    if (m) return `${m[3]!.length === 2 ? "20" + m[3] : m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return s.slice(0, 10);
  };
  const num = (s: string | undefined) => (s ? Math.round(parseFloat(s.replace(/[£,\s]/g, "")) * 100) || 0 : 0);
  const result: { date: string; description: string; amount_pence: number }[] = [];
  for (const line of rows.slice(1)) {
    const c = split(line);
    if (di < 0) continue;
    const amount = amt >= 0 ? num(c[amt]) : num(c[inn]) - Math.abs(num(c[out]));
    if (!amount) continue;
    result.push({ date: toDate(c[di] ?? ""), description: c[desc >= 0 ? desc : 1] ?? "", amount_pence: amount });
  }
  return result;
}

export function suggest(t: BankTransaction, ctx: { docs: BillingDocument[]; bills: Bill[]; expenses: Expense[]; rules: Preset[] }): Suggestion[] {
  const out: Suggestion[] = [];
  const amt = Math.abs(t.amount_pence);
  if (t.amount_pence > 0) {
    for (const d of ctx.docs) {
      if (d.lifecycle !== "issued" || !(d.doc_type === "invoice" || d.doc_type === "receipt")) continue;
      const bal = balanceDue(d);
      if (bal <= 0) continue;
      const nameHit = overlap(t.description, d.content.customer.name) > 0 || t.description.toLowerCase().includes((d.number ?? "~").toLowerCase());
      if (bal === amt) out.push({ type: "payment", target_id: d.id, label: `${d.number} · ${d.content.customer.name}`, amount_pence: bal, confidence: nameHit ? "exact" : "likely" });
      else if (nameHit) out.push({ type: "payment", target_id: d.id, label: `${d.number} · ${d.content.customer.name}`, amount_pence: Math.min(bal, amt), confidence: "likely" });
    }
  } else {
    for (const b of ctx.bills) {
      if (b.status !== "approved") continue;
      const bal = billBalance(b);
      const nameHit = overlap(t.description, b.supplier_name) > 0;
      if (bal === amt || nameHit) out.push({ type: "bill", target_id: b.id, label: `${b.supplier_name} · ${b.reference}`, amount_pence: bal, confidence: bal === amt ? "exact" : "likely" });
    }
    for (const e of ctx.expenses) {
      if (e.status !== "approved") continue;
      if (e.gross_pence === amt) out.push({ type: "expense", target_id: e.id, label: `${e.claimant} · ${e.description}`, amount_pence: amt, confidence: "likely" });
    }
  }
  for (const r of ctx.rules) {
    const kw = String(r.payload.keyword ?? "").toLowerCase();
    if (kw && t.description.toLowerCase().includes(kw)) out.push({ type: "rule", target_id: r.id, label: `Rule: ${r.label}`, amount_pence: amt, confidence: "rule", account: String(r.payload.account ?? "499"), vat_rate: Number(r.payload.vat_rate ?? 0) });
  }
  const rank = { exact: 0, likely: 1, rule: 2 } as const;
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}
