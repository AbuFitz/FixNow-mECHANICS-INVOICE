import type {
  Account,
  Bill,
  BankAccount,
  BankTransaction,
  BillingDocument,
  BillingEvent,
  BillingSettings,
  BudgetRow,
  Contact,
  DocumentContent,
  DocumentRevision,
  DocType,
  Employee,
  Expense,
  InfoRequest,
  JobReport,
  PayRun,
  Payment,
  Preset,
  Project,
  TimeEntry,
  TrackerJob,
  TrackerPhoto,
  VatReturnRecord,
} from "../types";

/** Long-tail collections stored as JSON rows (see migration: billing_records). */
export interface CollectionMap {
  contacts: Contact;
  presets: Preset;
  bills: Bill;
  expenses: Expense;
  bank_accounts: BankAccount;
  bank_txns: BankTransaction;
  projects: Project;
  time_entries: TimeEntry;
  budgets: BudgetRow;
  vat_returns: VatReturnRecord;
  employees: Employee;
  pay_runs: PayRun;
  accounts: Account & { id: string };
}
export type CollectionName = keyof CollectionMap;

export interface Collection<T> {
  list(): Promise<T[]>;
  upsert(row: T & { id: string }): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface NewDocumentInput {
  doc_type: DocType;
  content: DocumentContent;
  session_id?: string | null;
  contact_id?: string | null;
  parent_id?: string | null;
  project_id?: string | null;
}

/** What an unauthenticated customer may see — internal fields are stripped server-side. */
export interface PublicDocument {
  doc_type: DocType;
  number: string | null;
  lifecycle: BillingDocument["lifecycle"];
  quote_outcome: BillingDocument["quote_outcome"];
  revision: number;
  issued_at: string | null;
  due_at: string | null;
  valid_until: string | null;
  content: DocumentContent;
  total_pence: number;
  paid_pence: number;
  credited_pence: number;
  pay_url: string | null;
  parent_number: string | null;
  payments: Pick<Payment, "id" | "amount_pence" | "method" | "paid_at" | "reference" | "document_id" | "note" | "created_at">[];
}

export interface AuthState {
  email: string | null;
}

export interface Api {
  mode: "demo" | "supabase";

  auth: {
    current(): Promise<AuthState>;
    signIn(email: string, password: string): Promise<void>;
    signOut(): Promise<void>;
  };

  settings: {
    get(): Promise<BillingSettings>;
    save(s: BillingSettings): Promise<BillingSettings>;
  };

  docs: {
    list(): Promise<BillingDocument[]>;
    get(id: string): Promise<BillingDocument | null>;
    create(input: NewDocumentInput): Promise<BillingDocument>;
    /** Update content/meta of a draft, or of an issued document WITHOUT a revision (internal fields). */
    update(id: string, patch: Partial<Pick<BillingDocument, "content" | "total_pence" | "contact_id" | "due_at" | "valid_until" | "doc_type" | "project_id" | "sent_at" | "session_id">>): Promise<BillingDocument>;
    /** Assigns the next number, stamps issue/due dates, locks the document as issued. */
    issue(id: string): Promise<BillingDocument>;
    /** Stores the previous version as a revision, bumps the revision number, applies the new content. */
    amend(id: string, content: DocumentContent, total_pence: number, reason: string): Promise<BillingDocument>;
    setVoid(id: string, voided: boolean, reason: string): Promise<BillingDocument>;
    setQuoteOutcome(id: string, outcome: BillingDocument["quote_outcome"]): Promise<BillingDocument>;
    remove(id: string): Promise<void>;
    revisions(id: string): Promise<DocumentRevision[]>;
    markSent(id: string, channel: string): Promise<BillingDocument>;
  };

  payments: {
    list(): Promise<Payment[]>;
    add(p: Omit<Payment, "id" | "created_at">): Promise<Payment>;
    remove(id: string): Promise<void>;
    update(id: string, patch: Partial<Payment>): Promise<Payment>;
  };

  events: {
    list(documentId?: string): Promise<BillingEvent[]>;
    add(e: Omit<BillingEvent, "id" | "created_at" | "actor">): Promise<void>;
  };

  col<K extends CollectionName>(name: K): Collection<CollectionMap[K]>;

  tracker: {
    jobs(): Promise<TrackerJob[]>;
    reports(): Promise<JobReport[]>;
    photos(sessionId: string): Promise<TrackerPhoto[]>;
    infoRequests(): Promise<InfoRequest[]>;
    requestInfo(sessionId: string, prompt: string): Promise<InfoRequest>;
    closeInfoRequest(id: string): Promise<void>;
    setReportStatus(sessionId: string, status: JobReport["status"]): Promise<void>;
  };

  files: {
    /** Uploads an image and returns a URL usable in the PDF + customer page. */
    uploadImage(file: Blob, folder: string): Promise<string>;
  };

  publicApi: {
    getDocument(token: string): Promise<PublicDocument | null>;
    recordView(token: string): Promise<void>;
    respondToQuote(token: string, outcome: "accepted" | "declined", name: string): Promise<void>;
  };
}
