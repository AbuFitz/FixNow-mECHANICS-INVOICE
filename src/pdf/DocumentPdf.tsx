import {
  Document,
  Image,
  Page,
  Path,
  Polygon,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { PdfModel } from "./model";
import type { Advisory, DocPhoto, LineItem, LineKind } from "@/lib/types";
import { gbp } from "@/lib/money";
import { lineNet, vatLabel } from "@/lib/totals";
import { d } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tokens — kept in step with the tracker + website brand (ink + signal yellow).
// ---------------------------------------------------------------------------
export const C = {
  ink: "#0d0d0d",
  ink2: "#1c1b19",
  signal: "#F4B400",
  signalSoft: "#fdf3d0",
  text: "#1c1b19",
  mute: "#6a6760",
  faint: "#9d9a92",
  line: "#e4e1d9",
  wash: "#f6f5f1",
  green: "#1a7a3a",
  greenSoft: "#e6f3ea",
  amber: "#b45309",
  amberSoft: "#fdf0dc",
  red: "#b42318",
  redSoft: "#fbe9e7",
  blue: "#2f5f93",
  blueSoft: "#e8f0f8",
  white: "#ffffff",
};

const PAGE_W = 595.28;
const MX = 40;

const s = StyleSheet.create({
  page: {
    paddingTop: 62,
    paddingBottom: 66,
    paddingHorizontal: MX,
    fontFamily: "Grotesk",
    fontSize: 9,
    color: C.text,
    backgroundColor: C.white,
    lineHeight: 1.4,
  },
  label: {
    fontFamily: "Outfit",
    fontWeight: 600,
    fontSize: 6.8,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: C.mute,
  },
  h1: { fontFamily: "Outfit", fontWeight: 600, fontSize: 14, color: C.ink, lineHeight: 1.2 },
  h2: { fontFamily: "Outfit", fontWeight: 600, fontSize: 11.5, color: C.ink, lineHeight: 1.2 },
  body: { fontSize: 9, color: C.text, lineHeight: 1.5 },
  muted: { fontSize: 8.4, color: C.mute, lineHeight: 1.45 },
  row: { flexDirection: "row" },
});

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function SectionHead({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 9 }} minPresenceAhead={60}>
      <View style={{ width: 6, height: 6, backgroundColor: C.signal, marginRight: 7 }} />
      <Text style={s.label}>{children}</Text>
      <View style={{ flex: 1, height: 0.6, backgroundColor: C.line, marginLeft: 9 }} />
      {note ? <Text style={{ ...s.label, marginLeft: 9, color: C.faint }}>{note}</Text> : null}
    </View>
  );
}

function Hazard({ width = PAGE_W, height = 6 }: { width?: number; height?: number }) {
  const step = 12;
  const n = Math.ceil(width / step) + 1;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={C.ink} />
      {Array.from({ length: n }, (_, i) => (
        <Polygon
          key={i}
          points={`${i * step},${height} ${i * step + height},0 ${i * step + height + 6},0 ${i * step + 6},${height}`}
          fill={C.signal}
        />
      ))}
    </Svg>
  );
}

function Wordmark({ size = 22, dark = true }: { size?: number; dark?: boolean }) {
  const base = dark ? C.white : C.ink;
  return (
    <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: size, color: base, letterSpacing: -0.4 }}>
      Fix<Text style={{ color: C.signal }}>Now</Text> Mechanics
    </Text>
  );
}

