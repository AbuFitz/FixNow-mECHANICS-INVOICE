import { createClient } from "@supabase/supabase-js";
import type { Api, Collection, CollectionMap, CollectionName, PublicDocument } from "./types";
import type {
  BillingDocument,
  BillingEvent,
  BillingSettings,
  DocumentRevision,
  InfoRequest,
  JobReport,
  Payment,
  TrackerJob,
  TrackerPhoto,
} from "../types";
import { DEFAULT_SETTINGS } from "../defaults";
import { token } from "../format";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "anon", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message ? `${fallback} (${error.message})` : fallback);
}

function rowToDoc(r: Record<string, unknown>): BillingDocument {
  return r as unknown as BillingDocument;
}

async function actorEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? "unknown";
}

function collection<K extends CollectionName>(name: K): Collection<CollectionMap[K]> {
  return {
    async list() {
      const { data, error } = await supabase.from("billing_records").select("id, data").eq("collection", name);
      if (error) fail(error, `Couldn't load ${name}.`);
      return (data ?? []).map((r) => ({ ...(r.data as object), id: r.id })) as unknown as CollectionMap[K][];
    },
    async upsert(row) {
      const { error } = await supabase.from("billing_records").upsert({ id: row.id, collection: name, data: row, updated_at: new Date().toISOString() });
      if (error) fail(error, `Couldn't save ${name}.`);
      return row;
    },
    async remove(id) {
      const { error } = await supabase.from("billing_records").delete().eq("id", id).eq("collection", name);
      if (error) fail(error, `Couldn't delete from ${name}.`);
    },
  };
}

