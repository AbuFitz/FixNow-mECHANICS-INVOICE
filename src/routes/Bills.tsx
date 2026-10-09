import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Plus, Repeat, ShoppingCart, Trash2 } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, Select, SelectField, Spinner, Tabs, TextAreaField, TextField, Toggle, useDisclosure } from "@/components/ui";
import { CaptureButton } from "@/components/CaptureButton";
import { useCollection, useSaveRow, useRemoveRow } from "@/lib/hooks";
import type { Bill, BillLine, Contact } from "@/lib/types";
import { addDaysIso, d, isoDate, uid } from "@/lib/format";
import { billBalance, billGross } from "@/lib/acct/reports";
import { cisDeduction } from "@/lib/acct/cis";
import { gbp, CURRENCIES } from "@/lib/money";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/images";

type Tab = "due" | "draft" | "paid" | "all";

const blank = (): Bill => ({
  id: uid(), contact_id: null, supplier_name: "", reference: "", bill_date: isoDate(), due_date: addDaysIso(isoDate(), 30), currency: "GBP", fx_rate: 1,
  lines: [{ id: uid(), description: "", account: "300", net_pence: 0, vat_rate: 20 }], status: "approved", paid_pence: 0, cis_deduction_pence: 0, project_id: null, attachment_url: null, notes: "", repeat: "none", created_at: new Date().toISOString(),
});

