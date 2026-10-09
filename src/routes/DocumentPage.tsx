import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Banknote, Bell, Copy, CreditCard, Download, FileMinus2, FilePlus2, FileText, History, MoreHorizontal, Receipt, Send, Trash2, UserRound, Ban, RotateCcw, CheckCircle2, XCircle, Link2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCollection, useDoc, useDocs, useEvents, useInvalidate, usePayments, useRevisions, useSettings, useJobs } from "@/lib/hooks";
import type { BillingDocument, Contact, DocType, DocumentContent } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { computeTotals } from "@/lib/totals";
import { checkDocument } from "@/lib/completeness";
import { balanceDue } from "@/lib/status";
import { gbp } from "@/lib/money";
import { DOC_LABEL } from "@/lib/defaults";
import { d, dt, isoDate, uid } from "@/lib/format";
import { modelFor, downloadPdf } from "@/lib/pdfAction";
import { Badge, Button, Card, Dialog, Input, Menu, MenuItem, MenuLabel, MoneyInput, Segmented, SectionTitle, SelectField, Spinner, TextAreaField, TextField, Toggle, useDisclosure } from "@/components/ui";
import { AmendedBadge, DocStatus } from "@/components/StatusBadges";
import { PdfPreview } from "@/components/PdfPreview";
import { ItemsEditor } from "@/components/editor/ItemsEditor";
import { AdvisoriesEditor } from "@/components/editor/AdvisoriesEditor";
import { PhotoField } from "@/components/editor/PhotoField";
import { SignaturePad } from "@/components/SignaturePad";
import { AmendDialog, ConfirmDialog, IssueDialog, PaymentDialog, ShareDialog } from "@/components/DocDialogs";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/cn";

type Panel = "edit" | "preview";

