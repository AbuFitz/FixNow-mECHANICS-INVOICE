import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, GripVertical, Settings2 } from "lucide-react";
import { format } from "date-fns";
import { Badge, Button, Card, Dialog, PageHeader, SectionTitle, Spinner, Stat, Tabs, Toggle, useDisclosure } from "@/components/ui";
import { BarsChart, Meter } from "@/components/charts";
import { PeriodPicker } from "@/components/PeriodPicker";
import { useBooks } from "@/lib/useLedger";
import { useCollection, useSaveRow } from "@/lib/hooks";
import { resolvePeriod, type PeriodKey } from "@/lib/periods";
import { AGE_LABEL, agedCreditors, agedDebtors, bankBalance, bucketTotals, computeKpis, kpiLabel, kpiValue, monthlySeries, profitAndLoss, scorecard, type AgeBucket } from "@/lib/acct/reports";
import { gbp } from "@/lib/money";
import { computeTotals } from "@/lib/totals";
import { downloadText, toCsv } from "@/lib/csv";
import { d, uid } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Preset } from "@/lib/types";

type Tab = "dashboard" | "pnl" | "aged" | "margins" | "health";
const WIDGETS = [
  { id: "headline", label: "Headline numbers" },
  { id: "trend", label: "Income vs spend" },
  { id: "customers", label: "Top customers" },
  { id: "categories", label: "Where the money goes" },
  { id: "kpis", label: "Key ratios" },
  { id: "owed", label: "Who owes you" },
] as const;
type WidgetId = (typeof WIDGETS)[number]["id"];

