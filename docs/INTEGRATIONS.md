# Integrations & what is genuinely live

Legend — **Live**: works today in the app. **Ready**: code is written, needs your credentials/deploy.
**Needs you**: cannot be done from code alone (registration, approval, a paid provider).

| Capability | Status | Notes |
| --- | --- | --- |
| Send invoices & quotes | **Live** | WhatsApp / SMS / email links, native share sheet with the PDF attached, private customer link, “viewed” tracking. |
| Quote acceptance online | **Live** | Customer accepts/declines from their link; logged. |
| Online invoice payments (card) | **Ready** | Deploy `stripe-payment-link` + `stripe-webhook`, set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_APP_URL`. Needs a Stripe account (fees are Stripe's). Bank-transfer details with the invoice number as reference work today. Webhook is **not yet exercised against live Stripe** — test in Stripe test mode first. |
| Reconcile transactions | **Live** | CSV import from any bank; suggested matches (exact amount + name), rules, auto-match, categorise, undo. |
| Live bank feeds | **Needs you** | Needs an open-banking provider (TrueLayer, GoCardless Bank Account Data…). Add an Edge Function that writes `bank_txns` rows; the reconcile screen needs no change. |
| Smart document capture | **Ready** | Deploy `capture-document`; set `ANTHROPIC_API_KEY` and `CAPTURE_MODEL`. Admin always reviews extracted fields before saving. |
| Real-time reports & dashboards | **Live** | P&L, aged debtors/creditors, job margins, KPIs, health scorecard, customisable dashboard widgets, charts. |
| Benchmark against the industry | **Live (your data)** | You enter benchmark figures + source in Settings; the app compares. It never ships invented industry numbers. |
| Bills & recurring bills | **Live** | Feeds VAT, P&L and the cash-flow forecast. |
| Expenses & mileage (10+ users) | **Live** | Claimants are free text/suggested from payroll; mileage uses 45p/25p (editable in Settings — confirm HMRC's current rates). |
| Multiple currencies | **Live** | Per document/bill/expense currency + rate; live ECB rate button (frankfurter.app); reports convert to GBP. International bill *payments* **Needs you** (payment provider). |
| 180-day cash-flow forecast | **Live** | Known receipts/payments timed by due dates + your average lateness; optional projected sales shown separately. |
| Budgets with suggestions | **Live** | Suggests from last year's same month, else trailing 12-month average. |
| Projects & time (10 users) | **Live** | Hours, costs, budget burn, invoice unbilled time. |
| VAT returns | **Live (figures)** / **Needs you (filing)** | Builds the 9 boxes (standard, cash, flat-rate), exports transactions + the HMRC MTD JSON payload, records the submission receipt. **Submitting to HMRC** requires an HMRC developer-hub application, OAuth consent, HMRC's mandatory fraud-prevention headers and sandbox testing — none of which can be done for you from code. Until then, file via HMRC online or give the exports to your accountant. |
| MTD for Income Tax | **Live (summaries)** / **Needs you (filing)** | Quarterly summaries by HMRC category, deadlines, JSON. Note: **FixNow Mechanics Ltd is a company** — MTD ITSA applies to sole traders/landlords. A company files corporation tax + accounts. Useful if a director has self-employed/rental income. |
| CIS | **Live (figures)** | Per-subcontractor labour/materials/deduction, monthly return summary, statements. Only relevant if you pay construction subcontractors. Filing the CIS300 is with HMRC. |
| Payroll for 10 people | **Live (calculations)** / **Needs you (RTI)** | PAYE (cumulative, standard codes), NI category A, pension (net pay), student loans, payslip PDFs, PAYE/NIC due. **Verify rates each April** in `src/lib/acct/payroll.ts`. Submitting RTI (FPS/EPS) needs HMRC-recognised software or an accountant. Unsupported (flagged, not guessed): K/S/C codes, non-A NI categories, directors' annual NI method. |
| Domestic bill & payroll payments (15) | **Needs you** | Needs bank/open-banking payment initiation. The app records “paid” and reconciles; it does not move money. |
| Company accounts & tax | **Partly** | Corporation-tax **estimate** and a year-end **accountant pack** (sales, purchase, bank, summary CSVs). Statutory accounts/CT600 filing is by an accountant or approved software (the optional £120 add-on in Xero's list is a filing service). |

## Deploying the optional functions

```bash
supabase functions deploy capture-document
supabase functions deploy stripe-payment-link
supabase functions deploy stripe-webhook --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=... CAPTURE_MODEL=... STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... PUBLIC_APP_URL=https://your-billing-app
```

## Before you rely on it (checklist)

1. Settings → bank details, registered office, VAT status (and VAT number if registered).
2. Confirm “Registered in” (England & Wales was assumed from the company number format).
3. Have your accountant read the default terms (`Settings → Documents`) — particularly liability wording for consumers
   (the original text was kept; a statutory-rights sentence was added).
4. If you run payroll here, reconcile the first run against HMRC's calculator or your accountant.
5. Set `VITE_BILLING_URL` in Tracking so each job links here.
