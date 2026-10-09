import type { Account } from "../types";
import type { LedgerLine } from "./ledger";
import { inRange } from "./ledger";

/** MTD for Income Tax quarters: 6 Apr–5 Jul, 6 Jul–5 Oct, 6 Oct–5 Jan, 6 Jan–5 Apr. */
export function itsaQuarters(taxYearStartYear: number) {
  const y = taxYearStartYear;
  return [
    { n: 1, start: `${y}-04-06`, end: `${y}-07-05`, deadline: `${y}-08-07` },
    { n: 2, start: `${y}-07-06`, end: `${y}-10-05`, deadline: `${y}-11-07` },
    { n: 3, start: `${y}-10-06`, end: `${y + 1}-01-05`, deadline: `${y + 1}-02-07` },
    { n: 4, start: `${y + 1}-01-06`, end: `${y + 1}-04-05`, deadline: `${y + 1}-05-07` },
  ];
}

export interface ItsaSummary {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: { turnover: number; other: number };
  periodExpenses: Record<string, number>;
}

/** Quarterly cumulative-style summary by HMRC category, in pounds (2dp). */
export function itsaSummary(lines: LedgerLine[], accounts: Account[], start: string, end: string): ItsaSummary {
  const cat = new Map(accounts.map((a) => [a.code, a.hmrc_category]));
  const exp: Record<string, number> = {};
  let turnover = 0;
  let other = 0;
  for (const l of lines) {
    if (!inRange(l.date, start, end) || l.source === "payroll" && false) continue;
    const c = cat.get(l.account) ?? "otherExpenses";
    if (l.kind === "income") {
      if (c === "otherIncome") other += l.net_pence;
      else turnover += l.net_pence;
    } else {
      exp[c] = (exp[c] ?? 0) + l.net_pence;
    }
  }
  const pounds = (n: number) => Math.round(n) / 100;
  return {
    periodDates: { periodStartDate: start, periodEndDate: end },
    periodIncome: { turnover: pounds(turnover), other: pounds(other) },
    periodExpenses: Object.fromEntries(Object.entries(exp).map(([k, v]) => [k, pounds(v)])),
  };
}
