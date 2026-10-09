import type { BillingDocument, PaymentState } from "./types";
import { daysBetween, isoDate } from "./format";

/** Outstanding balance on a sales document, never below zero. */
export function balanceDue(doc: Pick<BillingDocument, "total_pence" | "paid_pence" | "credited_pence">): number {
  return Math.max(doc.total_pence - doc.paid_pence - (doc.credited_pence || 0), 0);
}

export function paymentState(
  doc: Pick<
    BillingDocument,
    "lifecycle" | "doc_type" | "total_pence" | "paid_pence" | "credited_pence" | "due_at"
  >,
  today: string = isoDate(),
): PaymentState {
  if (doc.lifecycle === "void") return "void";
  if (doc.lifecycle === "draft") return "draft";
  if (doc.doc_type === "quote" || doc.doc_type === "credit_note") return "unpaid";
  if (doc.total_pence > 0 && (doc.credited_pence || 0) >= doc.total_pence) return "credited";
  const bal = balanceDue(doc);
  if (bal === 0 && doc.total_pence >= 0) return "paid";
  if (doc.due_at && daysBetween(today, doc.due_at) > 0) return "overdue";
  return doc.paid_pence > 0 ? "part_paid" : "unpaid";
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  draft: "Draft",
  unpaid: "Awaiting payment",
  part_paid: "Part paid",
  paid: "Paid in full",
  overdue: "Overdue",
  void: "Void",
  credited: "Credited",
};

export function daysOverdue(due: string | null, today: string = isoDate()): number {
  if (!due) return 0;
  return Math.max(daysBetween(today, due), 0);
}
