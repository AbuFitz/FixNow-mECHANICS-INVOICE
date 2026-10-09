import { blankContent, DEFAULT_SETTINGS } from "./defaults";
import type { BillingSettings, DocumentContent } from "./types";

/** Sample content used by demo mode and the PDF sample renderer. */
export function sampleReceiptContent(settings: BillingSettings = DEFAULT_SETTINGS, photoBase = "/demo"): DocumentContent {
  const c = blankContent(settings, "receipt");
  c.business.bank = { account_name: "FixNow Mechanics Ltd", sort_code: "00-00-00", account_number: "00000000", bank_name: "Demo Bank" };
  c.business.registered_office = "Demo registered office (set in Settings)";
  c.customer = { name: "Matt Johnson", phone: "07700 912 345", email: "matt@example.com", address: "14 Beech Avenue", postcode: "AL10 8TR" };
  c.vehicle = { make_model: "Mazda 2 (2007)", registration: "MJ57 CWF", mileage: 98240, colour: "Silver", location: "AL10 8TR" };
  c.job = { reference: "JOB-001", title: "Battery replacement — supplied & fitted", summary: "Old battery removed and safely disposed of. Terminals cleaned and inspected. New Audura 063 battery fitted and tested. Vehicle confirmed starting correctly.", work_date: "2026-10-08", engineer_name: "Dan Reeves" };
  c.items = [
    { id: "1", kind: "part", description: "Audura 063 car battery", detail: "P/N 063 · S/N AU063-77412", qty: 1, unit_pence: 4349, cost_pence: 3100 },
    { id: "2", kind: "callout", description: "Mobile call-out fee", qty: 1, unit_pence: 2500 },
    { id: "3", kind: "labour", description: "Labour — battery replacement", qty: 1, unit_pence: 5651 },
  ];
  c.warranty = { parts: "3-Year manufacturer guarantee (Audura)", labour: "30-Day workmanship guarantee", exclusions: ["Vehicle electrical faults (e.g. faulty alternator)", "Misuse or physical damage", "Work carried out by third parties"] };
  c.condition_on_arrival = "Vehicle would not start. Battery voltage 9.8V. Terminals lightly corroded. No visible bodywork damage.";
  c.engineer_notes = "Battery fitted and tested successfully. Vehicle starting and operating correctly at time of completion. Charging output checked at 14.1V.";
  c.advisories = [
    { id: "a1", severity: "urgent", title: "Front brake pads close to the wear limit", detail: "Pad thickness measured at approx. 2mm on both front wheels. Recommend replacement within the next few weeks.", photos: [{ id: "p1", url: `${photoBase}/brakes.jpg`, caption: "Front nearside pad" }, { id: "p2", url: `${photoBase}/diagonstic.jpg`, caption: "Wear indicator" }], declined: true, declined_at: "2026-10-08" },
    { id: "a2", severity: "soon", title: "Rear suspension bush perished", detail: "Light cracking visible; no play at present. Recommend inspecting at next service.", photos: [{ id: "p3", url: `${photoBase}/suspension.jpg`, caption: "Rear arm bush" }] },
    { id: "a3", severity: "monitor", title: "Alternator output", detail: "Charging within range today. Ask for a recheck at the next service.", photos: [] },
  ];
  c.gallery = [
    { id: "g1", url: `${photoBase}/electrical.jpg`, caption: "New battery fitted" },
    { id: "g2", url: `${photoBase}/diagonstic.jpg`, caption: "Load test result" },
    { id: "g3", url: `${photoBase}/suspension.jpg`, caption: "Under-bonnet after work" },
  ];
  c.signoff = { name: "Matt Johnson", signed_at: "2026-10-08T15:42:00.000Z", signature: "", statement: "I confirm the work described above has been completed to my satisfaction and the engineer has explained their recommendations to me." };
  return c;
}
