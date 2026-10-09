import type { Employee, PayRun, PayslipLine } from "../types";

/**
 * UK payroll calculation (category A NI, cumulative PAYE, workplace pension via
 * net pay, student loans). Parameters are held per tax year in ONE place so they
 * can be checked against gov.uk each April.
 *
 * VERIFY BEFORE RELYING ON IT: these figures must be confirmed against HMRC's
 * published rates for the tax year in use. This module calculates; it does not
 * submit RTI (Full Payment Submission) to HMRC — that needs HMRC-recognised
 * software/credentials.
 */
export interface PayrollParams {
  year: string;
  personal_allowance: number; // £
  basic_band: number; // £ of taxable income at the basic rate
  higher_limit: number; // £ income above which additional rate applies
  rates: { basic: number; higher: number; additional: number };
  ni: { pt_month: number; uel_month: number; st_month: number; pt_week: number; uel_week: number; st_week: number; ee_main: number; ee_upper: number; er: number };
  pension: { lower_month: number; upper_month: number; lower_week: number; upper_week: number; employee: number; employer: number };
  student_loan: Record<"plan1" | "plan2" | "plan4" | "plan5", number>; // annual thresholds £
  employment_allowance: number; // £
}

export const PAYROLL_PARAMS: Record<string, PayrollParams> = {
  "2026-27": {
    year: "2026-27",
    personal_allowance: 12570,
    basic_band: 37700,
    higher_limit: 125140,
    rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
    ni: { pt_month: 1048, uel_month: 4189, st_month: 417, pt_week: 242, uel_week: 967, st_week: 96, ee_main: 0.08, ee_upper: 0.02, er: 0.15 },
    pension: { lower_month: 520, upper_month: 4189, lower_week: 120, upper_week: 967, employee: 0.05, employer: 0.03 },
    student_loan: { plan1: 26900, plan2: 29385, plan4: 33795, plan5: 25000 },
    employment_allowance: 10500,
  },
};

export function paramsForTaxYear(year: string): PayrollParams {
  return PAYROLL_PARAMS[year] ?? PAYROLL_PARAMS["2026-27"]!;
}

