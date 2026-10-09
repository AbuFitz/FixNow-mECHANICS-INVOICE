import { useState } from "react";
import { Download, HardHat, Printer } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { Badge, Button, Card, Dialog, Empty, PageHeader, Spinner, useDisclosure } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { cisPeriod, cisReport, CIS_RATE, type CisRow } from "@/lib/acct/cis";
import { gbp } from "@/lib/money";
import { d, isoDate } from "@/lib/format";
import { downloadText, toCsv } from "@/lib/csv";

export function Cis() {
  const books = useBooks();
  const [anchor, setAnchor] = useState(isoDate());
  const stmt = useDisclosure();
  const [row, setRow] = useState<CisRow | null>(null);
  if (books.loading) return <Spinner />;
  const p = cisPeriod(anchor);
  const rows = cisReport(books.bills, books.contacts, p.start, p.end);
  const tot = rows.reduce((a, r) => ({ g: a.g + r.gross_pence, m: a.m + r.materials_pence, l: a.l + r.labour_pence, d: a.d + r.deduction_pence }), { g: 0, m: 0, l: 0, d: 0 });
  const subs = books.contacts.filter((c) => c.kind !== "customer" && c.cis_status !== "none");
  const shift = (n: number) => setAnchor(format(addMonths(parseISO(p.end), n), "yyyy-MM-dd"));

  return (
    <div className="space-y-5">
      <PageHeader title="Construction Industry Scheme" subtitle="Subcontractor deductions on labour, monthly return summary and payment statements." actions={<><Button onClick={() => shift(-1)}>←</Button><span className="min-w-44 text-center font-display font-semibold">{d(p.start)} – {d(p.end)}</span><Button onClick={() => shift(1)}>→</Button></>} />
      <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted-foreground">CIS only applies to payments for construction work. If none of your subcontractors do construction operations, you don't need it — leave suppliers as “Not a CIS subcontractor”. Mark a supplier as a CIS subcontractor (Suppliers → CIS status), then flag the <em>labour</em> lines on their bills; materials are never deducted from. The monthly CIS300 return itself is filed with HMRC (due by the 19th) — this page produces the figures.</p>
      {rows.length === 0 ? <Empty icon={<HardHat className="h-5 w-5" />} title="No CIS payments in this period" body={subs.length ? "Enter a bill from a CIS subcontractor and tick its labour lines." : "No suppliers are set as CIS subcontractors."} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Gross payments", tot.g], ["Materials", tot.m], ["Labour", tot.l], ["CIS deducted", tot.d]].map(([k, v]) => <Card key={k as string} className="p-4"><p className="eyebrow text-muted-foreground">{k}</p><p className="num mt-2 font-display text-2xl font-bold">{gbp(v as number)}</p></Card>)}</div>
          <Card className="divide-y divide-hairline">
            {rows.map((r) => (
              <div key={r.contact_id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div><p className="font-display text-base font-semibold">{r.name}</p><p className="text-muted-foreground">UTR {r.utr || "—"} · <Badge tone="info">{r.status} {Math.round(CIS_RATE[r.status] * 100)}%</Badge></p></div>
                <dl className="grid grid-cols-4 gap-4 text-right"><div><dt className="text-xs text-muted-foreground">Gross</dt><dd className="num font-semibold">{gbp(r.gross_pence)}</dd></div><div><dt className="text-xs text-muted-foreground">Materials</dt><dd className="num">{gbp(r.materials_pence)}</dd></div><div><dt className="text-xs text-muted-foreground">Deducted</dt><dd className="num font-semibold text-info">{gbp(r.deduction_pence)}</dd></div><div><dt className="text-xs text-muted-foreground">Net paid</dt><dd className="num font-semibold">{gbp(r.net_paid_pence)}</dd></div></dl>
                <Button size="sm" onClick={() => { setRow(r); stmt.show(); }}><Printer className="h-4 w-4" /> Statement</Button>
              </div>
            ))}
          </Card>
          <Button onClick={() => downloadText(`cis-${p.label}.csv`, toCsv([["Subcontractor", "UTR", "Status", "Gross (£)", "Materials (£)", "Labour (£)", "Deducted (£)", "Net paid (£)"], ...rows.map((r) => [r.name, r.utr, r.status, r.gross_pence / 100, r.materials_pence / 100, r.labour_pence / 100, r.deduction_pence / 100, r.net_paid_pence / 100])]))}><Download className="h-4 w-4" /> Export return summary (CSV)</Button>
        </>
      )}
      <Dialog open={stmt.open} onClose={stmt.hide} title="Payment & deduction statement" footer={<><Button onClick={stmt.hide}>Close</Button><Button variant="signal" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button></>}>
        {row ? (
          <div className="space-y-3 text-sm">
            <p className="font-display text-lg font-semibold">{books.settings.business.legal_name}</p>
            <p>Statement for <strong>{row.name}</strong> (UTR {row.utr || "—"}) · tax month {d(p.start)} – {d(p.end)}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5"><dt>Gross amount paid (ex VAT)</dt><dd className="num">{gbp(row.gross_pence)}</dd><dt>Cost of materials</dt><dd className="num">{gbp(row.materials_pence)}</dd><dt>Amount liable to deduction</dt><dd className="num">{gbp(row.labour_pence)}</dd><dt>Deducted ({Math.round(CIS_RATE[row.status] * 100)}%)</dt><dd className="num font-semibold">{gbp(row.deduction_pence)}</dd><dt className="font-semibold">Net payment</dt><dd className="num font-semibold">{gbp(row.net_paid_pence)}</dd></dl>
            <p className="text-xs text-muted-foreground">Keep for your tax records. Contractor: {books.settings.business.legal_name}.</p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
