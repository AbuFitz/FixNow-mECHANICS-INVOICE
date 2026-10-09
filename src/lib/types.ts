/**
 * FixNow Billing — domain types.
 *
 * Money is ALWAYS integer pence (never floats). Quantities may be fractional
 * (1.5 hours) and are rounded once, per line, when converted to pence.
 */

export type DocType = "quote" | "invoice" | "receipt" | "credit_note";
export type DocLifecycle = "draft" | "issued" | "void";
export type QuoteOutcome = "pending" | "accepted" | "declined";

export type LineKind = "part" | "labour" | "callout" | "other";

export type PaymentMethod =
  | "bank_transfer"
  | "cash"
  | "card"
  | "cheque"
  | "online"
  | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online payment" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Business profile + settings
// ---------------------------------------------------------------------------

export interface BankDetails {
  account_name: string;
  sort_code: string;
  account_number: string;
  bank_name: string;
}

export interface BusinessProfile {
  trading_name: string;
  legal_name: string;
  descriptor: string;
  tagline: string;
  company_number: string;
  registered_in: string;
  registered_office: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  vat_number: string;
  vat_registered: boolean;
  bank: BankDetails;
  review_url: string;
}

export interface NumberingSettings {
  quote: string;
  invoice: string;
  receipt: string;
  credit_note: string;
}

export interface DocumentDefaults {
  payment_terms_days: number;
  quote_valid_days: number;
  parts_warranty: string;
  labour_warranty: string;
  exclusions: string[];
  legal_text: string;
  statutory_note: string;
  invoice_footer_note: string;
  quote_terms: string;
  late_payment_note: string;
  show_legal: boolean;
  show_review: boolean;
  show_qr: boolean;
}

export interface TaxSettings {
  vat_scheme: "standard" | "cash" | "flat_rate";
  vat_frequency: "quarterly" | "monthly" | "annual";
  /** First month (1-12) a VAT quarter starts in, e.g. 1 = Jan/Apr/Jul/Oct. */
  vat_stagger_start_month: number;
  flat_rate_percent: number;
  accounting_basis: "accrual" | "cash";
  financial_year_end_month: number;
  mileage_rate_first_10k_pence: number;
  mileage_rate_after_10k_pence: number;
}

export interface BillingSettings {
  business: BusinessProfile;
  numbering: NumberingSettings;
  defaults: DocumentDefaults;
  tax: TaxSettings;
  base_currency: string;
  tracker_url: string;
  /** User-entered sector benchmarks (never invented by the app). */
  benchmarks: BenchmarkEntry[];
}

export interface BenchmarkEntry {
  id: string;
  label: string;
  metric: KpiKey;
  value: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Sales documents
// ---------------------------------------------------------------------------

export interface LineItem {
  id: string;
  kind: LineKind;
  description: string;
  /** Part number / serial / extra detail line. */
  detail?: string;
  qty: number;
  unit_pence: number;
  /** Internal cost per unit — NEVER printed. Drives job margin reporting. */
  cost_pence?: number;
  /** VAT rate percentage for this line (0, 5, 20 …). Ignored when not VAT registered. */
  vat_rate?: number;
  /** Chart-of-accounts code for sales reporting. */
  account?: string;
}

export type AdvisorySeverity = "urgent" | "soon" | "monitor";

export interface DocPhoto {
  id: string;
  /** Public URL (or data URL in demo mode). */
  url: string;
  caption?: string;
}

export interface Advisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
  photos: DocPhoto[];
  /** Customer was told and declined the work. */
  declined?: boolean;
  declined_at?: string;
}

export interface Signoff {
  name: string;
  signed_at: string;
  /** PNG data URL of the drawn signature. */
  signature: string;
  statement: string;
}

export interface CustomerBlock {
  name: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  /** Business customers can carry a company name / VAT no. */
  company?: string;
}

export interface VehicleBlock {
  make_model: string;
  registration: string;
  mileage?: number | null;
  colour?: string;
  vin?: string;
  location: string;
}

export interface JobBlock {
  reference: string;
  title: string;
  summary: string;
  work_date?: string;
  engineer_name?: string;
}

export interface WarrantyBlock {
  parts: string;
  labour: string;
  exclusions: string[];
}

export interface DocOptions {
  show_legal: boolean;
  show_review: boolean;
  show_qr: boolean;
  show_plate: boolean;
  show_warranty: boolean;
}

export type VatMode = "none" | "standard" | "reduced" | "zero";

