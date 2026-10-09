import { createElement } from "react";
import { pdf } from "@react-pdf/renderer";
import { DocumentPdf } from "./DocumentPdf";
import { registerFonts } from "./fonts";
import { browserFontUrls } from "./fontUrls";
import { prepareAssets } from "./assets";
import type { PdfModel } from "./model";

export async function renderPdfBlob(model: PdfModel): Promise<Blob> {
  registerFonts(browserFontUrls);
  const prepared = await prepareAssets(model);
  return pdf(createElement(DocumentPdf, { model: prepared }) as never).toBlob();
}

export function pdfFileName(model: PdfModel): string {
  const label = model.mode === "receipt" ? "Receipt" : { quote: "Quote", invoice: "Invoice", receipt: "Receipt", credit_note: "Credit-note" }[model.doc_type];
  const reg = model.content.vehicle.registration.replace(/\s+/g, "");
  return `FixNow-${label}-${model.number ?? "DRAFT"}${reg ? "-" + reg : ""}.pdf`.replace(/[^A-Za-z0-9._-]/g, "");
}