export function DocumentPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const { data: doc, isLoading } = useDoc(id);
  const { data: allDocs } = useDocs();
  const { data: payments } = usePayments();
  const { data: settings } = useSettings();
  const { data: contacts } = useCollection("contacts");
  const { data: presets } = useCollection("presets");
  const { data: events } = useEvents(id);
  const { data: revisions } = useRevisions(id);
  const { data: jobs } = useJobs();

  const [content, setContent] = useState<DocumentContent | null>(null);
  const [panel, setPanel] = useState<Panel>("edit");
  const [renderAs, setRenderAs] = useState<"document" | "receipt">("document");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState(false);
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [amendNote, setAmendNote] = useState("");

  const share = useDisclosure();
  const reminder = useDisclosure();
  const pay = useDisclosure();
  const issue = useDisclosure();
  const amend = useDisclosure();
  const picker = useDisclosure();
  const del = useDisclosure();
  const voidDlg = useDisclosure();

  // Load working copy once per document (and when the server copy changes while clean).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    const sig = `${doc.id}:${doc.revision}:${doc.updated_at}`;
    if (loadedFor.current === null || loadedFor.current.split(":")[0] !== doc.id) {
      setContent(structuredClone(doc.content));
      loadedFor.current = sig;
    } else if (!dirtyRef.current) {
      setContent(structuredClone(doc.content));
      loadedFor.current = sig;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.revision, doc?.updated_at]);

  const dirty = !!doc && !!content && JSON.stringify(content) !== JSON.stringify(doc.content);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const isDraft = doc?.lifecycle === "draft";

  // Autosave drafts.
  useEffect(() => {
    if (!doc || !content || !isDraft || !dirty) return;
    setSaving("saving");
    const t = setTimeout(async () => {
      try {
        await api.docs.update(doc.id, { content, total_pence: computeTotals(content).total_pence });
        await qc.invalidateQueries({ queryKey: ["docs"] });
        setSaving("saved");
      } catch (e) {
        setSaving("idle");
        toast.error(e instanceof Error ? e.message : "Couldn't save.");
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isDraft]);

  const docPayments = useMemo(() => (payments ?? []).filter((p) => p.document_id === id), [payments, id]);
  const parent = useMemo(() => (doc?.parent_id ? (allDocs ?? []).find((x) => x.id === doc.parent_id) : null), [doc, allDocs]);
  const children = useMemo(() => (allDocs ?? []).filter((x) => x.parent_id === id), [allDocs, id]);
  const job = useMemo(() => (jobs ?? []).find((j) => j.id === doc?.session_id), [jobs, doc]);

  const working: BillingDocument | null = useMemo(() => {
    if (!doc || !content) return null;
    const rev = viewRev ? (revisions ?? []).find((r) => r.revision === viewRev) : null;
    const c = rev ? rev.content : content;
    return { ...doc, content: { ...c, amendment_note: c.amendment_note || amendNote }, total_pence: computeTotals(c).total_pence, revision: rev ? rev.revision : doc.revision };
  }, [doc, content, viewRev, revisions, amendNote]);

  const previewModel = useMemo(() => (working ? modelFor(working, docPayments, { mode: renderAs, parentNumber: parent?.number ?? null }) : null), [working, docPayments, renderAs, parent]);

  if (isLoading || !doc || !content || !working || !previewModel) return <Spinner label="Opening document" />;

  const totals = computeTotals(content);
  const vatOn = content.business.vat_registered && content.vat_mode !== "none";
  const label = DOC_LABEL[doc.doc_type];
  const set = <K extends keyof DocumentContent>(k: K, v: DocumentContent[K]) => setContent((c) => (c ? { ...c, [k]: v } : c));
  const setIn = <K extends "customer" | "vehicle" | "job" | "warranty" | "options">(k: K, patch: Partial<DocumentContent[K]>) => setContent((c) => (c ? { ...c, [k]: { ...c[k], ...patch } } : c));
  const issues = checkDocument({ doc_type: doc.doc_type, content, total_pence: totals.total_pence }, settings!);

  async function flush() {
    await api.docs.update(doc!.id, { content: content!, total_pence: totals.total_pence });
  }

  async function doIssue() {
    setBusy(true);
    try {
      await flush();
      // keep customer book up to date
      const c = content!.customer;
      const known = (contacts ?? []).find((x) => x.id === doc!.contact_id) ?? (contacts ?? []).find((x) => (c.email && x.email === c.email) || (c.phone && x.phone === c.phone));
      let contactId = known?.id ?? null;
      if (!known && c.name) {
        contactId = uid();
        await api.col("contacts").upsert({ id: contactId, kind: "customer", name: c.name, company: c.company ?? "", email: c.email, phone: c.phone, address: c.address, postcode: c.postcode, vat_number: "", notes: "", cis_status: "none", cis_utr: "", default_account: "200", payment_terms_days: null, currency: "GBP", created_at: new Date().toISOString() });
        invalidate("col");
      }
      if (contactId !== doc!.contact_id) await api.docs.update(doc!.id, { contact_id: contactId });
      const issued = await api.docs.issue(doc!.id);
      const pp = content!.pending_payment;
      if (pp && pp.amount_pence > 0 && issued.doc_type !== "quote") {
        await api.payments.add({ document_id: issued.id, amount_pence: pp.amount_pence, method: pp.method, paid_at: isoDate(), reference: pp.reference, note: "" });
      }
      invalidate("docs", "payments", "events", "col");
      issue.hide();
      toast.success(`${label} ${issued.number} issued`);
      share.show();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't issue the document.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRevision(reason: string, note: string) {
    setBusy(true);
    try {
      const next = { ...content!, amendment_note: note };
      await api.docs.amend(doc!.id, next, computeTotals(next).total_pence, reason);
      invalidate("docs", "events", "revisions");
      amend.hide();
      toast.success(`Saved as revision ${doc!.revision + 1}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't amend.");
    } finally {
      setBusy(false);
    }
  }
  async function saveSilently() {
    setBusy(true);
    try {
      await api.docs.update(doc!.id, { content: content!, total_pence: computeTotals(content!).total_pence });
      await api.events.add({ document_id: doc!.id, session_id: doc!.session_id, kind: "edited", detail: { silent: true } });
      invalidate("docs", "events");
      amend.hide();
      toast.success("Saved");
    } finally {
      setBusy(false);
    }
  }

  async function createFrom(type: DocType, opts: { parent?: boolean; credit?: boolean } = {}) {
    const clone = structuredClone(doc!.content);
    clone.signoff = null;
    clone.amendment_note = "";
    clone.pending_payment = null;
    if (type === "credit_note") {
      clone.terms_text = "";
      clone.job.title = `Credit for ${doc!.number}${clone.job.title ? " — " + clone.job.title : ""}`;
      clone.advisories = [];
      clone.gallery = [];
    }
    if (type === "invoice" && doc!.doc_type === "quote") clone.terms_text = settings!.defaults.legal_text;
    const created = await api.docs.create({ doc_type: type, content: clone, session_id: doc!.session_id, contact_id: doc!.contact_id, parent_id: opts.parent ? doc!.id : null, project_id: doc!.project_id });
    invalidate("docs");
    nav(`/documents/${created.id}`);
    toast.success(`New draft ${DOC_LABEL[type].toLowerCase()} created`);
  }

  async function createPayLink() {
    if (api.mode === "demo") return toast.message("Online card payments need a connected Supabase project and Stripe — see docs/INTEGRATIONS.md.");
    const { supabase } = await import("@/lib/api/supabase");
    const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>("stripe-payment-link", { body: { document_id: doc!.id } });
    if (error || !data?.url) return toast.error(data?.error ?? "Online payments aren't set up yet — see docs/INTEGRATIONS.md.");
    invalidate("docs");
    toast.success("Customers will now see a “Pay online” button on their link.");
  }

  const bal = balanceDue(doc);
  const canPay = (doc.doc_type === "invoice" || doc.doc_type === "receipt") && doc.lifecycle === "issued";
  const inputFolder = doc.id;

  const header = (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-hairline bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link to="/documents" aria-label="Back to documents" className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-2">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold leading-tight sm:text-xl">
            {label} <span className="mono text-[0.8em] font-medium text-muted-foreground">{doc.number ?? "DRAFT"}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <DocStatus doc={doc} />
            <AmendedBadge doc={doc} />
            {doc.lifecycle === "issued" && doc.first_viewed_at ? <Badge tone="info">Viewed by customer</Badge> : null}
            {isDraft ? <span className="text-xs text-muted-foreground">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : dirty ? "Unsaved" : "Auto-saves"}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft ? (
            <Button variant="signal" onClick={issue.show}>
              <FileText className="h-4 w-4" /> Issue {label.toLowerCase()}
            </Button>
          ) : doc.lifecycle === "issued" ? (
            <>
              {canPay && bal > 0 ? (
                <Button variant="ink" onClick={pay.show}>
                  <Banknote className="h-4 w-4" /> <span className="hidden sm:inline">Record</span> payment
                </Button>
              ) : null}
              <Button variant="signal" onClick={share.show}>
                <Send className="h-4 w-4" /> Send
              </Button>
            </>
          ) : null}
          <Menu
            trigger={
              <Button aria-label="More actions" className="w-11 px-0">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            }
          >
            <MenuLabel>Document</MenuLabel>
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => downloadPdf(previewModel)}>Download PDF</MenuItem>
            {canPay && docPayments.length > 0 ? (
              <MenuItem icon={<Receipt className="h-4 w-4" />} onClick={() => downloadPdf(modelFor(doc, docPayments, { mode: "receipt", parentNumber: parent?.number ?? null }))}>Download payment receipt</MenuItem>
            ) : null}
            {doc.lifecycle === "issued" ? (
              <MenuItem icon={<Link2 className="h-4 w-4" />} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/d/${doc.share_token}`); toast.success("Customer link copied"); }}>Copy customer link</MenuItem>
            ) : null}
            {doc.lifecycle === "issued" && doc.doc_type === "invoice" && bal > 0 ? (
              <MenuItem icon={<Bell className="h-4 w-4" />} onClick={reminder.show}>Send payment reminder</MenuItem>
            ) : null}
            {doc.lifecycle === "issued" && doc.doc_type === "invoice" && bal > 0 ? (
              <MenuItem icon={<CreditCard className="h-4 w-4" />} onClick={createPayLink}>{doc.pay_url ? "Refresh online payment link" : "Add “Pay online” (card)"}</MenuItem>
            ) : null}
            <MenuLabel>Create</MenuLabel>
            {doc.doc_type === "quote" && doc.lifecycle === "issued" ? (
              <MenuItem icon={<FilePlus2 className="h-4 w-4" />} onClick={() => createFrom("invoice", { parent: true })}>Turn into invoice</MenuItem>
            ) : null}
            {doc.doc_type === "invoice" && doc.lifecycle === "issued" ? (
              <MenuItem icon={<FileMinus2 className="h-4 w-4" />} onClick={() => createFrom("credit_note", { parent: true })}>Issue a credit note</MenuItem>
            ) : null}
            <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => createFrom(doc.doc_type)}>Duplicate as new draft</MenuItem>
            {doc.doc_type === "quote" && doc.lifecycle === "issued" && doc.quote_outcome === "pending" ? (
              <>
                <MenuLabel>Quote response</MenuLabel>
                <MenuItem icon={<CheckCircle2 className="h-4 w-4" />} onClick={async () => { await api.docs.setQuoteOutcome(doc.id, "accepted"); invalidate("docs", "events"); }}>Mark accepted (phone / in person)</MenuItem>
                <MenuItem icon={<XCircle className="h-4 w-4" />} onClick={async () => { await api.docs.setQuoteOutcome(doc.id, "declined"); invalidate("docs", "events"); }}>Mark declined</MenuItem>
              </>
            ) : null}
            <MenuLabel>Admin</MenuLabel>
            {doc.lifecycle === "void" ? (
              <MenuItem icon={<RotateCcw className="h-4 w-4" />} onClick={async () => { await api.docs.setVoid(doc.id, false, "Restored"); invalidate("docs", "events"); }}>Restore (un-void)</MenuItem>
            ) : doc.lifecycle === "issued" ? (
              <MenuItem icon={<Ban className="h-4 w-4" />} danger onClick={voidDlg.show}>Void this document</MenuItem>
            ) : null}
            <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={del.show}>Delete permanently</MenuItem>
          </Menu>
        </div>
      </div>
      <div className="mt-3 lg:hidden">
        <Segmented<Panel> value={panel} onChange={setPanel} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "PDF preview" }]} />
      </div>
    </div>
  );

  return (
    <div>
      {header}

      {doc.lifecycle === "issued" && dirty ? (
        <div className="rise-in sticky top-[84px] z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-3 text-ink-foreground shadow-lift sm:top-[76px]">
          <p className="text-sm"><strong className="font-display">You're editing an issued {label.toLowerCase()}.</strong> <span className="opacity-70">Changes aren't saved yet.</span></p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-ink-foreground hover:bg-white/10" onClick={() => setContent(structuredClone(doc.content))}>Discard</Button>
            <Button size="sm" variant="signal" onClick={amend.show}>Save changes…</Button>
          </div>
        </div>
      ) : null}
      {doc.lifecycle === "void" ? <div className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm font-medium text-destructive">This document is void. It stays on record but is excluded from totals and the VAT return.</div> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className={cn("min-w-0 space-y-5", panel === "preview" && "hidden lg:block")}>
          {/* Context */}
          {(job || parent || children.length) ? (
            <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-sm">
              {job ? <span>Job <strong className="mono">{job.job_reference}</strong> · {job.engineer_name ?? "unassigned"}</span> : null}
              {parent ? <Link className="font-medium underline decoration-signal decoration-2 underline-offset-4" to={`/documents/${parent.id}`}>From {DOC_LABEL[parent.doc_type].toLowerCase()} {parent.number}</Link> : null}
              {children.map((c) => (
                <Link key={c.id} className="font-medium underline decoration-signal decoration-2 underline-offset-4" to={`/documents/${c.id}`}>
                  → {DOC_LABEL[c.doc_type]} {c.number ?? "draft"}
                </Link>
              ))}
            </Card>
          ) : null}

          {isDraft ? (
            <Segmented<DocType>
              value={doc.doc_type}
              onChange={async (v) => { await api.docs.update(doc.id, { doc_type: v }); invalidate("docs"); }}
              options={[{ value: "receipt", label: "Receipt" }, { value: "invoice", label: "Invoice" }, { value: "quote", label: "Quote" }, { value: "credit_note", label: "Credit note" }]}
            />
          ) : null}

          {/* Customer */}
          <Section title="Customer" action={<Button size="sm" onClick={picker.show}><UserRound className="h-4 w-4" /> Choose</Button>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Full name" value={content.customer.name} onChange={(e) => setIn("customer", { name: e.target.value })} autoComplete="off" />
              <TextField label="Company (optional)" value={content.customer.company ?? ""} onChange={(e) => setIn("customer", { company: e.target.value })} />
              <TextField label="Mobile" type="tel" value={content.customer.phone} onChange={(e) => setIn("customer", { phone: e.target.value })} />
              <TextField label="Email" type="email" value={content.customer.email} onChange={(e) => setIn("customer", { email: e.target.value })} />
              <TextField label="Address" className="sm:col-span-1" value={content.customer.address} onChange={(e) => setIn("customer", { address: e.target.value })} />
              <TextField label="Postcode" value={content.customer.postcode} onChange={(e) => setIn("customer", { postcode: e.target.value.toUpperCase() })} />
            </div>
          </Section>

          {/* Vehicle */}
          <Section title="Vehicle">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Registration" className="[&_input]:mono [&_input]:uppercase" value={content.vehicle.registration} onChange={(e) => setIn("vehicle", { registration: e.target.value.toUpperCase() })} />
              <TextField label="Make & model" value={content.vehicle.make_model} onChange={(e) => setIn("vehicle", { make_model: e.target.value })} placeholder="Mazda 2 (2007)" />
              <TextField label="Mileage" inputMode="numeric" value={content.vehicle.mileage ? String(content.vehicle.mileage) : ""} onChange={(e) => setIn("vehicle", { mileage: parseInt(e.target.value.replace(/\D/g, ""), 10) || null })} />
              <TextField label="Colour" value={content.vehicle.colour ?? ""} onChange={(e) => setIn("vehicle", { colour: e.target.value })} />
              <TextField label="Service location" className="sm:col-span-2" value={content.vehicle.location} onChange={(e) => setIn("vehicle", { location: e.target.value })} />
            </div>
            <PreviousVehicle reg={content.vehicle.registration} docs={allDocs ?? []} currentId={doc.id} onUse={(prev) => setContent((c) => (c ? { ...c, vehicle: { ...c.vehicle, make_model: prev.vehicle.make_model, colour: prev.vehicle.colour }, customer: c.customer.name ? c.customer : prev.customer } : c))} />
          </Section>

          {/* Work */}
          <Section title={doc.doc_type === "quote" ? "Proposed work" : "Work carried out"}>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Service title" className="sm:col-span-2" value={content.job.title} onChange={(e) => setIn("job", { title: e.target.value })} placeholder="Battery replacement — supplied & fitted" />
              <TextAreaField label="Summary of work" className="sm:col-span-2" value={content.job.summary} onChange={(e) => setIn("job", { summary: e.target.value })} />
              <TextField label="Job reference" value={content.job.reference} onChange={(e) => setIn("job", { reference: e.target.value })} />
              <TextField label="Date of work" type="date" value={content.job.work_date ?? ""} onChange={(e) => setIn("job", { work_date: e.target.value })} />
              <TextField label="Engineer" value={content.job.engineer_name ?? ""} onChange={(e) => setIn("job", { engineer_name: e.target.value })} />
            </div>
          </Section>

          {/* Items */}
          <Section title="Items & pricing">
            <ItemsEditor content={content} presets={presets ?? []} vatOn={vatOn} onChange={(items) => set("items", items)} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="eyebrow text-muted-foreground">Discount</span>
                <MoneyInput className="mt-1.5" value={content.discount_pence} onChange={(v) => set("discount_pence", v)} />
              </div>
              {content.business.vat_registered ? (
                <SelectField label="VAT" value={content.vat_mode} onChange={(e) => set("vat_mode", e.target.value as DocumentContent["vat_mode"])}>
                  <option value="standard">Standard rate (20%)</option>
                  <option value="reduced">Reduced rate (5%)</option>
                  <option value="zero">Zero-rated</option>
                  <option value="none">Outside scope / not charged</option>
                </SelectField>
              ) : (
                <p className="self-end pb-2 text-xs text-muted-foreground">VAT isn't charged — you're set as not VAT registered (Settings).</p>
              )}
              <SelectField label="Currency" value={content.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </SelectField>
              {content.currency !== "GBP" ? (
                <FxRate currency={content.currency} value={content.fx_rate} onChange={(v) => set("fx_rate", v)} />
              ) : null}
            </div>
            <TotalsCard className="mt-4" content={content} />
            {totals.cost_pence > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Internal: cost {gbp(totals.cost_pence)} · margin <strong className={totals.margin_pence < 0 ? "text-destructive" : "text-foreground"}>{gbp(totals.margin_pence)}</strong> ({totals.net_pence ? Math.round((totals.margin_pence / totals.net_pence) * 100) : 0}%). Never shown to the customer.</p>
            ) : null}
          </Section>

          {/* Payment */}
          {doc.doc_type !== "quote" ? (
            <Section title="Payment" action={canPay && bal > 0 ? <Button size="sm" variant="ink" onClick={pay.show}>Record payment</Button> : undefined}>
              {isDraft && doc.doc_type !== "credit_note" ? (
                <div className="space-y-3">
                  <Toggle
                    checked={!!content.pending_payment}
                    onChange={(v) => set("pending_payment", v ? { amount_pence: totals.total_pence, method: "bank_transfer", reference: "" } : null)}
                    label="Customer has already paid"
                    hint="Recorded as a payment the moment you issue this document."
                  />
                  {content.pending_payment ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <span className="eyebrow text-muted-foreground">Amount</span>
                        <MoneyInput className="mt-1.5" value={content.pending_payment.amount_pence} onChange={(v) => set("pending_payment", { ...content.pending_payment!, amount_pence: v })} />
                      </div>
                      <SelectField label="Method" value={content.pending_payment.method} onChange={(e) => set("pending_payment", { ...content.pending_payment!, method: e.target.value as never })}>
                        {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </SelectField>
                      <TextField label="Reference" value={content.pending_payment.reference} onChange={(e) => set("pending_payment", { ...content.pending_payment!, reference: e.target.value })} />
                    </div>
                  ) : null}
                  {doc.doc_type === "invoice" ? (
                    <TextField label="Payment terms (days)" type="number" min={0} value={String(content.payment_terms_days)} onChange={(e) => set("payment_terms_days", parseInt(e.target.value, 10) || 0)} />
                  ) : null}
                </div>
              ) : (
                <PaymentsList docId={doc.id} />
              )}
              {doc.lifecycle === "issued" && doc.doc_type === "invoice" ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <TextField label="Due date" type="date" value={doc.due_at ?? ""} onChange={async (e) => { await api.docs.update(doc.id, { due_at: e.target.value || null }); invalidate("docs"); }} />
                </div>
              ) : null}
            </Section>
          ) : doc.lifecycle === "issued" ? (
            <Section title="Quote">
              <TextField label="Valid until" type="date" value={doc.valid_until ?? ""} onChange={async (e) => { await api.docs.update(doc.id, { valid_until: e.target.value || null }); invalidate("docs"); }} />
            </Section>
          ) : null}

          {/* Warranty */}
          <Section title="Warranty">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Parts warranty" value={content.warranty.parts} onChange={(e) => setIn("warranty", { parts: e.target.value })} placeholder="3-Year manufacturer guarantee" />
              <TextField label="Labour warranty" value={content.warranty.labour} onChange={(e) => setIn("warranty", { labour: e.target.value })} placeholder="30-Day workmanship guarantee" />
            </div>
            <div className="mt-3">
              <span className="eyebrow text-muted-foreground">Not covered</span>
              <div className="mt-2 space-y-2">
                {content.warranty.exclusions.map((ex, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={ex} aria-label={`Exclusion ${i + 1}`} onChange={(e) => setIn("warranty", { exclusions: content.warranty.exclusions.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <Button aria-label="Remove" className="w-11 px-0" onClick={() => setIn("warranty", { exclusions: content.warranty.exclusions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" onClick={() => setIn("warranty", { exclusions: [...content.warranty.exclusions, ""] })}>+ Add exclusion</Button>
              </div>
            </div>
          </Section>

          {/* Engineer report */}
          <Section title="Engineer's report">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextAreaField label="Condition on arrival" value={content.condition_on_arrival} onChange={(e) => set("condition_on_arrival", e.target.value)} hint="Pre-existing damage or faults — protects you." />
              <TextAreaField label="Work notes" value={content.engineer_notes} onChange={(e) => set("engineer_notes", e.target.value)} />
            </div>
          </Section>

          <Section title="Advisories & health check">
            <AdvisoriesEditor advisories={content.advisories} presets={presets ?? []} folder={inputFolder} onChange={(a) => set("advisories", a)} />
          </Section>

          <Section title="Photos from the job">
            <PhotoField photos={content.gallery} onChange={(g) => set("gallery", g)} folder={inputFolder} max={9} label="Add job photo" />
          </Section>

          <Section title="Customer sign-off">
            {content.signoff ? (
              <div className="space-y-3">
                <p className="text-sm">Signed by <strong>{content.signoff.name}</strong> on {dt(content.signoff.signed_at)}.</p>
                {content.signoff.signature ? <img src={content.signoff.signature} alt="Signature" className="h-20 rounded-lg border border-hairline bg-white p-1" /> : null}
                <Button size="sm" variant="danger" onClick={() => set("signoff", null)}>Remove sign-off</Button>
              </div>
            ) : (
              <SignoffCapture defaultName={content.customer.name} onSave={(name, signature) => set("signoff", { name, signature, signed_at: new Date().toISOString(), statement: "I confirm the work described has been completed to my satisfaction and the engineer has explained their recommendations to me." })} />
            )}
          </Section>

          {/* Options */}
          <Section title="Layout, terms & internal notes">
            <div className="divide-y divide-hairline">
              <Toggle checked={content.options.show_plate} onChange={(v) => setIn("options", { show_plate: v })} label="Number-plate graphic" />
              <Toggle checked={content.options.show_warranty} onChange={(v) => setIn("options", { show_warranty: v })} label="Warranty section" />
              <Toggle checked={content.options.show_legal} onChange={(v) => setIn("options", { show_legal: v })} label="Terms & legal notice" />
              <Toggle checked={content.options.show_review} onChange={(v) => setIn("options", { show_review: v })} label="Google review request + QR" />
              <Toggle checked={content.options.show_qr} onChange={(v) => setIn("options", { show_qr: v })} label="“View online” QR code" />
            </div>
            <div className="mt-3 space-y-3">
              <TextAreaField label="Terms text" value={content.terms_text} onChange={(e) => set("terms_text", e.target.value)} />
              <TextAreaField label="Extra footer note (optional)" value={content.footer_note} onChange={(e) => set("footer_note", e.target.value)} />
              <TextAreaField label="Internal notes (never printed or shared)" value={content.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} />
            </div>
          </Section>

          {/* History */}
          <Section title="History">
            {(revisions ?? []).length ? (
              <div className="mb-4">
                <p className="eyebrow mb-2 text-muted-foreground">Revisions</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={viewRev === null ? "ink" : "outline"} onClick={() => setViewRev(null)}>Current (Rev {doc.revision})</Button>
                  {(revisions ?? []).map((r) => (
                    <Button key={r.id} size="sm" variant={viewRev === r.revision ? "ink" : "outline"} onClick={() => { setViewRev(r.revision); setPanel("preview"); }}>
                      Rev {r.revision} · {gbp(r.total_pence)}
                    </Button>
                  ))}
                </div>
                {viewRev ? <p className="mt-2 text-xs text-muted-foreground">Previewing an earlier revision (read-only): {(revisions ?? []).find((r) => r.revision === viewRev)?.reason}</p> : null}
              </div>
            ) : null}
            <ul className="space-y-2.5">
              {(events ?? []).slice(0, 25).map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium capitalize">{e.kind.replace(/_/g, " ")}{typeof e.detail?.reason === "string" && e.detail.reason ? ` — ${e.detail.reason}` : ""}{typeof e.detail?.channel === "string" ? ` via ${e.detail.channel}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{dt(e.created_at)} · {e.actor}</p>
                  </div>
                </li>
              ))}
              {(events ?? []).length === 0 ? <li className="text-sm text-muted-foreground">No activity yet.</li> : null}
            </ul>
          </Section>
        </div>

        {/* Preview */}
        <div className={cn("min-w-0", panel === "edit" && "hidden lg:block")}>
          <div className="lg:sticky lg:top-[88px]">
            {docPayments.length > 0 && (doc.doc_type === "invoice") ? (
              <div className="mb-3">
                <Segmented<"document" | "receipt"> value={renderAs} onChange={setRenderAs} options={[{ value: "document", label: "As invoice" }, { value: "receipt", label: "As receipt" }]} />
              </div>
            ) : null}
            <div className="max-h-none overflow-y-auto rounded-2xl bg-surface-2 p-3 lg:max-h-[calc(100dvh-8rem)]">
              <PdfPreview model={previewModel} />
            </div>
          </div>
        </div>
      </div>

      {/* dialogs */}
      <ContactPicker open={picker.open} onClose={picker.hide} contacts={(contacts ?? []).filter((c) => c.kind !== "supplier")} onPick={(c) => { setContent((x) => (x ? { ...x, customer: { name: c.name, company: c.company, phone: c.phone, email: c.email, address: c.address, postcode: c.postcode } } : x)); api.docs.update(doc.id, { contact_id: c.id }); picker.hide(); }} />
      <IssueDialog open={issue.open} onClose={issue.hide} issues={issues} onConfirm={doIssue} busy={busy} docLabel={label} />
      <AmendDialog open={amend.open} onClose={amend.hide} revision={doc.revision} busy={busy} onRevision={(r, n) => { setAmendNote(n); saveRevision(r, n); }} onSilent={saveSilently} />
      {doc.lifecycle !== "draft" ? <ShareDialog doc={doc} payments={docPayments} open={share.open} onClose={share.hide} /> : null}
      {doc.lifecycle !== "draft" ? <ShareDialog doc={doc} payments={docPayments} open={reminder.open} onClose={reminder.hide} reminder /> : null}
      <PaymentDialog doc={doc} open={pay.open} onClose={pay.hide} />
      <ConfirmDialog open={voidDlg.open} onClose={voidDlg.hide} title="Void this document?" body="It stays on record (so numbering has no gaps) but no longer counts towards sales or VAT. The customer link will show it as void. You can restore it later." confirmLabel="Void document" danger onConfirm={async () => { await api.docs.setVoid(doc.id, true, "Voided by admin"); invalidate("docs", "events"); voidDlg.hide(); }} />
      <ConfirmDialog
        open={del.open}
        onClose={del.hide}
        title="Delete permanently?"
        body={doc.lifecycle === "draft" ? "This draft will be deleted." : "This permanently removes an issued document, its payments and its revisions. Prefer voiding unless this was created by mistake. This can't be undone."}
        confirmLabel="Delete"
        danger
        requireText={doc.lifecycle === "draft" ? undefined : "DELETE"}
        onConfirm={async () => { await api.docs.remove(doc.id); invalidate("docs", "payments"); del.hide(); nav("/documents"); toast.success("Deleted"); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4">
        <SectionTitle action={action}>{title}</SectionTitle>
      </div>
      {children}
    </Card>
  );
}

function TotalsCard({ content, className }: { content: DocumentContent; className?: string }) {
  const t = computeTotals(content);
  const cur = content.currency;
  const row = (k: string, v: string, strong = false) => (
    <div className={cn("flex justify-between py-1 text-sm", strong && "font-display text-base font-bold")}>
      <span className={strong ? "" : "text-muted-foreground"}>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
  return (
    <div className={cn("rounded-2xl bg-ink p-4 text-ink-foreground", className)}>
      <div className="[&_span:first-child]:text-white/60">
        {row("Subtotal", gbp(t.subtotal_pence, cur))}
        {t.discount_pence ? row(content.discount_label || "Discount", `-${gbp(t.discount_pence, cur)}`) : null}
        {t.vat_buckets.some((b) => b.rate > 0) ? t.vat_buckets.filter((b) => b.rate > 0).map((b) => <div key={b.rate}>{row(`VAT @ ${b.rate}%`, gbp(b.vat_pence, cur))}</div>) : row("VAT", "not charged")}
      </div>
      <div className="mt-2 flex items-end justify-between border-t border-white/15 pt-3">
        <span className="eyebrow text-white/60">Total</span>
        <span className="num font-display text-3xl font-bold text-signal">{gbp(t.total_pence, cur)}</span>
      </div>
    </div>
  );
}

function PaymentsList({ docId }: { docId: string }) {
  const { data: payments } = usePayments();
  const invalidate = useInvalidate();
  const mine = (payments ?? []).filter((p) => p.document_id === docId);
  if (!mine.length) return <p className="text-sm text-muted-foreground">No payments recorded yet.</p>;
  return (
    <ul className="divide-y divide-hairline">
      {mine.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{gbp(p.amount_pence)} <span className="font-normal text-muted-foreground">· {PAYMENT_METHODS.find((m) => m.value === p.method)?.label}</span></p>
            <p className="text-xs text-muted-foreground">{d(p.paid_at)}{p.reference ? ` · ${p.reference}` : ""}{p.bank_txn_id ? " · reconciled" : ""}</p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Remove payment" onClick={async () => { await api.payments.remove(p.id); invalidate("payments", "docs", "events"); }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SignoffCapture({ defaultName, onSave }: { defaultName: string; onSave: (name: string, sig: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [sig, setSig] = useState("");
  return (
    <div className="space-y-3">
      <TextField label="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
      <SignaturePad onChange={setSig} />
      <Button variant="ink" disabled={!name || !sig} onClick={() => onSave(name, sig)}>Save sign-off</Button>
    </div>
  );
}

function PreviousVehicle({ reg, docs, currentId, onUse }: { reg: string; docs: BillingDocument[]; currentId: string; onUse: (c: DocumentContent) => void }) {
  const norm = reg.replace(/\s/g, "").toUpperCase();
  const prev = norm.length >= 4 ? docs.find((x) => x.id !== currentId && x.content.vehicle.registration.replace(/\s/g, "").toUpperCase() === norm) : null;
  if (!prev) return null;
  return (
    <button type="button" onClick={() => onUse(prev.content)} className="press mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-signal/20 p-3 text-left text-sm">
      <span>
        <strong>Seen before:</strong> {prev.content.vehicle.make_model || "this vehicle"} · {prev.content.customer.name} · {prev.number}
      </span>
      <span className="font-display font-semibold">Use details</span>
    </button>
  );
}

function ContactPicker({ open, onClose, contacts, onPick }: { open: boolean; onClose: () => void; contacts: Contact[]; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState("");
  const list = contacts.filter((c) => `${c.name} ${c.company} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onClose={onClose} title="Choose customer">
      <Input autoFocus placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 divide-y divide-hairline">
        {list.map((c) => (
          <li key={c.id}>
            <button className="flex min-h-14 w-full flex-col justify-center py-2 text-left hover:bg-surface-2" onClick={() => onPick(c)}>
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{[c.phone, c.email, c.postcode].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
        {list.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No matches — just type the details in; they're saved to Customers when you issue.</li> : null}
      </ul>
    </Dialog>
  );
}

function FxRate({ currency, value, onChange }: { currency: string; value: number; onChange: (v: number) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-end gap-2">
      <TextField label={`1 ${currency} = £`} type="number" step="0.0001" value={String(value)} onChange={(e) => onChange(parseFloat(e.target.value) || 1)} className="flex-1" />
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=GBP`);
            const j = (await r.json()) as { rates: { GBP: number } };
            onChange(j.rates.GBP);
            toast.success(`Rate updated (ECB): ${j.rates.GBP}`);
          } catch {
            toast.error("Couldn't fetch a live rate — enter one manually.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Live rate
      </Button>
    </div>
  );
}

