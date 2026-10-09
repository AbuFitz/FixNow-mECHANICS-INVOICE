import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Plus, Trash2, UserPlus } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, SelectField, Spinner, Tabs, TextField, Toggle, useDisclosure } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { useCollection, useRemoveRow, useSaveRow } from "@/lib/hooks";
import { calcPayslip, paramsForTaxYear, payrollSummary, periodNumber, previousTotals, taxYearOf } from "@/lib/acct/payroll";
import type { Employee, PayRun, PayslipLine } from "@/lib/types";
import { gbp } from "@/lib/money";
import { d, isoDate, uid } from "@/lib/format";
import { endOfMonth, format } from "date-fns";
import { registerFonts } from "@/pdf/fonts";
import { browserFontUrls } from "@/pdf/fontUrls";

type Tab = "runs" | "people";
const blankEmp = (): Employee => ({ id: uid(), name: "", ni_number: "", tax_code: "1257L", pay_frequency: "monthly", annual_salary_pence: 0, hourly_rate_pence: 0, pension_opt_in: false, student_loan_plan: "none", start_date: isoDate(), active: true, created_at: new Date().toISOString() });

async function downloadPayslip(run: PayRun, line: PayslipLine, business: Parameters<typeof import("@/pdf/PayslipPdf").PayslipPdf>[0]["business"]) {
  registerFonts(browserFontUrls);
  const [{ pdf }, { PayslipPdf }, React] = await Promise.all([import("@react-pdf/renderer"), import("@/pdf/PayslipPdf"), import("react")]);
  const blob = await pdf(React.createElement(PayslipPdf, { run, line, business }) as never).toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Payslip-${line.employee_name.replace(/\s+/g, "")}-${run.period_label.replace(/\s+/g, "")}.pdf`;
  a.click();
}

export function Payroll() {
  const books = useBooks();
  const { data: employees } = useCollection("employees");
  const saveEmp = useSaveRow("employees");
  const removeEmp = useRemoveRow("employees");
  const saveRun = useSaveRow("pay_runs");
  const removeRun = useRemoveRow("pay_runs");
  const empDlg = useDisclosure();
  const runDlg = useDisclosure();
  const [tab, setTab] = useState<Tab>("runs");
  const [edit, setEdit] = useState<Employee | null>(null);
  const [draft, setDraft] = useState<{ pay_date: string; hours: Record<string, number>; overrides: Record<string, number> } | null>(null);
  const active = (employees ?? []).filter((e) => e.active);

  const preview = useMemo(() => {
    if (!draft) return null;
    const ty = taxYearOf(draft.pay_date);
    const params = paramsForTaxYear(ty);
    try {
      const lines = active.map((e) => {
        const period = periodNumber(draft.pay_date, e.pay_frequency);
        const base = e.hourly_rate_pence ? Math.round(e.hourly_rate_pence * (draft.hours[e.id] ?? 0)) : e.pay_frequency === "monthly" ? Math.round(e.annual_salary_pence / 12) : Math.round(e.annual_salary_pence / 52);
        const gross = draft.overrides[e.id] ?? base;
        return calcPayslip({ employee: e, gross_pence: gross, hours: draft.hours[e.id], period, prev: previousTotals(e.id, books.payRuns, ty, period), params });
      });
      return { lines, error: null as string | null, period: periodNumber(draft.pay_date, "monthly") };
    } catch (err) {
      return { lines: [] as PayslipLine[], error: err instanceof Error ? err.message : "Couldn't calculate", period: 0 };
    }
  }, [draft, active, books.payRuns]);
  if (books.loading) return <Spinner />;

  const runs = [...books.payRuns].sort((a, b) => b.pay_date.localeCompare(a.pay_date));
  return (
    <div className="space-y-5">
      <PageHeader title="Payroll" subtitle="PAYE, National Insurance, pension and student-loan calculations for up to 10 people, with payslips." actions={<><Button onClick={() => { setEdit(blankEmp()); empDlg.show(); }}><UserPlus className="h-4 w-4" /> Add employee</Button><Button variant="signal" disabled={!active.length} onClick={() => { setDraft({ pay_date: format(endOfMonth(new Date()), "yyyy-MM-dd"), hours: {}, overrides: {} }); runDlg.show(); }}><Plus className="h-4 w-4" /> New pay run</Button></>} />
      <p className="flex gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Calculation tool, not a filing service.</strong> Rates for {paramsForTaxYear(taxYearOf(isoDate())).year} are held in <code className="mono">src/lib/acct/payroll.ts</code> and must be checked against gov.uk each April. Submitting your Full Payment Submission (RTI) to HMRC needs HMRC-recognised payroll software or an accountant — export the figures from here or file them there. Supports standard cumulative tax codes (e.g. 1257L, BR, D0, NT) and NI category A.</span></p>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "runs", label: "Pay runs", count: runs.length }, { value: "people", label: "Employees", count: (employees ?? []).length }]} />

      {tab === "people" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(employees ?? []).length === 0 ? <div className="md:col-span-2"><Empty title="No employees" body="Add the people you pay through payroll." /></div> : null}
          {(employees ?? []).map((e) => (
            <button key={e.id} className="press text-left" onClick={() => { setEdit(structuredClone(e)); empDlg.show(); }}>
              <Card className="p-4 hover:shadow-lift"><div className="flex items-center justify-between"><p className="font-display text-lg font-semibold">{e.name}</p><Badge tone={e.active ? "success" : "neutral"}>{e.active ? "Active" : "Left"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{e.hourly_rate_pence ? `${gbp(e.hourly_rate_pence)}/hr` : `${gbp(e.annual_salary_pence)} a year`} · {e.tax_code} · {e.pay_frequency}{e.pension_opt_in ? " · pension" : ""}</p></Card>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {runs.length === 0 ? <Empty title="No pay runs yet" /> : null}
          {runs.map((r) => { const s = payrollSummary(r); return (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-display text-lg font-semibold">{r.period_label}</p><p className="text-sm text-muted-foreground">Paid {d(r.pay_date)} · {r.lines.length} people</p></div><div className="flex items-center gap-2"><Badge tone={r.status === "paid" ? "success" : r.status === "approved" ? "signal" : "neutral"}>{r.status}</Badge>{r.status === "draft" ? <Button size="sm" variant="ink" onClick={() => saveRun.mutate({ ...r, status: "approved" })}>Approve</Button> : r.status === "approved" ? <Button size="sm" variant="signal" onClick={() => saveRun.mutate({ ...r, status: "paid" })}>Mark paid</Button> : null}<Button size="sm" variant="ghost" aria-label="Delete run" onClick={() => removeRun.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Gross", s.gross], ["Net pay", s.net], ["PAYE & NIC due to HMRC", s.paye_nic_to_hmrc], ["Total employer cost", s.employer_cost]].map(([k, v]) => <div key={k as string}><dt className="text-muted-foreground">{k}</dt><dd className="num font-display font-bold">{gbp(v as number)}</dd></div>)}</dl>
              <ul className="mt-3 divide-y divide-hairline text-sm">{r.lines.map((l) => <li key={l.employee_id} className="flex items-center justify-between py-2"><span>{l.employee_name}</span><span className="flex items-center gap-3"><span className="num font-semibold">{gbp(l.net_pence)}</span><Button size="sm" onClick={() => downloadPayslip(r, l, books.settings.business)}><Download className="h-4 w-4" /> Payslip</Button></span></li>)}</ul>
              <p className="mt-2 text-xs text-muted-foreground">PAYE & NIC for this period are normally due to HMRC by the 22nd of the following month (electronic payment).</p>
            </Card>
          ); })}
        </div>
      )}

      <Dialog open={empDlg.open} onClose={empDlg.hide} title="Employee" wide footer={<>{edit && (employees ?? []).some((e) => e.id === edit.id) ? <Button variant="danger" onClick={async () => { await removeEmp.mutateAsync(edit.id); empDlg.hide(); }}><Trash2 className="h-4 w-4" /></Button> : null}<Button onClick={empDlg.hide}>Cancel</Button><Button variant="signal" disabled={!edit?.name.trim()} onClick={async () => { await saveEmp.mutateAsync(edit!); empDlg.hide(); toast.success("Saved"); }}>Save</Button></>}>
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextField label="NI number" value={edit.ni_number} onChange={(e) => setEdit({ ...edit, ni_number: e.target.value.toUpperCase() })} />
            <TextField label="Tax code" value={edit.tax_code} onChange={(e) => setEdit({ ...edit, tax_code: e.target.value.toUpperCase() })} hint="From HMRC or the P45/starter checklist." />
            <SelectField label="Paid" value={edit.pay_frequency} onChange={(e) => setEdit({ ...edit, pay_frequency: e.target.value as never })}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></SelectField>
            <div><span className="eyebrow text-muted-foreground">Annual salary</span><MoneyInput className="mt-1.5" value={edit.annual_salary_pence} onChange={(v) => setEdit({ ...edit, annual_salary_pence: v })} /></div>
            <div><span className="eyebrow text-muted-foreground">…or hourly rate</span><MoneyInput className="mt-1.5" value={edit.hourly_rate_pence} onChange={(v) => setEdit({ ...edit, hourly_rate_pence: v })} /></div>
            <SelectField label="Student loan" value={edit.student_loan_plan} onChange={(e) => setEdit({ ...edit, student_loan_plan: e.target.value as never })}><option value="none">None</option><option value="plan1">Plan 1</option><option value="plan2">Plan 2</option><option value="plan4">Plan 4</option><option value="plan5">Plan 5</option></SelectField>
            <TextField label="Start date" type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
            <div className="sm:col-span-2 divide-y divide-hairline"><Toggle label="In the workplace pension" hint="Statutory minimum: 5% employee, 3% employer on qualifying earnings." checked={edit.pension_opt_in} onChange={(v) => setEdit({ ...edit, pension_opt_in: v })} /><Toggle label="Currently employed" checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} /></div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={runDlg.open} onClose={runDlg.hide} title="New pay run" wide footer={<><Button onClick={runDlg.hide}>Cancel</Button><Button variant="signal" disabled={!preview || !!preview.error} onClick={async () => { const dt = draft!; await saveRun.mutateAsync({ id: uid(), period_label: format(new Date(dt.pay_date), "MMMM yyyy"), period_end: dt.pay_date, pay_date: dt.pay_date, period_number: preview!.period, frequency: "monthly", lines: preview!.lines, status: "draft", created_at: new Date().toISOString() }); runDlg.hide(); toast.success("Draft pay run saved"); }}>Save draft</Button></>}>
        {draft && preview ? (
          <div className="space-y-4">
            <TextField label="Pay date" type="date" value={draft.pay_date} onChange={(e) => setDraft({ ...draft, pay_date: e.target.value })} />
            {preview.error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{preview.error}</p> : null}
            {active.map((e, i) => (
              <div key={e.id} className="rounded-xl border border-hairline p-3 text-sm">
                <div className="flex items-center justify-between"><p className="font-display font-semibold">{e.name}</p><p className="num font-bold">{preview.lines[i] ? gbp(preview.lines[i]!.net_pence) : "—"} <span className="font-normal text-muted-foreground">net</span></p></div>
                {e.hourly_rate_pence ? <div className="mt-2 max-w-40"><TextField label="Hours worked" type="number" value={draft.hours[e.id] ?? ""} onChange={(ev) => setDraft({ ...draft, hours: { ...draft.hours, [e.id]: parseFloat(ev.target.value) || 0 } })} /></div> : null}
                {preview.lines[i] ? <p className="mt-2 text-xs text-muted-foreground">Gross {gbp(preview.lines[i]!.gross_pence)} · tax {gbp(preview.lines[i]!.tax_pence)} · NI {gbp(preview.lines[i]!.employee_ni_pence)}{preview.lines[i]!.pension_employee_pence ? ` · pension ${gbp(preview.lines[i]!.pension_employee_pence)}` : ""}{preview.lines[i]!.student_loan_pence ? ` · SL ${gbp(preview.lines[i]!.student_loan_pence)}` : ""} · employer NI {gbp(preview.lines[i]!.employer_ni_pence)}</p> : null}
                <div className="mt-2 max-w-44"><span className="eyebrow text-muted-foreground">Override gross (bonus, etc.)</span><MoneyInput className="mt-1" value={draft.overrides[e.id] ?? 0} onChange={(v) => setDraft({ ...draft, overrides: { ...draft.overrides, [e.id]: v } })} /></div>
              </div>
            ))}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
