import type { Bill, BillingDocument, BankTransaction, Expense, PayRun, Payment, BillingSettings, Account } from "../types";
import { allocateLines } from "../totals";
import { convertToBase, roundHalfUp } from "../money";

export type LedgerSource = "invoice" | "receipt" | "credit_note" | "bill" | "expense" | "bank" | "payroll";

/** One accounting fact. Positive = income/expense magnitude; `kind` gives direction. */
export interface LedgerLine {
  date: string;
  source: LedgerSource;
  ref: string;
  description: string;
  account: string;
  kind: "income" | "expense";
  net_pence: number;
  vat_pence: number;
  vat_rate: number;
  doc_id?: string;
  contact_id?: string | null;
  project_id?: string | null;
}

export interface LedgerInput {
  docs: BillingDocument[];
  payments: Payment[];
  bills: Bill[];
  expenses: Expense[];
  bankTxns: BankTransaction[];
  payRuns: PayRun[];
  settings: BillingSettings;
  accounts: Account[];
}

function incomeAccount(kind: string): string {
  return kind === "part" ? "201" : kind === "callout" ? "202" : "200";
}

/**
 * Sales lines. Accrual: dated at issue. Cash: each payment is dated and carries
 * its proportional share of net/VAT, so the VAT return follows money received.
 */
export function salesLines(docs: BillingDocument[], payments: Payment[], basis: "accrual" | "cash"): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const d of docs) {
    if (d.lifecycle !== "issued" || d.doc_type === "quote") continue;
    const alloc = allocateLines(d.content);
    const fx = d.content.fx_rate || 1;
    const sign = d.doc_type === "credit_note" ? -1 : 1;
    const gross = alloc.reduce((a, l) => a + l.net_pence + l.vat_pence, 0);
    const pays = payments.filter((p) => p.document_id === d.id);

    const push = (date: string, share: number) => {
      for (const l of alloc) {
        out.push({
          date,
          source: d.doc_type === "credit_note" ? "credit_note" : d.doc_type === "receipt" ? "receipt" : "invoice",
          ref: d.number ?? "",
          description: l.item.description,
          account: l.item.account || incomeAccount(l.item.kind),
          kind: "income",
          net_pence: sign * convertToBase(roundHalfUp(l.net_pence * share), fx),
          vat_pence: sign * convertToBase(roundHalfUp(l.vat_pence * share), fx),
          vat_rate: l.rate,
          doc_id: d.id,
          contact_id: d.contact_id,
          project_id: d.project_id,
        });
      }
    };

    if (basis === "accrual" || d.doc_type === "credit_note") {
      push(d.issued_at ?? d.created_at.slice(0, 10), 1);
    } else if (gross > 0) {
      for (const p of pays) push(p.paid_at, p.amount_pence / gross);
    }
  }
  return out;
}

export function billLines(bills: Bill[], bankTxns: BankTransaction[], basis: "accrual" | "cash"): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const b of bills) {
    if (b.status === "draft" || b.status === "void") continue;
    let date = b.bill_date;
    if (basis === "cash") {
      if (b.status !== "paid") continue;
      const tx = bankTxns.find((t) => t.matched?.type === "bill" && t.matched.id === b.id);
      date = tx?.date ?? b.bill_date;
    }
    for (const l of b.lines) {
      out.push({
        date,
        source: "bill",
        ref: b.reference,
        description: `${b.supplier_name}${l.description ? " — " + l.description : ""}`,
        account: l.account,
        kind: "expense",
        net_pence: convertToBase(l.net_pence, b.fx_rate),
        vat_pence: convertToBase(roundHalfUp((l.net_pence * l.vat_rate) / 100), b.fx_rate),
        vat_rate: l.vat_rate,
        contact_id: b.contact_id,
        project_id: b.project_id,
      });
    }
  }
  return out;
}

/** HMRC advisory approved mileage rates, 45p for the first 10,000 business miles in a tax year, then 25p. */
export function mileageAmount(miles: number, milesBefore: number, first: number, after: number): number {
  const at1 = Math.max(Math.min(miles, 10000 - milesBefore), 0);
  const at2 = miles - at1;
  return Math.round(at1 * first + at2 * after);
}

export function taxYearStart(dateIso: string): string {
  const y = parseInt(dateIso.slice(0, 4), 10);
  const afterApr6 = dateIso >= `${y}-04-06`;
  return `${afterApr6 ? y : y - 1}-04-06`;
}

export function expenseLines(expenses: Expense[], settings: BillingSettings): LedgerLine[] {
  const out: LedgerLine[] = [];
  const miles = new Map<string, number>();
  const sorted = [...expenses].filter((e) => e.status === "approved" || e.status === "reimbursed").sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    if (e.kind === "mileage") {
      const key = `${e.claimant}|${taxYearStart(e.date)}`;
      const before = miles.get(key) ?? 0;
      const amount = mileageAmount(e.miles, before, settings.tax.mileage_rate_first_10k_pence, settings.tax.mileage_rate_after_10k_pence);
      miles.set(key, before + e.miles);
      out.push({ date: e.date, source: "expense", ref: e.claimant, description: `Mileage ${e.miles} mi — ${e.description}`, account: e.account || "411", kind: "expense", net_pence: amount, vat_pence: 0, vat_rate: 0, project_id: e.project_id });
    } else {
      const gross = convertToBase(e.gross_pence, e.fx_rate);
      const vat = convertToBase(e.vat_pence, e.fx_rate);
      out.push({ date: e.date, source: "expense", ref: e.claimant, description: e.description, account: e.account, kind: "expense", net_pence: gross - vat, vat_pence: vat, vat_rate: gross - vat > 0 ? Math.round((vat / (gross - vat)) * 100) : 0, project_id: e.project_id });
    }
  }
  return out;
}

export function bankDirectLines(txns: BankTransaction[]): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const t of txns) {
    if (t.matched?.type !== "direct") continue;
    const gross = Math.abs(t.amount_pence);
    const rate = t.matched.vat_rate;
    const net = rate ? roundHalfUp(gross / (1 + rate / 100)) : gross;
    out.push({ date: t.date, source: "bank", ref: t.external_id, description: t.matched.description || t.description, account: t.matched.account, kind: t.amount_pence >= 0 ? "income" : "expense", net_pence: net, vat_pence: gross - net, vat_rate: rate });
  }
  return out;
}

export function payrollLines(runs: PayRun[]): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const r of runs) {
    if (r.status === "draft") continue;
    const gross = r.lines.reduce((a, l) => a + l.gross_pence, 0);
    const er = r.lines.reduce((a, l) => a + l.employer_ni_pence + l.pension_employer_pence, 0);
    out.push({ date: r.pay_date, source: "payroll", ref: r.period_label, description: `Wages — ${r.period_label}`, account: "420", kind: "expense", net_pence: gross, vat_pence: 0, vat_rate: 0 });
    if (er) out.push({ date: r.pay_date, source: "payroll", ref: r.period_label, description: `Employer NI & pension — ${r.period_label}`, account: "421", kind: "expense", net_pence: er, vat_pence: 0, vat_rate: 0 });
  }
  return out;
}

export function buildLedger(input: LedgerInput, basis: "accrual" | "cash" = input.settings.tax.accounting_basis): LedgerLine[] {
  return [
    ...salesLines(input.docs, input.payments, basis),
    ...billLines(input.bills, input.bankTxns, basis),
    ...expenseLines(input.expenses, input.settings),
    ...bankDirectLines(input.bankTxns),
    ...payrollLines(input.payRuns),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}
