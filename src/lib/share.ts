import type { BillingDocument } from "./types";
import { DOC_LABEL } from "./defaults";
import { gbp } from "./money";
import { balanceDue } from "./status";
import { d } from "./format";

export function publicUrl(token: string, origin: string = window.location.origin): string {
  return `${origin}/d/${token}`;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/** Short, human message used for WhatsApp / SMS / email bodies. */
export function shareMessage(doc: BillingDocument, link: string, bizName = "FixNow Mechanics"): string {
  const c = doc.content;
  const hi = `Hi ${firstName(c.customer.name)},`;
  const num = doc.number ?? "";
  const reg = c.vehicle.registration ? ` for your ${c.vehicle.registration}` : "";
  const total = gbp(doc.total_pence, c.currency);
  if (doc.doc_type === "quote") {
    return `${hi}\n\nHere is your quote ${num}${reg} from ${bizName} — ${total}${
      doc.valid_until ? `, valid until ${d(doc.valid_until)}` : ""
    }.\n\nView, download and accept it here:\n${link}\n\nAny questions, just reply to this message.`;
  }
  if (doc.doc_type === "receipt" || balanceDue(doc) === 0) {
    return `${hi}\n\nThanks for choosing ${bizName}. Your receipt ${num}${reg} for ${gbp(
      doc.paid_pence || doc.total_pence,
      c.currency,
    )} is here:\n${link}\n\nIt includes your warranty details and any recommendations from the engineer.`;
  }
  if (doc.doc_type === "credit_note") {
    return `${hi}\n\nYour credit note ${num} for ${total} from ${bizName} is here:\n${link}`;
  }
  return `${hi}\n\nYour invoice ${num}${reg} from ${bizName} is ready — ${gbp(balanceDue(doc), c.currency)} due${
    doc.due_at ? ` by ${d(doc.due_at)}` : ""
  }.\n\nView and download it here:\n${link}\n\nPlease use ${num} as the payment reference.`;
}

export function reminderMessage(doc: BillingDocument, link: string, bizName = "FixNow Mechanics"): string {
  return `Hi ${firstName(doc.content.customer.name)},\n\nA friendly reminder that invoice ${doc.number} (${gbp(
    balanceDue(doc),
    doc.content.currency,
  )}) was due on ${d(doc.due_at)}. You can view it and the payment details here:\n${link}\n\nIf you've already paid, thank you — please ignore this message.\n\n${bizName}`;
}

export function emailSubject(doc: BillingDocument, bizName = "FixNow Mechanics"): string {
  return `${DOC_LABEL[doc.doc_type]} ${doc.number ?? ""} from ${bizName}`.replace(/\s+/g, " ").trim();
}

export function whatsappHref(phone: string, text: string): string {
  let digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = "44" + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function smsHref(phone: string, text: string): string {
  return `sms:${phone.replace(/\s+/g, "")}?&body=${encodeURIComponent(text)}`;
}

export function mailHref(email: string, subject: string, text: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}
