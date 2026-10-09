import type { Account, Bill, BankAccount, BankTransaction, BillingDocument, Contact, BillingSettings, KpiKey, Payment } from "../types";
import type { LedgerLine } from "./ledger";
import { inRange } from "./ledger";
import { addDaysIso, daysBetween, isoDate } from "../format";
import { balanceDue } from "../status";
import { computeTotals } from "../totals";
import { convertToBase } from "../money";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";

// ---------------------------------------------------------------------------
// Profit & loss
// ---------------------------------------------------------------------------
export interface PnlRow {
  account: string;
  name: string;
  group: Account["group"];
  amount_pence: number;
  by_month: Record<string, number>;
}
export interface Pnl {
  income: PnlRow[];
  cost_of_sales: PnlRow[];
  expenses: PnlRow[];
  payroll: PnlRow[];
  other_income: PnlRow[];
  totals: { income: number; cost_of_sales: number; gross_profit: number; expenses: number; payroll: number; other_income: number; net_profit: number };
  months: string[];
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = startOfMonth(parseISO(from));
  const end = parseISO(to);
  while (d <= end) {
    out.push(format(d, "yyyy-MM"));
    d = addMonths(d, 1);
  }
  return out;
}

export function profitAndLoss(lines: LedgerLine[], accounts: Account[], from: string, to: string): Pnl {
  const names = new Map(accounts.map((a) => [a.code, a]));
  const rows = new Map<string, PnlRow>();
  const months = monthsBetween(from, to);
  for (const l of lines) {
    if (!inRange(l.date, from, to)) continue;
    const acc = names.get(l.account);
    const row = rows.get(l.account) ?? { account: l.account, name: acc?.name ?? l.account, group: acc?.group ?? (l.kind === "income" ? "income" : "expense"), amount_pence: 0, by_month: {} };
    const signed = l.kind === "income" ? l.net_pence : l.net_pence;
    row.amount_pence += signed;
    const m = l.date.slice(0, 7);
    row.by_month[m] = (row.by_month[m] ?? 0) + signed;
    rows.set(l.account, row);
  }
  const pick = (g: Account["group"]) => [...rows.values()].filter((r) => r.group === g).sort((a, b) => a.account.localeCompare(b.account));
  const sum = (rs: PnlRow[]) => rs.reduce((a, r) => a + r.amount_pence, 0);
  const income = pick("income");
  const cos = pick("cost_of_sales");
  const exp = pick("expense");
  const pay = pick("payroll");
  const oth = pick("other_income");
  const t = { income: sum(income), cost_of_sales: sum(cos), expenses: sum(exp), payroll: sum(pay), other_income: sum(oth), gross_profit: 0, net_profit: 0 };
  t.gross_profit = t.income - t.cost_of_sales;
  t.net_profit = t.gross_profit + t.other_income - t.expenses - t.payroll;
  return { income, cost_of_sales: cos, expenses: exp, payroll: pay, other_income: oth, totals: t, months };
}

export function monthlySeries(lines: LedgerLine[], from: string, to: string) {
  return monthsBetween(from, to).map((m) => {
    const ml = lines.filter((l) => l.date.startsWith(m));
    const income = ml.filter((l) => l.kind === "income").reduce((a, l) => a + l.net_pence, 0);
    const spend = ml.filter((l) => l.kind === "expense").reduce((a, l) => a + l.net_pence, 0);
    return { month: m, income, spend, profit: income - spend };
  });
}

// ---------------------------------------------------------------------------
// Ageing
// ---------------------------------------------------------------------------
export type AgeBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const AGE_LABEL: Record<AgeBucket, string> = { current: "Not yet due", d1_30: "1–30 days", d31_60: "31–60 days", d61_90: "61–90 days", d90: "90+ days" };

export function ageBucket(due: string | null, today = isoDate()): AgeBucket {
  if (!due) return "current";
  const late = daysBetween(today, due);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "d90";
}

export interface AgedRow {
  id: string;
  who: string;
  ref: string;
  due: string | null;
  balance_pence: number;
  bucket: AgeBucket;
  days_late: number;
}

