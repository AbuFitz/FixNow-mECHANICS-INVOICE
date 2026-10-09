import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Banknote, CalendarClock, FileText, MessageSquareWarning, Plus, Wrench } from "lucide-react";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { Badge, Button, Card, PageHeader, SectionTitle, Spinner, Stat } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { DocStatus } from "@/components/StatusBadges";
import { useBooks } from "@/lib/useLedger";
import { useInfoRequests, useJobs, useReports } from "@/lib/hooks";
import { balanceDue } from "@/lib/status";
import { gbp } from "@/lib/money";
import { DOC_LABEL } from "@/lib/defaults";
import { d, isoDate } from "@/lib/format";
import { monthlySeries, bankBalance, agedDebtors } from "@/lib/acct/reports";
import { vatPeriods, vatReturn } from "@/lib/acct/vat";
import { jobBilledDocs } from "@/lib/jobBridge";
import { suggest } from "@/lib/acct/bank";

export function Dashboard() {
  const books = useBooks();
  const jobs = useJobs();
  const reports = useReports();
  const requests = useInfoRequests();
  if (books.loading || jobs.isLoading) return <Spinner label="Loading your books" />;

  const today = isoDate();
  const { docs, ledger, settings } = books;
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const from = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");
  const series = monthlySeries(ledger, from, format(addMonths(startOfMonth(new Date()), 1), "yyyy-MM-dd")).slice(0, 6);
  const thisMonth = series[series.length - 1];
  const inv = docs.filter((x) => x.doc_type === "invoice" && x.lifecycle === "issued");
  const outstanding = inv.reduce((a, x) => a + balanceDue(x), 0);
  const overdueRows = agedDebtors(docs, today).filter((r) => r.bucket !== "current");
  const overdue = overdueRows.reduce((a, r) => a + r.balance_pence, 0);
  const cash = books.bankAccounts.reduce((a, b) => a + bankBalance(b, books.bankTxns), 0);

  const completed = (jobs.data ?? []).filter((j) => j.status === "completed");
  const unbilled = completed.filter((j) => jobBilledDocs(j.id, docs).length === 0);
  const needsInfo = (requests.data ?? []).filter((r) => r.status === "open");
  const quotesWaiting = docs.filter((x) => x.doc_type === "quote" && x.lifecycle === "issued" && x.quote_outcome === "pending");
  const drafts = docs.filter((x) => x.lifecycle === "draft");
  const unreconciled = books.bankTxns.filter((t) => !t.matched);
  const suggested = unreconciled.filter((t) => suggest(t, { docs, bills: books.bills, expenses: books.expenses, rules: [] }).length > 0).length;

  const periods = vatPeriods(settings, today, 4);
  const cur = periods.find((p) => p.start <= today && today <= p.end);
  const vatBox = settings.business.vat_registered && cur ? vatReturn(ledger, cur, settings) : null;

  const attention: { icon: React.ReactNode; title: string; sub: string; to: string; tone?: "danger" }[] = [];
  if (unbilled.length) attention.push({ icon: <Wrench className="h-5 w-5" />, title: `${unbilled.length} completed job${unbilled.length > 1 ? "s" : ""} ready to bill`, sub: "Create the receipt or invoice from the engineer's report in one tap.", to: "/jobs" });
  if (needsInfo.length) attention.push({ icon: <MessageSquareWarning className="h-5 w-5" />, title: `${needsInfo.length} question${needsInfo.length > 1 ? "s" : ""} waiting on an engineer`, sub: "Missing details are holding up paperwork.", to: "/jobs" });
  if (overdueRows.length) attention.push({ icon: <AlertCircle className="h-5 w-5" />, title: `${overdueRows.length} overdue invoice${overdueRows.length > 1 ? "s" : ""} — ${gbp(overdue)}`, sub: "Send a reminder with the link and payment details.", to: "/documents?tab=overdue", tone: "danger" });
  if (quotesWaiting.length) attention.push({ icon: <FileText className="h-5 w-5" />, title: `${quotesWaiting.length} quote${quotesWaiting.length > 1 ? "s" : ""} awaiting a reply`, sub: "Chase while the job is fresh.", to: "/documents?tab=quote" });
  if (drafts.length) attention.push({ icon: <FileText className="h-5 w-5" />, title: `${drafts.length} draft${drafts.length > 1 ? "s" : ""} to finish`, sub: "Started but never issued.", to: "/documents?tab=draft" });
  if (unreconciled.length) attention.push({ icon: <Banknote className="h-5 w-5" />, title: `${unreconciled.length} bank transaction${unreconciled.length > 1 ? "s" : ""} to reconcile`, sub: suggested ? `${suggested} have suggested matches.` : "Match them to invoices and bills.", to: "/banking" });
  if (vatBox && cur) attention.push({ icon: <CalendarClock className="h-5 w-5" />, title: `VAT return due ${d(cur.due)}`, sub: `Current quarter estimate: ${vatBox.totalVatDue >= vatBox.vatReclaimedCurrPeriod ? "pay" : "reclaim"} ${gbp(vatBox.netVatDue)}.`, to: "/vat" });

  const recent = [...docs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Good to see you"
        subtitle={format(new Date(), "EEEE d MMMM yyyy")}
        actions={
          <>
            <Link to="/documents/new?type=receipt"><Button variant="signal"><Plus className="h-4 w-4" /> New receipt</Button></Link>
            <Link to="/documents/new?type=invoice"><Button variant="ink"><Plus className="h-4 w-4" /> Invoice</Button></Link>
            <Link to="/documents/new?type=quote"><Button><Plus className="h-4 w-4" /> Quote</Button></Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales this month" value={gbp(thisMonth?.income ?? 0)} sub={`Spend ${gbp(thisMonth?.spend ?? 0)}`} />
        <Stat label="Profit this month" value={gbp(thisMonth?.profit ?? 0)} tone={(thisMonth?.profit ?? 0) < 0 ? "danger" : undefined} sub={`since ${d(monthStart)}`} />
        <Stat label="Owed to you" value={gbp(outstanding)} sub={overdue ? <span className="font-semibold text-destructive">{gbp(overdue)} overdue</span> : "Nothing overdue"} />
        <Stat label="In the bank" value={gbp(cash)} sub={books.bankAccounts.length ? "From imported transactions" : "Add a bank account"} />
      </div>

      {attention.length ? (
        <section aria-label="Needs attention" className="space-y-3">
          <SectionTitle>Needs your attention</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {attention.map((a) => (
              <Link key={a.title} to={a.to} className="press group">
                <Card className="flex items-center gap-4 p-4 transition-shadow group-hover:shadow-lift">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${a.tone === "danger" ? "bg-destructive/12 text-destructive" : "bg-signal/30"}`}>{a.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-semibold leading-snug">{a.title}</span>
                    <span className="block text-sm text-muted-foreground">{a.sub}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <SectionTitle action={<div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink" />Income</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-signal" />Spend</span></div>}>Last six months</SectionTitle>
          <div className="mt-4"><BarsChart data={series.map((s) => ({ label: format(new Date(`${s.month}-01`), "MMM"), a: s.income, b: s.spend }))} /></div>
        </Card>
        <Card className="p-5">
          <SectionTitle action={<Link className="text-sm font-semibold underline decoration-signal decoration-2 underline-offset-4" to="/documents">All</Link>}>Recent paperwork</SectionTitle>
          <ul className="mt-3 divide-y divide-hairline">
            {recent.map((x) => (
              <li key={x.id}>
                <Link to={`/documents/${x.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:bg-surface-2/60">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{x.content.customer.name || "No name yet"}</span>
                    <span className="mono block truncate text-muted-foreground">{x.number ?? "Draft"} · {DOC_LABEL[x.doc_type]}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num font-display text-sm font-semibold">{gbp(x.total_pence)}</span>
                    <DocStatus doc={x} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {completed.length === 0 && (reports.data ?? []).length === 0 ? <Badge>No tracker jobs found yet</Badge> : null}
    </div>
  );
}
