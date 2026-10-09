import type { BillingDocument, Payment } from "./types";
import { buildModel, type PdfModel } from "@/pdf/model";
import { publicUrl } from "./share";

export function modelFor(doc: BillingDocument, payments: Payment[], opts: { mode?: "document" | "receipt"; parentNumber?: string | null } = {}): PdfModel {
  return buildModel(doc, payments.filter((p) => p.document_id === doc.id), { ...opts, shareUrl: doc.lifecycle === "issued" ? publicUrl(doc.share_token) : null });
}

export async function downloadPdf(model: PdfModel): Promise<Blob> {
  const { renderPdfBlob, pdfFileName } = await import("@/pdf/render");
  const blob = await renderPdfBlob(model);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(model);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return blob;
}

/** Native share sheet with the PDF attached (mobile) — falls back to false when unsupported. */
export async function sharePdfFile(model: PdfModel, text: string): Promise<boolean> {
  const { renderPdfBlob, pdfFileName } = await import("@/pdf/render");
  const blob = await renderPdfBlob(model);
  const file = new File([blob], pdfFileName(model), { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text, title: pdfFileName(model) });
    return true;
  }
  return false;
}
