# FixNow OS — review of what exists, and how we merge it

Status: **proposal for sign-off. No code has been changed for this yet.**

## 1. The architecture answer

**One database. Two repos, two deployments, one set of rules.**

- **One Supabase project, one Postgres schema.** Never two databases that "sync". Two databases means every
  customer, vehicle and job exists twice and the copies drift; reconciling them is the hardest kind of bug to find.
  Everything below assumes a single source of truth.
- **This repo (`FixNow-mECHANICS-INVOICE`) is the base — the "OS".** It owns the schema, all migrations, the admin
  console, bookings, estimates, invoices, parts, finance and the PDF engine.
- **The tracker repo (`fixnow-track-live`) is slimmed down to the two field/customer surfaces:** the customer
  tracking link (`/t/{token}`) and the engineer app (`/e/{token}`), including GPS, ETA, push and PWA scoping. These need
  to stay light, public and token-gated, so they should not ship inside the admin bundle.
- **The database is the contract between them.** The tracker repo reads/writes only through named RPCs and views that
  the OS repo defines. It never owns tables.

Rules that make "two systems acting as one" safe:
1. **Migrations live in one repo only (this one).** The tracker's historic migrations are frozen as the baseline and
   copied here; from then on the tracker repo has no `supabase/migrations/`.
2. **Edge functions are deployed from this repo** (including the ones the tracker calls).
3. **Generated TypeScript types for the schema are produced here and copied into the tracker** (one script), so a
   column rename breaks the tracker's build instead of production.
4. **The tracker has no admin routes** and no direct table access — only token-gated RPCs. (As today for anon.)
5. Same Supabase Auth users. Staff log into the OS; engineers and customers never log in.

Why not a single repo/monorepo right now? It is the cleaner end-state, and the plan below doesn't prevent it —
the surfaces are already separate entry points. But it forces a TanStack-vs-Vite framework decision today for no
immediate gain. Revisit once the data model has settled.

## 2. Review: what exists today

### Tracker (`fixnow-track-live`)
Tables: `tracking_sessions` (the "booking"), `engineers`, `engineer_availability`, `job_photos`, `job_reports`,
`job_info_requests`, `push_subscriptions`, `tracking_push_subscriptions`, `tracking_status_notifications`,
`admin_notices`, `data_exports`, `api_keys`, `api_idempotency_keys`.
Customer/engineer RPCs: `get_public_tracking_session`, `get_public_proof_of_work_photos`, `subscribe_tracking_push`,
`get_engineer_*`, `engineer_start_journey / update_location / mark_arrived / complete_tracking`,
`engineer_save_job_report`, `engineer_answer_info_request`, availability + push RPCs.
Edge functions: `booking-api` (external/ChatGPT booking), `send-job-reminders`, `send-status-notifications`,
`get-eta`, `engineer-update-profile`, `engineer-upload-job-photo`, `engineer-submit-availability-photo`,
`check-storage-usage`.
Routes: **admin** (`/admin`, `/admin/create`, `/admin/session/$id`, `/admin/engineers*`, `/admin/availability`,
`/admin/data`, `/admin/login`) · **engineer** (`/e/$token…`) · **customer** (`/t/$token`).

### Billing (this repo)
Relational: `billing_documents`, `billing_payments`, `billing_document_revisions`, `billing_events`,
`billing_settings`, `billing_counters`. JSON rows (`billing_records`): contacts, presets, bills, expenses, bank
accounts/transactions, projects, time, budgets, VAT returns, employees, pay runs, chart of accounts.
Pure libs: PDF engine, ledger/VAT/payroll/CIS/MTD/bank-matching, pdf/photo/QR helpers. UI kit + ~25 screens.

### Classification

| Piece | Verdict |
| --- | --- |
| Customer tracking page, `get_public_tracking_session`, push, ETA | **Stays in tracker** (re-pointed at the Job) |
| Engineer app, GPS controls, queue, availability, photos, report form | **Stays in tracker** (re-pointed) |
| `/admin/create`, `/admin/index`, `/admin/session`, edit/reopen/cancel/reassign | **Moves to OS** as Bookings/Jobs |
| `/admin/engineers*`, `/admin/availability` | **Moves to OS** (engineer management, rota) |
| `/admin/data`, `data_exports`, retention, storage check, `admin_notices` | **Moves to OS** |
| `booking-api` + `api_keys` (ChatGPT/external intake) | **Re-pointed** to create *Requests*, not bookings |
| `tracking_sessions` | **Replaced** by the Request→Estimate→Booking→Job model (see §3). Keep the token, status and GPS fields on `jobs` |
| `job_reports` | **Folds into the Job** (inspection, advisories, parts fitted, sign-off) |
| `billing_documents` + PDF engine + accounting libs | **Kept**, linked to Job/Customer/Vehicle by foreign key |
| `billing_records` JSON for contacts/bills/expenses | **Partly replaced:** customers, vehicles, suppliers, purchases become real tables; low-stakes records (budgets, presets, time) can stay JSON |

