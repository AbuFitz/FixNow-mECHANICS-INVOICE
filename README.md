# FixNow Billing

Quotes, invoices, receipts, credit notes and the books behind them — built for FixNow Mechanics and wired into
[FixNow Tracking](https://github.com/AbuFitz/fixnow-track-live) (the booking/tracker system). It replaces the single-file
`legacy/FixNow_Receipt_Editor.html`.

- **Real PDFs, not print-to-PDF.** Documents are generated with `@react-pdf/renderer` (vector, brand fonts embedded,
  A4, proper pagination, page X of Y, photo grids, QR codes). The same engine renders the live preview, the download,
  the share-sheet file and the customer's page — so what you see is exactly what the customer gets.
- **Connected to the job.** When an engineer completes a job in Tracking they fill in a job report (work, parts with
  part numbers, time, mileage, condition on arrival, advisories with photos, payment taken, customer email,
  signature). Billing turns that into an editable draft in one tap, and can ask the engineer for anything missing.
- **Runs without a backend.** With no Supabase variables set the app starts in **demo mode** (sample data in the
  browser) so you can try every screen.

## Run it

```bash
npm install
cp .env.example .env.local   # optional — leave blank for demo mode
npm run dev                  # http://localhost:8081
npm test                     # money, VAT, payroll, CIS, bank-matching tests
npm run build                # typecheck + production build
npm run sample               # render sample PDFs into ./out (needs poppler to rasterise)
```

## Connect it for real

1. Apply FixNow Tracking's migrations first, **including** `20261009120000_job_reports.sql` (job reports + engineer
   questions + two new photo categories). Redeploy its `engineer-upload-job-photo` function.
2. Apply `supabase/migrations/20261009130000_billing.sql` from this repo (same Supabase project).
3. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (same values as Tracking) and `VITE_TRACKER_URL`. Sign in with
   your existing staff login.
4. Deploy to Vercel (`vercel.json` rewrites everything to the SPA). In Tracking set `VITE_BILLING_URL` to this app's
   address to get the “Billing” button on each job.
5. Open **Settings** and fill in the blanks the original editor never stated: bank details, registered office, VAT
   status. Documents refuse to issue as invoices without bank details — nothing is invented.

## What's in it

| Area | What it does |
| --- | --- |
| **Jobs to bill** | Completed Tracking jobs with report, photos, missing-info checklist, one-tap Receipt / Invoice / Quote, “Ask the engineer” messages that appear on their job page. |
| **Documents** | Quotes, invoices, receipts, credit notes. Auto-save drafts, completeness checks before issue, strict sequential numbering (`INV-2026-0001`), live PDF preview, send by WhatsApp / text / email / share-sheet with the PDF attached, customer link with “viewed” tracking, quote accept/decline online, payments (part-payments, deposits), payment receipts from any paid invoice, reminders. |
| **Amendments** | Every change to an issued document can be saved as a numbered revision (old version kept, PDF marked “Amended · Rev n”, reason logged) or as a silent correction. Void/restore, credit notes, duplicate, quote → invoice, and permanent delete (typed confirmation). Full audit trail. |
| **Photos & sign-off** | Advisories with RAG severity, photos with captions, “customer declined work” record, condition-on-arrival, job photo gallery, customer signature — all laid out as cards on the PDF. |
| **Accounting** | Bills (+ recurring, CIS), expenses & mileage, bank import/reconcile with suggested matches and rules, P&L, aged debtors/creditors, 180-day cash-flow forecast, budgets with suggestions, KPIs/scorecard, projects & time, multi-currency, VAT 9-box returns, CIS, payroll calculations and payslips, corporation-tax estimate, MTD-for-Income-Tax summaries, accountant pack. |

## How it is built

- Vite + React 19 + TypeScript + Tailwind v4, same tokens as Tracking (`src/styles.css`). Outfit / Space Grotesk /
  JetBrains Mono are bundled — no third-party font requests.
- **Money is integer pence** everywhere (`src/lib/money.ts`); VAT is computed per rate bucket after discount with
  line VAT summing exactly to document VAT (`src/lib/totals.ts`).
- `src/pdf/` — the document engine. `DocumentPdf.tsx` is a pure function of a `PdfModel`; `assets.ts` prepares photos/QR.
- `src/lib/acct/` — pure, tested accounting engine (ledger, VAT, payroll, CIS, MTD, bank matching, reports).
- `src/lib/api/` — one `Api` interface, two backends: `supabase.ts` and `demo.ts` (+ seed).
- `supabase/migrations/` — schema. Sales documents/payments are relational; the long tail (bills, expenses, bank
  transactions, payroll …) is stored as JSON rows in `billing_records` — one admin, small data, aggregated in-app.
- Access model matches Tracking: `authenticated` = staff; `anon` = nothing directly. The customer link goes through
  `get_public_billing_document(token)`, which strips internal costs and notes in SQL.

## Honest status

See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for the live/ready/needs-credentials breakdown (HMRC submission,
Stripe, bank feeds, payroll RTI, smart capture). Short version: everything that can be built from code is built and
tested; anything that needs an account, key or HMRC registration has its seam, data and exports ready but is **not**
claiming to file or take money until you connect it.
