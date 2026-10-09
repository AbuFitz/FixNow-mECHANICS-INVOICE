import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileJson, Lock } from "lucide-react";
import { Badge, Button, Card, Dialog, PageHeader, Select, Spinner, TextField, useDisclosure } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { useCollection, useSaveRow } from "@/lib/hooks";
import { hmrcVatPayload, owesHmrc, vatPeriods, vatReturn } from "@/lib/acct/vat";
import { inRange } from "@/lib/acct/ledger";
import { gbp } from "@/lib/money";
import { d, isoDate, uid } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/csv";
import { Link } from "react-router-dom";

export function Vat() {
  const books = useBooks();
  const { data: returns } = useCollection("vat_returns");
  const save = useSaveRow("vat_returns");
  const submit = useDisclosure();
  const [idx, setIdx] = useState(-1);
  const [receipt, setReceipt] = useState("");
  const periods = useMemo(() => (books.loading ? [] : vatPeriods(books.settings, isoDate(), 8).reverse()), [books.loading, books.settings]);
  if (books.loading) return <Spinner />;

  if (!books.settings.business.vat_registered) {
    return (
      <div>
        <PageHeader title="VAT returns" />
        <Card className="p-6"><p className="font-display text-lg font-semibold">VAT isn't switched on</p><p className="mt-1 text-sm text-muted-foreground">FixNow is currently set up as not VAT registered, so no VAT is charged or reclaimed. Once you register (it's compulsory when taxable turnover passes the HMRC threshold — check gov.uk for the current figure), turn it on in Settings and this page builds your return automatically.</p><Link to="/settings" className="mt-4 inline-block"><Button variant="signal">Open VAT settings</Button></Link></Card>
      </div>
    );
  }
  const cur = periods[idx < 0 ? periods.findIndex((p) => p.start <= isoDate() && isoDate() <= p.end) : idx] ?? periods[0]!;
  const boxes = vatReturn(books.ledger, cur, books.settings);
  const rec = (returns ?? []).find((r) => r.period_start === cur.start);
  const payload = hmrcVatPayload(rec?.period_key || cur.key, boxes);
  const lines = books.ledger.filter((l) => inRange(l.date, cur.start, cur.end) && l.source !== "payroll" && (l.vat_pence !== 0 || l.net_pence !== 0));
  const pay = owesHmrc(boxes);
  const BOX: [string, string, number][] = [
    ["1", "VAT due on sales", boxes.vatDueSales], ["2", "VAT due on EU acquisitions", boxes.vatDueAcquisitions], ["3", "Total VAT due", boxes.totalVatDue], ["4", "VAT reclaimed on purchases", boxes.vatReclaimedCurrPeriod], ["5", "Net VAT to pay / reclaim", boxes.netVatDue],
    ["6", "Total sales (ex VAT)", boxes.totalValueSalesExVAT], ["7", "Total purchases (ex VAT)", boxes.totalValuePurchasesExVAT], ["8", "Supplies to EU (ex VAT)", 0], ["9", "Acquisitions from EU (ex VAT)", 0],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="VAT returns" subtitle={`${books.settings.tax.vat_scheme === "cash" ? "Cash accounting" : books.settings.tax.vat_scheme === "flat_rate" ? `Flat rate scheme (${books.settings.tax.flat_rate_percent}%)` : "Standard accounting"} · ${books.settings.tax.vat_frequency}`} actions={<Select aria-label="VAT period" className="w-auto" value={periods.indexOf(cur)} onChange={(e) => setIdx(Number(e.target.value))}>{periods.map((p, i) => <option key={p.start} value={i}>{d(p.start)} – {d(p.end)}</option>)}</Select>} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ink p-5 text-ink-foreground">
          <div><p className="eyebrow text-white/60">{pay ? "You owe HMRC" : "HMRC owes you"}</p><p className="num font-display text-4xl font-bold text-signal">{gbp(boxes.netVatDue)}</p></div>
          <div className="text-right text-sm"><p className="text-white/60">Due by</p><p className="font-display text-lg font-semibold">{d(cur.due)}</p>{rec ? <Badge tone={rec.status === "submitted" ? "success" : "signal"}>{rec.status}</Badge> : <Badge>open</Badge>}</div>
        </div>
        <dl className="divide-y divide-hairline">
          {BOX.map(([n, label, v]) => <div key={n} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><dt className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 font-display text-xs font-bold">{n}</span>{label}</dt><dd className="num font-semibold">{Number(n) >= 6 ? `£${Math.floor(v / 100).toLocaleString("en-GB")}` : gbp(v)}</dd></div>)}
        </dl>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => downloadText(`vat-${cur.start}.csv`, toCsv([["Date", "Source", "Ref", "Description", "Account", "Net", "VAT", "Rate"], ...lines.map((l) => [l.date, l.source, l.ref, l.description, l.account, l.net_pence / 100, l.vat_pence / 100, l.vat_rate])]))}><Download className="h-4 w-4" /> Transactions behind this return</Button>
        <Button onClick={() => downloadText(`vat-${cur.start}-hmrc.json`, JSON.stringify(payload, null, 2), "application/json")}><FileJson className="h-4 w-4" /> HMRC payload (JSON)</Button>
        <Button variant="ink" onClick={submit.show}><CheckCircle2 className="h-4 w-4" /> Record as submitted</Button>
      </div>

      <Card className="space-y-2 p-5 text-sm">
        <p className="flex items-center gap-2 font-display font-semibold"><Lock className="h-4 w-4" /> Submitting to HMRC</p>
        <p className="text-muted-foreground">Making Tax Digital for VAT must be filed from software HMRC recognises. This page prepares the exact nine-box figures and the MTD payload; connecting the HMRC VAT API needs your HMRC developer application, client credentials and sandbox sign-off (the steps are in <code className="mono">docs/INTEGRATIONS.md</code>). Until that's connected, copy the boxes into your HMRC online account — or hand the CSV and JSON to your accountant — then record the submission here with the receipt number so the period is locked in your records.</p>
        <a className="inline-flex items-center gap-1.5 font-semibold underline decoration-signal decoration-2 underline-offset-4" href="https://www.gov.uk/guidance/use-software-to-submit-your-vat-returns" target="_blank" rel="noreferrer">HMRC guidance <ExternalLink className="h-3.5 w-3.5" /></a>
        {lines.some((l) => l.vat_rate > 0 && l.vat_pence === 0) ? <p className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /> Some lines carry a VAT rate but no VAT — check them.</p> : null}
      </Card>

      <Dialog open={submit.open} onClose={submit.hide} title="Record submission" footer={<><Button onClick={submit.hide}>Cancel</Button><Button variant="signal" onClick={async () => { await save.mutateAsync({ id: rec?.id ?? uid(), period_key: payload.periodKey, period_start: cur.start, period_end: cur.end, due_date: cur.due, status: "submitted", boxes, submitted_at: new Date().toISOString(), hmrc_receipt: receipt || null, created_at: rec?.created_at ?? new Date().toISOString() }); submit.hide(); toast.success("Recorded"); }}>Save</Button></>}>
        <div className="space-y-3"><p className="text-sm text-muted-foreground">Store the figures exactly as filed, with HMRC's receipt reference.</p><TextField label="HMRC receipt / form bundle number" value={receipt} onChange={(e) => setReceipt(e.target.value)} /></div>
      </Dialog>
    </div>
  );
}
