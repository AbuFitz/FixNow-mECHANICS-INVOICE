import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Plus, Trash2 } from "lucide-react";
import { Button, Card, PageHeader, SectionTitle, SelectField, Spinner, Tabs, TextAreaField, TextField, Toggle } from "@/components/ui";
import { useCollection, useSaveRow, useRemoveRow, useSaveSettings, useSettings } from "@/lib/hooks";
import type { Account, BillingSettings, KpiKey } from "@/lib/types";
import { api } from "@/lib/api";
import { downloadText } from "@/lib/csv";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";
import { kpiLabel } from "@/lib/acct/reports";
import { uid } from "@/lib/format";

type Tab = "business" | "documents" | "tax" | "accounts" | "benchmarks" | "data";

export function Settings() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [s, setS] = useState<BillingSettings | null>(null);
  const [tab, setTab] = useState<Tab>("business");
  useEffect(() => { if (data && !s) setS(structuredClone(data)); }, [data, s]);
  if (isLoading || !s) return <Spinner />;

  const b = s.business;
  const setB = (p: Partial<typeof b>) => setS({ ...s, business: { ...b, ...p } });
  const setBank = (p: Partial<typeof b.bank>) => setB({ bank: { ...b.bank, ...p } });
  const setD = (p: Partial<typeof s.defaults>) => setS({ ...s, defaults: { ...s.defaults, ...p } });
  const setT = (p: Partial<typeof s.tax>) => setS({ ...s, tax: { ...s.tax, ...p } });

  const missing: string[] = [];
  if (!b.bank.account_number || !b.bank.sort_code) missing.push("Bank details (needed on every invoice)");
  if (!b.registered_office && !b.address) missing.push("Registered office / trading address (company documents should show it)");
  if (b.vat_registered && !b.vat_number) missing.push("VAT number (required on VAT invoices)");

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Your business details are stamped onto each document when it's created, so past paperwork never changes if you update these." actions={<Button variant="signal" loading={save.isPending} onClick={async () => { await save.mutateAsync(s); toast.success("Settings saved"); }}>Save settings</Button>} />
      {missing.length ? (
        <Card className="border-warning/50 bg-warning/10 p-4">
          <p className="flex items-center gap-2 font-display font-semibold"><AlertTriangle className="h-4 w-4" /> Still needed</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </Card>
      ) : null}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "business", label: "Business" }, { value: "documents", label: "Documents" }, { value: "tax", label: "Tax & VAT" }, { value: "accounts", label: "Chart of accounts" }, { value: "benchmarks", label: "Benchmarks" }, { value: "data", label: "Data" }]} />

      {tab === "business" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <SectionTitle>Company</SectionTitle>
            <TextField label="Trading name" value={b.trading_name} onChange={(e) => setB({ trading_name: e.target.value })} />
            <TextField label="Legal name" value={b.legal_name} onChange={(e) => setB({ legal_name: e.target.value })} />
            <TextField label="Company number" value={b.company_number} onChange={(e) => setB({ company_number: e.target.value })} />
            <TextField label="Registered in" value={b.registered_in} onChange={(e) => setB({ registered_in: e.target.value })} hint="Check this against your Companies House record — it was assumed." />
            <TextField label="Registered office" value={b.registered_office} onChange={(e) => setB({ registered_office: e.target.value })} />
            <TextField label="Trading address (optional)" value={b.address} onChange={(e) => setB({ address: e.target.value })} />
            <TextField label="Descriptor line" value={b.descriptor} onChange={(e) => setB({ descriptor: e.target.value })} />
            <TextField label="Tagline" value={b.tagline} onChange={(e) => setB({ tagline: e.target.value })} />
          </Card>
          <div className="space-y-5">
            <Card className="space-y-3 p-5">
              <SectionTitle>Contact</SectionTitle>
              <TextField label="Phone" value={b.phone} onChange={(e) => setB({ phone: e.target.value })} />
              <TextField label="Email" value={b.email} onChange={(e) => setB({ email: e.target.value })} />
              <TextField label="Website" value={b.website} onChange={(e) => setB({ website: e.target.value })} />
              <TextField label="Google review link" value={b.review_url} onChange={(e) => setB({ review_url: e.target.value })} />
            </Card>
            <Card className="space-y-3 p-5">
              <SectionTitle>Bank details for invoices</SectionTitle>
              <TextField label="Account name" value={b.bank.account_name} onChange={(e) => setBank({ account_name: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Sort code" value={b.bank.sort_code} onChange={(e) => setBank({ sort_code: e.target.value })} placeholder="00-00-00" />
                <TextField label="Account number" value={b.bank.account_number} onChange={(e) => setBank({ account_number: e.target.value })} />
              </div>
              <TextField label="Bank" value={b.bank.bank_name} onChange={(e) => setBank({ bank_name: e.target.value })} />
            </Card>
            <Card className="space-y-3 p-5">
              <SectionTitle>Tracker link</SectionTitle>
              <TextField label="FixNow Tracking address" value={s.tracker_url} onChange={(e) => setS({ ...s, tracker_url: e.target.value })} placeholder="https://track.fixnowmechanics.co.uk" hint="Adds an “Open in Tracking” button on every job." />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <SectionTitle>Numbering</SectionTitle>
            <p className="text-sm text-muted-foreground">Numbers run in strict sequence per type and year, e.g. INV-2026-0001. They're assigned when a document is issued.</p>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(s.numbering) as (keyof typeof s.numbering)[]).map((k) => <TextField key={k} label={k.replace("_", " ")} value={s.numbering[k]} onChange={(e) => setS({ ...s, numbering: { ...s.numbering, [k]: e.target.value.toUpperCase() } })} />)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Invoice payment terms (days)" type="number" value={s.defaults.payment_terms_days} onChange={(e) => setD({ payment_terms_days: parseInt(e.target.value, 10) || 0 })} />
              <TextField label="Quote valid for (days)" type="number" value={s.defaults.quote_valid_days} onChange={(e) => setD({ quote_valid_days: parseInt(e.target.value, 10) || 0 })} />
            </div>
          </Card>
          <Card className="space-y-3 p-5">
            <SectionTitle>Default warranty</SectionTitle>
            <TextField label="Parts" value={s.defaults.parts_warranty} onChange={(e) => setD({ parts_warranty: e.target.value })} />
            <TextField label="Labour" value={s.defaults.labour_warranty} onChange={(e) => setD({ labour_warranty: e.target.value })} />
            <TextAreaField label="Default exclusions (one per line)" value={s.defaults.exclusions.join("\n")} onChange={(e) => setD({ exclusions: e.target.value.split("\n") })} />
          </Card>
          <Card className="space-y-3 p-5 lg:col-span-2">
            <SectionTitle>Wording</SectionTitle>
            <TextAreaField label="Terms & legal notice" value={s.defaults.legal_text} onChange={(e) => setD({ legal_text: e.target.value })} className="[&_textarea]:min-h-28" hint="Review with your solicitor/accountant — particularly liability wording for consumers." />
            <TextAreaField label="Statutory rights line" value={s.defaults.statutory_note} onChange={(e) => setD({ statutory_note: e.target.value })} />
            <TextAreaField label="Quote terms" value={s.defaults.quote_terms} onChange={(e) => setD({ quote_terms: e.target.value })} />
            <TextAreaField label="Payment instruction" value={s.defaults.late_payment_note} onChange={(e) => setD({ late_payment_note: e.target.value })} />
            <div className="divide-y divide-hairline">
              <Toggle checked={s.defaults.show_legal} onChange={(v) => setD({ show_legal: v })} label="Include terms by default" />
              <Toggle checked={s.defaults.show_review} onChange={(v) => setD({ show_review: v })} label="Include review request by default" />
              <Toggle checked={s.defaults.show_qr} onChange={(v) => setD({ show_qr: v })} label="Include “view online” QR by default" />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "tax" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <SectionTitle>VAT</SectionTitle>
            <Toggle checked={b.vat_registered} onChange={(v) => setB({ vat_registered: v })} label="VAT registered" hint="Turn on once you're registered (compulsory when taxable turnover passes the threshold — check gov.uk)." />
            {b.vat_registered ? (
              <>
                <TextField label="VAT number" value={b.vat_number} onChange={(e) => setB({ vat_number: e.target.value })} />
                <SelectField label="VAT scheme" value={s.tax.vat_scheme} onChange={(e) => setT({ vat_scheme: e.target.value as never })}>
                  <option value="standard">Standard accounting</option><option value="cash">Cash accounting</option><option value="flat_rate">Flat rate scheme</option>
                </SelectField>
                {s.tax.vat_scheme === "flat_rate" ? <TextField label="Flat rate %" type="number" step="0.5" value={s.tax.flat_rate_percent} onChange={(e) => setT({ flat_rate_percent: parseFloat(e.target.value) || 0 })} hint="Use the rate for your trade sector from HMRC." /> : null}
                <SelectField label="Return frequency" value={s.tax.vat_frequency} onChange={(e) => setT({ vat_frequency: e.target.value as never })}><option value="quarterly">Quarterly</option><option value="monthly">Monthly</option><option value="annual">Annual</option></SelectField>
                <SelectField label="First quarter starts in" value={s.tax.vat_stagger_start_month} onChange={(e) => setT({ vat_stagger_start_month: parseInt(e.target.value, 10) })}><option value="1">Jan / Apr / Jul / Oct</option><option value="2">Feb / May / Aug / Nov</option><option value="3">Mar / Jun / Sep / Dec</option></SelectField>
              </>
            ) : null}
          </Card>
          <Card className="space-y-3 p-5">
            <SectionTitle>Accounting</SectionTitle>
            <SelectField label="Basis for reports" value={s.tax.accounting_basis} onChange={(e) => setT({ accounting_basis: e.target.value as never })}><option value="accrual">Accrual (when invoiced)</option><option value="cash">Cash (when paid)</option></SelectField>
            <SelectField label="Financial year ends" value={s.tax.financial_year_end_month} onChange={(e) => setT({ financial_year_end_month: parseInt(e.target.value, 10) })}>
              {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Mileage rate – first 10,000 mi (p)" type="number" value={s.tax.mileage_rate_first_10k_pence} onChange={(e) => setT({ mileage_rate_first_10k_pence: parseInt(e.target.value, 10) || 0 })} />
              <TextField label="After 10,000 mi (p)" type="number" value={s.tax.mileage_rate_after_10k_pence} onChange={(e) => setT({ mileage_rate_after_10k_pence: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <p className="text-xs text-muted-foreground">Approved mileage rates are HMRC's published figures; confirm they are current.</p>
          </Card>
        </div>
      ) : null}

      {tab === "accounts" ? <AccountsEditor /> : null}

      {tab === "benchmarks" ? (
        <Card className="space-y-4 p-5">
          <SectionTitle action={<Button size="sm" onClick={() => setS({ ...s, benchmarks: [...s.benchmarks, { id: uid(), label: "", metric: "gross_margin_pct", value: 0, source: "" }] })}><Plus className="h-4 w-4" /> Add</Button>}>Industry benchmarks</SectionTitle>
          <p className="text-sm text-muted-foreground">Enter figures from a source you trust (trade body, accountant, ONS). The app compares your results against these — it never invents benchmark data.</p>
          {s.benchmarks.map((bm) => (
            <div key={bm.id} className="grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[1.2fr_1fr_100px_1.2fr_auto]">
              <TextField label="Label" value={bm.label} onChange={(e) => setS({ ...s, benchmarks: s.benchmarks.map((x) => (x.id === bm.id ? { ...x, label: e.target.value } : x)) })} />
              <SelectField label="Metric" value={bm.metric} onChange={(e) => setS({ ...s, benchmarks: s.benchmarks.map((x) => (x.id === bm.id ? { ...x, metric: e.target.value as KpiKey } : x)) })}>
                {(["gross_margin_pct", "net_margin_pct", "avg_invoice_pence", "dso_days", "repeat_customer_pct", "parts_margin_pct"] as KpiKey[]).map((k) => <option key={k} value={k}>{kpiLabel(k)}</option>)}
              </SelectField>
              <TextField label="Value" type="number" value={bm.value} onChange={(e) => setS({ ...s, benchmarks: s.benchmarks.map((x) => (x.id === bm.id ? { ...x, value: parseFloat(e.target.value) || 0 } : x)) })} />
              <TextField label="Source" value={bm.source} onChange={(e) => setS({ ...s, benchmarks: s.benchmarks.map((x) => (x.id === bm.id ? { ...x, source: e.target.value } : x)) })} />
              <Button aria-label="Remove" className="self-end" onClick={() => setS({ ...s, benchmarks: s.benchmarks.filter((x) => x.id !== bm.id) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </Card>
      ) : null}

      {tab === "data" ? (
        <Card className="space-y-3 p-5">
          <SectionTitle>Backup & export</SectionTitle>
          <p className="text-sm text-muted-foreground">Download everything as one JSON file — documents, payments, revisions and every accounting record. Keep a copy somewhere safe; hand a CSV set to your accountant from Reports and Tax.</p>
          <Button variant="ink" onClick={async () => {
            const [docs, payments, events] = await Promise.all([api.docs.list(), api.payments.list(), api.events.list()]);
            const cols = ["contacts", "presets", "bills", "expenses", "bank_accounts", "bank_txns", "projects", "time_entries", "budgets", "vat_returns", "employees", "pay_runs", "accounts"] as const;
            const records: Record<string, unknown> = {};
            for (const c of cols) records[c] = await api.col(c).list();
            downloadText(`fixnow-billing-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported_at: new Date().toISOString(), settings: s, docs, payments, events, records }, null, 2), "application/json");
          }}><Download className="h-4 w-4" /> Download full backup</Button>
        </Card>
      ) : null}
    </div>
  );
}

function AccountsEditor() {
  const { data, isLoading } = useCollection("accounts");
  const save = useSaveRow("accounts");
  const remove = useRemoveRow("accounts");
  const [seeding, setSeeding] = useState(false);
  if (isLoading) return <Spinner />;
  const list = data ?? [];
  const GROUPS: Account["group"][] = ["income", "cost_of_sales", "expense", "payroll", "other_income"];
  return (
    <Card className="p-5">
      <SectionTitle action={<Button size="sm" onClick={() => save.mutate({ code: String(900 + list.length), name: "New category", group: "expense", default_vat: 20, hmrc_category: "otherExpenses", id: uid() })}><Plus className="h-4 w-4" /> Add category</Button>}>Chart of accounts</SectionTitle>
      {list.length === 0 ? (
        <div className="mt-4 text-sm text-muted-foreground">
          <p>Using the built-in categories for a mobile mechanic. Customise by copying them in first.</p>
          <Button className="mt-3" loading={seeding} onClick={async () => { setSeeding(true); for (const a of DEFAULT_ACCOUNTS) await api.col("accounts").upsert({ ...a, id: a.code }); await save.mutateAsync({ ...DEFAULT_ACCOUNTS[0]!, id: DEFAULT_ACCOUNTS[0]!.code }); setSeeding(false); }}>Copy defaults to edit</Button>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-hairline">
          {list.sort((a, b) => a.code.localeCompare(b.code)).map((a) => (
            <div key={a.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 py-2 sm:grid-cols-[70px_1fr_160px_80px_auto]">
              <input aria-label="Code" className="mono h-10 rounded-lg border border-hairline bg-surface px-2" value={a.code} onChange={(e) => save.mutate({ ...a, code: e.target.value })} />
              <input aria-label="Name" className="h-10 rounded-lg border border-hairline bg-surface px-2" value={a.name} onChange={(e) => save.mutate({ ...a, name: e.target.value })} />
              <select aria-label="Group" className="hidden h-10 rounded-lg border border-hairline bg-surface px-2 sm:block" value={a.group} onChange={(e) => save.mutate({ ...a, group: e.target.value as Account["group"] })}>{GROUPS.map((g) => <option key={g} value={g}>{g.replace("_", " ")}</option>)}</select>
              <select aria-label="Default VAT" className="hidden h-10 rounded-lg border border-hairline bg-surface px-2 sm:block" value={a.default_vat} onChange={(e) => save.mutate({ ...a, default_vat: Number(e.target.value) })}><option value={20}>20%</option><option value={5}>5%</option><option value={0}>0%</option></select>
              <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
