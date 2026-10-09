// Supabase Edge Function: stripe-payment-link
//
// Creates a Stripe Checkout Session for an issued invoice's outstanding
// balance, stores the URL on the document (pay_url) so the customer's page
// shows a "Pay online" button, and returns it. Admin only.
//
// Secrets: STRIPE_SECRET_KEY, PUBLIC_APP_URL (the billing app's origin).
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  if (!stripeKey || !appUrl) return json({ error: "Online payments aren't configured: set STRIPE_SECRET_KEY and PUBLIC_APP_URL." }, 501);

  const authed = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: user } = await authed.auth.getUser();
  if (!user.user) return json({ error: "Sign in first." }, 401);

  const { document_id } = await req.json().catch(() => ({}));
  if (typeof document_id !== "string") return json({ error: "Missing document_id" }, 400);

  const db = createClient(url, service);
  const { data: doc } = await db.from("billing_documents").select("*").eq("id", document_id).maybeSingle();
  if (!doc || doc.doc_type !== "invoice" || doc.lifecycle !== "issued") return json({ error: "Only issued invoices can be paid online." }, 400);
  const balance = Number(doc.total_pence) - Number(doc.paid_pence) - Number(doc.credited_pence);
  if (balance <= 0) return json({ error: "Nothing left to pay." }, 400);

  const base = appUrl.replace(/\/$/, "");
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": String(doc.content?.currency || "GBP").toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(balance),
    "line_items[0][price_data][product_data][name]": `Invoice ${doc.number} — ${doc.content?.business?.trading_name ?? "FixNow Mechanics"}`,
    "metadata[document_id]": doc.id,
    success_url: `${base}/d/${doc.share_token}?paid=1`,
    cancel_url: `${base}/d/${doc.share_token}`,
  });
  if (doc.content?.customer?.email) body.set("customer_email", doc.content.customer.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const session = await res.json();
  if (!res.ok || !session.url) return json({ error: "Stripe refused that request." }, 502);

  await db.from("billing_documents").update({ pay_url: session.url }).eq("id", doc.id);
  return json({ url: session.url });
});
