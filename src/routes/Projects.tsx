import { useState } from "react";
import { toast } from "sonner";
import { FolderKanban, Plus, Timer, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, Select, SelectField, Spinner, TextField, Toggle, useDisclosure } from "@/components/ui";
import { Meter } from "@/components/charts";
import { useBooks } from "@/lib/useLedger";
import { useCollection, useInvalidate, useRemoveRow, useSaveRow, useSettings } from "@/lib/hooks";
import { api } from "@/lib/api";
import { blankContent } from "@/lib/defaults";
import type { Project, TimeEntry } from "@/lib/types";
import { d, isoDate, uid } from "@/lib/format";
import { gbp } from "@/lib/money";
import { computeTotals } from "@/lib/totals";
import { billGross } from "@/lib/acct/reports";

const blank = (): Project => ({ id: uid(), name: "", contact_id: null, status: "active", budget_pence: 0, hourly_rate_pence: 6000, notes: "", created_at: new Date().toISOString() });

export function Projects() {
  const books = useBooks();
  const { data: projects } = useCollection("projects");
  const { data: entries } = useCollection("time_entries");
  const { data: employees } = useCollection("employees");
  const { data: settings } = useSettings();
  const saveP = useSaveRow("projects");
  const removeP = useRemoveRow("projects");
  const saveT = useSaveRow("time_entries");
  const removeT = useRemoveRow("time_entries");
  const invalidate = useInvalidate();
  const nav = useNavigate();
  const pDlg = useDisclosure();
  const tDlg = useDisclosure();
  const [edit, setEdit] = useState<Project | null>(null);
  const [te, setTe] = useState<TimeEntry | null>(null);
  const [hours, setHours] = useState("");
  if (books.loading || !projects || !entries) return <Spinner />;

  const people = [...new Set([...(employees ?? []).map((e) => e.name), ...entries.map((e) => e.user_name)].filter(Boolean))];
  const stats = (p: Project) => {
    const mine = entries.filter((e) => e.project_id === p.id);
    const mins = mine.reduce((a, e) => a + e.minutes, 0);
    const billable = mine.filter((e) => e.billable && !e.invoiced_document_id);
    const unbilledValue = Math.round(billable.reduce((a, e) => a + e.minutes, 0) / 60 * p.hourly_rate_pence);
    const costs = books.bills.filter((b) => b.project_id === p.id).reduce((a, b) => a + billGross(b), 0) + books.expenses.filter((e) => e.project_id === p.id).reduce((a, e) => a + e.gross_pence, 0);
    const invoiced = books.docs.filter((x) => x.project_id === p.id && x.lifecycle === "issued" && x.doc_type !== "quote").reduce((a, x) => a + computeTotals(x.content).net_pence, 0);
    return { mins, unbilledValue, costs, invoiced, billable };
  };

  async function invoiceTime(p: Project) {
    const s = stats(p);
    const c = blankContent(settings!, "invoice");
    c.job.title = p.name;
    const contact = books.contacts.find((x) => x.id === p.contact_id);
    if (contact) c.customer = { name: contact.name, company: contact.company, phone: contact.phone, email: contact.email, address: contact.address, postcode: contact.postcode };
    const hrs = Math.round((s.billable.reduce((a, e) => a + e.minutes, 0) / 60) * 100) / 100;
    c.items = [{ id: uid(), kind: "labour", description: `Labour — ${p.name}`, detail: `${s.billable.length} entries`, qty: hrs, unit_pence: p.hourly_rate_pence, vat_rate: settings!.business.vat_registered ? 20 : 0, account: "200" }];
    c.vat_mode = settings!.business.vat_registered ? "standard" : "none";
    const doc = await api.docs.create({ doc_type: "invoice", content: c, contact_id: p.contact_id, project_id: p.id });
    for (const e of s.billable) await saveT.mutateAsync({ ...e, invoiced_document_id: doc.id });
    invalidate("docs");
    nav(`/documents/${doc.id}`);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Projects & time" subtitle="Track hours and costs for fleet contracts or internal jobs, then bill the time." actions={<><Button onClick={() => { setTe({ id: uid(), project_id: projects[0]?.id ?? "", user_name: "", date: isoDate(), minutes: 60, description: "", billable: true, invoiced_document_id: null, created_at: new Date().toISOString() }); setHours("1"); tDlg.show(); }} disabled={!projects.length}><Timer className="h-4 w-4" /> Log time</Button><Button variant="signal" onClick={() => { setEdit(blank()); pDlg.show(); }}><Plus className="h-4 w-4" /> New project</Button></>} />
      {projects.length === 0 ? <Empty icon={<FolderKanban className="h-5 w-5" />} title="No projects" body="Create one for a fleet customer or an internal job to track hours, costs and profit." /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => {
          const s = stats(p);
          const pct = p.budget_pence ? ((s.costs + (s.mins / 60) * p.hourly_rate_pence) / p.budget_pence) * 100 : 0;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg font-semibold">{p.name}</p><p className="text-sm text-muted-foreground">{books.contacts.find((c) => c.id === p.contact_id)?.name ?? "Internal"}</p></div><Badge tone={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge></div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Hours</dt><dd className="num font-display font-bold">{(s.mins / 60).toFixed(1)}</dd></div><div><dt className="text-xs text-muted-foreground">Costs</dt><dd className="num font-display font-bold">{gbp(s.costs)}</dd></div><div><dt className="text-xs text-muted-foreground">Billed</dt><dd className="num font-display font-bold">{gbp(s.invoiced)}</dd></div><div><dt className="text-xs text-muted-foreground">Unbilled</dt><dd className="num font-display font-bold">{gbp(s.unbilledValue)}</dd></div></dl>
              {p.budget_pence ? <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Budget used</span><span>{Math.round(pct)}% of {gbp(p.budget_pence)}</span></div><Meter pct={pct} tone={pct > 100 ? "danger" : "ink"} /></div> : null}
              <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => { setEdit(structuredClone(p)); pDlg.show(); }}>Edit</Button>{s.billable.length ? <Button size="sm" variant="signal" onClick={() => invoiceTime(p)}>Invoice {gbp(s.unbilledValue)} of time</Button> : null}</div>
              <ul className="mt-3 divide-y divide-hairline text-sm">{entries.filter((e) => e.project_id === p.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map((e) => <li key={e.id} className="flex items-center justify-between py-1.5"><span className="min-w-0 truncate">{d(e.date)} · {e.user_name} · {e.description || "—"}</span><span className="flex items-center gap-1"><span className="num">{(e.minutes / 60).toFixed(1)}h</span><button aria-label="Delete entry" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => removeT.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></button></span></li>)}</ul>
            </Card>
          );
        })}
      </div>

      <Dialog open={pDlg.open} onClose={pDlg.hide} title="Project" footer={<>{edit && projects.some((p) => p.id === edit.id) ? <Button variant="danger" onClick={async () => { await removeP.mutateAsync(edit.id); pDlg.hide(); }}><Trash2 className="h-4 w-4" /></Button> : null}<Button onClick={pDlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit?.name.trim()} onClick={async () => { await saveP.mutateAsync(edit!); pDlg.hide(); toast.success("Saved"); }}>Save</Button></>}>
        {edit ? <div className="space-y-3"><TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><div className="flex flex-col gap-1.5"><span className="eyebrow text-muted-foreground">Customer</span><Select value={edit.contact_id ?? ""} onChange={(e) => setEdit({ ...edit, contact_id: e.target.value || null })}><option value="">Internal (no customer)</option>{books.contacts.filter((c) => c.kind !== "supplier").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div><div className="grid grid-cols-2 gap-3"><div><span className="eyebrow text-muted-foreground">Budget</span><MoneyInput className="mt-1.5" value={edit.budget_pence} onChange={(v) => setEdit({ ...edit, budget_pence: v })} /></div><div><span className="eyebrow text-muted-foreground">Hourly rate</span><MoneyInput className="mt-1.5" value={edit.hourly_rate_pence} onChange={(v) => setEdit({ ...edit, hourly_rate_pence: v })} /></div></div><SelectField label="Status" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as never })}><option value="active">Active</option><option value="completed">Completed</option><option value="archived">Archived</option></SelectField></div> : null}
      </Dialog>
      <Dialog open={tDlg.open} onClose={tDlg.hide} title="Log time" footer={<><Button onClick={tDlg.hide}>Cancel</Button><Button variant="signal" disabled={!te?.user_name.trim() || !te?.project_id} onClick={async () => { await saveT.mutateAsync({ ...te!, minutes: Math.round((parseFloat(hours) || 0) * 60) }); tDlg.hide(); toast.success("Logged"); }}>Save</Button></>}>
        {te ? <div className="space-y-3"><SelectField label="Project" value={te.project_id} onChange={(e) => setTe({ ...te, project_id: e.target.value })}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</SelectField><div className="flex flex-col gap-1.5"><span className="eyebrow text-muted-foreground">Who</span><input list="tpeople" className="h-11 rounded-xl border border-hairline bg-surface px-3" value={te.user_name} onChange={(e) => setTe({ ...te, user_name: e.target.value })} /><datalist id="tpeople">{people.map((x) => <option key={x} value={x} />)}</datalist></div><div className="grid grid-cols-2 gap-3"><TextField label="Date" type="date" value={te.date} onChange={(e) => setTe({ ...te, date: e.target.value })} /><TextField label="Hours" type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} /></div><TextField label="What was done" value={te.description} onChange={(e) => setTe({ ...te, description: e.target.value })} /><Toggle checked={te.billable} onChange={(v) => setTe({ ...te, billable: v })} label="Billable" /></div> : null}
      </Dialog>
    </div>
  );
}
