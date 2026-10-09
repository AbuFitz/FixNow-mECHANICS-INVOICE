import { describe, it, expect } from "vitest";
import { calcPayslip, paramsForTaxYear, employeeNi, employerNi, taxToDate, periodNumber, taxYearOf } from "./payroll";
import { cisDeduction, cisPeriod } from "./cis";
import { vatReturn, vatPeriods, hmrcVatPayload } from "./vat";
import { mileageAmount, salesLines } from "./ledger";
import { allocateLines, computeTotals } from "../totals";
import { DEFAULT_SETTINGS, blankContent } from "../defaults";
import { parseBankCsv } from "./bank";
import type { BillingDocument, Employee } from "../types";

const P = paramsForTaxYear("2026-27");
const emp = (o: Partial<Employee> = {}): Employee => ({
  id: "e", name: "T", ni_number: "", tax_code: "1257L", pay_frequency: "monthly", annual_salary_pence: 2600000, hourly_rate_pence: 0,
  pension_opt_in: false, student_loan_plan: "none", start_date: "2025-01-01", active: true, created_at: "", ...o,
});

describe("payroll", () => {
  it("calculates month 1 on £26,000 (1257L) like HMRC tables", () => {
    const l = calcPayslip({ employee: emp(), gross_pence: 216667, period: 1, prev: { taxable_pence: 0, tax_pence: 0 }, params: P });
    expect(l.tax_pence).toBe(22360); // (2166.67 - 1048.25) floored to £1118 × 20%
    expect(l.employee_ni_pence).toBe(8949);
    expect(l.employer_ni_pence).toBe(26245);
    expect(l.net_pence).toBe(216667 - 22360 - 8949);
  });
  it("is cumulative: month 2 tax equals month 1 for flat pay", () => {
    const m1 = calcPayslip({ employee: emp(), gross_pence: 216667, period: 1, prev: { taxable_pence: 0, tax_pence: 0 }, params: P });
    const m2 = calcPayslip({ employee: emp(), gross_pence: 216667, period: 2, prev: { taxable_pence: 216667, tax_pence: m1.tax_pence }, params: P });
    expect(Math.abs(m2.tax_pence - m1.tax_pence)).toBeLessThanOrEqual(40);
  });
  it("applies pension via net pay and student loan", () => {
    const l = calcPayslip({ employee: emp({ pension_opt_in: true, student_loan_plan: "plan2" }), gross_pence: 216667, period: 1, prev: { taxable_pence: 0, tax_pence: 0 }, params: P });
    expect(l.pension_employee_pence).toBeGreaterThan(0);
    expect(l.student_loan_pence).toBe(0); // below the plan 2 monthly threshold
  });
  it("NI is zero under the primary threshold", () => {
    expect(employeeNi(1000, "monthly", P)).toBe(0);
    expect(employerNi(400, "monthly", P)).toBe(0);
  });
  it("rejects unsupported tax codes instead of guessing", () => {
    expect(() => taxToDate("K475", 1000, 1, "monthly", P)).toThrow();
  });
  it("derives tax year and period", () => {
    expect(taxYearOf("2026-04-05")).toBe("2025-26");
    expect(taxYearOf("2026-04-06")).toBe("2026-27");
    expect(periodNumber("2026-04-30", "monthly")).toBe(1);
    expect(periodNumber("2027-03-31", "monthly")).toBe(12);
  });
});

describe("CIS", () => {
  it("deducts only from labour", () => {
    const lines = [
      { id: "1", description: "labour", account: "301", net_pence: 100000, vat_rate: 20, is_labour: true },
      { id: "2", description: "materials", account: "300", net_pence: 40000, vat_rate: 20 },
    ];
    expect(cisDeduction(lines, "standard")).toBe(20000);
    expect(cisDeduction(lines, "unmatched")).toBe(30000);
    expect(cisDeduction(lines, "gross")).toBe(0);
  });
  it("finds the 6th–5th period", () => {
    expect(cisPeriod("2026-10-09")).toMatchObject({ start: "2026-10-06", end: "2026-11-05" });
    expect(cisPeriod("2026-10-03")).toMatchObject({ start: "2026-09-06", end: "2026-10-05" });
    expect(cisPeriod("2027-01-02")).toMatchObject({ start: "2026-12-06", end: "2027-01-05" });
  });
});