export function agedDebtors(docs: BillingDocument[], today = isoDate()): AgedRow[] {
  return docs
    .filter((d) => d.lifecycle === "issued" && d.doc_type === "invoice" && balanceDue(d) > 0)
    .map((d) => ({ id: d.id, who: d.content.customer.name, ref: d.number ?? "", due: d.due_at, balance_pence: convertToBase(balanceDue(d), d.content.fx_rate), bucket: ageBucket(d.due_at, today), days_late: Math.max(daysBetween(today, d.due_at ?? today), 0) }))
    .sort((a, b) => b.days_late - a.days_late);
}

export function billGross(b: Bill): number {
  return b.lines.reduce((a, l) => a + l.net_pence + Math.round((l.net_pence * l.vat_rate) / 100), 0);
}
export function billBalance(b: Bill): number {
  return Math.max(billGross(b) - b.cis_deduction_pence - b.paid_pence, 0);
}

export function agedCreditors(bills: Bill[], today = isoDate()): AgedRow[] {
  return bills
    .filter((b) => (b.status === "approved") && billBalance(b) > 0)
    .map((b) => ({ id: b.id, who: b.supplier_name, ref: b.reference, due: b.due_date, balance_pence: convertToBase(billBalance(b), b.fx_rate), bucket: ageBucket(b.due_date, today), days_late: Math.max(daysBetween(today, b.due_date ?? today), 0) }))
    .sort((a, b) => b.days_late - a.days_late);
}

export function bucketTotals(rows: AgedRow[]): Record<AgeBucket, number> {
  const t: Record<AgeBucket, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  rows.forEach((r) => (t[r.bucket] += r.balance_pence));
  return t;
}

// ---------------------------------------------------------------------------
// Cash & forecast
// ---------------------------------------------------------------------------
export function bankBalance(account: BankAccount, txns: BankTransaction[]): number {
  return account.opening_balance_pence + txns.filter((t) => t.bank_account_id === account.id).reduce((a, t) => a + t.amount_pence, 0);
}

