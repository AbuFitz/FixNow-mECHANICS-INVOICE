// Renders sample PDFs with the real engine in Node so layout can be inspected.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToFile } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { DocumentPdf } from "../src/pdf/DocumentPdf";
import { registerFonts } from "../src/pdf/fonts";
import { buildModel } from "../src/pdf/model";
import { sampleReceiptContent } from "../src/lib/sampleData";
import { computeTotals } from "../src/lib/totals";
import type { BillingDocument, Payment } from "../src/lib/types";

const require = createRequire(import.meta.url);
const f = (pkg: string, file: string) => require.resolve(`@fontsource/${pkg}/files/${file}`);
registerFonts({
  outfit: { 400: f("outfit", "outfit-latin-400-normal.woff"), 500: f("outfit", "outfit-latin-500-normal.woff"), 600: f("outfit", "outfit-latin-600-normal.woff"), 700: f("outfit", "outfit-latin-700-normal.woff") },
  grotesk: { 400: f("space-grotesk", "space-grotesk-latin-400-normal.woff"), 500: f("space-grotesk", "space-grotesk-latin-500-normal.woff"), 600: f("space-grotesk", "space-grotesk-latin-600-normal.woff"), 700: f("space-grotesk", "space-grotesk-latin-700-normal.woff") },
  mono: { 400: f("jetbrains-mono", "jetbrains-mono-latin-400-normal.woff"), 500: f("jetbrains-mono", "jetbrains-mono-latin-500-normal.woff"), 600: f("jetbrains-mono", "jetbrains-mono-latin-600-normal.woff") },
});

const dataUrl = (file: string) => `data:image/jpeg;base64,${readFileSync(file).toString("base64")}`;
const photos: Record<string, string> = {};
for (const n of ["brakes", "diagonstic", "electrical", "suspension"]) photos[`/demo/${n}.jpg`] = dataUrl(`public/demo/${n}.jpg`);

// A simple drawn signature as SVG-less PNG is awkward in Node; use a 1x1 transparent PNG placeholder.
const SIG = "data:image/png;base64,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";

const content = sampleReceiptContent();
content.signoff!.signature = SIG;
const totals = computeTotals(content);
const base: BillingDocument = {
  id: "d1", doc_type: "receipt", number: "RCT-2026-0042", lifecycle: "issued", quote_outcome: "pending", revision: 1,
  session_id: null, contact_id: null, parent_id: null, project_id: null, share_token: "demo",
  issued_at: "2026-10-08", due_at: null, valid_until: null, sent_at: null, first_viewed_at: null, last_viewed_at: null, view_count: 0,
  content, total_pence: totals.total_pence, paid_pence: totals.total_pence, credited_pence: 0, created_at: "", updated_at: "",
};
const pay = (amt: number, id = "p1"): Payment => ({ id, document_id: "d1", amount_pence: amt, method: "bank_transfer", paid_at: "2026-10-08", reference: "Faster Payment", note: "", created_at: "" });

async function out(name: string, doc: BillingDocument, payments: Payment[], extra: Partial<ReturnType<typeof buildModel>> = {}) {
  const m = buildModel(doc, payments, { shareUrl: "https://billing.example/d/abc123", parentNumber: extra.parent_number });
  m.assets = {
    images: photos,
    qrShare: await QRCode.toDataURL(m.share_url!, { margin: 0, width: 280 }),
    qrReview: await QRCode.toDataURL(content.business.review_url, { margin: 0, width: 280 }),
  };
  Object.assign(m, extra);
  mkdirSync("out", { recursive: true });
  await renderToFile(createElement(DocumentPdf, { model: m }) as never, `out/${name}.pdf`);
  console.log("wrote", name);
}

await out("receipt", base, [pay(totals.total_pence)]);
await out("invoice-unpaid", { ...base, doc_type: "invoice", number: "INV-2026-0043", due_at: "2026-10-15", paid_pence: 0 }, []);
await out("invoice-amended", { ...base, doc_type: "invoice", number: "INV-2026-0044", revision: 2, due_at: "2026-10-15", content: { ...content, amendment_note: "Corrected the call-out fee." } }, [pay(5000)]);
const vatContent = { ...content, business: { ...content.business, vat_registered: true, vat_number: "GB 123 4567 89" }, vat_mode: "standard" as const };
await out("quote-vat", { ...base, doc_type: "quote", number: "QT-2026-0007", valid_until: "2026-11-07", paid_pence: 0, content: { ...vatContent, advisories: [], gallery: [], signoff: null, engineer_notes: "", condition_on_arrival: "" } }, []);
await out("draft-min", { ...base, lifecycle: "draft", number: null, doc_type: "invoice", paid_pence: 0, content: { ...content, advisories: [], gallery: [], signoff: null, warranty: { parts: "", labour: "", exclusions: [] } } }, []);
writeFileSync("out/.gitkeep", "");
