import { addMonths, endOfMonth, format, startOfMonth, subMonths, startOfQuarter, endOfQuarter } from "date-fns";
import { taxYearStart } from "./acct/ledger";
import { isoDate } from "./format";

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "tax_year" | "last_12" | "custom";
export const PERIOD_LABEL: Record<PeriodKey, string> = { this_month: "This month", last_month: "Last month", this_quarter: "This quarter", tax_year: "This tax year", last_12: "Last 12 months", custom: "Custom" };

export function resolvePeriod(key: PeriodKey, custom?: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  switch (key) {
    case "this_month": return { from: f(startOfMonth(now)), to: f(endOfMonth(now)) };
    case "last_month": { const m = subMonths(now, 1); return { from: f(startOfMonth(m)), to: f(endOfMonth(m)) }; }
    case "this_quarter": return { from: f(startOfQuarter(now)), to: f(endOfQuarter(now)) };
    case "tax_year": { const s = taxYearStart(isoDate(now)); const y = parseInt(s.slice(0, 4), 10); return { from: s, to: `${y + 1}-04-05` }; }
    case "last_12": return { from: f(startOfMonth(subMonths(now, 11))), to: f(endOfMonth(addMonths(now, 0))) };
    default: return custom ?? { from: f(startOfMonth(now)), to: f(endOfMonth(now)) };
  }
}
