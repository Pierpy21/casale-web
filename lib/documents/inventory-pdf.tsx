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
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { InventoryReport, InventoryReportLine } from "@/lib/types";

// Report di giacenza in PDF: stessa impostazione tipografica del preventivo (lib/documents/quote-pdf.tsx).

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
  eyebrow: {
    fontFamily: FONT.sansBold,
    fontSize: 8,
    color: COLOR.bronze,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 },
  docTitle: { fontFamily: FONT.serif, fontSize: 22, color: COLOR.ink },
  metaText: { fontSize: 9, color: COLOR.slate, marginBottom: 1, textAlign: "right" },
  section: { marginBottom: 16 },
  sectionTitle: { fontFamily: FONT.serif, fontSize: 13, color: COLOR.ink, marginBottom: 6 },
  tableHead: { flexDirection: "row", borderBottomWidth: 0.9, borderBottomColor: COLOR.ink, paddingVertical: 5 },
  tableHeadText: { fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.ink, textTransform: "uppercase", letterSpacing: 0.8 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOR.line, paddingVertical: 6 },
  cellName: { flexGrow: 4, paddingRight: 8, fontSize: 9.5 },
  cellUnit: { width: 90, fontSize: 9.5 },
  cellQty: { width: 90, textAlign: "right", fontSize: 9.5 },
  empty: { fontSize: 9.5, color: COLOR.slate, fontFamily: FONT.serifItalic },
  bodyText: { fontSize: 9.5, color: COLOR.ink },
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

export interface InventoryPdfRow {
  name: string;
  unit: string;
  quantity: string;
}

export interface InventoryPdfModel {
  title: string;
  reportDate: string;
  createdBy: string;
  sentAt: string;
  notes: string | null;
  toOrder: InventoryPdfRow[];
  present: InventoryPdfRow[];
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function toRow(line: InventoryReportLine): InventoryPdfRow {
  return {
    name: line.product_name,
    unit: line.unit ?? "",
    quantity: line.quantity.toLocaleString("it-IT", { maximumFractionDigits: 3 }),
  };
}

/** Dati del report pronti per il PDF (puro: testo già formattato in italiano). */
export function buildInventoryPdfModel(report: InventoryReport): InventoryPdfModel {
  const [y, m, d] = report.report_date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const byName = (a: InventoryReportLine, b: InventoryReportLine) => a.product_name.localeCompare(b.product_name, "it");
  return {
    title: "Giacenza",
    reportDate: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    createdBy: report.created_by_name || "—",
    sentAt: report.created_at
      ? capitalize(format(new Date(report.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it }))
      : "",
    notes: report.notes,
    toOrder: report.lines.filter((l) => l.state === "da_ordinare").sort(byName).map(toRow),
    present: report.lines.filter((l) => l.state === "presente").sort(byName).map(toRow),
  };
}

let logoCache: Promise<Buffer> | null = null;

function loadLogo(): Promise<Buffer> {
  if (!logoCache) {
    logoCache = readFile(path.join(process.cwd(), "public", "logo-dark.png"));
  }
  return logoCache;
}

function RowsTable({ rows }: { rows: InventoryPdfRow[] }) {
  if (rows.length === 0) return <Text style={styles.empty}>Nessun prodotto.</Text>;
  return (
    <View>
      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadText, styles.cellName]}>Prodotto</Text>
        <Text style={[styles.tableHeadText, styles.cellUnit]}>Unità</Text>
        <Text style={[styles.tableHeadText, styles.cellQty]}>Quantità</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          <Text style={styles.cellName}>{row.name}</Text>
          <Text style={styles.cellUnit}>{row.unit}</Text>
          <Text style={styles.cellQty}>{row.quantity}</Text>
        </View>
      ))}
    </View>
  );
}

function InventoryDocument({ model, logo }: { model: InventoryPdfModel; logo: Buffer }) {
  return (
    <Document title={`Giacenza ${model.reportDate}`} author="Casale del Notaio" creator="Casale del Notaio">
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
            <Text style={styles.eyebrow}>{model.title}</Text>
            <Text style={styles.docTitle}>{model.reportDate}</Text>
          </View>
          <View>
            <Text style={styles.metaText}>Operatore: {model.createdBy}</Text>
            {model.sentAt ? <Text style={styles.metaText}>Inviato: {model.sentAt}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Da ordinare</Text>
          <RowsTable rows={model.toOrder} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Presente</Text>
          <RowsTable rows={model.present} />
        </View>

        {model.notes ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.eyebrow}>Note</Text>
            <Text style={styles.bodyText}>{model.notes}</Text>
          </View>
        ) : null}

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

/** Renderizza il report di giacenza in un PDF A4 (Buffer). */
export async function renderInventoryPdf(model: InventoryPdfModel): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<InventoryDocument model={model} logo={logo} />);
}
