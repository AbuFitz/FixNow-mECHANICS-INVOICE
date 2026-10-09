import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BusinessProfile, PayRun, PayslipLine } from "@/lib/types";
import { gbp } from "@/lib/money";
import { d } from "@/lib/format";
import { C } from "./DocumentPdf";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Grotesk", fontSize: 9, color: C.text },
  label: { fontFamily: "Outfit", fontWeight: 600, fontSize: 6.8, letterSpacing: 1.3, color: C.mute, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.6, borderBottomColor: C.line },
});

export function PayslipPdf({ run, line, business }: { run: PayRun; line: PayslipLine; business: BusinessProfile }) {
  const rows: [string, number, boolean?][] = [
    ["Gross pay", line.gross_pence],
    ["PAYE income tax", -line.tax_pence],
    ["Employee National Insurance", -line.employee_ni_pence],
    ...(line.pension_employee_pence ? ([["Workplace pension (employee)", -line.pension_employee_pence]] as [string, number][]) : []),
    ...(line.student_loan_pence ? ([["Student loan", -line.student_loan_pence]] as [string, number][]) : []),
  ];
  return (
    <Document title={`Payslip ${line.employee_name} ${run.period_label}`} author={business.legal_name}>
      <Page size="A4" style={s.page}>
        <View style={{ backgroundColor: C.ink, marginHorizontal: -40, marginTop: -40, padding: 28, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 20, color: C.white }}>Fix<Text style={{ color: C.signal }}>Now</Text> Mechanics</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 8, letterSpacing: 2.4, color: C.signal }}>PAYSLIP</Text>
            <Text style={{ fontFamily: "Plex", fontSize: 11, color: C.white, marginTop: 3 }}>{run.period_label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 22 }}>
          <View style={{ flex: 1 }}><Text style={s.label}>Employee</Text><Text style={{ fontFamily: "Outfit", fontWeight: 600, fontSize: 14, marginTop: 4 }}>{line.employee_name}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.label}>Pay date</Text><Text style={{ fontFamily: "Outfit", fontWeight: 500, fontSize: 11, marginTop: 4 }}>{d(run.pay_date)}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.label}>Employer</Text><Text style={{ fontSize: 10, marginTop: 4 }}>{business.legal_name}</Text></View>
        </View>
        <View style={{ marginTop: 22 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={s.row}><Text>{k}</Text><Text style={{ fontFamily: "Plex" }}>{v < 0 ? `-${gbp(-v)}` : gbp(v)}</Text></View>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: C.ink, padding: 10, marginTop: 8 }}>
            <Text style={{ fontFamily: "Outfit", fontWeight: 600, color: C.white, fontSize: 11 }}>Net pay</Text>
            <Text style={{ fontFamily: "Outfit", fontWeight: 700, color: C.signal, fontSize: 15 }}>{gbp(line.net_pence)}</Text>
          </View>
        </View>
        <Text style={{ ...s.label, marginTop: 22 }}>Employer contributions (for information)</Text>
        <View style={s.row}><Text>Employer National Insurance</Text><Text style={{ fontFamily: "Plex" }}>{gbp(line.employer_ni_pence)}</Text></View>
        {line.pension_employer_pence ? <View style={s.row}><Text>Workplace pension (employer)</Text><Text style={{ fontFamily: "Plex" }}>{gbp(line.pension_employer_pence)}</Text></View> : null}
        <Text style={{ position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7, color: C.faint }}>{business.legal_name} · Company No. {business.company_number}. Keep this payslip for your records.</Text>
      </Page>
    </Document>
  );
}
