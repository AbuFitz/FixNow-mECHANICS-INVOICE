import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Badge, Button, Card, PageHeader, Select, Spinner } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { useSaveRow, useCollection } from "@/lib/hooks";
import { gbp } from "@/lib/money";
import { uid } from "@/lib/format";
import type { BudgetRow } from "@/lib/types";
import { cn } from "@/lib/cn";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Budgets() {
  const books = useBooks();
  const { data: budgets, isLoading } = useCollection("budgets");
  const save = useSaveRow("budgets");
  const [year, setYear] = useState(new Date().getFullYear());
  const rows = (budgets ?? []).filter((b) => b.year === year);

  const actuals = useMemo(() => {
    const m: Record<string, number[]> = {};
    books.ledger.forEach((l) => {
      if (!l.date.startsWith(String(year))) return;
      const i = parseInt(l.date.slice(5, 7), 10) - 1;
      (m[l.account] ??= Array(12).fill(0))[i]! += l.net_pence;
    });
    return m;
  }, [books.ledger, year]);
  if (books.loading || isLoading) return <Spinner />;

  const accountName = (c: string) => books.accounts.find((a) => a.code === c)?.name ?? c;
  const set = (row: BudgetRow, i: number, pence: number) => save.mutate({ ...row, months: row.months.map((m, j) => (j === i ? pence : m)) });
  const addAccount = (code: string) => code && save.mutate({ id: uid(), year, account: code, months: Array(12).fill(0) });

  /** Smart suggestion: same month last year when available, otherwise the trailing 12-month average. */
  async function suggest() {
    const now = new Date();
    const prev: Record<string, number[]> = {};
    const trailing: Record<string, number> = {};
    books.ledger.forEach((l) => {
      const dt = new Date(l.date);
      if (dt.getFullYear() === year - 1) (prev[l.account] ??= Array(12).fill(0))[dt.getMonth()]! += l.net_pence;
      const monthsAgo = (now.getFullYear() - dt.getFullYear()) * 12 + now.getMonth() - dt.getMonth();
      if (monthsAgo >= 0 && monthsAgo < 12) trailing[l.account] = (trailing[l.account] ?? 0) + l.net_pence;
    });
    const codes = new Set([...Object.keys(prev), ...Object.keys(trailing)]);
    let n = 0;
    for (const code of codes) {
      const existing = rows.find((r) => r.account === code);
      const avg = Math.round((trailing[code] ?? 0) / 12);
      const months = Array.from({ length: 12 }, (_, i) => Math.round((prev[code]?.[i] ? prev[code]![i]! : avg) / 100) * 100);
      await save.mutateAsync({ id: existing?.id ?? uid(), year, account: code, months });
      n++;
    }
    toast.success(`Suggested budgets set for ${n} categories — adjust anything you like.`);
  }

  const total = (r: BudgetRow) => r.months.reduce((a, b) => a + b, 0);
  const incomeCodes = new Set(books.accounts.filter((a) => a.group === "income" || a.group === "other_income").map((a) => a.code));
  return (
    <div className="space-y-5">
      <PageHeader title="Budgets" subtitle="Plan each category by month and see how you're really doing against it." actions={<><Select aria-label="Year" className="w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>{[year - 1, year, year + 1].map((y) => <option key={y}>{y}</option>)}</Select><Button variant="signal" onClick={suggest}><Sparkles className="h-4 w-4" /> Suggest budgets</Button></>} />
      <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted-foreground">“Suggest budgets” uses last year's figure for each month where you have one, otherwise your trailing 12-month average. Review before relying on it.</p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead><tr className="border-b border-hairline text-left"><th className="sticky left-0 z-10 bg-card px-4 py-3 eyebrow text-muted-foreground">Category</th>{MONTHS.map((m) => <th key={m} className="px-1 py-3 text-right eyebrow text-muted-foreground">{m}</th>)}<th className="px-4 py-3 text-right eyebrow text-muted-foreground">Year</th></tr></thead>
          <tbody>
            {rows.sort((a, b) => a.account.localeCompare(b.account)).map((r) => {
              const act = actuals[r.account] ?? Array(12).fill(0);
              const isIncome = incomeCodes.has(r.account);
              const actTotal = act.reduce((a: number, b: number) => a + b, 0);
              const over = isIncome ? actTotal < total(r) : actTotal > total(r);
              return (
                <tr key={r.id} className="border-b border-hairline align-top">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2"><p className="font-medium">{accountName(r.account)}</p><p className="text-xs text-muted-foreground">Actual {gbp(actTotal)}</p></td>
                  {r.months.map((m, i) => {
                    const a = act[i] ?? 0;
                    const bad = m > 0 && (isIncome ? a < m && i <= new Date().getMonth() : a > m);
                    return <td key={i} className="px-1 py-2"><input aria-label={`${MONTHS[i]} budget`} inputMode="numeric" className="num h-9 w-[72px] rounded-lg border border-hairline bg-surface px-1.5 text-right" value={m ? String(Math.round(m / 100)) : ""} onChange={(e) => set(r, i, (parseInt(e.target.value, 10) || 0) * 100)} /><p className={cn("num mt-0.5 text-right text-[11px]", bad ? "font-semibold text-destructive" : "text-muted-foreground")}>{a ? Math.round(a / 100) : "·"}</p></td>;
                  })}
                  <td className="px-4 py-2 text-right"><p className="num font-semibold">{gbp(total(r))}</p><Badge tone={over ? "danger" : "success"}>{over ? (isIncome ? "behind" : "over") : "on track"}</Badge></td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">No budget for {year} yet — try “Suggest budgets”.</td></tr> : null}
          </tbody>
        </table>
      </Card>
      <Select aria-label="Add category" className="max-w-xs" value="" onChange={(e) => addAccount(e.target.value)}>
        <option value="">+ Add a category…</option>
        {books.accounts.filter((a) => !rows.some((r) => r.account === a.code)).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
      </Select>
    </div>
  );
}
