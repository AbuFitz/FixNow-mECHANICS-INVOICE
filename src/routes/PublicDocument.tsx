import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Phone, ShieldCheck, Mail, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { Button, Card, TextField } from "@/components/ui";
import { PdfPreview } from "@/components/PdfPreview";
import { buildModel } from "@/pdf/model";
import { downloadPdf } from "@/lib/pdfAction";
import { DOC_LABEL } from "@/lib/defaults";
import { gbp } from "@/lib/money";
import { d } from "@/lib/format";
import type { BillingDocument } from "@/lib/types";
import { publicUrl } from "@/lib/share";

/** The customer's private page: a view of the document, the PDF, and (quotes) accept online. */
export function PublicDocument() {
  const { token } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["public-doc", token], queryFn: () => api.publicApi.getDocument(token!), enabled: !!token, retry: 1 });
  const viewed = useRef(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data && !viewed.current && token) {
      viewed.current = true;
      api.publicApi.recordView(token).catch(() => undefined);
    }
  }, [data, token]);

  const model = useMemo(() => {
    if (!data || !token) return null;
    const doc = { id: token, doc_type: data.doc_type, number: data.number, lifecycle: data.lifecycle, quote_outcome: data.quote_outcome, revision: data.revision, issued_at: data.issued_at, due_at: data.due_at, valid_until: data.valid_until, content: data.content, total_pence: data.total_pence, paid_pence: data.paid_pence, credited_pence: data.credited_pence, share_token: token } as unknown as BillingDocument;
    const m = buildModel(doc, data.payments as never, { parentNumber: data.parent_number, shareUrl: publicUrl(token) });
    m.paid_pence = data.paid_pence;
    return m;
  }, [data, token]);

  if (isLoading) return <div className="grid min-h-dvh place-items-center bg-ink text-white"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !data || !model) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink px-6 text-center text-white">
        <div className="max-w-sm">
          <Logo className="text-2xl" />
          <h1 className="mt-8 font-display text-xl font-semibold">We couldn't find that document</h1>
          <p className="mt-2 text-sm text-white/60">The link may be incomplete or the document has been withdrawn. Please contact us and we'll sort it out.</p>
        </div>
      </div>
    );
  }

  const b = data.content.business;
  const bal = Math.max(data.total_pence - data.paid_pence - data.credited_pence, 0);
  const isQuote = data.doc_type === "quote";
  const label = DOC_LABEL[data.doc_type];
  const open = isQuote && data.quote_outcome === "pending" && data.lifecycle === "issued";

  return (
    <div className="min-h-dvh bg-background pb-16">
      <header className="bg-ink px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo className="text-xl" />
          <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="flex min-h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold"><Phone className="h-4 w-4" /> {b.phone}</a>
        </div>
      </header>
      <div className="hazard h-1.5" />

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6">
        <Card className="p-5">
          <p className="eyebrow text-muted-foreground">{label} {data.number}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Hi {data.content.customer.name.split(" ")[0] || "there"}</h1>
          <p className="mt-1 text-muted-foreground">{data.content.job.title || "Your paperwork from FixNow Mechanics"}{data.content.vehicle.registration ? ` · ${data.content.vehicle.registration}` : ""}</p>

          {data.lifecycle === "void" ? (
            <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">This document has been withdrawn. Please contact us if you have any questions.</p>
          ) : isQuote ? (
            <div className="mt-4 flex items-end justify-between gap-4">
              <div><p className="eyebrow text-muted-foreground">Estimate</p><p className="num font-display text-3xl font-bold">{gbp(data.total_pence, data.content.currency)}</p></div>
              <p className="text-right text-sm text-muted-foreground">Valid until<br /><strong className="text-foreground">{d(data.valid_until)}</strong></p>
            </div>
          ) : (
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-muted-foreground">{bal === 0 ? "Paid in full" : "Balance due"}</p>
                <p className={`num font-display text-3xl font-bold ${bal === 0 ? "text-success" : ""}`}>{bal === 0 ? gbp(data.paid_pence || data.total_pence, data.content.currency) : gbp(bal, data.content.currency)}</p>
              </div>
              {bal > 0 && data.due_at ? <p className="text-right text-sm text-muted-foreground">Due<br /><strong className="text-foreground">{d(data.due_at)}</strong></p> : null}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="ink" size="lg" onClick={() => downloadPdf(model)}><Download className="h-5 w-5" /> Download PDF</Button>
            {data.pay_url && bal > 0 && data.doc_type === "invoice" ? <a href={data.pay_url}><Button variant="signal" size="lg">Pay online</Button></a> : null}
          </div>
        </Card>

        {data.doc_type === "invoice" && bal > 0 && data.lifecycle === "issued" && b.bank.account_number ? (
          <Card className="p-5">
            <p className="font-display font-semibold">Pay by bank transfer</p>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Account name</dt><dd className="font-medium">{b.bank.account_name}</dd>
              <dt className="text-muted-foreground">Sort code</dt><dd className="mono font-semibold">{b.bank.sort_code}</dd>
              <dt className="text-muted-foreground">Account no.</dt><dd className="mono font-semibold">{b.bank.account_number}</dd>
              <dt className="text-muted-foreground">Reference</dt><dd className="mono font-semibold">{data.number}</dd>
            </dl>
          </Card>
        ) : null}

        {isQuote ? (
          <Card className="p-5">
            {open ? (
              <div className="space-y-4">
                <p className="font-display font-semibold">Happy with this quote?</p>
                <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder={data.content.customer.name} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button size="lg" variant="signal" loading={busy} onClick={async () => { setBusy(true); try { await api.publicApi.respondToQuote(token!, "accepted", name || data.content.customer.name); toast.success("Thanks — we'll be in touch to book you in."); refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); } }}><CheckCircle2 className="h-5 w-5" /> Accept quote</Button>
                  <Button size="lg" loading={busy} onClick={async () => { setBusy(true); try { await api.publicApi.respondToQuote(token!, "declined", name || data.content.customer.name); toast.message("No problem — thanks for letting us know."); refetch(); } finally { setBusy(false); } }}><XCircle className="h-5 w-5" /> Decline</Button>
                </div>
                <p className="text-xs text-muted-foreground">Accepting lets us book the work in. You won't be charged until the work is done.</p>
              </div>
            ) : data.quote_outcome === "accepted" ? (
              <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-5 w-5" /> You accepted this quote. We'll be in touch to arrange a time.</p>
            ) : data.quote_outcome === "declined" ? (
              <p className="font-medium text-muted-foreground">You declined this quote. If you change your mind, just get in touch.</p>
            ) : null}
          </Card>
        ) : null}

        <div className="rounded-2xl bg-surface-2 p-2 sm:p-3">
          <PdfPreview model={model} delay={0} />
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Private link, only for you. {b.legal_name} · Co. No. {b.company_number}</span>
          <a href={`mailto:${b.email}`} className="flex items-center gap-2 font-semibold underline decoration-signal decoration-2 underline-offset-4"><Mail className="h-4 w-4" /> {b.email}</a>
        </Card>
      </main>
    </div>
  );
}