function Pill({ label, fg, bg, border }: { label: string; fg: string; bg: string; border?: string }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: border ? 0.8 : 0,
        borderColor: border,
        marginLeft: 6,
      }}
    >
      <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 6.8, letterSpacing: 1.2, color: fg }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function Tick({ color = C.green, size = 9 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M2 6.4 L4.8 9 L10 3" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

function Cross({ color = C.red, size = 7 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke={color} strokeWidth={1.8} fill="none" />
    </Svg>
  );
}

/** UK rear number plate — the signature detail of the vehicle block. */
function Plate({ reg }: { reg: string }) {
  const text = reg.toUpperCase().trim();
  return (
    <View
      style={{
        flexDirection: "row",
        alignSelf: "flex-start",
        borderRadius: 3.5,
        borderWidth: 1,
        borderColor: C.ink,
        backgroundColor: C.signal,
        overflow: "hidden",
      }}
    >
      <View style={{ width: 13, backgroundColor: "#1d3f8f", alignItems: "center", justifyContent: "flex-end", paddingBottom: 3 }}>
        <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 4.6, color: C.white }}>UK</Text>
      </View>
      <Text
        style={{
          fontFamily: "Plex",
          fontWeight: 600,
          fontSize: 14,
          letterSpacing: 1.6,
          color: C.ink,
          paddingHorizontal: 9,
          paddingVertical: 4,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function KV({ k, v, mono }: { k: string; v?: string | null; mono?: boolean }) {
  if (!v) return null;
  return (
    <View style={{ marginTop: 5 }}>
      <Text style={{ ...s.label, fontSize: 6.2 }}>{k}</Text>
      <Text style={{ ...s.body, fontFamily: mono ? "Plex" : "Grotesk", marginTop: 1.5 }}>{v}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Header / footer
// ---------------------------------------------------------------------------

function isReceipt(m: PdfModel): boolean {
  return m.mode === "receipt" || m.doc_type === "receipt";
}

function titleFor(m: PdfModel): string {
  if (isReceipt(m)) return "Receipt";
  return { quote: "Quotation", invoice: "Invoice", receipt: "Receipt", credit_note: "Credit note" }[m.doc_type];
}

function statusPills(m: PdfModel): ReactNode {
  const pills: ReactNode[] = [];
  if (m.lifecycle === "void") pills.push(<Pill key="v" label="Void" fg={C.white} bg={C.red} />);
  else if (m.lifecycle === "draft") pills.push(<Pill key="d" label="Draft" fg={C.ink} bg={C.white} />);
  else if (m.doc_type === "quote") {
    if (m.quote_outcome === "accepted") pills.push(<Pill key="a" label="Accepted" fg={C.white} bg={C.green} />);
    else if (m.quote_outcome === "declined") pills.push(<Pill key="a" label="Declined" fg={C.white} bg={C.red} />);
    else pills.push(<Pill key="q" label="Estimate" fg={C.ink} bg={C.signal} />);
  } else if (m.doc_type === "credit_note") {
    pills.push(<Pill key="c" label="Credit" fg={C.ink} bg={C.signal} />);
  } else if (m.state === "paid") pills.push(<Pill key="p" label="Paid in full" fg={C.white} bg={C.green} />);
  else if (m.state === "overdue") pills.push(<Pill key="o" label="Overdue" fg={C.white} bg={C.red} />);
  else if (m.state === "part_paid") pills.push(<Pill key="pp" label="Part paid" fg={C.ink} bg={C.signal} />);
  else if (m.state === "credited") pills.push(<Pill key="cr" label="Credited" fg={C.ink} bg={C.signal} />);
  else pills.push(<Pill key="u" label="Payment due" fg={C.ink} bg={C.signal} />);
  if (m.revision > 1 && m.lifecycle !== "draft")
    pills.push(<Pill key="r" label={`Amended · Rev ${m.revision}`} fg={C.signal} bg={C.ink2} border={C.signal} />);
  return pills;
}

function Header({ m }: { m: PdfModel }) {
  const b = m.content.business;
  return (
    <View style={{ marginTop: -62, marginHorizontal: -MX }}>
      <View style={{ backgroundColor: C.ink, paddingHorizontal: MX, paddingTop: 28, paddingBottom: 22, flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ maxWidth: 270 }}>
          <Wordmark />
          <Text style={{ fontFamily: "Grotesk", fontSize: 7.6, color: "#a6a39b", marginTop: 12, letterSpacing: 0.3 }}>
            {b.descriptor}
          </Text>
          <Text style={{ fontFamily: "Grotesk", fontStyle: "normal", fontSize: 8, color: C.signal, marginTop: 10, letterSpacing: 0.2 }}>
            {b.tagline}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 8, letterSpacing: 2.4, color: C.signal }}>
            {titleFor(m).toUpperCase()}
          </Text>
          <Text style={{ fontFamily: "Plex", fontWeight: 500, fontSize: 17, color: C.white, marginTop: 4, letterSpacing: 0.3 }}>
            {m.number ?? "DRAFT"}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 9 }}>{statusPills(m)}</View>
        </View>
      </View>
      <Hazard />
    </View>
  );
}

function RunningHeader({ m }: { m: PdfModel }) {
  return (
    <View
      fixed
      style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: 40 }}
      render={({ pageNumber }) =>
        pageNumber > 1 ? (
          <View
            style={{
              width: PAGE_W,
              height: 40,
              backgroundColor: C.ink,
              paddingHorizontal: MX,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Wordmark size={12} />
            <Text style={{ fontFamily: "Plex", fontSize: 8, color: "#bdbab2", letterSpacing: 0.4 }}>
              {titleFor(m)} {m.number ?? "DRAFT"}
              {m.content.vehicle.registration ? `  ·  ${m.content.vehicle.registration.toUpperCase()}` : ""}
            </Text>
          </View>
        ) : null
      }
    />
  );
}

function Footer({ m }: { m: PdfModel }) {
  const b = m.content.business;
  const legal = [
    b.legal_name,
    b.company_number ? `Registered in ${b.registered_in || "England & Wales"} No. ${b.company_number}` : "",
    b.registered_office ? `Registered office: ${b.registered_office}` : "",
    b.vat_registered && b.vat_number ? `VAT No. ${b.vat_number}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  const contact = [b.phone, b.email, b.website].filter(Boolean).join("  ·  ");
  return (
    <View fixed style={{ position: "absolute", top: 794, left: MX, width: PAGE_W - MX * 2 }}>
      <View style={{ height: 1.2, backgroundColor: C.signal, marginBottom: 7 }} />
      <View style={{ width: PAGE_W - MX * 2 - 130 }}>
        <Text style={{ fontSize: 6.8, color: C.mute, lineHeight: 1.45 }}>{legal}</Text>
        <Text style={{ fontSize: 6.8, color: C.faint, marginTop: 1 }}>{contact}</Text>
      </View>
      <Text
        style={{ position: "absolute", top: 8, right: 0, fontFamily: "Plex", fontSize: 7.4, color: C.mute, width: 120, textAlign: "right" }}
        render={({ pageNumber, totalPages }) => `${m.number ?? "DRAFT"}  ·  ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function Watermark({ m }: { m: PdfModel }) {
  const text = m.lifecycle === "void" ? "VOID" : m.lifecycle === "draft" ? "DRAFT" : null;
  if (!text) return null;
  return (
    <View
      fixed
      style={{ position: "absolute", top: 330, left: 0, right: 0, alignItems: "center" }}
    >
      <Text
        style={{
          fontFamily: "Outfit",
          fontWeight: 700,
          fontSize: 120,
          color: m.lifecycle === "void" ? "#f3d4d0" : "#ececea",
          transform: "rotate(-24deg)",
          letterSpacing: 8,
          opacity: 0.8,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page-one blocks
// ---------------------------------------------------------------------------

function Facts({ m }: { m: PdfModel }) {
  const c = m.content;
  const lastPay = m.payments.length ? m.payments[m.payments.length - 1]! : null;
  const methodLabel = (v: string) => PAYMENT_METHODS.find((p) => p.value === v)?.label ?? v;
  const cells: [string, string][] = [];
  if (isReceipt(m)) {
    cells.push(["Receipt date", d(lastPay?.paid_at ?? m.issued_at)]);
    cells.push(["Paid by", lastPay ? methodLabel(lastPay.method) : "—"]);
    cells.push([m.parent_number ? "Invoice ref" : "Job ref", m.parent_number ?? (c.job.reference || "—")]);
  } else if (m.doc_type === "quote") {
    cells.push(["Issued", d(m.issued_at)]);
    cells.push(["Valid until", d(m.valid_until)]);
    cells.push(["Reference", c.job.reference || "—"]);
  } else if (m.doc_type === "credit_note") {
    cells.push(["Issued", d(m.issued_at)]);
    cells.push(["Against invoice", m.parent_number ?? "—"]);
    cells.push(["Job ref", c.job.reference || "—"]);
  } else {
    cells.push(["Issued", d(m.issued_at)]);
    cells.push(["Payment due", d(m.due_at)]);
    cells.push(["Job ref", c.job.reference || "—"]);
  }
  cells.push([m.doc_type === "quote" ? "Prepared by" : "Engineer", c.job.engineer_name || "FixNow team"]);
  return (
    <View style={{ flexDirection: "row", marginTop: 20, borderTopWidth: 1.2, borderTopColor: C.ink, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
      {cells.map(([k, v], i) => (
        <View
          key={k}
          style={{
            flex: 1,
            paddingVertical: 9,
            paddingLeft: i === 0 ? 0 : 12,
            borderLeftWidth: i === 0 ? 0 : 0.6,
            borderLeftColor: C.line,
          }}
        >
          <Text style={s.label}>{k}</Text>
          <Text style={{ fontFamily: "Outfit", fontWeight: 500, fontSize: 10.5, color: C.ink, marginTop: 3 }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function Parties({ m }: { m: PdfModel }) {
  const c = m.content;
  const cu = c.customer;
  const v = c.vehicle;
  const hasVehicle = v.make_model || v.registration;
  return (
    <View style={{ flexDirection: "row", marginTop: 18 }}>
      <View style={{ flex: 1, paddingRight: 18 }}>
        <Text style={s.label}>{m.doc_type === "credit_note" ? "Credit to" : m.doc_type === "quote" ? "Prepared for" : "Billed to"}</Text>
        <Text style={{ ...s.h1, marginTop: 5 }}>{cu.name || "—"}</Text>
        {cu.company ? <Text style={{ ...s.body, marginTop: 1 }}>{cu.company}</Text> : null}
        <View style={{ marginTop: 5 }}>
          {cu.address || cu.postcode ? (
            <Text style={s.muted}>{[cu.address, cu.postcode].filter(Boolean).join(", ")}</Text>
          ) : null}
          {cu.phone ? <Text style={s.muted}>{cu.phone}</Text> : null}
          {cu.email ? <Text style={s.muted}>{cu.email}</Text> : null}
        </View>
      </View>
      {hasVehicle ? (
        <View style={{ flex: 1, paddingLeft: 18, borderLeftWidth: 0.6, borderLeftColor: C.line }}>
          <Text style={s.label}>Vehicle</Text>
          <Text style={{ ...s.h1, marginTop: 5, marginBottom: 7 }}>{v.make_model || "—"}</Text>
          {v.registration && c.options.show_plate ? <Plate reg={v.registration} /> : null}
          {v.registration && !c.options.show_plate ? <Text style={s.body}>{v.registration.toUpperCase()}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <View style={{ marginRight: 18 }}>
              <KV k="Mileage" v={v.mileage ? `${v.mileage.toLocaleString("en-GB")} mi` : null} />
            </View>
            <View style={{ marginRight: 18 }}>
              <KV k="Colour" v={v.colour} />
            </View>
            <KV k="Service location" v={v.location} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function WorkBlock({ m }: { m: PdfModel }) {
  const j = m.content.job;
  if (!j.title && !j.summary) return null;
  return (
    <View>
      <SectionHead>{m.doc_type === "quote" ? "Proposed work" : "Work carried out"}</SectionHead>
      {j.title ? <Text style={s.h1}>{j.title}</Text> : null}
      {j.summary ? <Text style={{ ...s.body, color: "#3d3b36", marginTop: 4 }}>{j.summary}</Text> : null}
      {j.work_date && m.doc_type !== "quote" ? <Text style={{ ...s.muted, marginTop: 4 }}>Date of work: {d(j.work_date)}</Text> : null}
    </View>
  );
}

const KIND_ORDER: LineKind[] = ["part", "labour", "callout", "other"];
const KIND_LABEL: Record<LineKind, string> = {
  part: "Parts & materials",
  labour: "Labour",
  callout: "Call-out",
  other: "Other charges",
};

const COL = { desc: 0.5, qty: 0.1, unit: 0.19, amt: 0.21 };

function ItemsTable({ m }: { m: PdfModel }) {
  const c = m.content;
  const cur = c.currency;
  const used = KIND_ORDER.filter((k) => c.items.some((i) => i.kind === k));
  const grouped = used.length > 1;
  const showVat = c.business.vat_registered && c.vat_mode !== "none";
  const head = (txt: string, w: number, right = false) => (
    <Text style={{ ...s.label, width: `${w * 100}%`, textAlign: right ? "right" : "left" }}>{txt}</Text>
  );
  const row = (it: LineItem, i: number) => (
    <View
      key={it.id}
      wrap={false}
      style={{
        flexDirection: "row",
        paddingVertical: 7,
        borderBottomWidth: 0.6,
        borderBottomColor: C.line,
        backgroundColor: i % 2 === 1 ? "#fbfaf7" : C.white,
        paddingHorizontal: 6,
      }}
    >
      <View style={{ width: `${COL.desc * 100}%`, paddingRight: 10 }}>
        <Text style={{ fontWeight: 500, fontSize: 9.4, color: C.ink }}>{it.description}</Text>
        {it.detail ? <Text style={{ fontFamily: "Plex", fontSize: 7.4, color: C.mute, marginTop: 2 }}>{it.detail}</Text> : null}
        {showVat && (it.vat_rate ?? 20) !== 20 ? (
          <Text style={{ fontSize: 7, color: C.faint, marginTop: 1 }}>VAT @ {it.vat_rate ?? 0}%</Text>
        ) : null}
      </View>
      <Text style={{ width: `${COL.qty * 100}%`, textAlign: "right", fontFamily: "Plex", fontSize: 8.8 }}>
        {Number.isInteger(it.qty) ? it.qty : it.qty.toFixed(2)}
      </Text>
      <Text style={{ width: `${COL.unit * 100}%`, textAlign: "right", fontFamily: "Plex", fontSize: 8.8, color: C.mute }}>
        {gbp(it.unit_pence, cur)}
      </Text>
      <Text style={{ width: `${COL.amt * 100}%`, textAlign: "right", fontFamily: "Plex", fontWeight: 600, fontSize: 9 }}>
        {gbp(lineNet(it), cur)}
      </Text>
    </View>
  );
  let n = 0;
  return (
    <View>
      <SectionHead>{m.doc_type === "credit_note" ? "Credited items" : "Itemised breakdown"}</SectionHead>
      <View style={{ flexDirection: "row", paddingBottom: 5, paddingHorizontal: 6, borderBottomWidth: 1.2, borderBottomColor: C.ink }}>
        {head("Description", COL.desc)}
        {head("Qty", COL.qty, true)}
        {head("Unit price", COL.unit, true)}
        {head("Amount", COL.amt, true)}
      </View>
      {grouped
        ? used.map((k) => (
            <View key={k}>
              <View wrap={false} style={{ backgroundColor: C.wash, paddingVertical: 4, paddingHorizontal: 6 }} minPresenceAhead={30}>
                <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 7.4, color: C.ink2, letterSpacing: 0.8 }}>
                  {KIND_LABEL[k].toUpperCase()}
                </Text>
              </View>
              {c.items.filter((i) => i.kind === k).map((it) => row(it, n++))}
            </View>
          ))
        : c.items.map((it, i) => row(it, i))}
      {c.items.length === 0 ? (
        <Text style={{ ...s.muted, textAlign: "center", paddingVertical: 14 }}>No items</Text>
      ) : null}
    </View>
  );
}

function methodLabel(v: string): string {
  return PAYMENT_METHODS.find((p) => p.value === v)?.label ?? v;
}

function TotalsBlock({ m }: { m: PdfModel }) {
  const c = m.content;
  const t = m.totals;
  const cur = c.currency;
  const balance = Math.max(t.total_pence - m.paid_pence - m.credited_pence, 0);
  const line = (k: string, v: string, opts: { color?: string; strong?: boolean } = {}) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ fontSize: 8.8, color: opts.color ?? C.mute, fontWeight: opts.strong ? 600 : 400 }}>{k}</Text>
      <Text style={{ fontFamily: "Plex", fontSize: 8.8, color: opts.color ?? C.text, fontWeight: opts.strong ? 600 : 400 }}>{v}</Text>
    </View>
  );
  const receipt = isReceipt(m);
  const totalLabel = m.doc_type === "quote" ? "Total estimate" : m.doc_type === "credit_note" ? "Credit total" : "Total";
  const registered = c.business.vat_registered && c.vat_mode !== "none";

  return (
    <View wrap={false} style={{ flexDirection: "row", marginTop: 12 }}>
      <View style={{ flex: 1, paddingRight: 22 }}>
        <PaymentSide m={m} />
      </View>
      <View style={{ width: 224 }}>
        {line("Subtotal", gbp(t.subtotal_pence, cur))}
        {t.discount_pence > 0 ? line(c.discount_label || "Discount", `-${gbp(t.discount_pence, cur)}`, { color: C.amber }) : null}
        {registered
          ? t.vat_buckets.filter((b) => b.rate > 0 || t.vat_buckets.length === 1).map((b) => (
              <View key={b.rate}>{line(`VAT @ ${b.rate}% on ${gbp(b.net_pence, cur)}`, gbp(b.vat_pence, cur))}</View>
            ))
          : line(vatLabel(c, t), "—", { color: C.faint })}
        <View
          style={{
            marginTop: 5,
            backgroundColor: C.ink,
            paddingHorizontal: 10,
            paddingVertical: 9,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 9.5, color: C.white, letterSpacing: 0.4 }}>
            {totalLabel}
          </Text>
          <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 15, color: C.signal }}>{gbp(t.total_pence, cur)}</Text>
        </View>
        {m.doc_type !== "quote" && m.doc_type !== "credit_note" && m.paid_pence > 0
          ? line(receipt ? "Amount received" : "Paid to date", `-${gbp(m.paid_pence, cur)}`, { color: C.green })
          : null}
        {m.credited_pence > 0 ? line("Credit notes", `-${gbp(m.credited_pence, cur)}`, { color: C.green }) : null}
        {m.doc_type === "invoice" || m.doc_type === "receipt" ? (
          <View
            style={{
              marginTop: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: balance === 0 ? C.greenSoft : C.signalSoft,
              borderLeftWidth: 3,
              borderLeftColor: balance === 0 ? C.green : C.signal,
            }}
          >
            <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 9, color: balance === 0 ? C.green : C.ink }}>
              {balance === 0 ? "Balance" : receipt ? "Balance outstanding" : "Balance due"}
            </Text>
            <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 13, color: balance === 0 ? C.green : C.ink }}>
              {gbp(balance, cur)}
            </Text>
          </View>
        ) : null}
        {c.currency !== "GBP" ? (
          <Text style={{ ...s.muted, fontSize: 7.2, marginTop: 5, textAlign: "right" }}>
            Amounts in {c.currency}. Reference rate: 1 {c.currency} = £{c.fx_rate}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PaymentSide({ m }: { m: PdfModel }) {
  const c = m.content;
  const b = c.business.bank;
  const hasBank = b.account_number && b.sort_code;
  const showPay = (m.doc_type === "invoice" && m.mode === "document" && m.state !== "paid" && m.lifecycle !== "void") || false;
  return (
    <View>
      {m.payments.length > 0 && m.doc_type !== "quote" ? (
        <View style={{ marginBottom: showPay ? 10 : 0 }}>
          <Text style={{ ...s.label, marginBottom: 5 }}>Payments received</Text>
          {m.payments.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              <Text style={{ fontSize: 8.4 }}>
                {d(p.paid_at)}  ·  {methodLabel(p.method)}
                {p.reference ? `  ·  ${p.reference}` : ""}
              </Text>
              <Text style={{ fontFamily: "Plex", fontSize: 8.4 }}>{gbp(p.amount_pence, c.currency)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {showPay ? (
        <View style={{ borderWidth: 0.8, borderColor: C.line, backgroundColor: C.wash, padding: 10 }}>
          <Text style={s.label}>How to pay</Text>
          {hasBank ? (
            <View style={{ marginTop: 5 }}>
              <PayRow k="Account name" v={b.account_name} />
              <PayRow k="Sort code" v={b.sort_code} mono />
              <PayRow k="Account no." v={b.account_number} mono />
              {m.number ? <PayRow k="Reference" v={m.number} mono /> : null}
            </View>
          ) : (
            <Text style={{ ...s.muted, marginTop: 5 }}>Please contact us to arrange payment.</Text>
          )}
          {c.payment_note ? <Text style={{ ...s.muted, fontSize: 7.6, marginTop: 6 }}>{c.payment_note}</Text> : null}
        </View>
      ) : null}
      {m.payments.length === 0 && !showPay && m.doc_type === "quote" ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: C.signal, backgroundColor: C.wash, padding: 10 }}>
          <Text style={s.label}>Accepting this quote</Text>
          <Text style={{ ...s.muted, marginTop: 4 }}>
            Reply to confirm, or accept online using the link/QR on the last page. Work is only booked in once you
            accept. Prices are an estimate until the vehicle has been inspected.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PayRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
      <Text style={{ width: 70, fontSize: 8, color: C.mute }}>{k}</Text>
      <Text style={{ fontFamily: mono ? "Plex" : "Grotesk", fontWeight: 600, fontSize: 8.8, color: C.ink }}>{v}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Detail sections
// ---------------------------------------------------------------------------

function Warranty({ m }: { m: PdfModel }) {
  const w = m.content.warranty;
  if (!m.content.options.show_warranty) return null;
  const ex = w.exclusions.filter((e) => e.trim());
  if (!w.parts && !w.labour && ex.length === 0) return null;
  const Box = ({ k, v }: { k: string; v: string }) => (
    <View style={{ flex: 1, padding: 11, backgroundColor: C.white, borderWidth: 0.8, borderColor: "#ecdca3" }}>
      <Text style={s.label}>{k}</Text>
      <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 11, color: C.ink, marginTop: 5, lineHeight: 1.25 }}>{v}</Text>
    </View>
  );
  return (
    <View wrap={false}>
      <SectionHead>{m.doc_type === "quote" ? "Proposed warranty" : "Your warranty"}</SectionHead>
      <View style={{ backgroundColor: C.signalSoft, borderLeftWidth: 3.5, borderLeftColor: C.signal, padding: 10 }}>
        <View style={{ flexDirection: "row" }}>
          {w.parts ? <Box k="Parts" v={w.parts} /> : null}
          {w.parts && w.labour ? <View style={{ width: 8 }} /> : null}
          {w.labour ? <Box k="Labour" v={w.labour} /> : null}
        </View>
        {ex.length > 0 ? (
          <View style={{ marginTop: 9 }}>
            <Text style={s.label}>Not covered</Text>
            {ex.map((e, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", marginTop: 3.5 }}>
                <Cross />
                <Text style={{ fontSize: 8.4, color: "#4a4741", marginLeft: 6 }}>{e}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ fontSize: 7.4, color: C.mute, marginTop: 9, paddingTop: 7, borderTopWidth: 0.6, borderTopColor: "#ecdca3" }}>
          Warranty covers defects in parts or workmanship only. It does not cover misuse, wear and tear, or unrelated faults.
        </Text>
      </View>
    </View>
  );
}

function Notes({ m }: { m: PdfModel }) {
  const c = m.content;
  if (!c.engineer_notes && !c.condition_on_arrival) return null;
  return (
    <View>
      <SectionHead>Engineer&apos;s report</SectionHead>
      <View style={{ flexDirection: "row" }}>
        {c.condition_on_arrival ? (
          <View style={{ flex: 1, backgroundColor: C.wash, borderLeftWidth: 3, borderLeftColor: "#c9c5ba", padding: 10, marginRight: c.engineer_notes ? 8 : 0 }} wrap={false}>
            <Text style={s.label}>Condition on arrival</Text>
            <Text style={{ ...s.body, marginTop: 4 }}>{c.condition_on_arrival}</Text>
          </View>
        ) : null}
        {c.engineer_notes ? (
          <View style={{ flex: 1, backgroundColor: C.wash, borderLeftWidth: 3, borderLeftColor: "#c9c5ba", padding: 10 }} wrap={false}>
            <Text style={s.label}>Work notes</Text>
            <Text style={{ ...s.body, marginTop: 4 }}>{c.engineer_notes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const SEV = {
  urgent: { label: "Urgent", fg: C.red, bg: C.redSoft },
  soon: { label: "Advised", fg: C.amber, bg: C.amberSoft },
  monitor: { label: "Monitor", fg: C.blue, bg: C.blueSoft },
} as const;

function Photo({ p, m, w, h }: { p: DocPhoto; m: PdfModel; w: number | string; h: number }) {
  const src = m.assets.images[p.url];
  return (
    <View style={{ width: w }}>
      {src ? (
        <Image src={src} style={{ width: "100%", height: h, objectFit: "cover", borderRadius: 2 }} />
      ) : (
        <View style={{ width: "100%", height: h, backgroundColor: C.wash, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ ...s.muted, fontSize: 7 }}>Photo unavailable</Text>
        </View>
      )}
      {p.caption ? <Text style={{ fontSize: 7.2, color: C.mute, marginTop: 3 }}>{p.caption}</Text> : null}
    </View>
  );
}

function AdvisoryCard({ a, m }: { a: Advisory; m: PdfModel }) {
  const sev = SEV[a.severity];
  return (
    <View wrap={false} style={{ flexDirection: "row", marginBottom: 8, borderWidth: 0.8, borderColor: C.line }}>
      <View style={{ width: 4, backgroundColor: sev.fg }} />
      <View style={{ flex: 1, padding: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ ...s.h2, flex: 1, paddingRight: 8 }}>{a.title}</Text>
          <View style={{ backgroundColor: sev.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5 }}>
            <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 6.6, letterSpacing: 1.1, color: sev.fg }}>
              {sev.label.toUpperCase()}
            </Text>
          </View>
        </View>
        {a.detail ? <Text style={{ ...s.body, color: "#3d3b36", marginTop: 4 }}>{a.detail}</Text> : null}
        {a.declined ? (
          <Text style={{ fontSize: 7.8, color: C.mute, marginTop: 5, fontWeight: 500 }}>
            Recommended to the customer on the day. Customer chose not to proceed{a.declined_at ? ` (${d(a.declined_at)})` : ""}.
          </Text>
        ) : null}
        {a.photos.length > 0 ? (
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            {a.photos.slice(0, 3).map((p, i) => (
              <View key={p.id} style={{ marginRight: i < 2 ? 6 : 0 }}>
                <Photo p={p} m={m} w={(PAGE_W - MX * 2 - 4 - 20 - 12) / 3} h={76} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Advisories({ m }: { m: PdfModel }) {
  const list = m.content.advisories.filter((a) => a.title.trim());
  if (m.doc_type === "credit_note") return null;
  if (list.length === 0) return null;
  const order = { urgent: 0, soon: 1, monitor: 2 } as const;
  const sorted = [...list].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <View>
      <SectionHead note="Vehicle health check">Advisories &amp; recommendations</SectionHead>
      {sorted.map((a) => (
        <AdvisoryCard key={a.id} a={a} m={m} />
      ))}
    </View>
  );
}

function Gallery({ m }: { m: PdfModel }) {
  const g = m.content.gallery;
  if (g.length === 0) return null;
  const w = (PAGE_W - MX * 2 - 16) / 3;
  const rows: DocPhoto[][] = [];
  for (let i = 0; i < g.length; i += 3) rows.push(g.slice(i, i + 3));
  return (
    <View>
      <SectionHead>Photos from the job</SectionHead>
      {rows.map((r, ri) => (
        <View key={ri} wrap={false} style={{ flexDirection: "row", marginBottom: 8 }}>
          {r.map((p, i) => (
            <View key={p.id} style={{ marginRight: i < 2 ? 8 : 0 }}>
              <Photo p={p} m={m} w={w} h={96} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Signoff({ m }: { m: PdfModel }) {
  const so = m.content.signoff;
  if (!so) return null;
  return (
    <View wrap={false}>
      <SectionHead>Customer sign-off</SectionHead>
      <View style={{ flexDirection: "row", borderWidth: 0.8, borderColor: C.line, padding: 12 }}>
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Text style={s.muted}>{so.statement}</Text>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <View style={{ marginRight: 24 }}>
              <Text style={s.label}>Signed by</Text>
              <Text style={{ ...s.h2, marginTop: 3 }}>{so.name}</Text>
            </View>
            <View>
              <Text style={s.label}>Date &amp; time</Text>
              <Text style={{ ...s.body, marginTop: 4 }}>{d(so.signed_at, "dd MMM yyyy, HH:mm")}</Text>
            </View>
          </View>
        </View>
        <View style={{ width: 170, borderBottomWidth: 1, borderBottomColor: C.ink, justifyContent: "flex-end", height: 62 }}>
          {so.signature ? <Image src={so.signature} style={{ width: 170, height: 60, objectFit: "contain" }} /> : null}
        </View>
      </View>
    </View>
  );
}

function Amendment({ m }: { m: PdfModel }) {
  if (m.revision <= 1 || m.lifecycle === "draft") return null;
  return (
    <View wrap={false} style={{ marginTop: 14, borderLeftWidth: 3, borderLeftColor: C.signal, backgroundColor: C.ink, padding: 10 }}>
      <Text style={{ ...s.label, color: C.signal }}>Amended document · Revision {m.revision}</Text>
      <Text style={{ fontSize: 8.4, color: "#d8d5cc", marginTop: 4 }}>
        This document replaces any earlier version with the same number.
        {m.content.amendment_note ? ` ${m.content.amendment_note}` : ""}
      </Text>
    </View>
  );
}

function Terms({ m }: { m: PdfModel }) {
  const c = m.content;
  const show = c.options.show_legal && (c.terms_text || c.statutory_note || c.footer_note);
  if (!show) return null;
  return (
    <View wrap={false}>
      <SectionHead>{m.doc_type === "quote" ? "Terms of this quotation" : "Terms & notices"}</SectionHead>
      {c.terms_text ? <Text style={{ fontSize: 7.6, color: C.mute, lineHeight: 1.55 }}>{c.terms_text}</Text> : null}
      {c.statutory_note ? <Text style={{ fontSize: 7.6, color: C.mute, lineHeight: 1.55, marginTop: 4 }}>{c.statutory_note}</Text> : null}
      {c.footer_note ? <Text style={{ fontSize: 7.6, color: C.mute, lineHeight: 1.55, marginTop: 4 }}>{c.footer_note}</Text> : null}
    </View>
  );
}

function Closing({ m }: { m: PdfModel }) {
  const c = m.content;
  const b = c.business;
  const wantsReview = c.options.show_review && b.review_url && m.doc_type !== "quote" && m.doc_type !== "credit_note";
  const wantsShare = c.options.show_qr && m.assets.qrShare;
  return (
    <View wrap={false} style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.wash, padding: 11 }}>
        <View style={{ flex: 1, paddingRight: 14 }}>
          <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 13, color: C.ink }}>
            Thank you for choosing {b.trading_name}.
          </Text>
          <Text style={{ ...s.muted, marginTop: 4 }}>
            {wantsReview
              ? "If we looked after you, a quick Google review helps other drivers find an honest mobile mechanic."
              : m.doc_type === "quote"
                ? "We'd be glad to look after your vehicle. Questions about this quote? Call or message us any time."
                : "Questions about this document? Call or message us any time."}
          </Text>
          <Text style={{ fontFamily: "Outfit", fontWeight: 500, fontSize: 8.6, color: C.ink, marginTop: 8 }}>
            {b.tagline}
          </Text>
        </View>
        {wantsReview && m.assets.qrReview ? (
          <View style={{ alignItems: "center", marginRight: wantsShare ? 14 : 0 }}>
            <Image src={m.assets.qrReview} style={{ width: 54, height: 54 }} />
            <Text style={{ ...s.label, fontSize: 6, marginTop: 4 }}>Leave a review</Text>
          </View>
        ) : null}
        {wantsShare ? (
          <View style={{ alignItems: "center" }}>
            <Image src={m.assets.qrShare!} style={{ width: 54, height: 54 }} />
            <Text style={{ ...s.label, fontSize: 6, marginTop: 4 }}>
              {m.doc_type === "quote" ? "View & accept online" : "View online"}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export function DocumentPdf({ model: m }: { model: PdfModel }) {
  const b = m.content.business;
  const title = `${titleFor(m)} ${m.number ?? "DRAFT"} — ${b.trading_name}`;
  return (
    <Document title={title} author={b.legal_name} subject={m.content.job.title} creator="FixNow Billing" producer="FixNow Billing">
      <Page size="A4" style={s.page}>
        <Watermark m={m} />
        <RunningHeader m={m} />
        <Header m={m} />
        <Facts m={m} />
        <Parties m={m} />
        <WorkBlock m={m} />
        <ItemsTable m={m} />
        <TotalsBlock m={m} />
        <Amendment m={m} />
        <Warranty m={m} />
        <Notes m={m} />
        <Advisories m={m} />
        <Gallery m={m} />
        <Signoff m={m} />
        <Terms m={m} />
        <Closing m={m} />
        <Footer m={m} />
      </Page>
    </Document>
  );
}

export { Tick };
