// Supabase Edge Function: stripe-webhook
//
// Receives checkout.session.completed from Stripe and records the payment
// against the invoice automatically. "Verify JWT" must be OFF (Stripe doesn't
// send a Supabase JWT); authenticity comes from the signature check below.
//
// Secrets: STRIPE_WEBHOOK_SECRET (whsec_...). Point the Stripe webhook at
// https://<project>.functions.supabase.co/stripe-webhook.
import { createClient } from "npm:@supabase/supabase-js@2";

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sig = parts["v1"];
  if (!t || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === sig.length && hex.split("").every((c, i) => c === sig[i]);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return new Response("Not configured", { status: 501 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature") ?? "", secret))) return new Response("Bad signature", { status: 400 });

  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed") return new Response("ignored", { status: 200 });
  const s = event.data.object;
  const documentId = s.metadata?.document_id;
  if (!documentId || s.payment_status !== "paid") return new Response("ignored", { status: 200 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Idempotent: Stripe retries webhooks.
  const { data: existing } = await db.from("billing_payments").select("id").eq("document_id", documentId).eq("reference", s.id).maybeSingle();
  if (existing) return new Response("duplicate", { status: 200 });

  await db.from("billing_payments").insert({
    document_id: documentId,
    amount_pence: s.amount_total,
    method: "online",
    paid_at: new Date().toISOString().slice(0, 10),
    reference: s.id,
    note: "Paid online (Stripe)",
  });
  await db.from("billing_documents").update({ pay_url: null }).eq("id", documentId);
  await db.from("billing_events").insert({ document_id: documentId, kind: "payment_added", detail: { amount_pence: s.amount_total, method: "online" }, actor: "stripe" });
  return new Response("ok", { status: 200 });
});