export function Reports() {
  const books = useBooks();
  const { data: presets } = useCollection("presets");
  const savePreset = useSaveRow("presets");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [period, setPeriod] = useState<PeriodKey>("last_12");
  const [custom, setCustom] = useState({ from: "2026-04-06", to: "2027-04-05" });
  const cfg = useDisclosure();
  const range = resolvePeriod(period, custom);

  const saved = (presets ?? []).find((p) => p.kind === "note" && p.label === "dashboard");
  const enabled: WidgetId[] = (saved?.payload.widgets as WidgetId[]) ?? WIDGETS.map((w) => w.id);

  const pnl = useMemo(() => profitAndLoss(books.ledger, books.accounts, range.from, range.to), [books.ledger, books.accounts, range.from, range.to]);
  const cash = books.bankAccounts.reduce((a, b) => a + bankBalance(b, books.bankTxns), 0);
  const kpis = useMemo(() => computeKpis({ lines: books.ledger, accounts: books.accounts, docs: books.docs, payments: books.payments, cash, from: range.from, to: range.to }), [books.ledger, books.accounts, books.docs, books.payments, cash, range.from, range.to]);
  if (books.loading) return <Spinner label="Crunching the numbers" />;

  const series = monthlySeries(books.ledger, range.from, range.to);
  const debtors = agedDebtors(books.docs);
  const creditors = agedCreditors(books.bills);

  const byCustomer = new Map<string, number>();
  books.docs.filter((x) => x.lifecycle === "issued" && (x.doc_type === "invoice" || x.doc_type === "receipt") && (x.issued_at ?? "") >= range.from && (x.issued_at ?? "") <= range.to).forEach((x) => byCustomer.set(x.content.customer.name, (byCustomer.get(x.content.customer.name) ?? 0) + computeTotals(x.content).net_pence));
  const topCustomers = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const spendRows = [...pnl.cost_of_sales, ...pnl.expenses, ...pnl.payroll].sort((a, b) => b.amount_pence - a.amount_pence).slice(0, 6);
  const maxSpend = Math.max(1, ...spendRows.map((r) => r.amount_pence));

  async function setWidgets(ids: WidgetId[]) {
    const p: Preset = saved ?? { id: uid(), kind: "note", label: "dashboard", payload: {}, sort: 0 };
    await savePreset.mutateAsync({ ...p, payload: { ...p.payload, widgets: ids } });
  }

  const widgets: Record<WidgetId, React.ReactNode> = {
    headline: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales (ex VAT)" value={gbp(pnl.totals.income)} />
        <Stat label="Gross profit" value={gbp(pnl.totals.gross_profit)} sub={`${kpis.gross_margin_pct.toFixed(0)}% margin`} />
        <Stat label="Overheads & wages" value={gbp(pnl.totals.expenses + pnl.totals.payroll)} />
        <Stat label="Net profit" value={gbp(pnl.totals.net_profit)} tone={pnl.totals.net_profit < 0 ? "danger" : "success"} sub={`${kpis.net_margin_pct.toFixed(0)}% margin`} />
      </div>
    ),
    trend: (
      <Card className="p-5">
        <SectionTitle>Income vs spend</SectionTitle>
        <div className="mt-4"><BarsChart data={series.map((s) => ({ label: format(new Date(`${s.month}-01`), "MMM"), a: s.income, b: s.spend }))} /></div>
      </Card>
    ),
    customers: (
      <Card className="p-5">
        <SectionTitle>Top customers</SectionTitle>
        <ul className="mt-3 space-y-3">{topCustomers.map(([n, v]) => <li key={n}><div className="flex justify-between text-sm"><span className="truncate pr-3">{n}</span><span className="num font-semibold">{gbp(v)}</span></div><Meter pct={(v / (topCustomers[0]?.[1] || 1)) * 100} /></li>)}{topCustomers.length === 0 ? <li className="text-sm text-muted-foreground">No sales in this period.</li> : null}</ul>
      </Card>
    ),
    categories: (
      <Card className="p-5">
        <SectionTitle>Where the money goes</SectionTitle>
        <ul className="mt-3 space-y-3">{spendRows.map((r) => <li key={r.account}><div className="flex justify-between text-sm"><span className="truncate pr-3">{r.name}</span><span className="num font-semibold">{gbp(r.amount_pence)}</span></div><Meter pct={(r.amount_pence / maxSpend) * 100} tone="danger" /></li>)}{spendRows.length === 0 ? <li className="text-sm text-muted-foreground">No spending in this period.</li> : null}</ul>
      </Card>
    ),
    kpis: (
      <Card className="p-5">
        <SectionTitle>Key ratios</SectionTitle>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {[["Gross margin", `${kpis.gross_margin_pct.toFixed(1)}%`], ["Net margin", `${kpis.net_margin_pct.toFixed(1)}%`], ["Average job value", gbp(kpis.avg_invoice_pence)], ["Days to get paid", `${kpis.dso_days}`], ["Parts margin", `${kpis.parts_margin_pct.toFixed(1)}%`], ["Repeat customers", `${kpis.repeat_customer_pct.toFixed(0)}%`]].map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="num font-display text-xl font-bold">{v}</dd></div>)}
        </dl>
      </Card>
    ),
    owed: (
      <Card className="p-5">
        <SectionTitle>Who owes you</SectionTitle>
        <ul className="mt-3 divide-y divide-hairline">{debtors.slice(0, 5).map((r) => <li key={r.id}><Link to={`/documents/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{r.who}</span><span className="mono text-muted-foreground">{r.ref}</span></span><span className="text-right"><span className="num block font-semibold">{gbp(r.balance_pence)}</span>{r.days_late ? <span className="text-xs text-destructive">{r.days_late}d overdue</span> : <span className="text-xs text-muted-foreground">due {d(r.due)}</span>}</span></Link></li>)}{debtors.length === 0 ? <li className="py-2 text-sm text-muted-foreground">Nobody owes you anything. 🎉</li> : null}</ul>
      </Card>
    ),
  };

  const exportPnl = () => downloadText(`fixnow-pnl-${range.from}-to-${range.to}.csv`, toCsv([["Group", "Code", "Account", "Amount (£)"], ...([["Income", pnl.income], ["Cost of sales", pnl.cost_of_sales], ["Expenses", pnl.expenses], ["Payroll", pnl.payroll], ["Other income", pnl.other_income]] as const).flatMap(([g, rs]) => rs.map((r) => [g, r.account, r.name, r.amount_pence / 100])), ["", "", "Net profit", pnl.totals.net_profit / 100]]));

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${d(range.from)} – ${d(range.to)} · ${books.settings.tax.accounting_basis === "cash" ? "cash" : "accrual"} basis`} actions={<PeriodPicker value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} />} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "dashboard", label: "My dashboard" }, { value: "pnl", label: "Profit & loss" }, { value: "aged", label: "Debtors & creditors" }, { value: "margins", label: "Job margins" }, { value: "health", label: "Health scorecard" }]} />

      <div className="mt-5 space-y-5">
        {tab === "dashboard" ? (
          <>
            <div className="flex justify-end"><Button size="sm" onClick={cfg.show}><Settings2 className="h-4 w-4" /> Customise</Button></div>
            {enabled.includes("headline") ? widgets.headline : null}
            <div className="grid gap-5 lg:grid-cols-2">{enabled.filter((w) => w !== "headline").map((w) => <div key={w} className={cn(w === "trend" && "lg:col-span-2")}>{widgets[w]}</div>)}</div>
          </>
        ) : null}

        {tab === "pnl" ? (
          <Card className="p-5">
            <SectionTitle action={<Button size="sm" onClick={exportPnl}><Download className="h-4 w-4" /> CSV</Button>}>Profit & loss</SectionTitle>
            <div className="mt-4 space-y-5 text-sm">
              {([["Income", pnl.income, pnl.totals.income], ["Cost of sales", pnl.cost_of_sales, pnl.totals.cost_of_sales]] as const).map(([t, rows, tot]) => (
                <div key={t}><p className="eyebrow mb-1 text-muted-foreground">{t}</p>{rows.map((r) => <div key={r.account} className="flex justify-between py-1.5"><span>{r.name}</span><span className="num">{gbp(r.amount_pence)}</span></div>)}<div className="flex justify-between border-t border-hairline py-1.5 font-semibold"><span>Total {t.toLowerCase()}</span><span className="num">{gbp(tot)}</span></div></div>
              ))}
              <div className="flex justify-between rounded-xl bg-ink p-3 font-display text-base font-bold text-ink-foreground"><span>Gross profit</span><span className="num text-signal">{gbp(pnl.totals.gross_profit)}</span></div>
              {([["Operating expenses", pnl.expenses, pnl.totals.expenses], ["Wages & employer costs", pnl.payroll, pnl.totals.payroll]] as const).map(([t, rows, tot]) => rows.length ? (
                <div key={t}><p className="eyebrow mb-1 text-muted-foreground">{t}</p>{rows.map((r) => <div key={r.account} className="flex justify-between py-1.5"><span>{r.name}</span><span className="num">{gbp(r.amount_pence)}</span></div>)}<div className="flex justify-between border-t border-hairline py-1.5 font-semibold"><span>Total</span><span className="num">{gbp(tot)}</span></div></div>
              ) : null)}
              <div className={cn("flex justify-between rounded-xl p-3 font-display text-base font-bold", pnl.totals.net_profit < 0 ? "bg-destructive/10 text-destructive" : "bg-success/12 text-success")}><span>Net profit (before tax)</span><span className="num">{gbp(pnl.totals.net_profit)}</span></div>
            </div>
          </Card>
        ) : null}

        {tab === "aged" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {([["Owed to you (debtors)", debtors], ["You owe (creditors)", creditors]] as const).map(([title, rows]) => {
              const t = bucketTotals([...rows]);
              return (
                <Card key={title} className="p-5">
                  <SectionTitle>{title}</SectionTitle>
                  <div className="mt-3 grid grid-cols-5 gap-1 text-center">{(Object.keys(AGE_LABEL) as AgeBucket[]).map((k) => <div key={k} className="rounded-lg bg-surface-2 p-2"><p className="text-[10px] font-semibold uppercase text-muted-foreground">{AGE_LABEL[k]}</p><p className={cn("num mt-1 text-sm font-bold", k !== "current" && t[k] > 0 && "text-destructive")}>{gbp(t[k])}</p></div>)}</div>
                  <ul className="mt-3 divide-y divide-hairline text-sm">{rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block truncate font-medium">{r.who}</span><span className="mono text-muted-foreground">{r.ref} · due {d(r.due)}</span></span><span className="text-right"><span className="num block font-semibold">{gbp(r.balance_pence)}</span><Badge tone={r.bucket === "current" ? "neutral" : "danger"}>{AGE_LABEL[r.bucket]}</Badge></span></li>)}{rows.length === 0 ? <li className="py-3 text-muted-foreground">Nothing outstanding.</li> : null}</ul>
                </Card>
              );
            })}
          </div>
        ) : null}

        {tab === "margins" ? (
          <Card className="overflow-hidden">
            <div className="p-5 pb-2"><SectionTitle>Job margins</SectionTitle><p className="mt-2 text-sm text-muted-foreground">Based on the cost prices you record against parts. Jobs without costs show “—”.</p></div>
            <ul className="divide-y divide-hairline">
              {books.docs.filter((x) => x.lifecycle === "issued" && (x.doc_type === "invoice" || x.doc_type === "receipt") && (x.issued_at ?? "") >= range.from && (x.issued_at ?? "") <= range.to).map((x) => ({ x, t: computeTotals(x.content) })).sort((a, b) => b.t.margin_pence - a.t.margin_pence).map(({ x, t }) => (
                <li key={x.id}><Link to={`/documents/${x.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface-2"><span className="min-w-0"><span className="block truncate font-medium">{x.content.customer.name} · {x.content.job.title}</span><span className="mono text-muted-foreground">{x.number}</span></span><span className="text-right"><span className="num block font-semibold">{gbp(t.net_pence)}</span><span className="num text-xs text-muted-foreground">{t.cost_pence ? `margin ${gbp(t.margin_pence)} (${Math.round((t.margin_pence / (t.net_pence || 1)) * 100)}%)` : "—"}</span></span></Link></li>
              ))}
            </ul>
          </Card>
        ) : null}

        {tab === "health" ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted-foreground">Rules of thumb for a small workshop — a prompt for the conversation with your accountant, not an accounting standard. Benchmarks come from figures you enter in Settings; none are assumed.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {scorecard(kpis).map((s) => (
                <Card key={s.key} className="flex gap-4 p-4">
                  <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full", s.rag === "green" ? "bg-success" : s.rag === "amber" ? "bg-warning" : "bg-destructive")} aria-label={s.rag} />
                  <div className="min-w-0"><div className="flex items-baseline justify-between gap-3"><p className="font-display font-semibold">{s.label}</p><p className="num font-display text-xl font-bold">{s.value}</p></div><p className="mt-1 text-sm text-muted-foreground">{s.why}</p></div>
                </Card>
              ))}
            </div>
            {books.settings.benchmarks.length ? (
              <Card className="p-5">
                <SectionTitle>Against your benchmarks</SectionTitle>
                <ul className="mt-3 divide-y divide-hairline text-sm">
                  {books.settings.benchmarks.map((b) => { const mine = kpiValue(kpis, b.metric); const diff = mine - b.value; return <li key={b.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block font-medium">{b.label || kpiLabel(b.metric)}</span><span className="text-xs text-muted-foreground">{b.source || "your figure"}</span></span><span className="text-right"><span className="num block">You {mine.toFixed(1)} · Benchmark {b.value}</span><span className={cn("num text-xs font-semibold", diff >= 0 ? "text-success" : "text-destructive")}>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}</span></span></li>; })}
                </ul>
              </Card>
            ) : <Card className="p-5 text-sm text-muted-foreground">No benchmarks entered yet. Add sector figures in <Link className="font-semibold underline decoration-signal decoration-2 underline-offset-4" to="/settings">Settings → Benchmarks</Link> to compare yourself against the industry.</Card>}
          </div>
        ) : null}
      </div>

      <Dialog open={cfg.open} onClose={cfg.hide} title="Customise your dashboard">
        <div className="divide-y divide-hairline">
          {WIDGETS.map((w) => <Toggle key={w.id} label={w.label} checked={enabled.includes(w.id)} onChange={(v) => setWidgets(v ? [...enabled, w.id] : enabled.filter((x) => x !== w.id)).then(() => toast.success("Dashboard updated"))} />)}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /> Saved for everyone on this account.</p>
      </Dialog>
    </div>
  );
}