describe("mileage", () => {
  it("steps from 45p to 25p after 10,000 miles", () => {
    expect(mileageAmount(100, 0, 45, 25)).toBe(4500);
    expect(mileageAmount(200, 9900, 45, 25)).toBe(100 * 45 + 100 * 25);
  });
});

describe("VAT", () => {
  const settings = { ...DEFAULT_SETTINGS, business: { ...DEFAULT_SETTINGS.business, vat_registered: true, vat_number: "GB1" } };
  const content = blankContent(settings, "invoice");
  content.vat_mode = "standard";
  content.items = [
    { id: "a", kind: "labour", description: "L", qty: 1, unit_pence: 10000, vat_rate: 20 },
    { id: "b", kind: "part", description: "P", qty: 1, unit_pence: 5000, vat_rate: 20 },
  ];
  const t = computeTotals(content);
  const doc = { id: "d", doc_type: "invoice", number: "INV-1", lifecycle: "issued", issued_at: "2026-10-02", content, total_pence: t.total_pence, paid_pence: 0, credited_pence: 0, contact_id: null, project_id: null, created_at: "2026-10-02" } as unknown as BillingDocument;
  it("line VAT sums to invoice VAT", () => {
    expect(allocateLines(content).reduce((a, l) => a + l.vat_pence, 0)).toBe(t.vat_pence);
  });
  it("builds boxes from sales and purchases", () => {
    const lines = salesLines([doc], [], "accrual");
    const boxes = vatReturn([...lines, { date: "2026-10-05", source: "bill", ref: "B", description: "x", account: "300", kind: "expense", net_pence: 2000, vat_pence: 400, vat_rate: 20 }], { start: "2026-10-01", end: "2026-12-31" }, settings);
    expect(boxes.vatDueSales).toBe(3000);
    expect(boxes.vatReclaimedCurrPeriod).toBe(400);
    expect(boxes.netVatDue).toBe(2600);
    expect(boxes.totalValueSalesExVAT).toBe(15000);
    expect(hmrcVatPayload("26A4", boxes).totalValueSalesExVAT).toBe(150);
  });
  it("cash scheme follows payments", () => {
    const lines = salesLines([doc], [{ id: "p", document_id: "d", amount_pence: 9000, method: "cash", paid_at: "2026-11-01", reference: "", note: "", created_at: "" }], "cash");
    expect(lines.reduce((a, l) => a + l.vat_pence, 0)).toBe(1500);
    expect(lines.every((l) => l.date === "2026-11-01")).toBe(true);
  });
  it("lists quarterly periods", () => {
    const ps = vatPeriods(settings, "2026-10-09", 4);
    expect(ps.some((p) => p.start === "2026-10-01" && p.end === "2026-12-31")).toBe(true);
  });
});

describe("bank CSV", () => {
  it("parses paid in / paid out columns and UK dates", () => {
    const rows = parseBankCsv('Date,Description,Paid in,Paid out\n09/10/2026,"FASTER PAYMENT, M JOHNSON",125.00,\n08/10/2026,SHELL,,68.40');
    expect(rows).toEqual([
      { date: "2026-10-09", description: "FASTER PAYMENT, M JOHNSON", amount_pence: 12500 },
      { date: "2026-10-08", description: "SHELL", amount_pence: -6840 },
    ]);
  });
});

import { corporationTaxEstimate } from "./tax";
describe("corporation tax estimate", () => {
  it("applies small, marginal and main rates", () => {
    expect(corporationTaxEstimate(4_000_000).tax_pence).toBe(760_000);
    expect(corporationTaxEstimate(5_000_000).tax_pence).toBe(950_000);
    expect(corporationTaxEstimate(25_000_000).tax_pence).toBe(6_250_000);
    expect(corporationTaxEstimate(15_000_000).tax_pence).toBe(Math.round((37500 - 100000 * 0.015) * 100));
    expect(corporationTaxEstimate(-100).tax_pence).toBe(0);
  });
});
