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
import { DEFAULT_ACCOUNTS, DEFAULT_SETTINGS } from "../defaults";
import { addDaysIso, isoDate, token, uid } from "../format";
import { computeTotals } from "../totals";
import { buildSeed, type SeedState } from "./demoSeed";

const KEY = "fixnow-billing-demo-v1";

interface DemoState extends SeedState {
  counters: Record<string, number>;
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    /* fall through to a fresh seed */
  }
  const fresh = { ...buildSeed(), counters: {} } as DemoState;
  persist(fresh);
  return fresh;
}

function persist(s: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — demo still works in memory */
  }
}

let state: DemoState | null = null;
function st(): DemoState {
  if (!state) state = load();
  return state;
}
function save() {
  persist(st());
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  state = null;
}

const delay = <T,>(v: T): Promise<T> => Promise.resolve(structuredClone(v));

function event(documentId: string | null, sessionId: string | null, kind: string, detail: Record<string, unknown> = {}) {
  const e: BillingEvent = {
    id: uid(),
    document_id: documentId,
    session_id: sessionId,
    kind,
    detail,
    actor: "demo@fixnowmechanics.co.uk",
    created_at: new Date().toISOString(),
  };
  st().events.push(e);
}

function recalcPaid(docId: string) {
  const s = st();
  const doc = s.documents.find((d) => d.id === docId);
  if (!doc) return;
  doc.paid_pence = s.payments.filter((p) => p.document_id === docId).reduce((a, p) => a + p.amount_pence, 0);
  doc.updated_at = new Date().toISOString();
}

function recalcCredited(parentId: string | null) {
  if (!parentId) return;
  const s = st();
  const parent = s.documents.find((d) => d.id === parentId);
  if (!parent) return;
  parent.credited_pence = s.documents
    .filter((d) => d.parent_id === parentId && d.doc_type === "credit_note" && d.lifecycle === "issued")
    .reduce((a, d) => a + d.total_pence, 0);
}

function nextNumber(docType: string, year: number): string {
  const s = st();
  const prefix = s.settings.numbering[docType as keyof BillingSettings["numbering"]];
  const key = `${docType}-${year}`;
  s.counters[key] = (s.counters[key] ?? s.documents.filter((d) => d.doc_type === docType && d.number?.includes(`-${year}-`)).length) + 1;
  return `${prefix}-${year}-${String(s.counters[key]).padStart(4, "0")}`;
}

function collection<K extends CollectionName>(name: K): Collection<CollectionMap[K]> {
  type Row = CollectionMap[K] & { id: string };
  const rows = () => (st().collections[name] as unknown as Row[]) ?? [];
  return {
    list: () => delay(rows() as unknown as CollectionMap[K][]),
    upsert: async (row) => {
      const list = rows();
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx >= 0) list[idx] = row as Row;
      else list.push(row as Row);
      st().collections[name] = list as never;
      save();
      return structuredClone(row) as CollectionMap[K];
    },
    remove: async (id) => {
      st().collections[name] = rows().filter((r) => r.id !== id) as never;
      save();
    },
  };
}

function stripPublic(doc: BillingDocument): PublicDocument {
  const s = st();
  const parent = doc.parent_id ? s.documents.find((d) => d.id === doc.parent_id) : null;
  const content = structuredClone(doc.content);
  content.internal_notes = "";
  content.items = content.items.map((i) => {
    const { cost_pence: _cost, ...rest } = i;
    void _cost;
    return rest;
  });
  return {
    doc_type: doc.doc_type,
    number: doc.number,
    lifecycle: doc.lifecycle,
    quote_outcome: doc.quote_outcome,
    revision: doc.revision,
    issued_at: doc.issued_at,
    due_at: doc.due_at,
    valid_until: doc.valid_until,
    content,
    total_pence: doc.total_pence,
    paid_pence: doc.paid_pence,
    credited_pence: doc.credited_pence,
    pay_url: null,
    parent_number: parent?.number ?? null,
    payments: s.payments.filter((p) => p.document_id === doc.id),
  };
}

