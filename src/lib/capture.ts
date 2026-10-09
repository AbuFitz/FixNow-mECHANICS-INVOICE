import { isSupabaseConfigured, supabase } from "./api/supabase";
import { compressImage } from "./images";

export interface CapturedDocument {
  supplier: string;
  reference: string;
  date: string;
  currency: string;
  net_pence: number;
  vat_pence: number;
  gross_pence: number;
  description: string;
  category_hint: string;
  lines: { description: string; net_pence: number; vat_rate: number }[];
}

/**
 * Smart document capture: sends a photo of a receipt/bill to the
 * `capture-document` Edge Function, which reads it with a vision model and
 * returns structured fields to review. Requires the function to be deployed
 * with its secret — see docs/INTEGRATIONS.md. Nothing is auto-saved: the admin
 * always reviews the extracted values.
 */
export async function captureDocument(file: File): Promise<CapturedDocument> {
  if (!isSupabaseConfigured) throw new Error("Smart capture needs a connected Supabase project with the capture-document function deployed.");
  const image = file.type.startsWith("image/") ? await compressImage(file, 1800, 0.85) : file;
  const form = new FormData();
  form.set("file", image, file.name);
  const { data, error } = await supabase.functions.invoke<CapturedDocument & { error?: string }>("capture-document", { body: form });
  if (error) throw new Error("Capture isn't available yet — the capture-document function hasn't been deployed, or its API key isn't set.");
  if (!data || data.error) throw new Error(data?.error ?? "Couldn't read that document.");
  return data;
}
