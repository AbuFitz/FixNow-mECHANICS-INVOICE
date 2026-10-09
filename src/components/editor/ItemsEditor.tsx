import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, BookMarked } from "lucide-react";
import type { DocumentContent, LineItem, LineKind, Preset } from "@/lib/types";
import { uid } from "@/lib/format";
import { gbp } from "@/lib/money";
import { lineNet } from "@/lib/totals";
import { Button, Input, MoneyInput, Select, Dialog, useDisclosure } from "../ui";
import { cn } from "@/lib/cn";

const KINDS: { value: LineKind; label: string }[] = [
  { value: "part", label: "Part" },
  { value: "labour", label: "Labour" },
  { value: "callout", label: "Call-out" },
  { value: "other", label: "Other" },
];

export function ItemsEditor({ content, onChange, presets, vatOn }: { content: DocumentContent; onChange: (items: LineItem[]) => void; presets: Preset[]; vatOn: boolean }) {
  const picker = useDisclosure();
  const [open, setOpen] = useState<string | null>(null);
  const items = content.items;
  const patch = (id: string, p: Partial<LineItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    onChange(next);
  };
  const add = (p?: Partial<LineItem>) =>
    onChange([...items, { id: uid(), kind: "part", description: "", qty: 1, unit_pence: 0, vat_rate: vatOn ? 20 : 0, ...p }]);
  const itemPresets = presets.filter((p) => p.kind === "item");

  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-muted-foreground">No items yet — add a line or pick from your catalogue.</p> : null}
      {items.map((it, i) => (
        <div key={it.id} className="rounded-2xl border border-hairline bg-surface p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[110px_1fr_auto]">
            <Select aria-label="Type" value={it.kind} onChange={(e) => patch(it.id, { kind: e.target.value as LineKind })} className="col-span-2 sm:col-span-1">
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
            <Input aria-label="Description" placeholder="Description" value={it.description} onChange={(e) => patch(it.id, { description: e.target.value })} />
            <div className="flex items-center gap-1">
              <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-11 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="grid h-11 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button aria-label="Remove line" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="grid h-11 w-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-[84px_1fr_1fr] items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-muted-foreground">Qty</span>
              <Input inputMode="decimal" className="num text-right" value={Number.isFinite(it.qty) ? String(it.qty) : ""} onChange={(e) => patch(it.id, { qty: parseFloat(e.target.value) || 0 })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-muted-foreground">Unit price</span>
              <MoneyInput value={it.unit_pence} onChange={(v) => patch(it.id, { unit_pence: v })} />
            </label>
            <div className="flex flex-col gap-1 pb-0.5 text-right">
              <span className="eyebrow text-muted-foreground">Line total</span>
              <span className="num flex h-11 items-center justify-end font-display text-lg font-semibold">{gbp(lineNet(it), content.currency)}</span>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open === it.id && "rotate-180")} /> Part no., VAT, cost
          </button>
          {open === it.id ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="eyebrow text-muted-foreground">Detail line (part no. / serial — printed)</span>
                <Input value={it.detail ?? ""} onChange={(e) => patch(it.id, { detail: e.target.value })} placeholder="P/N 063 · S/N AU063-77412" />
              </label>
              {vatOn ? (
                <label className="flex flex-col gap-1">
                  <span className="eyebrow text-muted-foreground">VAT rate</span>
                  <Select value={String(it.vat_rate ?? 20)} onChange={(e) => patch(it.id, { vat_rate: Number(e.target.value) })}>
                    <option value="20">20% standard</option>
                    <option value="5">5% reduced</option>
                    <option value="0">0% zero / exempt</option>
                  </Select>
                </label>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-muted-foreground">Your cost per unit (never printed)</span>
                <MoneyInput value={it.cost_pence ?? 0} onChange={(v) => patch(it.id, { cost_pence: v || undefined })} />
              </label>
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="ink" onClick={() => add()}>
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <Button onClick={picker.show}>
          <BookMarked className="h-4 w-4" /> From catalogue
        </Button>
      </div>
      <Dialog open={picker.open} onClose={picker.hide} title="Add from catalogue">
        {itemPresets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your catalogue is empty. Add common parts, labour and call-out fees in Catalogue.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {itemPresets.map((p) => {
              const pl = p.payload as Partial<LineItem>;
              return (
                <li key={p.id}>
                  <button
                    className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left hover:bg-surface-2"
                    onClick={() => {
                      add({ kind: pl.kind ?? "part", description: pl.description ?? p.label, detail: pl.detail, qty: pl.qty ?? 1, unit_pence: pl.unit_pence ?? 0, cost_pence: pl.cost_pence, account: pl.account, vat_rate: vatOn ? (pl.vat_rate ?? 20) : 0 });
                      picker.hide();
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.label}</span>
                      <span className="block text-xs capitalize text-muted-foreground">{pl.kind}</span>
                    </span>
                    <span className="num font-display font-semibold">{gbp(pl.unit_pence ?? 0)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </div>
  );
}
