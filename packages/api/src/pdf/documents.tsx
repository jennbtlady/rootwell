import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { statementIntro, type AckDocument, type OrgLetterhead, type StatementDonor } from "@maple/core/pdf-types";

// Never split words across lines: hyphenated amounts and legal wording read badly on paper.
Font.registerHyphenationCallback((word) => [word]);

// Letter-size pages with a 1-inch margin, Helvetica, Paste's text color.
const s = StyleSheet.create({
  page: { paddingTop: 72, paddingBottom: 72, paddingHorizontal: 72, fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.45, color: "#121c2d" },
  orgName: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  orgLine: { fontSize: 9, color: "#606b85" },
  header: { marginBottom: 28, borderBottomWidth: 1, borderBottomColor: "#e1e3ea", paddingBottom: 10 },
  date: { marginBottom: 18 },
  address: { marginBottom: 24 },
  para: { marginBottom: 10 },
  signature: { marginTop: 16 },
  h1: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 6 },
  table: { marginTop: 12, marginBottom: 12 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e1e3ea", paddingVertical: 4 },
  head: { fontFamily: "Helvetica-Bold" },
  cDate: { width: "22%" },
  cFund: { width: "34%" },
  cAmt: { width: "22%", textAlign: "right" },
  total: { flexDirection: "row", paddingVertical: 6, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 9, color: "#606b85", marginTop: 14 },
});

const money = (v: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v));
const shortDate = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const longToday = () => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date());

function Letterhead({ org }: { org: OrgLetterhead }) {
  return (
    <View style={s.header} fixed>
      <Text style={s.orgName}>{org.name}</Text>
      {org.address ? <Text style={s.orgLine}>{org.address}</Text> : null}
      {org.ein ? <Text style={s.orgLine}>EIN {org.ein}</Text> : null}
    </View>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <Text key={i} style={s.para}>
          {p}
        </Text>
      ))}
    </>
  );
}

/** One page per gift, ready to fold into a window envelope. */
export function renderLetters(org: OrgLetterhead, docs: AckDocument[]): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Thank-you letters, ${org.name}`} author={org.name}>
      {docs.map((d) => (
        <Page key={d.giftId} size="LETTER" style={s.page}>
          <Letterhead org={org} />
          <Text style={s.date}>{longToday()}</Text>
          <View style={s.address}>
            <Text>{d.to.name}</Text>
            {d.to.addressLines.map((l) => (
              <Text key={l}>{l}</Text>
            ))}
          </View>
          <Paragraphs text={d.body} />
          {d.signature ? <Text style={s.signature}>{d.signature}</Text> : null}
        </Page>
      ))}
    </Document>,
  );
}

/** One statement per donor for a tax year, with the deductible amount per gift. */
export function renderStatements(org: OrgLetterhead, year: number, donors: StatementDonor[]): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`${year} giving statements, ${org.name}`} author={org.name}>
      {donors.map((d) => (
        <Page key={d.constituentId} size="LETTER" style={s.page}>
          <Letterhead org={org} />
          <Text style={s.date}>{longToday()}</Text>
          <View style={s.address}>
            <Text>{d.name}</Text>
            {d.addressLines.map((l) => (
              <Text key={l}>{l}</Text>
            ))}
          </View>
          <Text style={s.h1}>
            {year} giving statement for {d.name}
          </Text>
          <Text style={s.para}>{statementIntro(year, org.name)}</Text>
          <View style={s.table}>
            <View style={[s.row, s.head]}>
              <Text style={s.cDate}>Date</Text>
              <Text style={s.cFund}>Fund</Text>
              <Text style={s.cAmt}>Amount</Text>
              <Text style={s.cAmt}>Deductible</Text>
            </View>
            {d.gifts.map((g, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={s.cDate}>{shortDate(g.date)}</Text>
                <Text style={s.cFund}>{g.fund ?? ""}{Number(g.received) > 0 ? ` (goods or services received: ${money(g.received)})` : ""}</Text>
                <Text style={s.cAmt}>{money(g.amount)}</Text>
                <Text style={s.cAmt}>{money(g.deductible)}</Text>
              </View>
            ))}
            <View style={s.total}>
              <Text style={s.cDate}>Total</Text>
              <Text style={s.cFund}>{d.gifts.length} gift{d.gifts.length === 1 ? "" : "s"}</Text>
              <Text style={s.cAmt}>{money(d.total)}</Text>
              <Text style={s.cAmt}>{money(d.deductibleTotal)}</Text>
            </View>
          </View>
          <Text style={s.para}>
            {org.name} is a tax-exempt organization under section 501(c)(3) of the Internal Revenue Code{org.ein ? `, EIN ${org.ein}` : ""}. Please keep this statement for your tax records.
          </Text>
          <Text style={s.small}>Questions about this statement? Reply to the email it came with or call us.</Text>
        </Page>
      ))}
    </Document>,
  );
}