export const demoApi: Api = {
  mode: "demo",

  auth: {
    current: async () => ({ email: "demo@fixnowmechanics.co.uk" }),
    signIn: async () => undefined,
    signOut: async () => undefined,
  },

  settings: {
    get: () => delay(st().settings),
    save: async (s) => {
      st().settings = s;
      save();
      return structuredClone(s);
    },
  },

  docs: {
    list: () => delay(st().documents),
    get: (id) => delay(st().documents.find((d) => d.id === id) ?? null),
    create: async (input) => {
      const now = new Date().toISOString();
      const doc: BillingDocument = {
        id: uid(),
        doc_type: input.doc_type,
        number: null,
        lifecycle: "draft",
        quote_outcome: "pending",
        revision: 1,
        session_id: input.session_id ?? null,
        contact_id: input.contact_id ?? null,
        parent_id: input.parent_id ?? null,
        project_id: input.project_id ?? null,
        share_token: token(),
        issued_at: null,
        due_at: null,
        valid_until: null,
        sent_at: null,
        first_viewed_at: null,
        last_viewed_at: null,
        view_count: 0,
        content: input.content,
        total_pence: computeTotals(input.content).total_pence,
        paid_pence: 0,
        credited_pence: 0,
        created_at: now,
        updated_at: now,
      };
      st().documents.push(doc);
      event(doc.id, doc.session_id, "created", { doc_type: doc.doc_type });
      save();
      return structuredClone(doc);
    },
    update: async (id, patch) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      Object.assign(doc, patch, { updated_at: new Date().toISOString() });
      save();
      return structuredClone(doc);
    },
    issue: async (id) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      const today = isoDate();
      if (!doc.number) doc.number = nextNumber(doc.doc_type, new Date().getFullYear());
      doc.lifecycle = "issued";
      doc.issued_at = doc.issued_at ?? today;
      if (doc.doc_type === "invoice") doc.due_at = addDaysIso(today, doc.content.payment_terms_days);
      if (doc.doc_type === "quote") doc.valid_until = addDaysIso(today, st().settings.defaults.quote_valid_days);
      event(doc.id, doc.session_id, "issued", { number: doc.number });
      recalcCredited(doc.parent_id);
      save();
      return structuredClone(doc);
    },
    amend: async (id, content, total, reason) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      st().revisions.push({
        id: uid(),
        document_id: id,
        revision: doc.revision,
        reason,
        content: structuredClone(doc.content),
        total_pence: doc.total_pence,
        created_at: new Date().toISOString(),
      });
      doc.revision += 1;
      doc.content = content;
      doc.total_pence = total;
      doc.updated_at = new Date().toISOString();
      event(doc.id, doc.session_id, "amended", { revision: doc.revision, reason });
      recalcCredited(doc.parent_id);
      save();
      return structuredClone(doc);
    },
    setVoid: async (id, voided, reason) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      doc.lifecycle = voided ? "void" : doc.number ? "issued" : "draft";
      event(doc.id, doc.session_id, voided ? "voided" : "unvoided", { reason });
      recalcCredited(doc.parent_id);
      save();
      return structuredClone(doc);
    },
    setQuoteOutcome: async (id, outcome) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      doc.quote_outcome = outcome;
      event(doc.id, doc.session_id, `quote_${outcome}`);
      save();
      return structuredClone(doc);
    },
    remove: async (id) => {
      const s = st();
      s.documents = s.documents.filter((d) => d.id !== id);
      s.payments = s.payments.filter((p) => p.document_id !== id);
      s.revisions = s.revisions.filter((r) => r.document_id !== id);
      event(null, null, "deleted", { id });
      save();
    },
    revisions: (id) => delay(st().revisions.filter((r) => r.document_id === id) as DocumentRevision[]),
    markSent: async (id, channel) => {
      const doc = st().documents.find((d) => d.id === id);
      if (!doc) throw new Error("Document not found");
      doc.sent_at = new Date().toISOString();
      event(doc.id, doc.session_id, "sent", { channel });
      save();
      return structuredClone(doc);
    },
  },

  payments: {
    list: () => delay(st().payments),
    add: async (p) => {
      const row: Payment = { ...p, id: uid(), created_at: new Date().toISOString() };
      st().payments.push(row);
      recalcPaid(p.document_id);
      event(p.document_id, null, "payment_added", { amount_pence: p.amount_pence, method: p.method });
      save();
      return structuredClone(row);
    },
    remove: async (id) => {
      const s = st();
      const p = s.payments.find((x) => x.id === id);
      s.payments = s.payments.filter((x) => x.id !== id);
      if (p) {
        recalcPaid(p.document_id);
        event(p.document_id, null, "payment_removed", { amount_pence: p.amount_pence });
      }
      save();
    },
    update: async (id, patch) => {
      const p = st().payments.find((x) => x.id === id);
      if (!p) throw new Error("Payment not found");
      Object.assign(p, patch);
      recalcPaid(p.document_id);
      save();
      return structuredClone(p);
    },
  },

  events: {
    list: (documentId) =>
      delay(
        st()
          .events.filter((e) => !documentId || e.document_id === documentId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      ),
    add: async (e) => {
      event(e.document_id, e.session_id, e.kind, e.detail);
      save();
    },
  },

  col: (name) => collection(name),

  tracker: {
    jobs: () => delay(st().jobs as TrackerJob[]),
    reports: () => delay(st().reports as JobReport[]),
    photos: (sessionId) => delay(st().photos.filter((p) => p.session_id === sessionId) as TrackerPhoto[]),
    infoRequests: () => delay(st().infoRequests as InfoRequest[]),
    requestInfo: async (sessionId, prompt) => {
      const r: InfoRequest = {
        id: uid(),
        session_id: sessionId,
        prompt,
        status: "open",
        response: null,
        created_at: new Date().toISOString(),
        answered_at: null,
      };
      st().infoRequests.push(r);
      const rep = st().reports.find((x) => x.session_id === sessionId);
      if (rep) rep.status = "needs_info";
      event(null, sessionId, "info_requested", { prompt });
      save();
      return structuredClone(r);
    },
    closeInfoRequest: async (id) => {
      const r = st().infoRequests.find((x) => x.id === id);
      if (r) r.status = "closed";
      save();
    },
    setReportStatus: async (sessionId, status) => {
      const rep = st().reports.find((x) => x.session_id === sessionId);
      if (rep) rep.status = status;
      save();
    },
  },

  files: {
    uploadImage: (file) =>
      new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Couldn't read that image."));
        fr.readAsDataURL(file);
      }),
  },

  publicApi: {
    getDocument: async (tok) => {
      const doc = st().documents.find((d) => d.share_token === tok && d.lifecycle !== "draft");
      return doc ? stripPublic(doc) : null;
    },
    recordView: async (tok) => {
      const doc = st().documents.find((d) => d.share_token === tok);
      if (!doc) return;
      const now = new Date().toISOString();
      doc.first_viewed_at = doc.first_viewed_at ?? now;
      doc.last_viewed_at = now;
      doc.view_count += 1;
      if (doc.view_count === 1) event(doc.id, doc.session_id, "viewed");
      save();
    },
    respondToQuote: async (tok, outcome, name) => {
      const doc = st().documents.find((d) => d.share_token === tok);
      if (!doc) throw new Error("Not found");
      doc.quote_outcome = outcome;
      event(doc.id, doc.session_id, `quote_${outcome}`, { name });
      save();
    },
  },
};

export { DEFAULT_ACCOUNTS, DEFAULT_SETTINGS };