### Honest findings about the current state
1. **The tracker stores customer and vehicle data inline on the booking row.** That is exactly the "booking is an
   isolated record" problem. It must be normalised into `customers` and `vehicles`.
2. **My billing contacts are JSON, not relational.** Fine for a stand-alone tool, wrong for traceability
   (supplier → part → job → vehicle). Changes in Phase 1.
3. **Two overlapping "report" concepts** (job report in tracker, document content in billing). Unify on the Job.
4. **`booking-api` assumes a booking is created immediately.** You don't want automatic bookings, so intake must land
   as a *Request* awaiting your decision.
5. **There is no live data anywhere** (no Supabase project yet), so there is **nothing to migrate** — we can reshape
   freely. This is the cheapest this will ever be.
6. **Nothing has been run against a real Supabase project.** Migrations were validated on a local Postgres with stubs;
   expect a short shake-down when the first real project is connected.
7. **Roles/permissions don't exist yet** (single `authenticated` = full access). Needed before a second staff member.

## 3. Target data model (the keystone)

```
customers ─┬─ customer_contacts (drivers, fleet contacts) ─ addresses
           └─ vehicles ── mileage_readings
requests ──▶ estimates ──▶ estimate_work_items ──▶ work_item_parts ──▶ parts ◀─ supplier_parts ◀─ suppliers
                │                                         │
                ▼                                         ▼
            bookings (visit: date, address, engineer, travel charge once)
                │
                ▼
              jobs (token, status, GPS, inspection, advisories, sign-off, photos)
                │            └─ job_work_items (copied from estimate; own status/notes/labour/cost)
                ▼
          draft invoice ─▶ invoice ─▶ payments ─▶ receipt
                │                         └─ credit_notes
                └─▶ warranties (part, supplier, part no., start, term; workmanship)  └─▶ reviews
purchases / supplier_bills / purchase_orders ─▶ allocated to job_work_items (cost)
communications (per customer/job)    audit_log (every sensitive action)
staff_profiles + roles (owner, ops_manager, finance, estimator, engineer)
```

Key properties:
- **Visit-level vs work-item-level:** travel/mobile attendance is charged once per booking; labour, parts, supplier,
  cost, price, warranty, notes and status belong to each work item.
- **Estimates are immutable snapshots once sent** (same revision model as invoices); the Job references the accepted one.
- **Invoice lines are generated from job work items** as a *draft*; nothing is issued without you. Customer sees the
  line price; you see parts cost, supplier, labour, travel and profit.
- **Warranties are rows**, not text. **Reviews** are only creatable from a paid job.
- **Everything automated is a suggestion; every decision is yours** (accept request, price, parts, engineer, issue).

## 4. Phases (each ends with something you can use)

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 — Foundations** | You create the Supabase project. Freeze tracker migrations into this repo as baseline. Roles + RLS skeleton. Types-sync script. | Clean project applies baseline; owner can log in to the OS. |
| **1 — Core flow** | `customers`, `vehicles`, `requests`, `estimates` + work items, `bookings`, `jobs`. Admin screens for Request → Estimate → Confirm → Booking → assign engineer. Re-point tracker + engineer app + intake endpoint to `jobs`. Job → **draft invoice** → review → issue → payment → receipt. | A real job runs end to end: request in, estimate, booking, engineer completes, draft invoice, you issue, record payment, customer gets receipt + tracker link. |
| **2 — Parts & suppliers** | `suppliers`, parts per work item, supplier prices (manual first), purchases allocated to jobs, per-job profit. | "£62 disc → supplier → job → vehicle" visible; job margin on every job. |
| **3 — Memory** | Structured warranties, vehicle history, verified reviews, communications log (SMS/email + manual notes), DVLA reg lookup. | Return customer: system already knows the car, its history and live warranties. |
| **4 — Operate** | Management dashboard, roles in anger, rota, conversion reporting, VAT switch-on, remaining finance modules re-linked. | You can stop being the mechanic and run it from one screen. |

Already-built finance modules (bills, bank, VAT, payroll…) are kept and re-linked as they become relevant; they are
not on the critical path for Phase 1.

## 5. What I need from you

1. **Sign-off on the architecture in §1** (one DB; this repo is base/owner; tracker = customer + engineer surfaces).
2. **Create the Supabase project** (or confirm I may use the connector if it is attached to your account). Plan for the
   paid tier before real customer data goes in (backups, no idle pause).
3. **Confirm the vocabulary:** Request → Estimate → Booking → Job, and `FNM-YYYYMMDD.001` references (per day,
   sequential) as the Job/Booking reference.
4. **Confirm roles for now:** you = Owner only; engineers = assigned jobs only; other roles defined but unused.

Not in scope (as agreed): the public website redesign, except an intake endpoint it can post requests to.
