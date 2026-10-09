/**
 * UK corporation tax estimate (main rate 25%, small profits rate 19%, marginal
 * relief between £50,000 and £250,000). Limits assume a single company with a
 * 12-month accounting period — associated companies and short periods reduce
 * the limits. An estimate to plan cash, not a computation to file.
 */
export function corporationTaxEstimate(profitPence: number): { tax_pence: number; effective_pct: number; band: "small" | "marginal" | "main" | "none" } {
  const p = profitPence / 100;
  if (p <= 0) return { tax_pence: 0, effective_pct: 0, band: "none" };
  let tax: number;
  let band: "small" | "marginal" | "main";
  if (p <= 50000) { tax = p * 0.19; band = "small"; }
  else if (p >= 250000) { tax = p * 0.25; band = "main"; }
  else { tax = p * 0.25 - (250000 - p) * (3 / 200); band = "marginal"; }
  return { tax_pence: Math.round(tax * 100), effective_pct: (tax / p) * 100, band };
}
