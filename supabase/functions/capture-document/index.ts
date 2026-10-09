// Supabase Edge Function: capture-document
//
// "Smart document capture": the admin photographs a supplier bill or receipt,
// this function reads it with an Anthropic vision model and returns structured
// fields for the admin to REVIEW. Nothing is saved automatically.
//
// Secrets (Edge Functions -> capture-document -> Secrets):
//   ANTHROPIC_API_KEY   your Anthropic API key
//   CAPTURE_MODEL       the model id to use (see https://docs.anthropic.com)
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically. Leave "Verify
// JWT" ON — this function additionally checks the caller is a signed-in user.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

const PROMPT = `You read UK supplier invoices and receipts. Return ONLY a JSON object, no prose:
{"supplier":string,"reference":string,"date":"YYYY-MM-DD","currency":"GBP","net_pence":int,"vat_pence":int,"gross_pence":int,"description":string,"category_hint":string,"lines":[{"description":string,"net_pence":int,"vat_rate":number}]}
Amounts are integer pence. Use "" or 0 when a field is not visible — never guess. vat_rate is a percentage (20, 5 or 0).`;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("CAPTURE_MODEL");
  if (!url || !anon) return json({ error: "Missing Supabase secrets" }, 500);
  if (!key || !model) return json({ error: "Capture isn't configured: set ANTHROPIC_API_KEY and CAPTURE_MODEL." }, 501);

  const authed = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: user } = await authed.auth.getUser();
  if (!user.user) return json({ error: "Sign in first." }, 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Missing file" }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ error: "File is too large (max 8MB)." }, 400);

  const isPdf = file.type === "application/pdf";
  const data = b64(new Uint8Array(await file.arrayBuffer()));
  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data } };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }] }),
  });
  if (!res.ok) return json({ error: `The reading service refused that (${res.status}).` }, 502);
  const out = await res.json();
  const text: string = out?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return json({ error: "Couldn't find any details on that document." }, 422);
  try {
    const p = JSON.parse(match[0]);
    return json({
      supplier: String(p.supplier ?? ""),
      reference: String(p.reference ?? ""),
      date: String(p.date ?? ""),
      currency: String(p.currency || "GBP"),
      net_pence: Number(p.net_pence) || 0,
      vat_pence: Number(p.vat_pence) || 0,
      gross_pence: Number(p.gross_pence) || 0,
      description: String(p.description ?? ""),
      category_hint: String(p.category_hint ?? ""),
      lines: Array.isArray(p.lines)
        ? p.lines.map((l: Record<string, unknown>) => ({ description: String(l.description ?? ""), net_pence: Number(l.net_pence) || 0, vat_rate: Number(l.vat_rate) || 0 }))
        : [],
    });
  } catch {
    return json({ error: "Couldn't read that document clearly." }, 422);
  }
});
