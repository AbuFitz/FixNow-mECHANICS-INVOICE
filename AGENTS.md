# Agent notes

- **Money is integer pence.** Never store or add floats. Quantities may be fractional; round once per line
  (`lineNet`). VAT is per rate bucket after the pro-rata discount (`computeTotals` / `allocateLines`) — keep line VAT
  summing to document VAT or the VAT return drifts.
- **Documents render from one pure model.** `src/pdf/DocumentPdf.tsx` takes a `PdfModel` (built by `buildModel`). Don't
  fetch inside it. Photos/QR are prepared in `assets.ts`. Preview, download, share-sheet and the customer page all
  use the same render path — keep it that way. Verify layout changes with `npm run sample` and rasterise the output.
- react-pdf cannot load IBM Plex Mono's woff files (fontkit crash) — the PDF mono font is JetBrains Mono.
  pdf.js must be the `legacy` build (the modern one needs `Map.getOrInsertComputed`).
- **Issued documents are never silently rewritten.** Edit-after-issue goes through `api.docs.amend` (revision + reason)
  or an explicitly “silent” save that still logs an event. Numbers come from `billing_issue_document` (atomic).
- **Customer-facing reads only via `get_public_billing_document`.** It strips `cost_pence` and `internal_notes` in
  SQL. Never add margin/cost data to anything `anon` can read.
- Long-tail records live in `billing_records` (JSON) via `api.col(name)`. New collection = add to `CollectionMap` in
  `src/lib/api/types.ts` and a type in `types.ts`; no migration needed.
- **Don't invent facts.** Bank details, VAT number, registered office are blank by default and block/ warn on issue.
  Benchmarks are user-entered only. Payroll/tax parameters are in one file and flagged “verify”.
- Schema changes: new file in `supabase/migrations/` (never edit an applied one). Billing migrations must sort after
  Tracking's `20261009120000_job_reports.sql`.
- Both backends must implement the whole `Api` interface (`src/lib/api/`). Demo seed is deterministic-ish and relative
  to today; keep it realistic but obviously sample.
- Tests: `npm test`. Add a test for any change to totals, VAT, payroll, CIS or bank matching.
