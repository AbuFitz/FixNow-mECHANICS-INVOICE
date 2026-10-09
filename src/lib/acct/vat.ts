import type { BillingSettings, VatBoxes } from "../types";
import type { LedgerLine } from "./ledger";
import { inRange } from "./ledger";
import { addDaysIso } from "../format";
import { parseISO, addMonths, endOfMonth, format } from "date-fns";

export interface VatPeriod {
  start: string;
  end: string;
  due: string;
  key: string;
}

/** Period list around a reference date, from the VAT frequency + stagger in Settings. */
export function vatPeriods(settings: BillingSettings, around: string, count = 8): VatPeriod[] {
  const { vat_frequency: freq, vat_stagger_start_month: m } = settings.tax;
  const stepMonths = freq === "monthly" ? 1 : freq === "annual" ? 12 : 3;
  const ref = parseISO(around);
  const refIdx = ref.getFullYear() * 12 + ref.getMonth();
  const offset = (m - 1) % stepMonths;
  const startIdx = refIdx - ((((refIdx - offset) % stepMonths) + stepMonths) % stepMonths);
  const out: VatPeriod[] = [];
  for (let i = -(count - 2); i <= 1; i++) {
    const s = startIdx + i * stepMonths;
    const start = new Date(Math.floor(s / 12), ((s % 12) + 12) % 12, 1);
    const end = endOfMonth(addMonths(start, stepMonths - 1));
    const endIso = format(end, "yyyy-MM-dd");
    out.push({ start: format(start, "yyyy-MM-dd"), end: endIso, due: addDaysIso(format(addMonths(end, 1), "yyyy-MM-dd"), 7), key: `${format(start, "yy")}${format(start, "MM")}` });
  }
  return out;
}

const whole = (pence: number) => Math.floor(pence / 100) * 100;

export function vatReturn(lines: LedgerLine[], period: { start: string; end: string }, settings: BillingSettings): VatBoxes {
  const inP = lines.filter((l) => inRange(l.date, period.start, period.end) && l.source !== "payroll");
  const sales = inP.filter((l) => l.kind === "income");
  const costs = inP.filter((l) => l.kind === "expense");
  const salesNet = sales.reduce((a, l) => a + l.net_pence, 0);
  const salesVat = sales.reduce((a, l) => a + l.vat_pence, 0);
  const purchNet = costs.reduce((a, l) => a + l.net_pence, 0);
  const purchVat = costs.reduce((a, l) => a + l.vat_pence, 0);

  let box1 = salesVat;
  let box4 = purchVat;
  if (settings.tax.vat_scheme === "flat_rate") {
    box1 = Math.round(((salesNet + salesVat) * settings.tax.flat_rate_percent) / 100);
    box4 = 0;
  }
  const box3 = box1;
  return {
    vatDueSales: box1,
    vatDueAcquisitions: 0,
    totalVatDue: box3,
    vatReclaimedCurrPeriod: box4,
    netVatDue: Math.abs(box3 - box4),
    totalValueSalesExVAT: whole(salesNet),
    totalValuePurchasesExVAT: whole(purchNet),
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
  };
}

/** Whether the return is a payment to HMRC (true) or a repayment (false). */
export function owesHmrc(b: VatBoxes): boolean {
  return b.totalVatDue >= b.vatReclaimedCurrPeriod;
}

/** HMRC MTD VAT submission body — pounds (2dp) for boxes 1-5, whole pounds for 6-9. */
export function hmrcVatPayload(periodKey: string, b: VatBoxes) {
  const p = (n: number) => Math.round(n) / 100;
  const w = (n: number) => Math.floor(n / 100);
  return {
    periodKey,
    vatDueSales: p(b.vatDueSales),
    vatDueAcquisitions: p(b.vatDueAcquisitions),
    totalVatDue: p(b.totalVatDue),
    vatReclaimedCurrPeriod: p(b.vatReclaimedCurrPeriod),
    netVatDue: p(b.netVatDue),
    totalValueSalesExVAT: w(b.totalValueSalesExVAT),
    totalValuePurchasesExVAT: w(b.totalValuePurchasesExVAT),
    totalValueGoodsSuppliedExVAT: w(b.totalValueGoodsSuppliedExVAT),
    totalAcquisitionsExVAT: w(b.totalAcquisitionsExVAT),
    finalised: true,
  };
}