export const supabaseApi: Api = {
  mode: "supabase",

  auth: {
    async current() {
      const { data } = await supabase.auth.getSession();
      return { email: data.session?.user.email ?? null };
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Those details didn't work. Check your email and password.");
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  },

  settings: {
    async get() {
      const { data, error } = await supabase.from("billing_settings").select("data").eq("id", 1).maybeSingle();
      if (error) fail(error, "Couldn't load settings.");
      const saved = (data?.data ?? {}) as Partial<BillingSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        business: { ...DEFAULT_SETTINGS.business, ...saved.business, bank: { ...DEFAULT_SETTINGS.business.bank, ...saved.business?.bank } },
        defaults: { ...DEFAULT_SETTINGS.defaults, ...saved.defaults },
        numbering: { ...DEFAULT_SETTINGS.numbering, ...saved.numbering },
        tax: { ...DEFAULT_SETTINGS.tax, ...saved.tax },
      };
    },
    async save(s) {
      const { error } = await supabase.from("billing_settings").upsert({ id: 1, data: s, updated_at: new Date().toISOString() });
      if (error) fail(error, "Couldn't save settings.");
      return s;
    },
  },

  docs: {
    async list() {
      const { data, error } = await supabase.from("billing_documents").select("*").order("created_at", { ascending: false });
      if (error) fail(error, "Couldn't load documents.");
      return (data ?? []).map(rowToDoc);
    },
    async get(id) {
      const { data, error } = await supabase.from("billing_documents").select("*").eq("id", id).maybeSingle();
      if (error) fail(error, "Couldn't load that document.");
      return data ? rowToDoc(data) : null;
    },
    async create(input) {
      const { computeTotals } = await import("../totals");
      const { data, error } = await supabase
        .from("billing_documents")
        .insert({
          doc_type: input.doc_type,
          content: input.content,
          total_pence: computeTotals(input.content).total_pence,
          session_id: input.session_id ?? null,
          contact_id: input.contact_id ?? null,
          parent_id: input.parent_id ?? null,
          project_id: input.project_id ?? null,
          share_token: token(),
        })
        .select("*")
        .single();
      if (error) fail(error, "Couldn't create the document.");
      await this.markEvent(data.id, data.session_id, "created", { doc_type: input.doc_type });
      return rowToDoc(data);
    },
    async update(id, patch) {
      const { data, error } = await supabase.from("billing_documents").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) fail(error, "Couldn't save the document.");
      return rowToDoc(data);
    },
    async issue(id) {
      const { data, error } = await supabase.rpc("billing_issue_document", { p_id: id });
      if (error) fail(error, "Couldn't issue the document.");
      return rowToDoc(data as Record<string, unknown>);
    },
    async amend(id, content, total, reason) {
      const { data, error } = await supabase.rpc("billing_amend_document", { p_id: id, p_content: content, p_total: total, p_reason: reason });
      if (error) fail(error, "Couldn't amend the document.");
      return rowToDoc(data as Record<string, unknown>);
    },
    async setVoid(id, voided, reason) {
      const { data, error } = await supabase.rpc("billing_set_void", { p_id: id, p_void: voided, p_reason: reason });
      if (error) fail(error, "Couldn't change the document status.");
      return rowToDoc(data as Record<string, unknown>);
    },
    async setQuoteOutcome(id, outcome) {
      const { data, error } = await supabase.from("billing_documents").update({ quote_outcome: outcome }).eq("id", id).select("*").single();
      if (error) fail(error, "Couldn't update the quote.");
      await this.markEvent(id, data.session_id, `quote_${outcome}`, {});
      return rowToDoc(data);
    },
    async remove(id) {
      const { error } = await supabase.from("billing_documents").delete().eq("id", id);
      if (error) fail(error, "Couldn't delete the document.");
    },
    async revisions(id) {
      const { data, error } = await supabase.from("billing_document_revisions").select("*").eq("document_id", id).order("revision", { ascending: false });
      if (error) fail(error, "Couldn't load revisions.");
      return (data ?? []) as DocumentRevision[];
    },
    async markSent(id, channel) {
      const { data, error } = await supabase.from("billing_documents").update({ sent_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) fail(error, "Couldn't record that.");
      await this.markEvent(id, data.session_id, "sent", { channel });
      return rowToDoc(data);
    },
    // internal helper (not part of the public interface)
    async markEvent(id: string, sessionId: string | null, kind: string, detail: Record<string, unknown>) {
      await supabase.from("billing_events").insert({ document_id: id, session_id: sessionId, kind, detail, actor: await actorEmail() });
    },
  } as Api["docs"] & { markEvent(id: string, s: string | null, k: string, d: Record<string, unknown>): Promise<void> },

  payments: {
    async list() {
      const { data, error } = await supabase.from("billing_payments").select("*").order("paid_at", { ascending: true });
      if (error) fail(error, "Couldn't load payments.");
      return (data ?? []) as Payment[];
    },
    async add(p) {
      const { data, error } = await supabase.from("billing_payments").insert(p).select("*").single();
      if (error) fail(error, "Couldn't record the payment.");
      await supabase.from("billing_events").insert({ document_id: p.document_id, kind: "payment_added", detail: { amount_pence: p.amount_pence, method: p.method }, actor: await actorEmail() });
      return data as Payment;
    },
    async remove(id) {
      const { data } = await supabase.from("billing_payments").select("document_id, amount_pence").eq("id", id).maybeSingle();
      const { error } = await supabase.from("billing_payments").delete().eq("id", id);
      if (error) fail(error, "Couldn't remove the payment.");
      if (data) await supabase.from("billing_events").insert({ document_id: data.document_id, kind: "payment_removed", detail: { amount_pence: data.amount_pence }, actor: await actorEmail() });
    },
    async update(id, patch) {
      const { data, error } = await supabase.from("billing_payments").update(patch).eq("id", id).select("*").single();
      if (error) fail(error, "Couldn't update the payment.");
      return data as Payment;
    },
  },

  events: {
    async list(documentId) {
      let q = supabase.from("billing_events").select("*").order("created_at", { ascending: false }).limit(500);
      if (documentId) q = q.eq("document_id", documentId);
      const { data, error } = await q;
      if (error) fail(error, "Couldn't load activity.");
      return (data ?? []) as BillingEvent[];
    },
    async add(e) {
      await supabase.from("billing_events").insert({ ...e, actor: await actorEmail() });
    },
  },

  col: (name) => collection(name),

  tracker: {
    async jobs() {
      const { data, error } = await supabase
        .from("tracking_sessions")
        .select("id, job_reference, customer_first_name, customer_phone, customer_address, customer_postcode, vehicle_registration, vehicle_description, appointment_at, completed_at, status, engineer_id, quoted_price, job_notes, visit_count, engineer:engineers(name)")
        .order("appointment_at", { ascending: false })
        .limit(400);
      if (error) fail(error, "Couldn't load jobs from the tracker.");
      return (data ?? []).map((r) => {
        const { engineer, ...rest } = r as Record<string, unknown> & { engineer?: { name?: string } | null };
        return { ...rest, engineer_name: engineer?.name ?? null } as unknown as TrackerJob;
      });
    },
    async reports() {
      const { data, error } = await supabase.from("job_reports").select("*");
      if (error) return [] as JobReport[]; // tracker migration not applied yet
      return (data ?? []) as JobReport[];
    },
    async photos(sessionId) {
      const { data, error } = await supabase.from("job_photos").select("id, session_id, category, photo_url, caption, created_at").eq("session_id", sessionId);
      if (error) return [] as TrackerPhoto[];
      return (data ?? []) as TrackerPhoto[];
    },
    async infoRequests() {
      const { data, error } = await supabase.from("job_info_requests").select("*").order("created_at", { ascending: false });
      if (error) return [] as InfoRequest[];
      return (data ?? []) as InfoRequest[];
    },
    async requestInfo(sessionId, prompt) {
      const { data, error } = await supabase.from("job_info_requests").insert({ session_id: sessionId, prompt }).select("*").single();
      if (error) fail(error, "Couldn't send that request to the engineer.");
      await supabase.from("job_reports").update({ status: "needs_info" }).eq("session_id", sessionId);
      return data as InfoRequest;
    },
    async closeInfoRequest(id) {
      const { error } = await supabase.from("job_info_requests").update({ status: "closed" }).eq("id", id);
      if (error) fail(error, "Couldn't close that request.");
    },
    async setReportStatus(sessionId, status) {
      await supabase.from("job_reports").update({ status }).eq("session_id", sessionId);
    },
  },

  files: {
    async uploadImage(file, folder) {
      const path = `${folder}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("billing-photos").upload(path, file, { contentType: "image/jpeg", upsert: false });
      if (error) fail(error, "Couldn't upload that photo.");
      return supabase.storage.from("billing-photos").getPublicUrl(path).data.publicUrl;
    },
  },

  publicApi: {
    async getDocument(tok) {
      const { data, error } = await supabase.rpc("get_public_billing_document", { p_token: tok });
      if (error) throw new Error("Couldn't load this document.");
      return (data as PublicDocument | null) ?? null;
    },
    async recordView(tok) {
      await supabase.rpc("billing_record_view", { p_token: tok });
    },
    async respondToQuote(tok, outcome, name) {
      const { error } = await supabase.rpc("billing_respond_quote", { p_token: tok, p_outcome: outcome, p_name: name });
      if (error) throw new Error("Couldn't record your response. Please contact us instead.");
    },
  },
};
