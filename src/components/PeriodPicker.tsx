import { PERIOD_LABEL, type PeriodKey } from "@/lib/periods";
import { Select, Input } from "./ui";

export function PeriodPicker({ value, onChange, custom, onCustom }: { value: PeriodKey; onChange: (k: PeriodKey) => void; custom: { from: string; to: string }; onCustom: (c: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Period" className="w-auto min-w-44" value={value} onChange={(e) => onChange(e.target.value as PeriodKey)}>
        {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => <option key={k} value={k}>{PERIOD_LABEL[k]}</option>)}
      </Select>
      {value === "custom" ? (
        <>
          <Input type="date" aria-label="From" className="w-auto" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <Input type="date" aria-label="To" className="w-auto" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </>
      ) : null}
    </div>
  );
}