export interface DocumentContent {
  business: BusinessProfile;
  currency: string;
  /** Rate to convert 1 unit of `currency` to base currency (GBP). 1 for GBP. */
  fx_rate: number;
  customer: CustomerBlock;
  vehicle: VehicleBlock;
  job: JobBlock;
  items: LineItem[];
  discount_pence: number;
  discount_label: string;
  /** Default VAT applied to new lines; per-line rate wins. */
  vat_mode: VatMode;
  warranty: WarrantyBlock;
  engineer_notes: string;
  condition_on_arrival: string;
  advisories: Advisory[];
  gallery: DocPhoto[];
  signoff: Signoff | null;
  payment_terms_days: number;
  payment_note: string;
  terms_text: string;
  statutory_note: string;
  footer_note: string;
  options: DocOptions;
  /** Customer-facing explanation shown on amended documents. */
  amendment_note: string;
  /** Internal-only notes, never rendered to PDF. */
  internal_notes: string;
  /** Payment taken on the day, recorded as a real payment when the document is issued. */
  pending_payment?: { amount_pence: number; method: PaymentMethod; reference: string } | null;
}

export interface Payment {
  id: string;
  document_id: string;
  amount_pence: number;
  method: PaymentMethod;
  paid_at: string;
  reference: string;
  note: string;
  created_at: string;
  /** Set once matched to a bank transaction during reconciliation. */
  bank_txn_id?: string | null;
}

