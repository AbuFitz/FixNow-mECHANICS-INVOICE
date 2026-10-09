import type { BillingDocument } from "@/lib/types";
import { paymentState, PAYMENT_STATE_LABEL } from "@/lib/status";
import { Badge, type Tone } from "./ui";

const PAY_TONE: Record<string, Tone> = { draft: "neutral", unpaid: "signal", part_paid: "warning", paid: "success", overdue: "danger", void: "danger", credited: "info" };

export function DocStatus({ doc }: { doc: BillingDocument }) {
  if (doc.doc_type === "quote") {
    if (doc.lifecycle === "draft") return <Badge>Draft</Badge>;
    if (doc.lifecycle === "void") return <Badge tone="danger">Void</Badge>;
    if (doc.quote_outcome === "accepted") return <Badge tone="success">Accepted</Badge>;
    if (doc.quote_outcome === "declined") return <Badge tone="danger">Declined</Badge>;
    if (doc.valid_until && doc.valid_until < new Date().toISOString().slice(0, 10)) return <Badge tone="warning">Expired</Badge>;
    return <Badge tone="signal">Awaiting reply</Badge>;
  }
  if (doc.doc_type === "credit_note") return <Badge tone={doc.lifecycle === "void" ? "danger" : doc.lifecycle === "draft" ? "neutral" : "info"}>{doc.lifecycle === "issued" ? "Issued" : doc.lifecycle}</Badge>;
  const s = paymentState(doc);
  return <Badge tone={PAY_TONE[s]}>{PAYMENT_STATE_LABEL[s]}</Badge>;
}

export function AmendedBadge({ doc }: { doc: BillingDocument }) {
  return doc.revision > 1 ? <Badge tone="ink">Rev {doc.revision}</Badge> : null;
}
