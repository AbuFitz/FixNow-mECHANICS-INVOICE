import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, SelectField, Spinner, Tabs, TextAreaField, TextField, useDisclosure } from "@/components/ui";
import { useCollection, useRemoveRow, useSaveRow } from "@/lib/hooks";
import type { Preset, PresetKind, LineKind } from "@/lib/types";
import { uid } from "@/lib/format";
import { gbp } from "@/lib/money";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";

type Tab = "item" | "advisory" | "warranty" | "bank_rule";
const LABEL: Record<Tab, string> = { item: "Items", advisory: "Advisories", warranty: "Warranties", bank_rule: "Bank rules" };

export function Catalogue() {
  const { data, isLoading } = useCollection("presets");
  const save = useSaveRow("presets");
  const remove = useRemoveRow("presets");
  const dlg = useDisclosure();
  const [tab, setTab] = useState<Tab>("item");
  const [edit, setEdit] = useState<Preset | null>(null);
  if (isLoading) return <Spinner />;
  const list = (data ?? []).filter((p) => p.kind === (tab as PresetKind)).sort((a, b) => a.sort - b.sort);
  const start = () => { setEdit({ id: uid(), kind: tab as PresetKind, label: "", payload: tab === "item" ? { kind: "part", qty: 1, unit_pence: 0, vat_rate: 20 } : tab === "bank_rule" ? { keyword: "", account: "499", vat_rate: 0 } : {}, sort: (data?.length ?? 0) + 1 }); dlg.show(); };
  const p = edit?.payload ?? {};
  const setP = (patch: Record<string, unknown>) => setEdit((e) => (e ? { ...e, payload: { ...e.payload, ...patch } } : e));
  return (
    <div>
      <PageHeader title="Catalogue" subtitle="Saved prices, warranty wording, advisories and bank rules — so common jobs take seconds." actions={<Button variant="signal" onClick={start}><Plus className="h-4 w-4" /> Add</Button>} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={(Object.keys(LABEL) as Tab[]).map((t) => ({ value: t, label: LABEL[t], count: (data ?? []).filter((x) => x.kind === t).length }))} />
      <div className="mt-4 space-y-2.5">
        {list.length === 0 ? <Empty icon={<BookOpen className="h-5 w-5" />} title={`No ${LABEL[tab].toLowerCase()} yet`} /> : null}
        {list.map((x) => (
          <Card key={x.id} className="flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-semibold">{x.label}</p>
              <p className="truncate text-sm text-muted-foreground">
                {x.kind === "item" ? `${String(x.payload.kind)} · ${gbp(Number(x.payload.unit_pence ?? 0))}${x.payload.cost_pence ? ` · cost ${gbp(Number(x.payload.cost_pence))}` : ""}` : x.kind === "bank_rule" ? `Contains “${String(x.payload.keyword)}” → ${String(x.payload.account)}` : x.kind === "advisory" ? String(x.payload.detail ?? "") : `${String(x.payload.parts ?? "")} ${x.payload.labour ? "· " + String(x.payload.labour) : ""}`}
              </p>
            </div>
            {x.kind === "advisory" ? <Badge tone={x.payload.severity === "urgent" ? "danger" : x.payload.severity === "soon" ? "warning" : "info"}>{String(x.payload.severity)}</Badge> : null}
            <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setEdit(structuredClone(x)); dlg.show(); }}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove.mutate(x.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </Card>
        ))}
      </div>
      <Dialog open={dlg.open} onClose={dlg.hide} title={edit ? `${LABEL[edit.kind as Tab] ?? "Preset"}` : ""} wide footer={<><Button onClick={dlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit?.label.trim()} onClick={async () => { await save.mutateAsync(edit!); dlg.hide(); toast.success("Saved"); }}>Save</Button></>}>
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" className="sm:col-span-2" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
            {edit.kind === "item" ? (
              <>
                <SelectField label="Type" value={String(p.kind ?? "part")} onChange={(e) => setP({ kind: e.target.value as LineKind })}><option value="part">Part</option><option value="labour">Labour</option><option value="callout">Call-out</option><option value="other">Other</option></SelectField>
                <TextField label="Printed description" value={String(p.description ?? "")} onChange={(e) => setP({ description: e.target.value })} />
                <div><span className="eyebrow text-muted-foreground">Price (ex VAT)</span><MoneyInput className="mt-1.5" value={Number(p.unit_pence ?? 0)} onChange={(v) => setP({ unit_pence: v })} /></div>
                <div><span className="eyebrow text-muted-foreground">Your cost (internal)</span><MoneyInput className="mt-1.5" value={Number(p.cost_pence ?? 0)} onChange={(v) => setP({ cost_pence: v || undefined })} /></div>
                <SelectField label="VAT rate" value={String(p.vat_rate ?? 20)} onChange={(e) => setP({ vat_rate: Number(e.target.value) })}><option value="20">20%</option><option value="5">5%</option><option value="0">0%</option></SelectField>
              </>
            ) : null}
            {edit.kind === "advisory" ? (
              <>
                <SelectField label="Severity" value={String(p.severity ?? "soon")} onChange={(e) => setP({ severity: e.target.value })}><option value="urgent">Urgent</option><option value="soon">Advised</option><option value="monitor">Monitor</option></SelectField>
                <TextField label="Title" value={String(p.title ?? "")} onChange={(e) => setP({ title: e.target.value })} />
                <TextAreaField label="Wording" className="sm:col-span-2" value={String(p.detail ?? "")} onChange={(e) => setP({ detail: e.target.value })} />
              </>
            ) : null}
            {edit.kind === "warranty" ? (
              <>
                <TextField label="Parts warranty" value={String(p.parts ?? "")} onChange={(e) => setP({ parts: e.target.value })} />
                <TextField label="Labour warranty" value={String(p.labour ?? "")} onChange={(e) => setP({ labour: e.target.value })} />
              </>
            ) : null}
            {edit.kind === "bank_rule" ? (
              <>
                <TextField label="If the description contains" value={String(p.keyword ?? "")} onChange={(e) => setP({ keyword: e.target.value })} placeholder="SHELL" />
                <SelectField label="Categorise as" value={String(p.account ?? "499")} onChange={(e) => setP({ account: e.target.value })}>{DEFAULT_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</SelectField>
                <SelectField label="VAT" value={String(p.vat_rate ?? 0)} onChange={(e) => setP({ vat_rate: Number(e.target.value) })}><option value="20">20%</option><option value="5">5%</option><option value="0">No VAT</option></SelectField>
              </>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
