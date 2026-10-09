/** Money helpers — integer pence everywhere. */

export function toPence(pounds: number | string): number {
  const n = typeof pounds === "string" ? parseFloat(pounds.replace(/[^0-9.\-]/g, "")) : pounds;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPence(pence: number): number {
  return pence / 100;
}

/** "£1,234.50" — negatives render as "-£12.00". */
export function gbp(pence: number, currency = "GBP"): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence) / 100;
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  const body = abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${sign}${symbol}${body}` : `${sign}${body} ${currency}`;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
};

export const CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "CHF", "SEK", "NOK", "DKK", "PLN"];

/** Plain editable value for inputs: 1234 -> "12.34". Empty string for 0 when blank=true. */
export function penceToInput(pence: number | undefined | null, blank = false): string {
  if (!pence) return blank ? "" : "0.00";
  return (pence / 100).toFixed(2);
}

export function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) + Number.EPSILON);
}

export function convertToBase(pence: number, fxRate: number): number {
  return roundHalfUp(pence * (fxRate || 1));
}
