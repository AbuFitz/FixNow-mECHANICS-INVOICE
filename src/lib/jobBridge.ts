import type { BillingSettings, BillingDocument, DocType, DocumentContent, InfoRequest, JobReport, LineItem, Preset, TrackerJob, TrackerPhoto, Payment } from "./types";
import { blankContent } from "./defaults";
import { uid } from "./format";

/** "£125", "125.00", "TBC" -> pence or null. */
export function parseQuoted(q: string | null): number | null {
  if (!q) return null;
  const m = /(\d+(?:\.\d{1,2})?)/.exec(q.replace(/,/g, ""));
  return m ? Math.round(parseFloat(m[1]!) * 100) : null;
}

export interface MissingItem {
  key: string;
  label: string;
  /** Wording for the message sent to the engineer. */
  ask: string;
  severity: "block" | "warn";
}

/** What is still needed from the engineer before a complete document can go out. */
export function missingFromEngineer(_job: TrackerJob, report: JobReport | undefined): MissingItem[] {
  const out: MissingItem[] = [];
  if (!report || report.status === "draft") {
    out.push({ key: "report", label: "Job report not submitted", ask: "Please complete the job report for this job.", severity: "block" });
    return out;
  }
  if (!report.work_summary.trim()) out.push({ key: "summary", label: "Work summary", ask: "What work was carried out?", severity: "block" });
  if (report.parts.length === 0) out.push({ key: "parts", label: "Parts fitted", ask: "Which parts were fitted (name, part number, serial/batch if any)?", severity: "warn" });
  report.parts.forEach((p, i) => {
    if (p.unit_price_pence === null) out.push({ key: `price-${i}`, label: `Price for "${p.name}"`, ask: `What was charged for "${p.name}" (supplied price)?`, severity: "warn" });
    if (!p.part_number && !p.serial) out.push({ key: `pn-${i}`, label: `Part no. for "${p.name}"`, ask: `What is the part number / serial for "${p.name}"? (needed for the warranty record)`, severity: "warn" });
  });
  if (!report.payment) out.push({ key: "payment", label: "Payment details", ask: "Was payment taken on the day? If so, how much and by what method?", severity: "block" });
  if (!report.customer_email.trim()) out.push({ key: "email", label: "Customer email", ask: "What email address should we send the customer's documents to?", severity: "warn" });
  if (!report.customer_full_name.trim()) out.push({ key: "name", label: "Customer full name", ask: "What is the customer's full name (for the invoice)?", severity: "warn" });
  if (!report.signoff) out.push({ key: "signoff", label: "Customer sign-off", ask: "Please get the customer's sign-off on the job report.", severity: "warn" });
  if (!report.mileage) out.push({ key: "mileage", label: "Vehicle mileage", ask: "What was the vehicle's mileage?", severity: "warn" });
  if (report.labour_minutes === null) out.push({ key: "labour", label: "Time on the job", ask: "How long did the job take (minutes)?", severity: "warn" });
  return out;
}

export function openRequestsFor(sessionId: string, requests: InfoRequest[]) {
  return requests.filter((r) => r.session_id === sessionId && r.status !== "closed");
}

export interface BuiltFromJob {
  content: DocumentContent;
  payment: Pick<Payment, "amount_pence" | "method" | "reference"> | null;
}

