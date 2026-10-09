import type { BillingDocument, DocumentContent, DocType, Payment, PaymentState } from "@/lib/types";
import { computeTotals, type Totals } from "@/lib/totals";
import { paymentState } from "@/lib/status";

/** Everything the PDF needs. Pure data — no network, no DOM. */
export interface PdfModel {
  doc_type: DocType;
  /** Render an invoice/receipt-capable document as a payment receipt. */
  mode: "document" | "receipt";
  number: string | null;
  lifecycle: BillingDocument["lifecycle"];
  quote_outcome: BillingDocument["quote_outcome"];
  revision: number;
  issued_at: string | null;
  due_at: string | null;
  valid_until: string | null;
  parent_number: string | null;
  content: DocumentContent;
  totals: Totals;
  payments: Payment[];
  paid_pence: number;
  credited_pence: number;
  state: PaymentState;
  share_url: string | null;
  /** Prepared assets: photo URL -> data URL, QR data URLs. */
  assets: {
    images: Record<string, string>;
    qrShare?: string;
    qrReview?: string;
  };
}

export function buildModel(
  doc: BillingDocument,
  payments: Payment[],
  opts: { mode?: "document" | "receipt"; parentNumber?: string | null; shareUrl?: string | null } = {},
): PdfModel {
  const totals = computeTotals(doc.content);
  const paid = payments.reduce((a, p) => a + p.amount_pence, 0);
  return {
    doc_type: doc.doc_type,
    mode: opts.mode ?? "document",
    number: doc.number,
    lifecycle: doc.lifecycle,
    quote_outcome: doc.quote_outcome,
    revision: doc.revision,
    issued_at: doc.issued_at,
    due_at: doc.due_at,
    valid_until: doc.valid_until,
    parent_number: opts.parentNumber ?? null,
    content: doc.content,
    totals,
    payments,
    paid_pence: paid,
    credited_pence: doc.credited_pence ?? 0,
    state: paymentState({ ...doc, total_pence: totals.total_pence, paid_pence: paid }),
    share_url: opts.shareUrl ?? null,
    assets: { images: {} },
  };
}

export function allPhotoUrls(c: DocumentContent): string[] {
  const urls: string[] = [];
  c.advisories.forEach((a) => a.photos.forEach((p) => urls.push(p.url)));
  c.gallery.forEach((p) => urls.push(p.url));
  return [...new Set(urls)];
}
