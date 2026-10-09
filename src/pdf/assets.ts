import QRCode from "qrcode";
import type { PdfModel } from "./model";
import { allPhotoUrls } from "./model";

/** Resize + re-encode so PDFs stay small and photos sit crisply in their tiles. */
export async function urlToDataUrl(url: string, maxDim = 1100, quality = 0.8): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 0,
    width: 280,
    errorCorrectionLevel: "M",
    color: { dark: "#0d0d0d", light: "#ffffff" },
  });
}

const cache = new Map<string, string | null>();

/** Fetches photos + QR codes once and returns a model ready to render. */
export async function prepareAssets(
  model: PdfModel,
  convert: (url: string) => Promise<string | null> = urlToDataUrl,
): Promise<PdfModel> {
  const images: Record<string, string> = {};
  await Promise.all(
    allPhotoUrls(model.content).map(async (u) => {
      if (!cache.has(u)) cache.set(u, await convert(u));
      const v = cache.get(u);
      if (v) images[u] = v;
    }),
  );
  const out: PdfModel = { ...model, assets: { images } };
  if (model.share_url && model.content.options.show_qr) out.assets.qrShare = await qrDataUrl(model.share_url);
  if (model.content.options.show_review && model.content.business.review_url)
    out.assets.qrReview = await qrDataUrl(model.content.business.review_url);
  return out;
}
