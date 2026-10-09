import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, FileUp, Landmark, Plus, Sparkles, Undo2, Wand2 } from "lucide-react";
import { Badge, Button, Card, Dialog, Empty, MoneyInput, PageHeader, Select, SelectField, Spinner, Tabs, TextField, useDisclosure } from "@/components/ui";
import { useBooks } from "@/lib/useLedger";
import { useCollection, useInvalidate, useSaveRow } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { BankAccount, BankTransaction, MatchTarget } from "@/lib/types";
import { parseBankCsv, suggest, type Suggestion } from "@/lib/acct/bank";
import { bankBalance, billBalance } from "@/lib/acct/reports";
import { balanceDue } from "@/lib/status";
import { d, uid } from "@/lib/format";
import { gbp } from "@/lib/money";
import { DEFAULT_ACCOUNTS } from "@/lib/defaults";

type Tab = "todo" | "done" | "all";

export function Banking() {
  const books = useBooks();
  const { data: rules } = useCollection("presets");
  const saveTxn = useSaveRow("bank_txns");
  const saveAcc = useSaveRow("bank_accounts");
  const saveBill = useSaveRow("bills");
  const saveExp = useSaveRow("expenses");
  const invalidate = useInvalidate();
  const fileRef = useRef<HTMLInputElement>(null);
  const addAcc = useDisclosure();
  const direct = useDisclosure();
  const [tab, setTab] = useState<Tab>("todo");
  const [acc, setAcc] = useState<string>("");
  const [newAcc, setNewAcc] = useState<BankAccount | null>(null);
  const [cat, setCat] = useState<{ t: BankTransaction; account: string; vat: number; desc: string } | null>(null);
  const bankRules = (rules ?? []).filter((r) => r.kind === "bank_rule");

  const accountId = acc || books.bankAccounts[0]?.id || "";
  const txns = useMemo(() => books.bankTxns.filter((t) => t.bank_account_id === accountId).sort((a, b) => b.date.localeCompare(a.date)), [books.bankTxns, accountId]);
  const shown = txns.filter((t) => (tab === "all" ? true : tab === "todo" ? !t.matched : !!t.matched));
  if (books.loading) return <Spinner />;
  const account = books.bankAccounts.find((a) => a.id === accountId);
  const ctx = { docs: books.docs, bills: books.bills, expenses: books.expenses, rules: bankRules };

  async function apply(t: BankTransaction, s: Suggestion) {
    if (s.type === "payment") {
      const doc = books.docs.find((x) => x.id === s.target_id)!;
      const p = await api.payments.add({ document_id: doc.id, amount_pence: Math.min(Math.abs(t.amount_pence), Math.max(balanceDue(doc), 0)) || Math.abs(t.amount_pence), method: "bank_transfer", paid_at: t.date, reference: t.description.slice(0, 40), note: "Reconciled", bank_txn_id: t.id });
      await saveTxn.mutateAsync({ ...t, matched: { type: "payment", id: p.id } });
      invalidate("payments", "docs");
    } else if (s.type === "bill") {
      const b = books.bills.find((x) => x.id === s.target_id)!;
      const paid = b.paid_pence + Math.abs(t.amount_pence);
      await saveBill.mutateAsync({ ...b, paid_pence: paid, status: billBalance({ ...b, paid_pence: paid }) <= 0 ? "paid" : "approved" });
      await saveTxn.mutateAsync({ ...t, matched: { type: "bill", id: b.id } });
    } else if (s.type === "expense") {
      const e = books.expenses.find((x) => x.id === s.target_id)!;
      await saveExp.mutateAsync({ ...e, status: "reimbursed" });
      await saveTxn.mutateAsync({ ...t, matched: { type: "expense", id: e.id } });
    } else {
      await saveTxn.mutateAsync({ ...t, matched: { type: "direct", account: s.account ?? "499", vat_rate: s.vat_rate ?? 0, description: t.description } });
    }
    toast.success("Reconciled");
  }

  async function undo(t: BankTransaction) {
    const m = t.matched as MatchTarget;
    if (m?.type === "payment") await api.payments.remove(m.id);
    if (m?.type === "bill") {
      const b = books.bills.find((x) => x.id === m.id);
      if (b) await saveBill.mutateAsync({ ...b, paid_pence: Math.max(b.paid_pence - Math.abs(t.amount_pence), 0), status: "approved" });
    }
    await saveTxn.mutateAsync({ ...t, matched: null });
    invalidate("payments", "docs");
  }

  async function autoMatch() {
    let n = 0;
    for (const t of txns.filter((x) => !x.matched)) {
      const s = suggest(t, ctx).find((x) => x.confidence === "exact" || x.confidence === "rule");
      if (s) { await apply(t, s); n++; }
    }
    toast.success(n ? `Matched ${n} transaction${n > 1 ? "s" : ""}` : "No confident matches found");
  }

  async function importCsv(file: File) {
    const rows = parseBankCsv(await file.text());
    if (!rows.length) return toast.error("Couldn't find any transactions — the file needs Date, Description and Amount (or Paid in/Paid out) columns.");
    const existing = new Set(txns.map((t) => `${t.date}|${t.amount_pence}|${t.description}`));
    let added = 0;
    for (const r of rows) {
      if (existing.has(`${r.date}|${r.amount_pence}|${r.description}`)) continue;
      await api.col("bank_txns").upsert({ id: uid(), bank_account_id: accountId, date: r.date, description: r.description, amount_pence: r.amount_pence, external_id: `csv-${r.date}-${r.amount_pence}`, matched: null, created_at: new Date().toISOString() });
      added++;
    }
    invalidate("col");
    toast.success(`Imported ${added} new transaction${added === 1 ? "" : "s"} (${rows.length - added} duplicates skipped)`);
  }

  if (books.bankAccounts.length === 0) {
    return (
      <div>
        <PageHeader title="Bank & reconcile" />
        <Empty icon={<Landmark className="h-5 w-5" />} title="Add your business bank account" body="Import statements as CSV (every UK bank offers this), then match each line to an invoice, bill or category." action={<Button variant="signal" onClick={() => { setNewAcc({ id: uid(), name: "Business current account", currency: "GBP", opening_balance_pence: 0, sort_code: "", account_number: "", created_at: new Date().toISOString() }); addAcc.show(); }}><Plus className="h-4 w-4" /> Add bank account</Button>} />
        {accountDialog()}
      </div>
    );
  }

  function accountDialog() {
    return (
      <Dialog open={addAcc.open} onClose={addAcc.hide} title="Bank account" footer={<><Button onClick={addAcc.hide}>Cancel</Button><Button variant="signal" disabled={!newAcc?.name} onClick={async () => { await saveAcc.mutateAsync(newAcc!); addAcc.hide(); }}>Save</Button></>}>
        {newAcc ? <div className="space-y-3"><TextField label="Name" value={newAcc.name} onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })} /><div><span className="eyebrow text-muted-foreground">Opening balance (at the start of your first statement)</span><MoneyInput className="mt-1.5" value={newAcc.opening_balance_pence} onChange={(v) => setNewAcc({ ...newAcc, opening_balance_pence: v })} /></div></div> : null}
      </Dialog>
    );
  }

  return (
    <div>
      <PageHeader title="Bank & reconcile" subtitle="Import statements, then match each line to paperwork. Matching an incoming payment to an invoice marks it paid." actions={
        <>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Import CSV</Button>
          <Button variant="signal" onClick={autoMatch}><Wand2 className="h-4 w-4" /> Auto-match</Button>
        </>
      } />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Bank account" className="max-w-xs" value={accountId} onChange={(e) => setAcc(e.target.value)}>{books.bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Button size="sm" onClick={() => { setNewAcc({ id: uid(), name: "", currency: "GBP", opening_balance_pence: 0, sort_code: "", account_number: "", created_at: new Date().toISOString() }); addAcc.show(); }}>+ Account</Button>
        {account ? <p className="ml-auto text-sm text-muted-foreground">Balance <strong className="num font-display text-lg text-foreground">{gbp(bankBalance(account, books.bankTxns))}</strong></p> : null}
      </div>
      <p className="mb-4 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">Live bank feeds need an open-banking provider (e.g. TrueLayer, GoCardless Bank Account Data) connected via an Edge Function — see Integrations in the docs. CSV import works with any bank today.</p>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: "todo", label: "To reconcile", count: txns.filter((t) => !t.matched).length }, { value: "done", label: "Reconciled", count: txns.filter((t) => t.matched).length }, { value: "all", label: "All" }]} />
      <div className="mt-4 space-y-2.5">
        {shown.length === 0 ? <Empty icon={<Check className="h-5 w-5" />} title={tab === "todo" ? "All reconciled" : "Nothing here"} /> : null}
        {shown.map((t) => {
          const sug = !t.matched ? suggest(t, ctx).slice(0, 3) : [];
          return (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-medium">{t.description}</p><p className="text-sm text-muted-foreground">{d(t.date)}</p></div>
                <p className={`num font-display text-lg font-bold ${t.amount_pence >= 0 ? "text-success" : ""}`}>{gbp(t.amount_pence)}</p>
              </div>
              {t.matched ? (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium text-success"><Check className="h-4 w-4" /> {t.matched.type === "direct" ? `Categorised: ${DEFAULT_ACCOUNTS.find((a) => a.code === (t.matched as { account: string }).account)?.name ?? ""}` : t.matched.type === "ignored" ? "Ignored" : `Matched to ${t.matched.type}`}</span>
                  <Button size="sm" variant="ghost" onClick={() => undo(t)}><Undo2 className="h-4 w-4" /> Undo</Button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {sug.map((s) => (
                    <button key={s.type + s.target_id} onClick={() => apply(t, s)} className="press flex w-full items-center justify-between gap-3 rounded-xl border border-signal-deep/40 bg-signal/15 px-3 py-2.5 text-left text-sm">
                      <span className="flex min-w-0 items-center gap-2"><Sparkles className="h-4 w-4 shrink-0" /><span className="truncate font-medium">{s.label}</span></span>
                      <Badge tone={s.confidence === "exact" ? "success" : "neutral"}>{s.confidence}</Badge>
                    </button>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setCat({ t, account: t.amount_pence > 0 ? "260" : "499", vat: 0, desc: t.description }); direct.show(); }}>Categorise…</Button>
                    <Button size="sm" variant="ghost" onClick={() => saveTxn.mutate({ ...t, matched: { type: "ignored" } })}>Ignore (transfer, etc.)</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {accountDialog()}
      <Dialog open={direct.open} onClose={direct.hide} title="Categorise transaction" footer={<><Button onClick={direct.hide}>Cancel</Button><Button variant="signal" onClick={async () => { await saveTxn.mutateAsync({ ...cat!.t, matched: { type: "direct", account: cat!.account, vat_rate: cat!.vat, description: cat!.desc } }); direct.hide(); }}>Save</Button></>}>
        {cat ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{cat.t.description} · {gbp(cat.t.amount_pence)}</p><SelectField label="Category" value={cat.account} onChange={(e) => { const a = DEFAULT_ACCOUNTS.find((x) => x.code === e.target.value); setCat({ ...cat, account: e.target.value, vat: a?.default_vat ?? 0 }); }}>{DEFAULT_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</SelectField><SelectField label="VAT included" value={cat.vat} onChange={(e) => setCat({ ...cat, vat: Number(e.target.value) })}><option value={20}>20%</option><option value={5}>5%</option><option value={0}>No VAT</option></SelectField><TextField label="Description" value={cat.desc} onChange={(e) => setCat({ ...cat, desc: e.target.value })} /></div> : null}
      </Dialog>
    </div>
  );
}
