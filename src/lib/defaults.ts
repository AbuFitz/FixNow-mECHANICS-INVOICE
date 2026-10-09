import type {
  Account,
  BillingSettings,
  DocType,
  DocumentContent,
  DocOptions,
} from "./types";

/**
 * Seed values come from the original receipt editor (company number, phone,
 * support email, review link, legal wording). Anything the original did NOT
 * state — bank details, VAT number, registered office — is left blank so it is
 * never invented; Settings flags it as missing.
 */
export const DEFAULT_SETTINGS: BillingSettings = {
  business: {
    trading_name: "FixNow Mechanics",
    legal_name: "FixNow Mechanics Ltd",
    descriptor: "Mobile Mechanics & Vehicle Repairs",
    tagline: "When it stops, we start.",
    company_number: "17004843",
    registered_in: "England & Wales",
    registered_office: "",
    address: "",
    phone: "07354 915941",
    email: "Support@fixnowmechanics.co.uk",
    website: "fixnowmechanics.co.uk",
    vat_number: "",
    vat_registered: false,
    bank: { account_name: "", sort_code: "", account_number: "", bank_name: "" },
    review_url: "https://g.page/r/CXrC1JmPiKu7EBM/review",
  },
  numbering: { quote: "QT", invoice: "INV", receipt: "RCT", credit_note: "CN" },
  defaults: {
    payment_terms_days: 7,
    quote_valid_days: 30,
    parts_warranty: "",
    labour_warranty: "30-Day Workmanship Guarantee",
    exclusions: [
      "Misuse or physical damage",
      "Work carried out by third parties",
      "Wear and tear or unrelated faults",
    ],
    legal_text:
      "All work carried out by FixNow Mechanics Ltd is based on the condition of the vehicle at the time of inspection. Additional faults may arise that were not visible during initial assessment. FixNow Mechanics Ltd is not liable for pre-existing issues or consequential faults following repair unless directly caused by our workmanship.",
    statutory_note: "Nothing in these terms affects your statutory rights as a consumer.",
    invoice_footer_note: "",
    quote_terms:
      "This quote is an estimate based on the information available at the time of inspection. If further work is found to be necessary we will contact you for approval before proceeding.",
    late_payment_note:
      "Please pay by the due date using the details above and quote the document number as your payment reference.",
    show_legal: true,
    show_review: true,
    show_qr: true,
  },
  tax: {
    vat_scheme: "standard",
    vat_frequency: "quarterly",
    vat_stagger_start_month: 1,
    flat_rate_percent: 0,
    accounting_basis: "accrual",
    financial_year_end_month: 3,
    mileage_rate_first_10k_pence: 45,
    mileage_rate_after_10k_pence: 25,
  },
  base_currency: "GBP",
  tracker_url: "",
  benchmarks: [],
};

export const DEFAULT_OPTIONS: DocOptions = {
  show_legal: true,
  show_review: true,
  show_qr: true,
  show_plate: true,
  show_warranty: true,
};

export function blankContent(settings: BillingSettings, docType: DocType): DocumentContent {
  const d = settings.defaults;
  return {
    business: structuredClone(settings.business),
    currency: settings.base_currency,
    fx_rate: 1,
    customer: { name: "", phone: "", email: "", address: "", postcode: "" },
    vehicle: { make_model: "", registration: "", mileage: null, location: "" },
    job: { reference: "", title: "", summary: "" },
    items: [],
    discount_pence: 0,
    discount_label: "Discount",
    vat_mode: settings.business.vat_registered ? "standard" : "none",
    warranty: {
      parts: d.parts_warranty,
      labour: docType === "quote" ? "" : d.labour_warranty,
      exclusions: docType === "quote" ? [] : [...d.exclusions],
    },
    engineer_notes: "",
    condition_on_arrival: "",
    advisories: [],
    gallery: [],
    signoff: null,
    payment_terms_days: d.payment_terms_days,
    payment_note: d.late_payment_note,
    terms_text: docType === "quote" ? d.quote_terms : d.legal_text,
    statutory_note: d.statutory_note,
    footer_note: d.invoice_footer_note,
    options: { ...DEFAULT_OPTIONS, show_legal: d.show_legal, show_review: d.show_review, show_qr: d.show_qr },
    amendment_note: "",
    internal_notes: "",
  };
}

export const DOC_LABEL: Record<DocType, string> = {
  quote: "Quote",
  invoice: "Invoice",
  receipt: "Receipt",
  credit_note: "Credit note",
};

export const DEFAULT_ACCOUNTS: Account[] = [
  { code: "200", name: "Sales — Labour", group: "income", default_vat: 20, hmrc_category: "turnover", system: true },
  { code: "201", name: "Sales — Parts", group: "income", default_vat: 20, hmrc_category: "turnover", system: true },
  { code: "202", name: "Sales — Call-out fees", group: "income", default_vat: 20, hmrc_category: "turnover", system: true },
  { code: "260", name: "Other income", group: "other_income", default_vat: 20, hmrc_category: "otherIncome" },
  { code: "300", name: "Parts & materials", group: "cost_of_sales", default_vat: 20, hmrc_category: "costOfGoods" },
  { code: "301", name: "Subcontractors", group: "cost_of_sales", default_vat: 20, hmrc_category: "constructionIndustryScheme" },
  { code: "302", name: "Tools & consumables", group: "cost_of_sales", default_vat: 20, hmrc_category: "costOfGoods" },
  { code: "400", name: "Advertising & marketing", group: "expense", default_vat: 20, hmrc_category: "advertisingCosts" },
  { code: "401", name: "Bank & card fees", group: "expense", default_vat: 0, hmrc_category: "financialCharges" },
  { code: "402", name: "Insurance", group: "expense", default_vat: 0, hmrc_category: "adminCosts" },
  { code: "403", name: "Fuel", group: "expense", default_vat: 20, hmrc_category: "carVanTravelCosts" },
  { code: "404", name: "Vehicle repairs & MOT", group: "expense", default_vat: 20, hmrc_category: "carVanTravelCosts" },
  { code: "405", name: "Phone & internet", group: "expense", default_vat: 20, hmrc_category: "adminCosts" },
  { code: "406", name: "Software & subscriptions", group: "expense", default_vat: 20, hmrc_category: "adminCosts" },
  { code: "407", name: "Training & certification", group: "expense", default_vat: 0, hmrc_category: "adminCosts" },
  { code: "408", name: "Workwear & PPE", group: "expense", default_vat: 20, hmrc_category: "otherExpenses" },
  { code: "409", name: "Accountancy & legal", group: "expense", default_vat: 20, hmrc_category: "professionalFees" },
  { code: "410", name: "Rent & premises", group: "expense", default_vat: 20, hmrc_category: "premisesRunningCosts" },
  { code: "411", name: "Mileage allowance", group: "expense", default_vat: 0, hmrc_category: "carVanTravelCosts" },
  { code: "412", name: "Waste disposal", group: "expense", default_vat: 20, hmrc_category: "otherExpenses" },
  { code: "415", name: "Office & admin", group: "expense", default_vat: 20, hmrc_category: "adminCosts" },
  { code: "420", name: "Wages & salaries", group: "payroll", default_vat: 0, hmrc_category: "staffCosts" },
  { code: "421", name: "Employer NI & pension", group: "payroll", default_vat: 0, hmrc_category: "staffCosts" },
  { code: "499", name: "Other expenses", group: "expense", default_vat: 20, hmrc_category: "otherExpenses" },
];

export const SEVERITY_LABEL = {
  urgent: "Urgent — act now",
  soon: "Advised — address soon",
  monitor: "Monitor",
} as const;
