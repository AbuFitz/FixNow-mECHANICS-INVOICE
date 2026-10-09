import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, Input, PageHeader, SelectField, Spinner, TextAreaField, TextField, useDisclosure } from "@/components/ui";
import { useCollection, useDocs, useRemoveRow, useSaveRow } from "@/lib/hooks";
import type { Contact } from "@/lib/types";
import { gbp } from "@/lib/money";
import { uid } from "@/lib/format";
import { balanceDue } from "@/lib/status";
import { DOC_LABEL } from "@/lib/defaults";
import { CURRENCIES } from "@/lib/money";
import { DocStatus } from "@/components/StatusBadges";

const blank = (kind: Contact["kind"]): Contact => ({ id: uid(), kind, name: "", company: "", email: "", phone: "", address: "", postcode: "", vat_number: "", notes: "", cis_status: "none", cis_utr: "", default_account: kind === "supplier" ? "300" : "200", payment_terms_days: null, currency: "GBP", created_at: new Date().toISOString() });

function ContactsPage({ mode }: { mode: "customer" | "supplier" }) {
  const { data: contacts, isLoading } = useCollection("contacts");
  const { data: docs } = useDocs();
  const save = useSaveRow("contacts");
  const remove = useRemoveRow("contacts");
  const dlg = useDisclosure();
  const [edit, setEdit] = useState<Contact | null>(null);
  const [view, setView] = useState<Contact | null>(null);
  const [q, setQ] = useState("");

  const list = useMemo(() => (contacts ?? []).filter((c) => (mode === "customer" ? c.kind !== "supplier" : c.kind !== "customer")).filter((c) => `${c.name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [contacts, mode, q]);
  if (isLoading) return <Spinner />;

  const stats = (c: Contact) => {
    const mine = (docs ?? []).filter((x) => x.contact_id === c.id || (c.email && x.content.customer.email === c.email));
    return { count: mine.filter((x) => x.lifecycle === "issued").length, owed: mine.filter((x) => x.doc_type === "invoice" && x.lifecycle === "issued").reduce((a, x) => a + balanceDue(x), 0), mine };
  };

  return (
    <div>
      <PageHeader title={mode === "customer" ? "Customers" : "Suppliers"} subtitle={mode === "customer" ? "Everyone you've worked for — with their full history." : "Parts suppliers, subcontractors and services you buy from."}
        actions={<Button variant="signal" onClick={() => { setEdit(blank(mode)); dlg.show(); }}><Plus className="h-4 w-4" /> Add {mode}</Button>} />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-10" placeholder="Search…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <Empty icon={<Users className="h-5 w-5" />} title={`No ${mode}s yet`} body={mode === "customer" ? "Customers are added automatically when you issue paperwork." : "Add a supplier to start entering bills."} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((c) => {
          const s = stats(c);
          return (
            <button key={c.id} onClick={() => setView(c)} className="press text-left">
              <Card className="p-4 hover:shadow-lift">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{[c.company !== c.name && c.company, c.postcode].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  {mode === "supplier" && c.cis_status !== "none" ? <Badge tone="info">CIS {c.cis_status}</Badge> : null}
                </div>
                {mode === "customer" ? (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.count} document{s.count === 1 ? "" : "s"}</span>
                    {s.owed > 0 ? <span className="font-semibold text-destructive">Owes {gbp(s.owed)}</span> : <span className="text-muted-foreground">Settled</span>}
                  </div>
                ) : null}
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={!!view} onClose={() => setView(null)} title={view?.name ?? ""} wide footer={view ? <><Button variant="danger" onClick={async () => { await remove.mutateAsync(view.id); setView(null); toast.success("Deleted"); }}><Trash2 className="h-4 w-4" /> Delete</Button><Button variant="ink" onClick={() => { setEdit(view); setView(null); dlg.show(); }}>Edit</Button></> : undefined}>
        {view ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {view.phone ? <a href={`tel:${view.phone}`}><Button size="sm"><Phone className="h-4 w-4" /> {view.phone}</Button></a> : null}
              {view.email ? <a href={`mailto:${view.email}`}><Button size="sm"><Mail className="h-4 w-4" /> {view.email}</Button></a> : null}
            </div>
            <p className="text-sm text-muted-foreground">{[view.address, view.postcode].filter(Boolean).join(", ")}</p>
            {view.notes ? <p className="rounded-xl bg-surface-2 p-3 text-sm">{view.notes}</p> : null}
            {mode === "customer" ? (
              <ul className="divide-y divide-hairline">
                {stats(view).mine.map((x) => (
                  <li key={x.id}><Link to={`/documents/${x.id}`} className="flex min-h-12 items-center justify-between gap-3 py-1.5"><span><span className="mono font-semibold">{x.number ?? "Draft"}</span> <span className="text-sm text-muted-foreground">{DOC_LABEL[x.doc_type]} · {x.content.vehicle.registration}</span></span><span className="flex items-center gap-2"><span className="num text-sm font-semibold">{gbp(x.total_pence)}</span><DocStatus doc={x} /></span></Link></li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={dlg.open} onClose={dlg.hide} title={edit && contacts?.some((c) => c.id === edit.id) ? "Edit" : `New ${mode}`} wide
        footer={<><Button onClick={dlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit?.name.trim()} onClick={async () => { await save.mutateAsync(edit!); dlg.hide(); toast.success("Saved"); }}>Save</Button></>}>
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextField label="Company" value={edit.company} onChange={(e) => setEdit({ ...edit, company: e.target.value })} />
            <TextField label="Phone" type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            <TextField label="Email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            <TextField label="Address" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            <TextField label="Postcode" value={edit.postcode} onChange={(e) => setEdit({ ...edit, postcode: e.target.value.toUpperCase() })} />
            <TextField label="VAT number" value={edit.vat_number} onChange={(e) => setEdit({ ...edit, vat_number: e.target.value })} />
            <SelectField label="Currency" value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</SelectField>
            {mode === "supplier" ? (
              <>
                <SelectField label="CIS status" value={edit.cis_status} onChange={(e) => setEdit({ ...edit, cis_status: e.target.value as Contact["cis_status"] })} hint="Only for construction-industry subcontractors.">
                  <option value="none">Not a CIS subcontractor</option>
                  <option value="standard">Registered — 20% deduction</option>
                  <option value="unmatched">Not registered — 30% deduction</option>
                  <option value="gross">Gross payment status — 0%</option>
                </SelectField>
                <TextField label="UTR" value={edit.cis_utr} onChange={(e) => setEdit({ ...edit, cis_utr: e.target.value })} />
                <TextField label="Payment terms (days)" type="number" value={edit.payment_terms_days ?? ""} onChange={(e) => setEdit({ ...edit, payment_terms_days: e.target.value ? parseInt(e.target.value, 10) : null })} />
              </>
            ) : null}
            <TextAreaField label="Notes" className="sm:col-span-2" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

export const Customers = () => <ContactsPage mode="customer" />;
export const Suppliers = () => <ContactsPage mode="supplier" />;
