import type {
  Account,
  Bill,
  BankAccount,
  BankTransaction,
  BillingDocument,
  BillingEvent,
  BillingSettings,
  Contact,
  DocType,
  DocumentContent,
  DocumentRevision,
  Employee,
  Expense,
  InfoRequest,
  JobReport,
  LineItem,
  PayRun,
  Payment,
  PaymentMethod,
  Preset,
  Project,
  TimeEntry,
  TrackerJob,
  TrackerPhoto,
  BudgetRow,
  VatReturnRecord,
} from "../types";
import { blankContent, DEFAULT_ACCOUNTS, DEFAULT_SETTINGS } from "../defaults";
import { addDaysIso, isoDate, token } from "../format";
import { computeTotals } from "../totals";

export interface SeedState {
  settings: BillingSettings;
  documents: BillingDocument[];
  payments: Payment[];
  revisions: DocumentRevision[];
  events: BillingEvent[];
  jobs: TrackerJob[];
  reports: JobReport[];
  photos: TrackerPhoto[];
  infoRequests: InfoRequest[];
  collections: {
    contacts: Contact[];
    presets: Preset[];
    bills: Bill[];
    expenses: Expense[];
    bank_accounts: BankAccount[];
    bank_txns: BankTransaction[];
    projects: Project[];
    time_entries: TimeEntry[];
    budgets: BudgetRow[];
    vat_returns: VatReturnRecord[];
    employees: Employee[];
    pay_runs: PayRun[];
    accounts: (Account & { id: string })[];
  };
}

const ago = (n: number) => addDaysIso(new Date(), -n);
let seq = 0;
const id = (p: string) => `${p}-${String(++seq).padStart(3, "0")}`;