/** Average days between an invoice's due date and the day it was settled (never negative). */
export function averageDaysLate(docs: BillingDocument[], payments: Payment[]): number {
  const lates: number[] = [];
  for (const d of docs) {
    if (d.doc_type !== "invoice" || d.lifecycle !== "issued" || balanceDue(d) > 0 || !d.due_at) continue;
    const last = payments.filter((p) => p.document_id === d.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
    if (last) lates.push(Math.max(daysBetween(last.paid_at, d.due_at), 0));
  }
  return lates.length ? Math.round(lates.reduce((a, b) => a + b, 0) / lates.length) : 0;
}

export interface ForecastPoint {
  date: string;
  balance_pence: number;
  inflow_pence: number;
  outflow_pence: number;
  projected_sales_pence: number;
}
export interface ForecastEvent {
  date: string;
  label: string;
  amount_pence: number;
  certainty: "known" | "projected";
}

export function cashForecast(opts: {
  startBalance: number;
  docs: BillingDocument[];
  bills: Bill[];
  payments: Payment[];
  recurringBills: Bill[];
  vatDue?: { date: string; amount_pence: number } | null;
  monthlyPayrollOut: number;
  trailingWeeklySales: number;
  includeProjectedSales: boolean;
  days?: number;
  today?: string;
}): { points: ForecastPoint[]; events: ForecastEvent[]; lowest: ForecastPoint } {
  const today = opts.today ?? isoDate();
  const days = opts.days ?? 180;
  const slack = averageDaysLate(opts.docs, opts.payments);
  const events: ForecastEvent[] = [];

  for (const d of opts.docs) {
    if (d.doc_type !== "invoice" || d.lifecycle !== "issued") continue;
    const bal = balanceDue(d);
    if (bal <= 0) continue;
    let when = addDaysIso(d.due_at ?? today, slack);
    if (when < today) when = today;
    events.push({ date: when, label: `${d.number} ${d.content.customer.name}`, amount_pence: convertToBase(bal, d.content.fx_rate), certainty: "known" });
  }
  for (const b of opts.bills) {
    if (b.status !== "approved") continue;
    const bal = billBalance(b);
    if (bal <= 0) continue;
    const when = (b.due_date ?? today) < today ? today : (b.due_date ?? today);
    events.push({ date: when, label: `Bill ${b.reference} ${b.supplier_name}`, amount_pence: -convertToBase(bal, b.fx_rate), certainty: "known" });
  }
  const step = { weekly: 7, monthly: 30, quarterly: 91, annually: 365 } as const;
  for (const b of opts.recurringBills) {
    if (b.repeat === "none") continue;
    let next = addDaysIso(b.bill_date, step[b.repeat]);
    while (next < today) next = addDaysIso(next, step[b.repeat]);
    while (daysBetween(next, today) <= days) {
      events.push({ date: next, label: `Recurring: ${b.supplier_name}`, amount_pence: -billGross(b), certainty: "known" });
      next = addDaysIso(next, step[b.repeat]);
    }
  }
  if (opts.monthlyPayrollOut > 0) {
    for (let i = 1; i <= Math.ceil(days / 30); i++) events.push({ date: addDaysIso(today, i * 30), label: "Payroll & PAYE (estimate)", amount_pence: -opts.monthlyPayrollOut, certainty: "known" });
  }
  if (opts.vatDue && opts.vatDue.amount_pence !== 0) events.push({ date: opts.vatDue.date < today ? today : opts.vatDue.date, label: "VAT return (estimate)", amount_pence: -opts.vatDue.amount_pence, certainty: "known" });
  if (opts.includeProjectedSales && opts.trailingWeeklySales > 0) {
    for (let w = 2; w * 7 <= days; w++) events.push({ date: addDaysIso(today, w * 7), label: "Projected new sales (trailing average)", amount_pence: opts.trailingWeeklySales, certainty: "projected" });
  }

  const points: ForecastPoint[] = [];
  let bal = opts.startBalance;
  for (let i = 0; i <= days; i++) {
    const date = addDaysIso(today, i);
    const todays = events.filter((e) => e.date === date);
    const inflow = todays.filter((e) => e.amount_pence > 0).reduce((a, e) => a + e.amount_pence, 0);
    const outflow = todays.filter((e) => e.amount_pence < 0).reduce((a, e) => a + e.amount_pence, 0);
    const projected = todays.filter((e) => e.certainty === "projected").reduce((a, e) => a + e.amount_pence, 0);
    bal += inflow + outflow;
    points.push({ date, balance_pence: bal, inflow_pence: inflow, outflow_pence: outflow, projected_sales_pence: projected });
  }
  const lowest = points.reduce((m, p) => (p.balance_pence < m.balance_pence ? p : m), points[0]!);
  return { points, events: events.sort((a, b) => a.date.localeCompare(b.date)), lowest };
}

// ---------------------------------------------------------------------------
// KPIs, scorecard
// ---------------------------------------------------------------------------
export interface Kpis {
  gross_margin_pct: number;
  net_margin_pct: number;
  avg_invoice_pence: number;
  dso_days: number;
  repeat_customer_pct: number;
  revenue_per_job_pence: number;
  parts_margin_pct: number;
  overdue_pct: number;
  runway_months: number;
}

export function computeKpis(opts: { lines: LedgerLine[]; accounts: Account[]; docs: BillingDocument[]; payments: Payment[]; cash: number; from: string; to: string; contacts?: Contact[]; today?: string }): Kpis {
  const { lines, docs, payments } = opts;
  const pnl = profitAndLoss(lines, opts.accounts, opts.from, opts.to);
  const income = pnl.totals.income;
  const salesDocs = docs.filter((d) => d.lifecycle === "issued" && (d.doc_type === "invoice" || d.doc_type === "receipt") && (d.issued_at ?? "") >= opts.from && (d.issued_at ?? "") <= opts.to);
  const avgInvoice = salesDocs.length ? Math.round(salesDocs.reduce((a, d) => a + d.total_pence, 0) / salesDocs.length) : 0;

  const days: number[] = [];
  for (const d of salesDocs) {
    if (d.doc_type !== "invoice" || balanceDue(d) > 0 || !d.issued_at) continue;
    const last = payments.filter((p) => p.document_id === d.id).sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];
    if (last) days.push(Math.max(daysBetween(last.paid_at, d.issued_at), 0));
  }
  const dso = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;

  const byCust = new Map<string, number>();
  salesDocs.forEach((d) => {
    const k = (d.contact_id ?? d.content.customer.name).toLowerCase();
    byCust.set(k, (byCust.get(k) ?? 0) + 1);
  });
  const repeat = byCust.size ? ([...byCust.values()].filter((n) => n >= 2).length / byCust.size) * 100 : 0;

  let partRev = 0;
  let partCost = 0;
  for (const d of salesDocs) {
    const t = computeTotals(d.content);
    d.content.items.filter((i) => i.kind === "part" && i.cost_pence).forEach((i) => {
      partRev += Math.round(i.qty * i.unit_pence);
      partCost += Math.round(i.qty * (i.cost_pence ?? 0));
    });
    void t;
  }
  const outstanding = docs.filter((d) => d.doc_type === "invoice" && d.lifecycle === "issued").reduce((a, d) => a + balanceDue(d), 0);
  const overdue = agedDebtors(docs, opts.today).filter((r) => r.bucket !== "current").reduce((a, r) => a + r.balance_pence, 0);
  const monthsSpan = Math.max(monthsBetween(opts.from, opts.to).length, 1);
  const monthlySpend = (pnl.totals.cost_of_sales + pnl.totals.expenses + pnl.totals.payroll) / monthsSpan;

  return {
    gross_margin_pct: income ? (pnl.totals.gross_profit / income) * 100 : 0,
    net_margin_pct: income ? (pnl.totals.net_profit / income) * 100 : 0,
    avg_invoice_pence: avgInvoice,
    dso_days: dso,
    repeat_customer_pct: repeat,
    revenue_per_job_pence: avgInvoice,
    parts_margin_pct: partRev ? ((partRev - partCost) / partRev) * 100 : 0,
    overdue_pct: outstanding ? (overdue / outstanding) * 100 : 0,
    runway_months: monthlySpend > 0 ? opts.cash / monthlySpend : 0,
  };
}

