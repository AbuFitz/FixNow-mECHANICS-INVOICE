import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Badge, Card, PageHeader, SectionTitle, Spinner, Stat, Toggle } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { useBooks } from "@/lib/useLedger";
import { bankBalance, cashForecast } from "@/lib/acct/reports";
import { vatPeriods, vatReturn, owesHmrc } from "@/lib/acct/vat";
import { payrollSummary } from "@/lib/acct/payroll";
import { gbp } from "@/lib/money";
import { d, isoDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export function CashFlow() {
  const books = useBooks();
  const [projected, setProjected] = useState(true);
  const today = isoDate();

  const f = useMemo(() => {
    if (books.loading) return null;
    const cash = books.bankAccounts.reduce((a, b) => a + bankBalance(b, books.bankTxns), 0);
    const lastRun = [...books.payRuns].sort((a, b) => b.pay_date.localeCompare(a.pay_date))[0];
    const payroll = lastRun ? payrollSummary(lastRun).employer_cost : 0;
    let vatDue = null;
    if (books.settings.business.vat_registered) {
      const cur = vatPeriods(books.settings, today, 4).find((p) => p.start <= today && today <= p.end);
      if (cur) {
        const box = vatReturn(books.ledger, cur, books.settings);
        const amount = owesHmrc(box) ? box.netVatDue : -box.netVatDue;
        vatDue = { date: cur.due, amount_pence: amount };
      }
    }
    const since = format(addDays(new Date(), -84), "yyyy-MM-dd");
    const sales = books.docs.filter((x) => x.lifecycle === "issued" && (x.doc_type === "invoice" || x.doc_type === "receipt") && (x.issued_at ?? "") >= since).reduce((a, x) => a + x.total_pence, 0);
    return { cash, ...cashForecast({ startBalance: cash, docs: books.docs, bills: books.bills, payments: books.payments, recurringBills: books.bills.filter((b) => b.repeat !== "none"), vatDue, monthlyPayrollOut: payroll, trailingWeeklySales: Math.round(sales / 12), includeProjectedSales: projected, today }) };
  }, [books, projected, today]);
  if (!f) return <Spinner />;

  const lowIdx = f.points.indexOf(f.lowest);
  const known = f.events.filter((e) => e.certainty === "known");
  return (
    <div className="space-y-5">
      <PageHeader title="180-day cash flow" subtitle="Your bank balance today, then every known payment in and out — plus an optional projection of new sales." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In the bank today" value={gbp(f.cash)} />
        <Stat label="Lowest point" value={gbp(f.lowest.balance_pence)} tone={f.lowest.balance_pence < 0 ? "danger" : undefined} sub={d(f.lowest.date)} />
        <Stat label="Balance in 30 days" value={gbp(f.points[30]!.balance_pence)} />
        <Stat label="Balance in 180 days" value={gbp(f.points[180]!.balance_pence)} />
      </div>
      {f.lowest.balance_pence < 0 ? <p className="flex items-center gap-3 rounded-2xl bg-destructive/10 p-4 text-sm font-medium text-destructive"><AlertTriangle className="h-5 w-5 shrink-0" /> Your balance is forecast to dip below zero on {d(f.lowest.date)}. Chase overdue invoices or time supplier payments to avoid it.</p> : null}
      <Card className="p-5">
        <SectionTitle>Projected bank balance</SectionTitle>
        <div className="mt-4"><LineChart points={f.points.filter((_, i) => i % 3 === 0 || i === 180).map((p) => ({ label: format(parseISO(p.date), "d MMM"), v: p.balance_pence }))} lowestIdx={Math.floor(lowIdx / 3)} /></div>
        <div className="mt-3 border-t border-hairline pt-3"><Toggle checked={projected} onChange={setProjected} label="Include projected new sales" hint="Uses your average weekly sales over the last 12 weeks. Switch off to see only money you're already owed and bills you already know about." /></div>
      </Card>
      <Card className="p-5">
        <SectionTitle>What's coming</SectionTitle>
        <ul className="mt-3 divide-y divide-hairline text-sm">
          {known.slice(0, 30).map((e, i) => <li key={i} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block truncate font-medium">{e.label}</span><span className="text-xs text-muted-foreground">{d(e.date)}</span></span><span className={cn("num font-semibold", e.amount_pence >= 0 ? "text-success" : "")}>{e.amount_pence >= 0 ? "+" : ""}{gbp(e.amount_pence)}</span></li>)}
          {known.length === 0 ? <li className="py-3 text-muted-foreground">Nothing scheduled.</li> : null}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Badge>Estimate</Badge> Customer payments are timed from their due date plus your average lateness. Corporation tax and one-off costs aren't included.</p>
      </Card>
    </div>
  );
}
