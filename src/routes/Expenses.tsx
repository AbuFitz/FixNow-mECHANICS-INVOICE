import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Car, CheckCircle2, Plus, Receipt, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, Segmented, Select, SelectField, Spinner, Tabs, TextField, useDisclosure } from "@/components/ui";
import { CaptureButton } from "@/components/CaptureButton";
import { useCollection, useRemoveRow, useSaveRow, useSettings } from "@/lib/hooks";
import type { Expense } from "@/lib/types";
import { d, isoDate, uid } from "@/lib/format";
import { gbp, CURRENCIES } from "@/lib/money";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";
import { mileageAmount, taxYearStart } from "@/lib/acct/ledger";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/images";

type Tab = "submitted" | "approved" | "reimbursed" | "all";
const blank = (kind: Expense["kind"]): Expense => ({ id: uid(), kind, claimant: "", date: isoDate(), description: "", account: kind === "mileage" ? "411" : "403", gross_pence: 0, vat_pence: 0, currency: "GBP", fx_rate: 1, miles: 0, from_to: "", status: "submitted", attachment_url: null, project_id: null, created_at: new Date().toISOString() });

export function Expenses() {
  const { data, isLoading } = useCollection("expenses");
  const { data: employees } = useCollection("employees");
  const { data: projects } = useCollection("projects");
  const { data: settings } = useSettings();
  const save = useSaveRow("expenses");
  const remove = useRemoveRow("expenses");
  const dlg = useDisclosure();
  const [edit, setEdit] = useState<Expense | null>(null);
  const [tab, setTab] = useState<Tab>("submitted");
  const rows = useMemo(() => (data ?? []).filter((e) => (tab === "all" ? true : e.status === tab)).sort((a, b) => b.date.localeCompare(a.date)), [data, tab]);
  if (isLoading || !settings) return <Spinner />;

  const people = [...new Set([...(employees ?? []).map((e) => e.name), ...(data ?? []).map((e) => e.claimant)].filter(Boolean))];
  const ytdMiles = (e: Expense) => (data ?? []).filter((x) => x.kind === "mileage" && x.id !== e.id && x.claimant === e.claimant && taxYearStart(x.date) === taxYearStart(e.date) && x.date <= e.date && (x.status === "approved" || x.status === "reimbursed")).reduce((a, x) => a + x.miles, 0);
  const preview = edit?.kind === "mileage" ? mileageAmount(edit.miles, ytdMiles(edit), settings.tax.mileage_rate_first_10k_pence, settings.tax.mileage_rate_after_10k_pence) : 0;
  const amountOf = (e: Expense) => (e.kind === "mileage" ? mileageAmount(e.miles, ytdMiles(e), settings.tax.mileage_rate_first_10k_pence, settings.tax.mileage_rate_after_10k_pence) : e.gross_pence);
  const setStatus = (e: Expense, status: Expense["status"]) => save.mutateAsync({ ...e, status });

  const totals = { pending: (data ?? []).filter((e) => e.status === "submitted").reduce((a, e) => a + amountOf(e), 0), owed: (data ?? []).filter((e) => e.status === "approved").reduce((a, e) => a + amountOf(e), 0) };

  return (
    <div>
      <PageHeader title="Expenses & mileage" subtitle="Claims from you and your engineers — approve, reimburse and it all lands in the books." actions={
        <>
          <CaptureButton label="Scan receipt" onCaptured={(c, f) => { const e = blank("receipt"); e.description = c.description || c.supplier; e.date = c.date || e.date; e.gross_pence = c.gross_pence; e.vat_pence = c.vat_pence; e.currency = c.currency || "GBP"; setEdit(e); dlg.show(); compressImage(f).then((b) => api.files.uploadImage(b, "expenses")).then((url) => setEdit((x) => (x ? { ...x, attachment_url: url } : x))).catch(() => undefined); }} />
          <Button onClick={() => { setEdit(blank("mileage")); dlg.show(); }}><Car className="h-4 w-4" /> Mileage</Button>
          <Button variant="signal" onClick={() => { setEdit(blank("receipt")); dlg.show(); }}><Plus className="h-4 w-4" /> Expense</Button>
        </>
      } />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="eyebrow text-muted-foreground">Awaiting approval</p><p className="num mt-2 font-display text-2xl font-bold">{gbp(totals.pending)}</p></Card>
        <Card className="p-4"><p className="eyebrow text-muted-foreground">Approved, to reimburse</p><p className="num mt-2 font-display text-2xl font-bold">{gbp(totals.owed)}</p></Card>
      </div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "submitted", label: "To approve", count: (data ?? []).filter((e) => e.status === "submitted").length }, { value: "approved", label: "To reimburse", count: (data ?? []).filter((e) => e.status === "approved").length }, { value: "reimbursed", label: "Reimbursed" }, { value: "all", label: "All" }]} />
      <div className="mt-4 space-y-2.5">
        {rows.length === 0 ? <Empty icon={<Receipt className="h-5 w-5" />} title="No claims here" /> : null}
        {rows.map((e) => (
          <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2">{e.kind === "mileage" ? <Car className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => { setEdit(structuredClone(e)); dlg.show(); }}>
              <p className="truncate font-display font-semibold">{e.description || (e.kind === "mileage" ? "Mileage" : "Expense")}</p>
              <p className="text-sm text-muted-foreground">{e.claimant} · {d(e.date)}{e.kind === "mileage" ? ` · ${e.miles} mi` : ""}</p>
            </button>
            <p className="num font-display font-bold">{gbp(amountOf(e))}</p>
            {e.status === "submitted" ? (
              <div className="flex gap-1.5"><Button size="sm" variant="ink" onClick={() => setStatus(e, "approved")}><CheckCircle2 className="h-4 w-4" /> Approve</Button><Button size="sm" aria-label="Reject" onClick={() => setStatus(e, "rejected")}><XCircle className="h-4 w-4" /></Button></div>
            ) : e.status === "approved" ? <Button size="sm" variant="signal" onClick={() => setStatus(e, "reimbursed")}>Mark reimbursed</Button> : <Badge tone={e.status === "reimbursed" ? "success" : "danger"}>{e.status}</Badge>}
          </Card>
        ))}
      </div>

      <Dialog open={dlg.open} onClose={dlg.hide} title={edit?.kind === "mileage" ? "Mileage claim" : "Expense claim"} wide footer={edit ? <>{data?.some((x) => x.id === edit.id) ? <Button variant="danger" onClick={async () => { await remove.mutateAsync(edit.id); dlg.hide(); }}><Trash2 className="h-4 w-4" /></Button> : null}<Button onClick={dlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit.claimant.trim()} onClick={async () => { await save.mutateAsync(edit); dlg.hide(); toast.success("Saved"); }}>Save</Button></> : undefined}>
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><span className="eyebrow text-muted-foreground">Claimed by</span><input list="people" className="h-11 rounded-xl border border-hairline bg-surface px-3" value={edit.claimant} onChange={(e) => setEdit({ ...edit, claimant: e.target.value })} /><datalist id="people">{people.map((p) => <option key={p} value={p} />)}</datalist></div>
            <TextField label="Date" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
            <TextField label="Description" className="sm:col-span-2" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            {edit.kind === "mileage" ? (
              <>
                <TextField label="Business miles" type="number" value={edit.miles || ""} onChange={(e) => setEdit({ ...edit, miles: parseFloat(e.target.value) || 0 })} />
                <TextField label="From → to" value={edit.from_to} onChange={(e) => setEdit({ ...edit, from_to: e.target.value })} />
                <p className="rounded-xl bg-signal/20 p-3 text-sm sm:col-span-2">Claim value: <strong>{gbp(preview)}</strong> <span className="text-muted-foreground">(rates in Settings; {ytdMiles(edit).toLocaleString("en-GB")} mi already claimed this tax year)</span></p>
              </>
            ) : (
              <>
                <div><span className="eyebrow text-muted-foreground">Total paid (incl. VAT)</span><MoneyInput className="mt-1.5" value={edit.gross_pence} onChange={(v) => setEdit({ ...edit, gross_pence: v })} /></div>
                <div><span className="eyebrow text-muted-foreground">of which VAT</span><MoneyInput className="mt-1.5" value={edit.vat_pence} onChange={(v) => setEdit({ ...edit, vat_pence: v })} /></div>
                <SelectField label="Currency" value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</SelectField>
                {edit.currency !== "GBP" ? <TextField label={`1 ${edit.currency} = £`} type="number" step="0.0001" value={edit.fx_rate} onChange={(e) => setEdit({ ...edit, fx_rate: parseFloat(e.target.value) || 1 })} /> : null}
              </>
            )}
            <SelectField label="Category" value={edit.account} onChange={(e) => setEdit({ ...edit, account: e.target.value })}>{DEFAULT_ACCOUNTS.filter((a) => a.group === "expense" || a.group === "cost_of_sales").map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</SelectField>
            <div className="flex flex-col gap-1.5"><span className="eyebrow text-muted-foreground">Project (optional)</span><Select value={edit.project_id ?? ""} onChange={(e) => setEdit({ ...edit, project_id: e.target.value || null })}><option value="">None</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
            <div className="sm:col-span-2"><Segmented value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} options={[{ value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "reimbursed", label: "Reimbursed" }, { value: "rejected", label: "Rejected" }]} /></div>
            {edit.attachment_url ? <a className="text-sm font-medium underline decoration-signal decoration-2 underline-offset-4 sm:col-span-2" href={edit.attachment_url} target="_blank" rel="noreferrer">View attached receipt</a> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