/** Turn a completed tracker job (+ engineer report + photos) into editable document content. */
export function buildFromJob(opts: {
  job: TrackerJob;
  report?: JobReport;
  photos: TrackerPhoto[];
  settings: BillingSettings;
  presets: Preset[];
  docType: DocType;
}): BuiltFromJob {
  const { job, report, photos, settings, presets, docType } = opts;
  const c = blankContent(settings, docType);
  c.customer = {
    name: report?.customer_full_name || job.customer_first_name,
    phone: job.customer_phone ?? "",
    email: report?.customer_email ?? "",
    address: job.customer_address ?? "",
    postcode: job.customer_postcode,
  };
  c.vehicle = {
    make_model: job.vehicle_description ?? "",
    registration: job.vehicle_registration,
    mileage: report?.mileage ?? null,
    location: [job.customer_address, job.customer_postcode].filter(Boolean).join(", "),
  };
  c.job = {
    reference: job.job_reference,
    title: report?.work_summary ? report.work_summary.split(/[.\n]/)[0]!.slice(0, 90) : "",
    summary: report?.work_summary ?? "",
    work_date: (job.completed_at ?? job.appointment_at).slice(0, 10),
    engineer_name: job.engineer_name ?? undefined,
  };

  const items: LineItem[] = [];
  const vat = settings.business.vat_registered ? 20 : 0;
  const preset = (label: string) => presets.find((p) => p.kind === "item" && p.label.toLowerCase().includes(label))?.payload as Partial<LineItem> | undefined;

  (report?.parts ?? []).forEach((p) =>
    items.push({
      id: uid(), kind: "part", description: p.name, detail: [p.part_number && `P/N ${p.part_number}`, p.serial && `S/N ${p.serial}`].filter(Boolean).join(" · ") || undefined,
      qty: p.qty || 1, unit_pence: p.unit_price_pence ?? 0, vat_rate: vat, account: "201",
    }),
  );
  const call = preset("call-out");
  if (call) items.push({ id: uid(), kind: "callout", description: String(call.description ?? "Mobile call-out fee"), qty: 1, unit_pence: Number(call.unit_pence ?? 0), vat_rate: vat, account: "202" });
  const lab = preset("labour");
  if (report?.labour_minutes && lab) {
    items.push({ id: uid(), kind: "labour", description: `Labour${c.job.title ? " — " + c.job.title : ""}`, qty: Math.round((report.labour_minutes / 60) * 4) / 4, unit_pence: Number(lab.unit_pence ?? 0), vat_rate: vat, account: "200" });
  }
  if (items.length === 0) {
    const q = parseQuoted(job.quoted_price);
    items.push({ id: uid(), kind: "labour", description: c.job.title || "Mobile mechanic service", qty: 1, unit_pence: q ?? 0, vat_rate: vat, account: "200" });
  }
  c.items = items;
  c.vat_mode = settings.business.vat_registered ? "standard" : "none";

  c.condition_on_arrival = report?.condition_on_arrival ?? "";
  c.engineer_notes = report?.engineer_notes || "";
  const byId = new Map(photos.map((p) => [p.id, p]));
  c.advisories = (report?.advisories ?? []).map((a) => ({
    id: a.id, severity: a.severity, title: a.title, detail: a.detail, declined: a.declined, declined_at: a.declined ? (job.completed_at ?? undefined)?.slice(0, 10) : undefined,
    photos: a.photo_ids.map((id) => byId.get(id)).filter(Boolean).map((p) => ({ id: p!.id, url: p!.photo_url, caption: p!.caption ?? undefined })),
  }));
  const usedIds = new Set((report?.advisories ?? []).flatMap((a) => a.photo_ids));
  c.gallery = photos
    .filter((p) => (p.category === "proof_of_work" || p.category === "condition") && !usedIds.has(p.id))
    .map((p) => ({ id: p.id, url: p.photo_url, caption: p.caption ?? undefined }));
  if (report?.signoff) {
    c.signoff = { ...report.signoff, statement: "I confirm the work described has been completed to my satisfaction and the engineer has explained their recommendations to me." };
  }
  const withWarranty = (report?.parts ?? []).find((p) => p.warranty)?.warranty;
  if (withWarranty && !c.warranty.parts) c.warranty.parts = withWarranty;

  const pay = report?.payment;
  return {
    content: c,
    payment: pay?.taken && pay.amount_pence ? { amount_pence: pay.amount_pence, method: pay.method ?? "other", reference: pay.reference } : null,
  };
}

export function jobBilledDocs(jobId: string, docs: BillingDocument[]) {
  return docs.filter((d) => d.session_id === jobId && d.lifecycle !== "void");
}
