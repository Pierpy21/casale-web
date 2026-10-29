import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ReservationSheet } from "@/lib/types";
import { buildReservationSheetView, type ReservationPdfRow, type ReservationSheetView } from "@/lib/documents/reservations-view";

// Foglio prenotazioni del giorno in PDF: stessa impostazione tipografica del preventivo e del report di giacenza.
// Una tabella: Nome | Sala | Tavolo | Orario | Cellulare. I valori mancanti diventano "—".

const COLOR = {
  ink: "#1C2B2D",
  petrol: "#355A63",
  slate: "#5A6668",
  bronze: "#8B6B4A",
  line: "#D5D5B7",
  paper: "#FFFFFF",
} as const;

const FONT = {
  sans: "Helvetica",
  sansBold: "Helvetica-Bold",
  serif: "Times-Roman",
  serifItalic: "Times-Italic",
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT.sans,
    fontSize: 10,
    color: COLOR.ink,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: COLOR.paper,
    lineHeight: 1.35,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexGrow: 1, paddingRight: 16 },
  issuerName: { fontFamily: FONT.serif, fontSize: 20, lineHeight: 1.2, color: COLOR.ink, marginBottom: 6 },
  issuerTagline: { fontFamily: FONT.serifItalic, fontSize: 9.5, lineHeight: 1.3, color: COLOR.petrol, marginBottom: 8 },
  issuerText: { fontSize: 8.5, color: COLOR.slate, marginBottom: 1 },
  logo: { width: 150, height: 50 },
  rule: { height: 0.75, backgroundColor: COLOR.line, marginTop: 14, marginBottom: 14 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 },
  docTitle: { fontFamily: FONT.serif, fontSize: 22, lineHeight: 1.25, color: COLOR.ink, marginBottom: 4 },
  docSubtitle: { fontFamily: FONT.serifItalic, fontSize: 13, lineHeight: 1.3, color: COLOR.petrol },
  metaText: { fontSize: 9, color: COLOR.slate, marginBottom: 1, textAlign: "right" },
  tableHead: { flexDirection: "row", borderBottomWidth: 0.9, borderBottomColor: COLOR.ink, paddingVertical: 5 },
  tableHeadText: { fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.ink, textTransform: "uppercase", letterSpacing: 0.8 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOR.line, paddingVertical: 6 },
  cellName: { flexGrow: 4, paddingRight: 8, fontSize: 9.5 },
  cellRoom: { width: 110, paddingRight: 8, fontSize: 9.5 },
  cellTable: { width: 60, textAlign: "center", fontSize: 9.5, fontFamily: FONT.sansBold },
  cellTime: { width: 55, textAlign: "center", fontSize: 9.5 },
  cellPhone: { width: 100, paddingLeft: 8, fontSize: 9.5 },
  empty: { fontSize: 9.5, color: COLOR.slate, fontFamily: FONT.serifItalic, marginTop: 8 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: COLOR.line,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: COLOR.slate },
});

let logoCache: Promise<Buffer> | null = null;

function loadLogo(): Promise<Buffer> {
  if (!logoCache) {
    logoCache = readFile(path.join(process.cwd(), "public", "logo-dark.png"));
  }
  return logoCache;
}

function ReservationsTable({ rows }: { rows: ReservationPdfRow[] }) {
  return (
    <View>
      <View style={styles.tableHead} fixed>
        <Text style={[styles.cellName, styles.tableHeadText]}>Nome</Text>
        <Text style={[styles.cellRoom, styles.tableHeadText]}>Sala</Text>
        <Text style={[styles.tableHeadText, { width: 60, textAlign: "center" }]}>Tavolo</Text>
        <Text style={[styles.tableHeadText, { width: 55, textAlign: "center" }]}>Orario</Text>
        <Text style={[styles.cellPhone, styles.tableHeadText]}>Cellulare</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          <Text style={styles.cellName}>{row.name}</Text>
          <Text style={styles.cellRoom}>{row.room}</Text>
          <Text style={styles.cellTable}>{row.table}</Text>
          <Text style={styles.cellTime}>{row.time}</Text>
          <Text style={styles.cellPhone}>{row.phone}</Text>
        </View>
      ))}
    </View>
  );
}

function ReservationsDocument({ view, logo }: { view: ReservationSheetView; logo: Buffer }) {
  return (
    <Document title={`${view.title} ${view.dateLong}`} author="Casale del Notaio" creator="Casale del Notaio">
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.issuerName}>Casale del Notaio</Text>
            <Text style={styles.issuerTagline}>Del gusto il Teatro.</Text>
            <Text style={styles.issuerText}>Via Nicolosi 67, 95032 Belpasso (CT)</Text>
            <Text style={styles.issuerText}>+39 340 109 0100 · info@casaledelnotaio.it</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image non supporta la prop alt */}
          <Image src={logo} style={styles.logo} />
        </View>
        <View style={styles.rule} />

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>{view.title}</Text>
            <Text style={styles.docSubtitle}>{view.dateLong}</Text>
          </View>
          <View>
            <Text style={styles.metaText}>{view.countLabel}</Text>
          </View>
        </View>

        {view.rows.length === 0 ? (
          <Text style={styles.empty}>Nessuna prenotazione</Text>
        ) : (
          <ReservationsTable rows={view.rows} />
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Casale del Notaio · Via Nicolosi 67, Belpasso (CT)</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Renderizza il foglio prenotazioni del giorno in un PDF A4 (Buffer). */
export async function renderReservationsPdf(sheet: ReservationSheet): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<ReservationsDocument view={buildReservationSheetView(sheet)} logo={logo} />);
}
