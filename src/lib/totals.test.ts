import { describe, it, expect } from "vitest";
import { computeTotals, lineNet } from "./totals";
import { DEFAULT_SETTINGS } from "./defaults";
import { paymentState, balanceDue } from "./status";
import { gbp, toPence } from "./money";
import { whatsappHref } from "./share";

const biz = (vat: boolean) => ({ ...DEFAULT_SETTINGS.business, vat_registered: vat });
const item = (qty: number, unit: number, vat_rate?: number) => ({
  id: "x", kind: "part" as const, description: "x", qty, unit_pence: unit, vat_rate,
});

describe("money", () => {
  it("formats and parses pence", () => {
    expect(gbp(123456)).toBe("£1,234.56");
    expect(gbp(-1200)).toBe("-£12.00");
    expect(toPence("£43.49")).toBe(4349);
    expect(toPence("0.1") + toPence("0.2")).toBe(30);
  });
});

describe("computeTotals", () => {
  it("sums the original demo receipt exactly", () => {
    const t = computeTotals({ items: [item(1, 4349), item(1, 2500), item(1, 5651)], discount_pence: 0, vat_mode: "none", business: biz(false) });
    expect(t.total_pence).toBe(12500);
    expect(t.vat_pence).toBe(0);
  });
  it("handles fractional quantity", () => {
    expect(lineNet({ qty: 1.5, unit_pence: 6000 })).toBe(9000);
    expect(lineNet({ qty: 0.33, unit_pence: 1000 })).toBe(330);
  });
  it("adds 20% VAT when registered", () => {
    const t = computeTotals({ items: [item(1, 10000, 20)], discount_pence: 0, vat_mode: "standard", business: biz(true) });
    expect(t.vat_pence).toBe(2000);
    expect(t.total_pence).toBe(12000);
  });
  it("ignores VAT when not registered even if line has a rate", () => {
    const t = computeTotals({ items: [item(1, 10000, 20)], discount_pence: 0, vat_mode: "standard", business: biz(false) });
    expect(t.total_pence).toBe(10000);
  });
  it("spreads discount before VAT across mixed rates", () => {
    const t = computeTotals({ items: [item(1, 10000, 20), item(1, 10000, 0)], discount_pence: 2000, vat_mode: "standard", business: biz(true) });
    expect(t.net_pence).toBe(18000);
    expect(t.vat_buckets.find((b) => b.rate === 20)!.vat_pence).toBe(1800);
    expect(t.total_pence).toBe(19800);
  });
  it("never lets discount exceed subtotal", () => {
    const t = computeTotals({ items: [item(1, 1000)], discount_pence: 99999, vat_mode: "none", business: biz(false) });
    expect(t.total_pence).toBe(0);
  });
  it("tracks margin from internal cost", () => {
    const t = computeTotals({ items: [{ ...item(1, 10000), cost_pence: 6000 }], discount_pence: 0, vat_mode: "none", business: biz(false) });
    expect(t.margin_pence).toBe(4000);
  });
});

describe("paymentState", () => {
  const base = { lifecycle: "issued" as const, doc_type: "invoice" as const, total_pence: 10000, paid_pence: 0, credited_pence: 0, due_at: "2026-10-20" };
  it("covers the lifecycle", () => {
    expect(paymentState(base, "2026-10-10")).toBe("unpaid");
    expect(paymentState(base, "2026-10-21")).toBe("overdue");
    expect(paymentState({ ...base, paid_pence: 4000 }, "2026-10-10")).toBe("part_paid");
    expect(paymentState({ ...base, paid_pence: 10000 }, "2026-10-30")).toBe("paid");
    expect(paymentState({ ...base, lifecycle: "void" })).toBe("void");
    expect(paymentState({ ...base, lifecycle: "draft" })).toBe("draft");
    expect(balanceDue({ ...base, paid_pence: 12000 })).toBe(0);
  });
});

describe("share", () => {
  it("builds a UK whatsapp number", () => {
    expect(whatsappHref("07700 912 345", "hi")).toContain("wa.me/447700912345");
  });
});