export function buildSeed(): SeedState {
  seq = 0;
  const settings: BillingSettings = structuredClone(DEFAULT_SETTINGS);
  settings.business.vat_registered = true;
  settings.business.vat_number = "GB 000 0000 00";
  settings.business.bank = { account_name: "FixNow Mechanics Ltd", sort_code: "00-00-00", account_number: "00000000", bank_name: "Demo Bank" };
  settings.business.registered_office = "Demo registered office — set in Settings";
  settings.defaults.parts_warranty = "12-Month parts guarantee";
  settings.benchmarks = [];

  const customers: Contact[] = [
    ["Matt Johnson", "07700 912345", "matt@example.com", "14 Beech Avenue", "AL10 8TR"],
    ["Priya Shah", "07700 900118", "priya@example.com", "3 Orchard Close", "AL9 5HB"],
    ["Dave Collins", "07700 900244", "", "88 Mill Lane", "SG1 3QR"],
    ["Sarah Whitlock", "07700 900390", "sarah@example.com", "21 Park Road", "EN6 1JE"],
    ["Hatfield Courier Co", "01707 000111", "accounts@hatfieldcourier.example", "Unit 4, Comet Way", "AL10 9TW"],
    ["Tom Eastwood", "07700 900512", "tom@example.com", "9 Church Street", "HP2 5AA"],
  ].map(([name, phone, email, address, postcode]) => ({
    id: id("cus"), kind: "customer" as const, name: name!, company: name!.includes("Co") ? name! : "", email: email!, phone: phone!, address: address!, postcode: postcode!,
    vat_number: "", notes: "", cis_status: "none" as const, cis_utr: "", default_account: "200", payment_terms_days: null, currency: "GBP", created_at: new Date().toISOString(),
  }));
  const suppliers: Contact[] = [
    ["Midland Motor Factors", "orders@midlandmf.example", 0, "none"],
    ["Battery & Bulb Wholesale", "sales@bbw.example", 0, "none"],
    ["Herts Tyre Supplies", "", 0, "none"],
    ["J. Okafor (subcontract engineer)", "jo@example.com", 20, "standard"],
    ["Garage Software Ltd", "", 0, "none"],
  ].map(([name, email, , cis]) => ({
    id: id("sup"), kind: "supplier" as const, name: name as string, company: name as string, email: email as string, phone: "", address: "", postcode: "",
    vat_number: "", notes: "", cis_status: cis as Contact["cis_status"], cis_utr: cis === "standard" ? "1234567890" : "", default_account: "300", payment_terms_days: 30, currency: "GBP", created_at: new Date().toISOString(),
  }));

  const accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a, id: a.code }));

  // ---- Jobs from the tracker (some already billed, some waiting) ------------------
  const eng = ["Dan Reeves", "Lewis Moore"];
  const jobDefs: [number, string, number, string, string, string, string][] = [
    // daysAgo, customerIdx name, ... see map below
    [1, "Matt Johnson", 0, "MJ57 CWF", "Mazda 2 (2007)", "AL10 8TR", "Battery replacement"],
    [2, "Priya Shah", 1, "LK19 PXA", "Ford Fiesta (2019)", "AL9 5HB", "Front brake pads & discs"],
    [4, "Dave Collins", 2, "BD63 NTR", "Vauxhall Astra (2013)", "SG1 3QR", "Diagnostic — misfire"],
    [6, "Sarah Whitlock", 3, "YA68 FHG", "VW Golf (2018)", "EN6 1JE", "Interim service"],
    [9, "Hatfield Courier Co", 4, "WX70 KLM", "Ford Transit Custom (2020)", "AL10 9TW", "Alternator replacement"],
    [14, "Tom Eastwood", 5, "HN15 ZZB", "Honda Civic (2015)", "HP2 5AA", "Full service"],
  ];
  const jobs: TrackerJob[] = jobDefs.map(([d, name, , reg, veh, pc], i) => ({
    id: `job-${i + 1}`,
    job_reference: `FN-${1040 + i}`,
    customer_first_name: name.split(" ")[0]!,
    customer_phone: customers.find((c) => c.name === name)?.phone ?? null,
    customer_address: customers.find((c) => c.name === name)?.address ?? null,
    customer_postcode: pc,
    vehicle_registration: reg,
    vehicle_description: veh,
    appointment_at: new Date(Date.now() - d * 864e5).toISOString(),
    completed_at: new Date(Date.now() - d * 864e5 + 36e5 * 2).toISOString(),
    status: "completed",
    engineer_id: i % 2 === 0 ? "eng-1" : "eng-2",
    engineer_name: eng[i % 2]!,
    quoted_price: ["£125", "£340", "TBC", "£179", "£285", "£199"][i]!,
    job_notes: null,
    visit_count: 1,
  }));
  jobs.push({
    id: "job-7", job_reference: "FN-1046", customer_first_name: "Ellie", customer_phone: "07700 900777", customer_address: "5 Rose Walk", customer_postcode: "AL1 3AB",
    vehicle_registration: "PN21 ABC", vehicle_description: "Kia Ceed (2021)", appointment_at: new Date(Date.now() + 864e5).toISOString(), completed_at: null,
    status: "confirmed", engineer_id: "eng-1", engineer_name: "Dan Reeves", quoted_price: "£95", job_notes: "Squeal from rear brakes", visit_count: 1,
  });

  const reports: JobReport[] = [
    {
      session_id: "job-1", status: "submitted", work_summary: "Fitted new Audura 063 battery. Cleaned terminals.",
      parts: [{ name: "Audura 063 battery", part_number: "063", serial: "AU063-77412", qty: 1, unit_price_pence: 4349, warranty: "3 years" }],
      labour_minutes: 45, mileage: 98240, condition_on_arrival: "Would not start, 9.8V at battery.",
      advisories: [{ id: "adv-1", severity: "urgent", title: "Front brake pads close to wear limit", detail: "Approx 2mm remaining.", photo_ids: ["ph-1"], declined: true }],
      payment: { taken: true, method: "bank_transfer", amount_pence: 12500, reference: "" }, customer_email: "matt@example.com", customer_full_name: "Matt Johnson",
      signoff: null, engineer_notes: "Charging output 14.1V.", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      session_id: "job-2", status: "needs_info", work_summary: "Replaced front pads and discs.", parts: [{ name: "Front discs (pair)", part_number: "", serial: "", qty: 1, unit_price_pence: null, warranty: "" }],
      labour_minutes: 120, mileage: null, condition_on_arrival: "", advisories: [], payment: null, customer_email: "", customer_full_name: "Priya Shah", signoff: null,
      engineer_notes: "", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
    {
      session_id: "job-3", status: "submitted", work_summary: "Diagnosed misfire on cylinder 3 — failed coil pack. Replaced coil pack and plugs.",
      parts: [{ name: "Ignition coil", part_number: "UF-701", serial: "", qty: 1, unit_price_pence: 4200, warranty: "12 months" }, { name: "Spark plugs (x4)", part_number: "", serial: "", qty: 1, unit_price_pence: 2800, warranty: "" }],
      labour_minutes: 90, mileage: 71200, condition_on_arrival: "Engine management light on, misfire.", advisories: [], payment: { taken: false, method: null, amount_pence: null, reference: "" },
      customer_email: "", customer_full_name: "Dave Collins", signoff: null, engineer_notes: "", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  ];
  const photos: TrackerPhoto[] = [
    { id: "ph-1", session_id: "job-1", category: "advisory", photo_url: "/demo/brakes.jpg", caption: "Front nearside pad", created_at: new Date().toISOString() },
    { id: "ph-2", session_id: "job-1", category: "proof_of_work", photo_url: "/demo/electrical.jpg", caption: "New battery fitted", created_at: new Date().toISOString() },
    { id: "ph-3", session_id: "job-1", category: "condition", photo_url: "/demo/diagonstic.jpg", caption: "Load test before", created_at: new Date().toISOString() },
  ];
  const infoRequests: InfoRequest[] = [
    { id: "ir-1", session_id: "job-2", prompt: "Which brand/part number were the discs? And how did the customer pay?", status: "open", response: null, created_at: new Date().toISOString(), answered_at: null },
  ];

  // ---- Documents -------------------------------------------------------------------
  const documents: BillingDocument[] = [];
  const payments: Payment[] = [];
  const events: BillingEvent[] = [];
  const revisions: DocumentRevision[] = [];

  const L = (kind: LineItem["kind"], description: string, qty: number, unit: number, cost = 0, detail?: string): LineItem => ({
    id: `li-${++seq}`, kind, description, qty, unit_pence: unit, cost_pence: cost || undefined, detail, vat_rate: 20,
    account: kind === "part" ? "201" : kind === "callout" ? "202" : "200",
  });

  interface DocDef {
    type: DocType; number: string; daysAgo: number; cust: number; veh: [string, string]; title: string; items: LineItem[];
    paid?: number; method?: PaymentMethod; jobIdx?: number; lifecycle?: "issued" | "void"; revision?: number; outcome?: "accepted" | "declined" | "pending"; viewed?: boolean; terms?: number; parent?: string;
  }
  const defs: DocDef[] = [
    { type: "receipt", number: "RCT-2026-0031", daysAgo: 1, cust: 0, veh: ["MJ57 CWF", "Mazda 2 (2007)"], title: "Battery replacement — supplied & fitted", items: [L("part", "Audura 063 car battery", 1, 4349, 3100, "P/N 063"), L("callout", "Mobile call-out fee", 1, 2500), L("labour", "Labour — battery replacement", 1, 5651)], paid: 1, method: "bank_transfer", jobIdx: 0, viewed: true },
    { type: "invoice", number: "INV-2026-0040", daysAgo: 12, cust: 4, veh: ["WX70 KLM", "Ford Transit Custom (2020)"], title: "Alternator replacement", items: [L("part", "Remanufactured alternator", 1, 18900, 12400), L("labour", "Labour — alternator R&R", 2.5, 6000), L("callout", "Mobile call-out fee", 1, 2500)], paid: 0, jobIdx: 4, terms: 14 },
    { type: "invoice", number: "INV-2026-0039", daysAgo: 20, cust: 2, veh: ["BD63 NTR", "Vauxhall Astra (2013)"], title: "Diagnostics & coil pack replacement", items: [L("labour", "Diagnostic time", 1, 4500), L("part", "Ignition coil", 1, 4200, 2600), L("part", "Spark plugs (x4)", 1, 2800, 1700), L("callout", "Call-out", 1, 2500)], paid: 0.5, method: "cash", jobIdx: 2, terms: 7 },
    { type: "receipt", number: "RCT-2026-0030", daysAgo: 6, cust: 3, veh: ["YA68 FHG", "VW Golf (2018)"], title: "Interim service", items: [L("part", "Engine oil 5W-30 (5L)", 1, 4200, 2600), L("part", "Oil filter", 1, 1200, 600), L("labour", "Service labour", 1.5, 6000), L("callout", "Mobile call-out", 1, 2500)], paid: 1, method: "card", jobIdx: 3 },
    { type: "quote", number: "QT-2026-0014", daysAgo: 3, cust: 1, veh: ["LK19 PXA", "Ford Fiesta (2019)"], title: "Front brake pads & discs", items: [L("part", "Front discs (pair)", 1, 11800, 7400), L("part", "Front pads (set)", 1, 5400, 3300), L("labour", "Labour — brakes", 2, 6000)], outcome: "pending", viewed: true },
    { type: "quote", number: "QT-2026-0013", daysAgo: 18, cust: 5, veh: ["HN15 ZZB", "Honda Civic (2015)"], title: "Full service", items: [L("part", "Service kit", 1, 5900, 3400), L("labour", "Full service labour", 2.5, 6000)], outcome: "accepted" },
    { type: "invoice", number: "INV-2026-0038", daysAgo: 30, cust: 5, veh: ["HN15 ZZB", "Honda Civic (2015)"], title: "Full service", items: [L("part", "Service kit", 1, 5900, 3400), L("labour", "Full service labour", 2.5, 6000), L("callout", "Mobile call-out", 1, 2500)], paid: 1, method: "bank_transfer", jobIdx: 5, terms: 7 },
    { type: "invoice", number: "INV-2026-0036", daysAgo: 45, cust: 0, veh: ["MJ57 CWF", "Mazda 2 (2007)"], title: "Spark plugs & coil", items: [L("part", "Spark plugs (x4)", 1, 2800, 1700), L("labour", "Labour", 1, 6000), L("callout", "Call-out", 1, 2500)], paid: 1, method: "bank_transfer", terms: 7 },
    { type: "receipt", number: "RCT-2026-0029", daysAgo: 62, cust: 3, veh: ["YA68 FHG", "VW Golf (2018)"], title: "Jump start & battery test", items: [L("callout", "Emergency call-out", 1, 4500), L("labour", "Battery test", 0.5, 6000)], paid: 1, method: "card" },
    { type: "invoice", number: "INV-2026-0034", daysAgo: 80, cust: 4, veh: ["WX70 KLM", "Ford Transit Custom (2020)"], title: "Brake service", items: [L("part", "Brake pads (set)", 1, 6400, 3900), L("labour", "Labour", 2, 6000), L("callout", "Call-out", 1, 2500)], paid: 1, method: "bank_transfer", terms: 14, revision: 2 },
    { type: "receipt", number: "RCT-2026-0027", daysAgo: 100, cust: 2, veh: ["BD63 NTR", "Vauxhall Astra (2013)"], title: "Battery replacement", items: [L("part", "Battery 096", 1, 9500, 6200), L("callout", "Call-out", 1, 2500), L("labour", "Fitting", 0.5, 6000)], paid: 1, method: "cash" },
    { type: "invoice", number: "INV-2026-0030", daysAgo: 130, cust: 1, veh: ["LK19 PXA", "Ford Fiesta (2019)"], title: "Clutch cable & adjustment", items: [L("part", "Clutch cable", 1, 3800, 2200), L("labour", "Labour", 2, 6000), L("callout", "Call-out", 1, 2500)], paid: 1, method: "bank_transfer", terms: 7 },
    { type: "invoice", number: "INV-2026-0026", daysAgo: 160, cust: 4, veh: ["WX70 KLM", "Ford Transit Custom (2020)"], title: "Service & MOT prep", items: [L("part", "Service kit", 1, 8400, 5100), L("labour", "Labour", 3, 6000), L("callout", "Call-out", 1, 2500)], paid: 1, method: "bank_transfer", terms: 14 },
    { type: "receipt", number: "RCT-2026-0020", daysAgo: 190, cust: 0, veh: ["MJ57 CWF", "Mazda 2 (2007)"], title: "Headlamp bulbs & wiring repair", items: [L("part", "H7 bulbs (pair)", 1, 1800, 900), L("labour", "Labour", 1, 6000), L("callout", "Call-out", 1, 2500)], paid: 1, method: "cash" },
    { type: "invoice", number: "INV-2026-0015", daysAgo: 28, cust: 3, veh: ["YA68 FHG", "VW Golf (2018)"], title: "Cancelled — duplicate", items: [L("labour", "Labour", 1, 6000)], lifecycle: "void", terms: 7 },
  ];

  defs.forEach((def, i) => {
    const content: DocumentContent = blankContent(settings, def.type);
    const c = customers[def.cust]!;
    content.customer = { name: c.name, phone: c.phone, email: c.email, address: c.address, postcode: c.postcode };
    content.vehicle = { make_model: def.veh[1], registration: def.veh[0], location: c.postcode };
    content.job = { reference: def.jobIdx !== undefined ? jobs[def.jobIdx]!.job_reference : `FN-${1000 + i}`, title: def.title, summary: "", work_date: ago(def.daysAgo), engineer_name: eng[i % 2] };
    content.items = def.items;
    content.vat_mode = "standard";
    content.payment_terms_days = def.terms ?? 7;
    if (def.type === "quote") { content.warranty.labour = "30-Day workmanship guarantee"; content.warranty.exclusions = []; }
    const t = computeTotals(content);
    const issued = ago(def.daysAgo);
    const docId = `doc-${i + 1}`;
    const paidPence = def.paid ? Math.round(t.total_pence * def.paid) : 0;
    const doc: BillingDocument = {
      id: docId, doc_type: def.type, number: def.number, lifecycle: def.lifecycle ?? "issued", quote_outcome: def.outcome ?? "pending", revision: def.revision ?? 1,
      session_id: def.jobIdx !== undefined ? jobs[def.jobIdx]!.id : null, contact_id: c.id, parent_id: null, project_id: null, share_token: token(),
      issued_at: issued, due_at: def.type === "invoice" ? addDaysIso(issued, def.terms ?? 7) : null, valid_until: def.type === "quote" ? addDaysIso(issued, 30) : null,
      sent_at: new Date(Date.now() - def.daysAgo * 864e5).toISOString(), first_viewed_at: def.viewed ? new Date().toISOString() : null, last_viewed_at: def.viewed ? new Date().toISOString() : null,
      view_count: def.viewed ? 2 : 0, content, total_pence: t.total_pence, paid_pence: paidPence, credited_pence: 0,
      created_at: new Date(Date.now() - def.daysAgo * 864e5).toISOString(), updated_at: new Date().toISOString(),
    };
    documents.push(doc);
    events.push({ id: `ev-${docId}-1`, document_id: docId, session_id: doc.session_id, kind: "issued", detail: { number: def.number }, actor: "demo", created_at: doc.created_at });
    if (paidPence > 0) {
      payments.push({ id: `pay-${docId}`, document_id: docId, amount_pence: paidPence, method: def.method ?? "bank_transfer", paid_at: addDaysIso(issued, def.type === "receipt" ? 0 : 3), reference: "", note: "", created_at: doc.created_at });
    }
    if (def.revision && def.revision > 1) {
      revisions.push({ id: `rev-${docId}`, document_id: docId, revision: 1, reason: "Corrected labour hours", content: structuredClone(content), total_pence: t.total_pence - 3000, created_at: doc.created_at });
      events.push({ id: `ev-${docId}-2`, document_id: docId, session_id: null, kind: "amended", detail: { revision: 2, reason: "Corrected labour hours" }, actor: "demo", created_at: doc.created_at });
    }
  });

  // ---- Suppliers' bills, expenses, bank ------------------------------------------------
  const bills: Bill[] = [
    ["Midland Motor Factors", 0, 25, 31200, "300", 0, "approved", 5, "MMF-88123"],
    ["Midland Motor Factors", 0, 55, 18440, "300", 20, "paid", 5, "MMF-87110"],
    ["Battery & Bulb Wholesale", 1, 15, 22600, "300", 0, "approved", 15, "BBW-5521"],
    ["Herts Tyre Supplies", 2, 70, 9800, "300", 40, "paid", 70, "HTS-221"],
    ["J. Okafor (subcontract engineer)", 3, 10, 36000, "301", 0, "approved", 20, "JO-014"],
    ["Garage Software Ltd", 4, 3, 4500, "406", 0, "approved", 27, "GS-2210"],
  ].map(([name, supIdx, dAgo, net, acc, paidPct, status, , ref]) => {
    const cis = supIdx === 3;
    return {
      id: id("bill"), contact_id: suppliers[supIdx as number]!.id, supplier_name: name as string, reference: ref as string, bill_date: ago(dAgo as number),
      due_date: addDaysIso(ago(dAgo as number), 30), currency: "GBP", fx_rate: 1,
      lines: [{ id: id("bl"), description: (name as string) + " — goods/services", account: acc as string, net_pence: net as number, vat_rate: cis ? 20 : 20, is_labour: cis }],
      status: (paidPct as number) === 0 && status === "paid" ? "paid" : (status as Bill["status"]), paid_pence: status === "paid" ? Math.round((net as number) * 1.2) : 0,
      cis_deduction_pence: cis ? Math.round((net as number) * 0.2) : 0, project_id: null, attachment_url: null, notes: "", repeat: name === "Garage Software Ltd" ? ("monthly" as const) : ("none" as const),
      created_at: new Date().toISOString(),
    } as Bill;
  });

  const expenses: Expense[] = [
    ["receipt", "Dan Reeves", 2, "Fuel — van", "403", 6840, 1140, 0, "", "approved"],
    ["receipt", "Dan Reeves", 9, "Fuel — van", "403", 7210, 1202, 0, "", "reimbursed"],
    ["receipt", "Lewis Moore", 4, "Brake cleaner & rags", "302", 2400, 400, 0, "", "submitted"],
    ["mileage", "Lewis Moore", 6, "Mileage — customer visits", "411", 0, 0, 86, "AL10 → SG1 → AL10", "submitted"],
    ["receipt", "Dan Reeves", 15, "Workwear", "408", 8900, 1483, 0, "", "reimbursed"],
    ["mileage", "Dan Reeves", 20, "Mileage — parts run", "411", 0, 0, 42, "AL10 → Luton → AL10", "reimbursed"],
  ].map(([kind, who, dAgo, desc, acc, gross, vat, miles, route, status]) => ({
    id: id("exp"), kind: kind as Expense["kind"], claimant: who as string, date: ago(dAgo as number), description: desc as string, account: acc as string,
    gross_pence: gross as number, vat_pence: vat as number, currency: "GBP", fx_rate: 1, miles: miles as number, from_to: route as string,
    status: status as Expense["status"], attachment_url: null, project_id: null, created_at: new Date().toISOString(),
  }));

  const bankAccount: BankAccount = { id: "bank-1", name: "Business current account", currency: "GBP", opening_balance_pence: 250000, sort_code: "00-00-00", account_number: "00000000", created_at: new Date().toISOString() };
  const txn = (dAgo: number, desc: string, amt: number, matched: BankTransaction["matched"] = null): BankTransaction => ({
    id: id("tx"), bank_account_id: "bank-1", date: ago(dAgo), description: desc, amount_pence: amt, external_id: `demo-${seq}`, matched, created_at: new Date().toISOString(),
  });
  const bank_txns: BankTransaction[] = [
    txn(1, "FASTER PAYMENT M JOHNSON", 12500),
    txn(9, "FASTER PAYMENT HATFIELD COURIER", 29700),
    txn(14, "FASTER PAYMENT T EASTWOOD", 21480, { type: "payment", id: "pay-doc-7" }),
    txn(2, "SHELL FUEL CARD", -6840),
    txn(3, "GARAGE SOFTWARE LTD", -5400),
    txn(5, "MIDLAND MOTOR FACTORS", -37440),
    txn(7, "INSURANCE DD ADMIRAL", -8900),
    txn(11, "CARD FEE SUMUP", -312),
    txn(16, "TRANSFER FROM SAVINGS", 100000, { type: "ignored" }),
    txn(19, "FASTER PAYMENT SARAH W", 12600),
    txn(24, "GOOGLE ADS", -4500),
  ];

  const projects: Project[] = [
    { id: "proj-1", name: "Hatfield Courier — fleet maintenance", contact_id: customers[4]!.id, status: "active", budget_pence: 600000, hourly_rate_pence: 6000, notes: "Monthly fleet service contract", created_at: new Date().toISOString() },
    { id: "proj-2", name: "Workshop van fit-out", contact_id: null, status: "active", budget_pence: 150000, hourly_rate_pence: 0, notes: "Internal", created_at: new Date().toISOString() },
  ];
  const time_entries: TimeEntry[] = [
    { id: id("te"), project_id: "proj-1", user_name: "Dan Reeves", date: ago(2), minutes: 150, description: "Transit service", billable: true, invoiced_document_id: null, created_at: new Date().toISOString() },
    { id: id("te"), project_id: "proj-1", user_name: "Lewis Moore", date: ago(5), minutes: 90, description: "Brake check", billable: true, invoiced_document_id: null, created_at: new Date().toISOString() },
    { id: id("te"), project_id: "proj-2", user_name: "Dan Reeves", date: ago(8), minutes: 240, description: "Racking install", billable: false, invoiced_document_id: null, created_at: new Date().toISOString() },
  ];

  const year = new Date().getFullYear();
  const budgets: BudgetRow[] = [
    { id: "bud-1", year, account: "200", months: Array(12).fill(380000) },
    { id: "bud-2", year, account: "201", months: Array(12).fill(190000) },
    { id: "bud-3", year, account: "300", months: Array(12).fill(120000) },
    { id: "bud-4", year, account: "403", months: Array(12).fill(40000) },
    { id: "bud-5", year, account: "406", months: Array(12).fill(5000) },
  ];

  const employees: Employee[] = [
    { id: "emp-1", name: "Dan Reeves", ni_number: "QQ123456C", tax_code: "1257L", pay_frequency: "monthly", annual_salary_pence: 2600000, hourly_rate_pence: 0, pension_opt_in: true, student_loan_plan: "none", start_date: "2025-03-01", active: true, created_at: new Date().toISOString() },
    { id: "emp-2", name: "Lewis Moore", ni_number: "QQ654321A", tax_code: "1257L", pay_frequency: "monthly", annual_salary_pence: 2200000, hourly_rate_pence: 0, pension_opt_in: true, student_loan_plan: "plan2", start_date: "2025-06-01", active: true, created_at: new Date().toISOString() },
  ];

  const presets: Preset[] = [
    { id: id("pre"), kind: "item", label: "Mobile call-out fee", payload: { kind: "callout", description: "Mobile call-out fee", qty: 1, unit_pence: 2500, vat_rate: 20, account: "202" }, sort: 1 },
    { id: id("pre"), kind: "item", label: "Labour (per hour)", payload: { kind: "labour", description: "Labour", qty: 1, unit_pence: 6000, vat_rate: 20, account: "200" }, sort: 2 },
    { id: id("pre"), kind: "item", label: "Diagnostic time", payload: { kind: "labour", description: "Diagnostic time", qty: 1, unit_pence: 4500, vat_rate: 20, account: "200" }, sort: 3 },
    { id: id("pre"), kind: "item", label: "Engine oil & filter", payload: { kind: "part", description: "Engine oil & filter", qty: 1, unit_pence: 5400, cost_pence: 3200, vat_rate: 20, account: "201" }, sort: 4 },
    { id: id("pre"), kind: "warranty", label: "Battery — 3 year", payload: { parts: "3-Year manufacturer guarantee", labour: "30-Day workmanship guarantee" }, sort: 5 },
    { id: id("pre"), kind: "advisory", label: "Brake pads worn", payload: { severity: "urgent", title: "Brake pads close to the wear limit", detail: "Pad thickness is approaching the minimum. Recommend replacement soon." }, sort: 6 },
    { id: id("pre"), kind: "advisory", label: "Tyre tread low", payload: { severity: "soon", title: "Tyre tread approaching the legal limit", detail: "Tread depth measured close to 1.6mm. Recommend replacing before it becomes illegal and unsafe in the wet." }, sort: 7 },
  ];

  const vat_returns: VatReturnRecord[] = [];
  const pay_runs: PayRun[] = [];

  return {
    settings, documents, payments, revisions, events, jobs, reports, photos, infoRequests,
    collections: {
      contacts: [...customers, ...suppliers], presets, bills, expenses, bank_accounts: [bankAccount], bank_txns, projects, time_entries, budgets, vat_returns,
      employees, pay_runs, accounts,
    },
  };
}

export const todayIso = isoDate;
