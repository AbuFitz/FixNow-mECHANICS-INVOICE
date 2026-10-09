import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Download, Mail, MessageCircle, MessageSquare, Share2, FileText, Bell } from "lucide-react";
import { toast } from "sonner";
import type { BillingDocument, PaymentMethod, Payment } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { api } from "@/lib/api";
import { Button, Dialog, MoneyInput, SelectField, TextAreaField, TextField } from "./ui";
import { emailSubject, mailHref, publicUrl, reminderMessage, shareMessage, smsHref, whatsappHref } from "@/lib/share";
import { downloadPdf, modelFor, sharePdfFile } from "@/lib/pdfAction";
import { isoDate } from "@/lib/format";
import { balanceDue } from "@/lib/status";
import { gbp } from "@/lib/money";
import type { Issue } from "@/lib/completeness";
import { useInvalidate } from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------
export function ShareDialog({ doc, payments, open, onClose, reminder }: { doc: BillingDocument; payments: Payment[]; open: boolean; onClose: () => void; reminder?: boolean }) {
  const link = publicUrl(doc.share_token);
  const base = useMemo(() => (reminder ? reminderMessage(doc, link) : shareMessage(doc, link)), [doc, link, reminder]);
  const [text, setText] = useState(base);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  useEffect(() => setText(base), [base]);

  const c = doc.content.customer;
  const sent = async (channel: string) => {
    await api.docs.markSent(doc.id, channel);
    invalidate("docs", "events");
  };
  const model = () => modelFor(doc, payments);

  return (
    <Dialog open={open} onClose={onClose} title={reminder ? "Send payment reminder" : "Send to customer"} wide>
      <div className="space-y-4">
        <TextAreaField label="Message" value={text} onChange={(e) => setText(e.target.value)} className="[&_textarea]:min-h-40" hint="This includes a private link where they can view, download the PDF and (for quotes) accept online." />
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={c.phone ? whatsappHref(c.phone, text) : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!c.phone}
            onClick={() => c.phone && sent("whatsapp")}
            className={`press flex min-h-12 items-center gap-3 rounded-xl bg-[#1f8f4d] px-4 font-display font-semibold text-white ${c.phone ? "" : "pointer-events-none opacity-40"}`}
          >
            <MessageCircle className="h-5 w-5" /> WhatsApp {c.phone ? "" : "(no phone)"}
          </a>
          <a href={c.phone ? smsHref(c.phone, text) : undefined} onClick={() => c.phone && sent("sms")} className={`press flex min-h-12 items-center gap-3 rounded-xl bg-ink px-4 font-display font-semibold text-ink-foreground ${c.phone ? "" : "pointer-events-none opacity-40"}`}>
            <MessageSquare className="h-5 w-5" /> Text message
          </a>
          <a href={c.email ? mailHref(c.email, emailSubject(doc), text) : undefined} onClick={() => c.email && sent("email")} className={`press flex min-h-12 items-center gap-3 rounded-xl border border-hairline bg-surface px-4 font-display font-semibold ${c.email ? "" : "pointer-events-none opacity-40"}`}>
            <Mail className="h-5 w-5" /> Email {c.email ? "" : "(no email)"}
          </a>
          <Button
            size="lg"
            className="justify-start"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ok = await sharePdfFile(model(), text);
                if (ok) await sent("share-sheet");
                else toast.message("File sharing isn't supported on this device — use WhatsApp/Email links, or download the PDF.");
              } catch (e) {
                if ((e as Error).name !== "AbortError") toast.error("Couldn't open the share sheet.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Share2 className="h-5 w-5" /> Share PDF file…
          </Button>
          <Button
            size="lg"
            className="justify-start"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              toast.success("Link copied");
              sent("link");
            }}
          >
            <Copy className="h-5 w-5" /> Copy link
          </Button>
          <Button size="lg" className="justify-start" onClick={() => downloadPdf(model()).then(() => sent("download"))}>
            <Download className="h-5 w-5" /> Download PDF
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {doc.first_viewed_at ? <>Customer first opened this link on {new Date(doc.first_viewed_at).toLocaleString("en-GB")} ({doc.view_count}×).</> : doc.sent_at ? "Sent — not opened yet." : "You'll see here when the customer opens the link."}
        </p>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Record payment
// ---------------------------------------------------------------------------
export function PaymentDialog({ doc, open, onClose }: { doc: BillingDocument; open: boolean; onClose: () => void }) {
  const bal = balanceDue(doc);
  const [amount, setAmount] = useState(bal);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [date, setDate] = useState(isoDate());
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  useEffect(() => {
    if (open) setAmount(balanceDue(doc));
  }, [open, doc]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record payment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="signal"
            loading={busy}
            disabled={!amount}
            onClick={async () => {
              setBusy(true);
              try {
                await api.payments.add({ document_id: doc.id, amount_pence: amount, method, paid_at: date, reference: ref, note: "" });
                invalidate("payments", "docs", "events");
                toast.success(`Recorded ${gbp(amount)}`);
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't record that payment.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check className="h-4 w-4" /> Record {gbp(amount)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Balance outstanding: <strong className="text-foreground">{gbp(bal, doc.content.currency)}</strong></p>
        <div>
          <span className="eyebrow text-muted-foreground">Amount received</span>
          <MoneyInput className="mt-1.5" value={amount} onChange={setAmount} />
          {amount > bal ? <p className="mt-1 text-xs text-warning">That's more than the balance — it will show as an overpayment.</p> : null}
        </div>
        <SelectField label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Date received" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank reference, card receipt no…" />
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Issue checks
// ---------------------------------------------------------------------------
export function IssueDialog({ open, onClose, issues, onConfirm, busy, docLabel }: { open: boolean; onClose: () => void; issues: Issue[]; onConfirm: () => void; busy: boolean; docLabel: string }) {
  const blocks = issues.filter((i) => i.level === "block");
  const warns = issues.filter((i) => i.level === "warn");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={blocks.length ? "Fix these first" : `Issue this ${docLabel.toLowerCase()}?`}
      footer={
        <>
          <Button onClick={onClose}>{blocks.length ? "Go back and fix" : "Keep editing"}</Button>
          {!blocks.length ? (
            <Button variant="signal" loading={busy} onClick={onConfirm}>
              <FileText className="h-4 w-4" /> Issue {docLabel.toLowerCase()}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {blocks.length ? (
          <ul className="space-y-2">
            {blocks.map((b, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-destructive/8 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {b.message}
              </li>
            ))}
          </ul>
        ) : null}
        {warns.length ? (
          <div>
            <p className="eyebrow mb-2 text-muted-foreground">Worth a look</p>
            <ul className="space-y-2">
              {warns.map((b, i) => (
                <li key={i} className="flex gap-3 rounded-xl bg-warning/12 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {b.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!blocks.length ? <p className="text-sm text-muted-foreground">Issuing assigns the next document number and locks the record. You can still amend it later — every change is kept as a revision.</p> : null}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Amend
// ---------------------------------------------------------------------------
export function AmendDialog({ open, onClose, onRevision, onSilent, revision, busy }: { open: boolean; onClose: () => void; onRevision: (reason: string, note: string) => void; onSilent: () => void; revision: number; busy: boolean }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Save changes to this document`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="signal" loading={busy} disabled={!reason.trim()} onClick={() => onRevision(reason.trim(), note.trim())}>
            Save as revision {revision + 1}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">The current version is kept in the history. The customer's link and PDF show the new version marked “Amended · Rev {revision + 1}”.</p>
        <TextField label="Why are you amending it? (internal)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corrected labour hours" />
        <TextAreaField label="Note to the customer (optional, printed on the PDF)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Call-out fee corrected from £35 to £25." />
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-medium">Just fixing a typo or internal note?</p>
          <p className="mt-0.5 text-muted-foreground">Save it quietly without creating a new revision. It's still logged in the activity trail.</p>
          <Button size="sm" className="mt-2" onClick={onSilent}>
            Save without a new revision
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({ open, onClose, title, body, confirmLabel, danger, onConfirm, busy, requireText }: { open: boolean; onClose: () => void; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; busy?: boolean; requireText?: string }) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "signal"} loading={busy} disabled={!!requireText && typed !== requireText} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{body}</p>
      {requireText ? <TextField className="mt-4" label={`Type ${requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} /> : null}
    </Dialog>
  );
}

export { Bell };
