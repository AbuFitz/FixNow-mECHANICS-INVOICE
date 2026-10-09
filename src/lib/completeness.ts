import type { BillingDocument, BillingSettings } from "./types";

export interface Issue {
  level: "block" | "warn";
  field: string;
  message: string;
}

/**
 * What is missing before this document can safely be issued. "block" stops the
 * issue button; "warn" asks the admin to confirm. Also used to build the list
 * of things to ask the engineer for.
 */
export function checkDocument(doc: Pick<BillingDocument, "doc_type" | "content" | "total_pence">, settings: BillingSettings): Issue[] {
  const c = doc.content;
  const out: Issue[] = [];
  const push = (level: Issue["level"], field: string, message: string) => out.push({ level, field, message });

  if (!c.customer.name.trim()) push("block", "customer.name", "Customer name is missing.");
  if (c.items.length === 0) push("block", "items", "Add at least one line item.");
  if (c.items.some((i) => !i.description.trim())) push("block", "items", "A line item has no description.");
  if (doc.total_pence < 0) push("block", "items", "Total cannot be negative.");
  if (!c.job.title.trim()) push("warn", "job.title", "Add a service title so the customer knows what the work was.");
  if (doc.doc_type !== "credit_note" && !c.vehicle.registration.trim())
    push("warn", "vehicle.registration", "Vehicle registration is missing.");
  if (!c.customer.email.trim() && !c.customer.phone.trim())
    push("warn", "customer.contact", "No email or phone — you won't be able to send this to the customer.");
  if (doc.doc_type === "invoice") {
    const b = settings.business.bank;
    if (!b.account_number || !b.sort_code)
      push("block", "bank", "Add your bank details in Settings so customers can pay this invoice.");
  }
  if (c.business.vat_registered && !c.business.vat_number)
    push("block", "vat", "VAT registered but no VAT number in Settings — a VAT invoice must show it.");
  if (!c.business.registered_office && !c.business.address)
    push("warn", "business.address", "Add a registered office/address in Settings — company documents should show it.");
  if (doc.doc_type !== "quote" && c.job.reference === "" )
    push("warn", "job.reference", "Not linked to a job reference.");
  if (c.advisories.some((a) => !a.title.trim())) push("warn", "advisories", "An advisory has no title.");
  return out;
}
