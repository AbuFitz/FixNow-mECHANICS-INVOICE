import { useState } from "react";
import { Download, FileJson, Info } from "lucide-react";
import { Badge, Button, Card, PageHeader, SectionTitle, Spinner, Stat, Tabs } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { bankBalance, agedCreditors, agedDebtors, profitAndLoss } from "@/lib/acct/reports";
import { itsaQuarters, itsaSummary } from "@/lib/acct/mtd";
import { corporationTaxEstimate } from "@/lib/acct/tax";
import { taxYearStart } from "@/lib/acct/ledger";
import { gbp } from "@/lib/money";
import { d, isoDate } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/csv";
import { paymentState } from "@/lib/status";

type Tab = "yearend" | "ct" | "itsa";

export function Tax() {
  const books = useBooks();
  const [tab, setTab] = useState<Tab>("yearend");
  const [fy, setFy] = useState(() => {
    const m = books.settings?.tax.financial_year_end_month ?? 3;
    const now = new Date();
    return now.getMonth() + 1 > m ? now.getFullYear() + 1 : now.getFullYear();
  });
  if (books.loading) return <Spinner />;

  const endMonth = books.settings.tax.financial_year_end_month;
  const end = new Date(fy, endMonth, 0);
  const start = new Date(fy - 1, endMonth, 1);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  const from = f(new Date(start.getTime() - start.getTimezoneOffset() * 6e4));
  const to = f(new Date(end.getTime() - end.getTimezoneOffset() * 6e4));
  const pnl = profitAndLoss(books.ledger, books.accounts, from, to);
  const ct = corporationTaxEstimate(pnl.totals.net_profit);
  const cash = books.bankAccounts.reduce((a, b) => a + bankBalance(b, books.bankTxns), 0);
  const debtors = agedDebtors(books.docs, to).reduce((a, r) => a + r.balance_pence, 0);
  const creditors = agedCreditors(books.bills, to).reduce((a, r) => a + r.balance_pence, 0);
  const startYear = parseInt(taxYearStart(isoDate()).slice(0, 4), 10);
  const quarters = itsaQuarters(startYear);

  const pack = () => {
    downloadText(`fixnow-sales-ledger-${fy}.csv`, toCsv([["Date", "Number", "Type", "Customer", "Status", "Net", "VAT", "Total", "Paid"], ...books.docs.filter((x) => x.lifecycle !== "draft" && x.doc_type !== "quote" && (x.issued_at ?? "") >= from && (x.issued_at ?? "") <= to).map((x) => [x.issued_at, x.number, x.doc_type, x.content.customer.name, paymentState(x), (x.total_pence - 0) / 100, "", x.total_pence / 100, x.paid_pence / 100])]));
    downloadText(`fixnow-purchase-ledger-${fy}.csv`, toCsv([["Date", "Supplier", "Ref", "Net", "VAT", "Status"], ...books.ledger.filter((l) => l.kind === "expense" && l.date >= from && l.date <= to).map((l) => [l.date, l.description, l.ref, l.net_pence / 100, l.vat_pence / 100, l.source])]));
    downloadText(`fixnow-bank-${fy}.csv`, toCsv([["Date", "Description", "Amount", "Reconciled"], ...books.bankTxns.filter((t) => t.date >= from && t.date <= to).map((t) => [t.date, t.description, t.amount_pence / 100, t.matched ? t.matched.type : "NO"])]));
    downloadText(`fixnow-trial-summary-${fy}.csv`, toCsv([["Group", "Code", "Account", "Amount"], ...[...pnl.income, ...pnl.cost_of_sales, ...pnl.expenses, ...pnl.payroll, ...pnl.other_income].map((r) => [r.group, r.account, r.name, r.amount_pence / 100])]));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Tax & year-end" subtitle="Year-end pack for your accountant, a corporation tax estimate, and MTD for Income Tax summaries." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "yearend", label: "Year-end pack" }, { value: "ct", label: "Corporation tax" }, { value: "itsa", label: "MTD Income Tax" }]} />

      {tab === "yearend" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2"><Button onClick={() => setFy(fy - 1)}>←</Button><span className="min-w-52 text-center font-display font-semibold">Year to {d(to)}</span><Button onClick={() => setFy(fy + 1)}>→</Button></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Turnover" value={gbp(pnl.totals.income)} /><Stat label="Profit before tax" value={gbp(pnl.totals.net_profit)} tone={pnl.totals.net_profit < 0 ? "danger" : undefined} /><Stat label="Bank at year-end" value={gbp(cash)} sub="Current balance" /><Stat label="Debtors / creditors" value={`${gbp(debtors)} / ${gbp(creditors)}`} /></div>
          <Card className="space-y-3 p-5">
            <SectionTitle>Accountant pack</SectionTitle>
            <p className="text-sm text-muted-foreground">Everything an accountant needs to prepare your statutory accounts and corporation tax return: sales ledger, purchase ledger, bank transactions with reconciliation status, and a category summary.</p>
            <Button variant="signal" onClick={pack}><Download className="h-4 w-4" /> Download the pack (4 CSVs)</Button>
            <p className="flex gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Filing statutory accounts at Companies House and the CT600 with HMRC requires approved software or an accountant; this pack is the input to that, not the filing itself.</p>
          </Card>
        </div>
      ) : null}

      {tab === "ct" ? (
        <Card className="space-y-4 p-5">
          <SectionTitle>Corporation tax estimate for the year to {d(to)}</SectionTitle>
          <div className="grid grid-cols-3 gap-3"><div><p className="text-sm text-muted-foreground">Profit before tax</p><p className="num font-display text-2xl font-bold">{gbp(pnl.totals.net_profit)}</p></div><div><p className="text-sm text-muted-foreground">Estimated tax</p><p className="num font-display text-2xl font-bold">{gbp(ct.tax_pence)}</p></div><div><p className="text-sm text-muted-foreground">Effective rate</p><p className="num font-display text-2xl font-bold">{ct.effective_pct.toFixed(1)}%</p></div></div>
          <Badge tone="info">{ct.band === "small" ? "Small profits rate (19%)" : ct.band === "marginal" ? "Marginal relief band" : ct.band === "main" ? "Main rate (25%)" : "No profit"}</Badge>
          <p className="text-xs text-muted-foreground">Estimate only: it ignores capital allowances, director pay, pension contributions, associated companies and other adjustments, which an accountant will apply. Corporation tax is usually due 9 months and 1 day after the year-end — put the estimate aside as you go.</p>
        </Card>
      ) : null}

      {tab === "itsa" ? (
        <div className="space-y-4">
          <Card className="border-info/30 bg-info/5 p-4 text-sm"><p className="flex gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-info" /><span><strong>Does this apply to FixNow?</strong> MTD for Income Tax is for sole traders and landlords. A limited company like FixNow Mechanics Ltd pays corporation tax and files company accounts instead — so these summaries matter only if someone in the business also has self-employment or rental income. They're built so they're ready when needed.</span></p></Card>
          <div className="grid gap-3 md:grid-cols-2">
            {quarters.map((q) => {
              const s = itsaSummary(books.ledger, books.accounts, q.start, q.end);
              const exp = Object.values(s.periodExpenses).reduce((a, b) => a + b, 0);
              return (
                <Card key={q.n} className="p-4">
                  <div className="flex items-center justify-between"><p className="font-display font-semibold">Quarter {q.n}</p><span className="text-xs text-muted-foreground">Submit by {d(q.deadline)}</span></div>
                  <p className="text-sm text-muted-foreground">{d(q.start)} – {d(q.end)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Turnover</dt><dd className="num font-display text-lg font-bold">£{s.periodIncome.turnover.toLocaleString("en-GB")}</dd></div><div><dt className="text-muted-foreground">Expenses</dt><dd className="num font-display text-lg font-bold">£{exp.toLocaleString("en-GB")}</dd></div></dl>
                  <Button size="sm" className="mt-3" onClick={() => downloadText(`itsa-q${q.n}-${startYear}.json`, JSON.stringify(s, null, 2), "application/json")}><FileJson className="h-4 w-4" /> HMRC-format JSON</Button>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