export function Bills() {
  const { data: bills, isLoading } = useCollection("bills");
  const { data: contacts } = useCollection("contacts");
  const { data: accounts } = useCollection("accounts");
  const save = useSaveRow("bills");
  const remove = useRemoveRow("bills");
  const saveContact = useSaveRow("contacts");
  const dlg = useDisclosure();
  const payDlg = useDisclosure();
  const [edit, setEdit] = useState<Bill | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [tab, setTab] = useState<Tab>("due");
  const acc = accounts?.length ? accounts : DEFAULT_ACCOUNTS.map((a) => ({ ...a, id: a.code }));
  const suppliers = (contacts ?? []).filter((c) => c.kind !== "customer");

  const list = useMemo(() => (bills ?? []).filter((b) => (tab === "all" ? true : tab === "draft" ? b.status === "draft" : tab === "paid" ? b.status === "paid" : b.status === "approved")).sort((a, b) => (b.bill_date).localeCompare(a.bill_date)), [bills, tab]);
  if (isLoading) return <Spinner />;

  const supplier = edit?.contact_id ? suppliers.find((s) => s.id === edit.contact_id) : null;
  const recompute = (b: Bill, sup: Contact | null | undefined): Bill => ({ ...b, cis_deduction_pence: sup ? cisDeduction(b.lines, sup.cis_status) : 0 });
  const setLine = (id: string, p: Partial<BillLine>) => setEdit((b) => (b ? recompute({ ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) }, supplier) : b));
  const net = edit?.lines.reduce((a, l) => a + l.net_pence, 0) ?? 0;
  const vat = edit ? billGross(edit) - net : 0;

  async function saveBill() {
    if (!edit) return;
    let b = edit;
    if (!b.contact_id && b.supplier_name.trim()) {
      const existing = suppliers.find((s) => s.name.toLowerCase() === b.supplier_name.trim().toLowerCase());
      if (existing) b = { ...b, contact_id: existing.id };
      else {
        const id = uid();
        await saveContact.mutateAsync({ id, kind: "supplier", name: b.supplier_name.trim(), company: b.supplier_name.trim(), email: "", phone: "", address: "", postcode: "", vat_number: "", notes: "", cis_status: "none", cis_utr: "", default_account: "300", payment_terms_days: 30, currency: "GBP", created_at: new Date().toISOString() });
        b = { ...b, contact_id: id };
      }
    }
    await save.mutateAsync(b);
    dlg.hide();
    toast.success("Bill saved");
  }

  return (
    <div>
      <PageHeader title="Bills" subtitle="What you owe suppliers. Enter or scan a bill and it flows into VAT, profit and cash flow." actions={
        <>
          <CaptureButton label="Scan bill" onCaptured={(c, f) => { const b = blank(); b.supplier_name = c.supplier; b.reference = c.reference; b.bill_date = c.date || b.bill_date; b.currency = c.currency || "GBP"; b.lines = (c.lines.length ? c.lines : [{ description: c.description, net_pence: c.net_pence, vat_rate: c.net_pence ? Math.round((c.vat_pence / c.net_pence) * 100) : 0 }]).map((l) => ({ id: uid(), description: l.description, account: "300", net_pence: l.net_pence, vat_rate: l.vat_rate })); setEdit(b); dlg.show(); compressImage(f).then((bl) => api.files.uploadImage(bl, "bills")).then((url) => setEdit((x) => (x ? { ...x, attachment_url: url } : x))).catch(() => undefined); }} />
          <Button variant="signal" onClick={() => { setEdit(blank()); dlg.show(); }}><Plus className="h-4 w-4" /> Add bill</Button>
        </>
      } />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "due", label: "Awaiting payment", count: (bills ?? []).filter((b) => b.status === "approved").length }, { value: "draft", label: "Drafts" }, { value: "paid", label: "Paid" }, { value: "all", label: "All" }]} />
      <div className="mt-4 space-y-2.5">
        {list.length === 0 ? <Empty icon={<ShoppingCart className="h-5 w-5" />} title="No bills" body="Add supplier invoices to track what you owe." /> : null}
        {list.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center gap-3 p-4">
            <button className="min-w-0 flex-1 text-left" onClick={() => { setEdit(structuredClone(b)); dlg.show(); }}>
              <p className="flex flex-wrap items-center gap-2"><span className="font-display font-semibold">{b.supplier_name}</span><span className="mono text-muted-foreground">{b.reference}</span>{b.repeat !== "none" ? <Badge tone="info"><Repeat className="h-3 w-3" /> {b.repeat}</Badge> : null}{b.attachment_url ? <Paperclip className="h-3.5 w-3.5 text-muted-foreground" /> : null}</p>
              <p className="text-sm text-muted-foreground">{d(b.bill_date)} · due {d(b.due_date)}{b.cis_deduction_pence ? ` · CIS −${gbp(b.cis_deduction_pence)}` : ""}</p>
            </button>
            <div className="text-right">
              <p className="num font-display font-bold">{gbp(billGross(b), b.currency)}</p>
              {b.status === "approved" ? <p className="num text-xs text-destructive">Owe {gbp(billBalance(b), b.currency)}</p> : <Badge tone={b.status === "paid" ? "success" : "neutral"}>{b.status}</Badge>}
            </div>
            {b.status === "approved" ? <Button size="sm" variant="ink" onClick={() => { setPaying(b); setPayAmt(billBalance(b)); payDlg.show(); }}>Pay</Button> : null}
          </Card>
        ))}
      </div>

      <Dialog open={dlg.open} onClose={dlg.hide} title={edit && bills?.some((b) => b.id === edit.id) ? "Edit bill" : "New bill"} wide footer={edit ? <>{bills?.some((b) => b.id === edit.id) ? <Button variant="danger" onClick={async () => { await remove.mutateAsync(edit.id); dlg.hide(); }}><Trash2 className="h-4 w-4" /></Button> : null}<Button onClick={dlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit.supplier_name.trim()} onClick={saveBill}>Save bill</Button></> : undefined}>
        {edit ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow text-muted-foreground">Supplier</span>
                <input list="suppliers" className="h-11 rounded-xl border border-hairline bg-surface px-3" value={edit.supplier_name} onChange={(e) => { const s = suppliers.find((x) => x.name === e.target.value); setEdit(recompute({ ...edit, supplier_name: e.target.value, contact_id: s?.id ?? null, due_date: s?.payment_terms_days ? addDaysIso(edit.bill_date, s.payment_terms_days) : edit.due_date }, s)); }} />
                <datalist id="suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
              </div>
              <TextField label="Supplier's reference" value={edit.reference} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} />
              <TextField label="Bill date" type="date" value={edit.bill_date} onChange={(e) => setEdit({ ...edit, bill_date: e.target.value })} />
              <TextField label="Due date" type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} />
              <SelectField label="Currency" value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</SelectField>
              {edit.currency !== "GBP" ? <TextField label={`1 ${edit.currency} = £`} type="number" step="0.0001" value={edit.fx_rate} onChange={(e) => setEdit({ ...edit, fx_rate: parseFloat(e.target.value) || 1 })} /> : null}
            </div>
            <div className="space-y-2">
              <span className="eyebrow text-muted-foreground">Lines</span>
              {edit.lines.map((l) => (
                <div key={l.id} className="grid grid-cols-2 gap-2 rounded-xl border border-hairline p-2.5 sm:grid-cols-[1.4fr_1.2fr_110px_90px_auto]">
                  <input aria-label="Description" placeholder="Description" className="col-span-2 h-11 rounded-xl border border-hairline bg-surface px-3 sm:col-span-1" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} />
                  <Select aria-label="Category" value={l.account} onChange={(e) => { const a = acc.find((x) => x.code === e.target.value); setLine(l.id, { account: e.target.value, vat_rate: a?.default_vat ?? l.vat_rate }); }}>{acc.filter((a) => a.group !== "income").map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</Select>
                  <MoneyInput value={l.net_pence} onChange={(v) => setLine(l.id, { net_pence: v })} />
                  <Select aria-label="VAT" value={l.vat_rate} onChange={(e) => setLine(l.id, { vat_rate: Number(e.target.value) })}><option value={20}>20%</option><option value={5}>5%</option><option value={0}>0%</option></Select>
                  <Button aria-label="Remove line" className="px-0" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((x) => x.id !== l.id) })}><Trash2 className="h-4 w-4" /></Button>
                  {supplier && supplier.cis_status !== "none" ? <div className="col-span-2 sm:col-span-5"><Toggle checked={!!l.is_labour} onChange={(v) => setLine(l.id, { is_labour: v })} label="Labour element (CIS deduction applies)" /></div> : null}
                </div>
              ))}
              <Button size="sm" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { id: uid(), description: "", account: "300", net_pence: 0, vat_rate: 20 }] })}>+ Add line</Button>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between"><span>Net</span><span className="num">{gbp(net, edit.currency)}</span></div>
              <div className="flex justify-between"><span>VAT</span><span className="num">{gbp(vat, edit.currency)}</span></div>
              {edit.cis_deduction_pence ? <div className="flex justify-between text-info"><span>CIS deduction</span><span className="num">−{gbp(edit.cis_deduction_pence, edit.currency)}</span></div> : null}
              <div className="mt-1 flex justify-between border-t border-hairline pt-1 font-display font-bold"><span>{edit.cis_deduction_pence ? "To pay subcontractor" : "Total"}</span><span className="num">{gbp(billGross(edit) - edit.cis_deduction_pence, edit.currency)}</span></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Bill["status"] })}><option value="draft">Draft</option><option value="approved">Approved — awaiting payment</option><option value="paid">Paid</option><option value="void">Void</option></SelectField>
              <SelectField label="Repeats" value={edit.repeat} onChange={(e) => setEdit({ ...edit, repeat: e.target.value as Bill["repeat"] })} hint="Recurring bills feed the cash-flow forecast."><option value="none">One-off</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option></SelectField>
            </div>
            <TextAreaField label="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            {edit.attachment_url ? <a className="inline-flex items-center gap-2 text-sm font-medium underline decoration-signal decoration-2 underline-offset-4" href={edit.attachment_url} target="_blank" rel="noreferrer"><Paperclip className="h-4 w-4" /> View attached scan</a> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={payDlg.open} onClose={payDlg.hide} title="Pay bill" footer={<><Button onClick={payDlg.hide}>Cancel</Button><Button variant="signal" onClick={async () => { if (!paying) return; const paid = paying.paid_pence + payAmt; await save.mutateAsync({ ...paying, paid_pence: paid, status: paid >= billGross(paying) - paying.cis_deduction_pence ? "paid" : "approved" }); payDlg.hide(); toast.success("Payment recorded — match it to the bank line in Banking."); }}>Mark {gbp(payAmt)} paid</Button></>}>
        {paying ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{paying.supplier_name} · {paying.reference} · owed {gbp(billBalance(paying), paying.currency)}</p><div><span className="eyebrow text-muted-foreground">Amount paid</span><MoneyInput className="mt-1.5" value={payAmt} onChange={setPayAmt} /></div><p className="text-xs text-muted-foreground">Recording a payment here updates what you owe. Making the actual bank payment is done in your online banking (or via an open-banking payment provider once connected — see Integrations).</p></div> : null}
      </Dialog>
    </div>
  );
}