export function taxYearOf(dateIso: string): string {
  const y = parseInt(dateIso.slice(0, 4), 10);
  const start = dateIso >= `${y}-04-06` ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** 1-based period number in the tax year for a pay date. Monthly: Apr=1 … Mar=12 (period ends 5th basis simplified to calendar month of pay date). */
export function periodNumber(dateIso: string, freq: "monthly" | "weekly"): number {
  const y = parseInt(taxYearOf(dateIso).slice(0, 4), 10);
  const start = new Date(Date.UTC(y, 3, 6));
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (freq === "weekly") return Math.floor((d.getTime() - start.getTime()) / (7 * 864e5)) + 1;
  const months = (d.getUTCFullYear() - y) * 12 + (d.getUTCMonth() - 3) + (d.getUTCDate() >= 6 ? 1 : 0);
  return Math.min(Math.max(months, 1), 12);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PayeResult {
  tax_to_date_pence: number;
}

/** Free pay (annual) for a numeric tax code like 1257L: (number*10)+9. */
export function annualFreePay(code: string): number | null {
  const m = /^(\d{1,4})[LMN]$/i.exec(code.trim());
  return m ? parseInt(m[1]!, 10) * 10 + 9 : null;
}

/** Cumulative PAYE tax to date in pence for the given cumulative taxable pay (£ with pence). */
export function taxToDate(code: string, cumTaxablePayPounds: number, period: number, freq: "monthly" | "weekly", p: PayrollParams): number {
  const n = freq === "monthly" ? 12 : 52;
  const c = code.trim().toUpperCase();
  const gross = Math.floor(cumTaxablePayPounds);
  if (c === "NT") return 0;
  if (c === "BR") return Math.round(gross * p.rates.basic * 100);
  if (c === "D0") return Math.round(gross * p.rates.higher * 100);
  if (c === "D1") return Math.round(gross * p.rates.additional * 100);
  const free = annualFreePay(c);
  if (free === null) throw new Error(`Tax code ${code} isn't supported yet — use a standard code such as 1257L, BR, D0 or NT.`);
  const taxable = Math.max(Math.floor(cumTaxablePayPounds - (free / n) * period), 0);
  const basicLimit = Math.ceil((p.basic_band / n) * period);
  const higherLimit = Math.ceil(((p.higher_limit - free) / n) * period);
  const tBasic = Math.min(taxable, basicLimit);
  const tHigher = Math.max(Math.min(taxable, higherLimit) - basicLimit, 0);
  const tAdd = Math.max(taxable - higherLimit, 0);
  return Math.round((tBasic * p.rates.basic + tHigher * p.rates.higher + tAdd * p.rates.additional) * 100);
}

export function employeeNi(gross: number, freq: "monthly" | "weekly", p: PayrollParams): number {
  const pt = freq === "monthly" ? p.ni.pt_month : p.ni.pt_week;
  const uel = freq === "monthly" ? p.ni.uel_month : p.ni.uel_week;
  const main = Math.max(Math.min(gross, uel) - pt, 0) * p.ni.ee_main;
  const upper = Math.max(gross - uel, 0) * p.ni.ee_upper;
  return Math.round((main + upper) * 100) / 100;
}
export function employerNi(gross: number, freq: "monthly" | "weekly", p: PayrollParams): number {
  const st = freq === "monthly" ? p.ni.st_month : p.ni.st_week;
  return Math.round(Math.max(gross - st, 0) * p.ni.er * 100) / 100;
}

export function studentLoan(gross: number, plan: Employee["student_loan_plan"], freq: "monthly" | "weekly", p: PayrollParams): number {
  if (plan === "none") return 0;
  const annual = p.student_loan[plan];
  const thr = freq === "monthly" ? annual / 12 : annual / 52;
  return Math.floor(Math.max(gross - thr, 0) * 0.09 * 100) / 100;
}

export interface PayslipInput {
  employee: Employee;
  /** Gross pay for this period in pence (salary/12 etc.). */
  gross_pence: number;
  hours?: number;
  period: number;
  /** Totals from earlier periods this tax year, in pence. */
  prev: { taxable_pence: number; tax_pence: number };
  params: PayrollParams;
}

export function calcPayslip(i: PayslipInput): PayslipLine {
  const { employee: e, params: p } = i;
  const freq = e.pay_frequency;
  const gross = i.gross_pence / 100;

  let pensionEe = 0;
  let pensionEr = 0;
  if (e.pension_opt_in) {
    const lower = freq === "monthly" ? p.pension.lower_month : p.pension.lower_week;
    const upper = freq === "monthly" ? p.pension.upper_month : p.pension.upper_week;
    const qual = Math.max(Math.min(gross, upper) - lower, 0);
    pensionEe = r2(qual * p.pension.employee);
    pensionEr = r2(qual * p.pension.employer);
  }
  const taxablePeriod = gross - pensionEe; // net pay arrangement
  const cumTaxable = i.prev.taxable_pence / 100 + taxablePeriod;
  const toDate = taxToDate(e.tax_code, cumTaxable, i.period, freq, p);
  const tax = toDate - i.prev.tax_pence;
  const ni = employeeNi(gross, freq, p);
  const erNi = employerNi(gross, freq, p);
  const sl = studentLoan(gross, e.student_loan_plan, freq, p);
  const net = gross - tax / 100 - ni - sl - pensionEe;
  return {
    employee_id: e.id,
    employee_name: e.name,
    gross_pence: i.gross_pence,
    tax_pence: tax,
    employee_ni_pence: Math.round(ni * 100),
    employer_ni_pence: Math.round(erNi * 100),
    pension_employee_pence: Math.round(pensionEe * 100),
    pension_employer_pence: Math.round(pensionEr * 100),
    student_loan_pence: Math.round(sl * 100),
    net_pence: Math.round(net * 100),
    hours: i.hours ?? 0,
  };
}

/** Cumulative taxable pay + tax already deducted for an employee in earlier runs of the same tax year. */
export function previousTotals(employeeId: string, runs: PayRun[], taxYear: string, beforePeriod: number): { taxable_pence: number; tax_pence: number } {
  let taxable = 0;
  let tax = 0;
  for (const r of runs) {
    if (r.status === "draft" || taxYearOf(r.pay_date) !== taxYear || r.period_number >= beforePeriod) continue;
    const l = r.lines.find((x) => x.employee_id === employeeId);
    if (!l) continue;
    taxable += l.gross_pence - l.pension_employee_pence;
    tax += l.tax_pence;
  }
  return { taxable_pence: taxable, tax_pence: tax };
}

export function payrollSummary(run: PayRun) {
  const s = (f: (l: PayslipLine) => number) => run.lines.reduce((a, l) => a + f(l), 0);
  const paye = s((l) => l.tax_pence) + s((l) => l.employee_ni_pence) + s((l) => l.employer_ni_pence) + s((l) => l.student_loan_pence);
  return { gross: s((l) => l.gross_pence), net: s((l) => l.net_pence), paye_nic_to_hmrc: paye, employer_cost: s((l) => l.gross_pence + l.employer_ni_pence + l.pension_employer_pence) };
}
