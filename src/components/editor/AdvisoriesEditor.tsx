import { Plus, Trash2, BookMarked } from "lucide-react";
import { useState } from "react";
import type { Advisory, AdvisorySeverity, Preset } from "@/lib/types";
import { uid } from "@/lib/format";
import { Button, Dialog, Input, Select, TextAreaField, Toggle, useDisclosure } from "../ui";
import { PhotoField } from "./PhotoField";
import { SEVERITY_LABEL } from "@/lib/defaults";
import { cn } from "@/lib/cn";

const BAR: Record<AdvisorySeverity, string> = { urgent: "bg-destructive", soon: "bg-warning", monitor: "bg-info" };

export function AdvisoriesEditor({ advisories, onChange, presets, folder }: { advisories: Advisory[]; onChange: (a: Advisory[]) => void; presets: Preset[]; folder: string }) {
  const picker = useDisclosure();
  const [, force] = useState(0);
  const patch = (id: string, p: Partial<Advisory>) => onChange(advisories.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const add = (p?: Partial<Advisory>) => {
    onChange([...advisories, { id: uid(), severity: "soon", title: "", detail: "", photos: [], ...p }]);
    force((n) => n + 1);
  };
  const adv = presets.filter((p) => p.kind === "advisory");
  return (
    <div className="space-y-3">
      {advisories.length === 0 ? <p className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-muted-foreground">No advisories. Add anything the customer should know about — it appears as a clear, colour-coded section with photos on the PDF.</p> : null}
      {advisories.map((a) => (
        <div key={a.id} className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          <div className="flex">
            <div className={cn("w-1.5 shrink-0", BAR[a.severity])} />
            <div className="min-w-0 flex-1 space-y-3 p-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input aria-label="Advisory title" placeholder="e.g. Front brake pads close to the wear limit" value={a.title} onChange={(e) => patch(a.id, { title: e.target.value })} />
                <button aria-label="Remove advisory" onClick={() => onChange(advisories.filter((x) => x.id !== a.id))} className="grid h-11 w-10 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Select aria-label="Severity" value={a.severity} onChange={(e) => patch(a.id, { severity: e.target.value as AdvisorySeverity })}>
                {(Object.keys(SEVERITY_LABEL) as AdvisorySeverity[]).map((k) => (
                  <option key={k} value={k}>
                    {SEVERITY_LABEL[k]}
                  </option>
                ))}
              </Select>
              <TextAreaField label="What the engineer found / recommends" value={a.detail} onChange={(e) => patch(a.id, { detail: e.target.value })} />
              <PhotoField photos={a.photos} onChange={(photos) => patch(a.id, { photos })} folder={folder} max={3} label="Add photo" />
              <Toggle checked={!!a.declined} onChange={(v) => patch(a.id, { declined: v, declined_at: v ? new Date().toISOString().slice(0, 10) : undefined })} label="Customer chose not to proceed" hint="Printed as a record that you advised them — protects the business." />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="ink" onClick={() => add()}>
          <Plus className="h-4 w-4" /> Add advisory
        </Button>
        {adv.length ? (
          <Button onClick={picker.show}>
            <BookMarked className="h-4 w-4" /> Quick advisories
          </Button>
        ) : null}
      </div>
      <Dialog open={picker.open} onClose={picker.hide} title="Quick advisories">
        <ul className="divide-y divide-hairline">
          {adv.map((p) => (
            <li key={p.id}>
              <button
                className="min-h-14 w-full py-2 text-left hover:bg-surface-2"
                onClick={() => {
                  add({ severity: (p.payload.severity as AdvisorySeverity) ?? "soon", title: String(p.payload.title ?? p.label), detail: String(p.payload.detail ?? "") });
                  picker.hide();
                }}
              >
                <span className="block font-medium">{p.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{String(p.payload.detail ?? "")}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