export interface BillingDocument {
  id: string;
  doc_type: DocType;
  number: string | null;
  lifecycle: DocLifecycle;
  quote_outcome: QuoteOutcome;
  revision: number;
  session_id: string | null;
  contact_id: string | null;
  parent_id: string | null;
  project_id: string | null;
  share_token: string;
  issued_at: string | null;
  due_at: string | null;
  valid_until: string | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  content: DocumentContent;
  total_pence: number;
  paid_pence: number;
  credited_pence: number;
  pay_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRevision {
  id: string;
  document_id: string;
  revision: number;
  reason: string;
  content: DocumentContent;
  total_pence: number;
  created_at: string;
}

export type PaymentState =
  | "draft"
  | "unpaid"
  | "part_paid"
  | "paid"
  | "overdue"
  | "void"
  | "credited";

export interface BillingEvent {
  id: string;
  document_id: string | null;
  session_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  actor: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Contacts, catalogue
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  kind: "customer" | "supplier" | "both";
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  vat_number: string;
  notes: string;
  /** Supplier is a CIS subcontractor. */
  cis_status: "none" | "gross" | "standard" | "unmatched";
  cis_utr: string;
  default_account: string;
  payment_terms_days: number | null;
  currency: string;
  created_at: string;
}

export type PresetKind = "item" | "warranty" | "exclusion" | "advisory" | "note" | "bank_rule";

export interface Preset {
  id: string;
  kind: PresetKind;
  label: string;
  payload: Record<string, unknown>;
  sort: number;
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

export type AccountGroup =
  | "income"
  | "cost_of_sales"
  | "expense"
  | "payroll"
  | "other_income"
  | "asset"
  | "liability";

export interface Account {
  code: string;
  name: string;
  group: AccountGroup;
  /** Default VAT rate for this category when entering bills/expenses. */
  default_vat: number;
  /** HMRC self-assessment style bucket, for MTD-ready quarterly summaries. */
  hmrc_category: string;
  system?: boolean;
}

export type BillStatus = "draft" | "approved" | "paid" | "void";

export interface BillLine {
  id: string;
  description: string;
  account: string;
  net_pence: number;
  vat_rate: number;
  /** Labour portion of a CIS-able bill (materials are excluded from deduction). */
  is_labour?: boolean;
}

export interface Bill {
  id: string;
  contact_id: string | null;
  supplier_name: string;
  reference: string;
  bill_date: string;
  due_date: string | null;
  currency: string;
  fx_rate: number;
  lines: BillLine[];
  status: BillStatus;
  paid_pence: number;
  cis_deduction_pence: number;
  project_id: string | null;
  attachment_url: string | null;
  notes: string;
  repeat: "none" | "weekly" | "monthly" | "quarterly" | "annually";
  created_at: string;
}

export type ExpenseKind = "receipt" | "mileage";

export interface Expense {
  id: string;
  kind: ExpenseKind;
  claimant: string;
  date: string;
  description: string;
  account: string;
  /** Gross amount paid, pence (receipt claims). */
  gross_pence: number;
  vat_pence: number;
  currency: string;
  fx_rate: number;
  miles: number;
  from_to: string;
  status: "submitted" | "approved" | "reimbursed" | "rejected";
  attachment_url: string | null;
  project_id: string | null;
  created_at: string;
}

export interface BankAccount {
  id: string;
  name: string;
  currency: string;
  opening_balance_pence: number;
  sort_code: string;
  account_number: string;
  created_at: string;
}

export type MatchTarget =
  | { type: "payment"; id: string }
  | { type: "bill"; id: string }
  | { type: "expense"; id: string }
  | { type: "direct"; account: string; vat_rate: number; description: string }
  | { type: "transfer"; id: string }
  | { type: "ignored" };

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  date: string;
  description: string;
  /** Positive = money in, negative = money out. */
  amount_pence: number;
  external_id: string;
  matched: MatchTarget | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  contact_id: string | null;
  status: "active" | "completed" | "archived";
  budget_pence: number;
  hourly_rate_pence: number;
  notes: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  project_id: string;
  user_name: string;
  date: string;
  minutes: number;
  description: string;
  billable: boolean;
  invoiced_document_id: string | null;
  created_at: string;
}

export interface BudgetRow {
  id: string;
  year: number;
  account: string;
  /** 12 monthly amounts in pence, index 0 = first month of the financial year. */
  months: number[];
}

export interface VatReturnRecord {
  id: string;
  period_key: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: "open" | "reviewed" | "submitted";
  boxes: VatBoxes;
  submitted_at: string | null;
  hmrc_receipt: string | null;
  created_at: string;
}

export interface VatBoxes {
  vatDueSales: number;
  vatDueAcquisitions: number;
  totalVatDue: number;
  vatReclaimedCurrPeriod: number;
  netVatDue: number;
  totalValueSalesExVAT: number;
  totalValuePurchasesExVAT: number;
  totalValueGoodsSuppliedExVAT: number;
  totalAcquisitionsExVAT: number;
}

export interface Employee {
  id: string;
  name: string;
  ni_number: string;
  tax_code: string;
  pay_frequency: "monthly" | "weekly";
  annual_salary_pence: number;
  hourly_rate_pence: number;
  pension_opt_in: boolean;
  student_loan_plan: "none" | "plan1" | "plan2" | "plan4" | "plan5";
  start_date: string;
  active: boolean;
  created_at: string;
}

export interface PayslipLine {
  employee_id: string;
  employee_name: string;
  gross_pence: number;
  tax_pence: number;
  employee_ni_pence: number;
  employer_ni_pence: number;
  pension_employee_pence: number;
  pension_employer_pence: number;
  student_loan_pence: number;
  net_pence: number;
  hours: number;
}

export interface PayRun {
  id: string;
  period_label: string;
  period_end: string;
  pay_date: string;
  /** 1-based period index within the tax year. */
  period_number: number;
  frequency: "monthly" | "weekly";
  lines: PayslipLine[];
  status: "draft" | "approved" | "paid";
  created_at: string;
}

export type KpiKey =
  | "gross_margin_pct"
  | "net_margin_pct"
  | "avg_invoice_pence"
  | "dso_days"
  | "repeat_customer_pct"
  | "revenue_per_job_pence"
  | "parts_margin_pct";

// ---------------------------------------------------------------------------
// Tracker bridge (reads)
// ---------------------------------------------------------------------------

export interface TrackerJob {
  id: string;
  job_reference: string;
  customer_first_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_postcode: string;
  vehicle_registration: string;
  vehicle_description: string | null;
  appointment_at: string;
  completed_at: string | null;
  status: "confirmed" | "en_route" | "arrived" | "completed" | "cancelled";
  engineer_id: string | null;
  engineer_name: string | null;
  quoted_price: string | null;
  job_notes: string | null;
  visit_count: number;
}

export interface JobReportParts {
  name: string;
  part_number: string;
  serial: string;
  qty: number;
  unit_price_pence: number | null;
  warranty: string;
}

export interface JobReportAdvisory {
  id: string;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
  photo_ids: string[];
  declined: boolean;
}

export interface JobReport {
  session_id: string;
  status: "draft" | "submitted" | "needs_info" | "reviewed";
  work_summary: string;
  parts: JobReportParts[];
  labour_minutes: number | null;
  mileage: number | null;
  condition_on_arrival: string;
  advisories: JobReportAdvisory[];
  payment: { taken: boolean; method: PaymentMethod | null; amount_pence: number | null; reference: string } | null;
  customer_email: string;
  customer_full_name: string;
  signoff: { name: string; signed_at: string; signature: string } | null;
  engineer_notes: string;
  submitted_at: string | null;
  updated_at: string;
}

export interface InfoRequest {
  id: string;
  session_id: string;
  prompt: string;
  status: "open" | "answered" | "closed";
  response: string | null;
  created_at: string;
  answered_at: string | null;
}

export interface TrackerPhoto {
  id: string;
  session_id: string;
  category: "proof_of_work" | "receipt_warranty" | "advisory" | "condition";
  photo_url: string;
  caption: string | null;
  created_at: string;
}