export type Rag = "green" | "amber" | "red";
export interface ScoreItem {
  key: string;
  label: string;
  value: string;
  rag: Rag;
  why: string;
}

/** Guidance scorecard. Thresholds are rules of thumb, not accounting standards — shown as such. */
export function scorecard(k: Kpis): ScoreItem[] {
  const r = (v: number, g: number, a: number, higherBetter = true): Rag => (higherBetter ? (v >= g ? "green" : v >= a ? "amber" : "red") : v <= g ? "green" : v <= a ? "amber" : "red");
  return [
    { key: "gm", label: "Gross margin", value: `${k.gross_margin_pct.toFixed(0)}%`, rag: r(k.gross_margin_pct, 55, 40), why: "Sales left after parts and subcontractors. Under 40% usually means prices or parts mark-up need a look." },
    { key: "nm", label: "Net margin", value: `${k.net_margin_pct.toFixed(0)}%`, rag: r(k.net_margin_pct, 15, 5), why: "What you keep after every cost, before corporation tax." },
    { key: "dso", label: "Days to get paid", value: `${k.dso_days} days`, rag: r(k.dso_days, 7, 21, false), why: "Average days from issuing an invoice to being paid in full." },
    { key: "od", label: "Overdue share of debtors", value: `${k.overdue_pct.toFixed(0)}%`, rag: r(k.overdue_pct, 10, 30, false), why: "Share of money owed to you that is already past its due date." },
    { key: "pm", label: "Parts margin", value: `${k.parts_margin_pct.toFixed(0)}%`, rag: r(k.parts_margin_pct, 30, 15), why: "Mark-up on parts where you've recorded the cost price." },
    { key: "rep", label: "Repeat customers", value: `${k.repeat_customer_pct.toFixed(0)}%`, rag: r(k.repeat_customer_pct, 25, 10), why: "Customers who have come back for a second job in this period." },
    { key: "run", label: "Cash runway", value: `${k.runway_months.toFixed(1)} months`, rag: r(k.runway_months, 3, 1.5), why: "How long today's bank balance covers your average monthly spend." },
  ];
}

export function kpiLabel(k: KpiKey): string {
  return { gross_margin_pct: "Gross margin %", net_margin_pct: "Net margin %", avg_invoice_pence: "Average invoice (£)", dso_days: "Days to get paid", repeat_customer_pct: "Repeat customers %", revenue_per_job_pence: "Revenue per job (£)", parts_margin_pct: "Parts margin %" }[k];
}

export function kpiValue(k: Kpis, key: KpiKey): number {
  return key.endsWith("_pence") ? k[key] / 100 : k[key];
}

export function defaultBenchmarkSettings(s: BillingSettings) {
  return s.benchmarks;
}
