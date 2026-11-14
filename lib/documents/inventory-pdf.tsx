import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { groupOrderRowsBySupplier, inventoryPdfFileName, mergeReportLines, type InventoryOrderRow } from "@/lib/inventory-utils";
import type { InventoryReport, InventorySupplier } from "@/lib/types";
import { SHEET_FOOTER } from "@/lib/documents/reservations-view";

// Report di giacenza in PDF: stessa impostazione tipografica del preventivo (lib/documents/quote-pdf.tsx).
// Nessuna intestazione del Casale: la prima pagina apre con il titolo del report e la data.
// Un blocco per fornitore (solo quelli con prodotti); ogni prodotto appare una volta, con giacenza e da ordinare.
// Con un fornitore (lista d'ordine) il PDF contiene solo il suo blocco. Il nome del fornitore è quello dello snapshot del report.

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
  cellUnit: { width: 80, fontSize: 9.5 },
  cellStock: { width: 80, textAlign: "right", fontSize: 9.5 },
  cellToOrder: { width: 90, textAlign: "right", fontSize: 9.5 },
  empty: { fontSize: 9.5, color: COLOR.slate, fontFamily: FONT.serifItalic },
  bodyText: { fontSize: 9.5, color: COLOR.ink },
  footer: {
    position: "absolute",
    // top e non bottom: con lineHeight sulla pagina, react-pdf 4.9 non disegna un footer fisso ancorato in basso
    // che contiene il numero di pagina. A4 = 841,89 pt: il bordo inferiore resta a circa 22 pt dal fondo.
    top: 803,
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
  /** Giacenza formattata, "—" se non indicata. */
  stock: string;
  /** Da ordinare formattata, "—" se non indicata. */
  toOrder: string;
}

export interface InventoryPdfSection {
  supplierId: string;
  /** Nome del fornitore come era nel report (snapshot). */
  label: string;
  rows: InventoryPdfRow[];
}

export interface InventoryPdfModel {
  title: string;
  /** Nome del file scaricato (completo o della lista d'ordine di un fornitore). */
  fileName: string;
  reportDate: string;
  createdBy: string;
  sentAt: string;
  notes: string | null;
  /** Sezioni per fornitore (solo quelle con prodotti). */
  sections: InventoryPdfSection[];
}

export interface InventoryPdfOptions {
  /** Esporta solo i prodotti di questo fornitore (lista d'ordine). Se il report non ne ha righe, il titolo usa il suo nome attuale. */
  supplier?: InventorySupplier;
  /** Elenco fornitori (ordine di visualizzazione dei blocchi). Senza, i blocchi seguono l'ordine dei nomi. */
  suppliers?: InventorySupplier[];
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const formatQuantity = (n: number | null): string =>
  n === null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 3 });

function toRow(row: InventoryOrderRow): InventoryPdfRow {
  return {
    name: row.name,
    unit: row.unit ?? "",
    stock: formatQuantity(row.stock),
    toOrder: formatQuantity(row.to_order),
  };
}

/** Dati del report pronti per il PDF (puro: testo già formattato in italiano). */
export function buildInventoryPdfModel(report: InventoryReport, opts: InventoryPdfOptions = {}): InventoryPdfModel {
  const [y, m, d] = report.report_date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const rows = mergeReportLines(report.lines);
  const scoped = opts.supplier ? rows.filter((r) => r.supplier_id === opts.supplier?.id) : rows;
  const sections = groupOrderRowsBySupplier(scoped, opts.suppliers ?? []).map((g) => ({
    supplierId: g.key,
    label: g.label,
    rows: g.items.map(toRow),
  }));
  // Lista d'ordine: il nome è quello dello snapshot del report; senza righe, il nome attuale del fornitore.
  const supplierName = opts.supplier ? (sections[0]?.label ?? opts.supplier.name) : null;
  return {
    title: supplierName ? `Ordine ${supplierName}` : "Giacenza",
    fileName: inventoryPdfFileName(report.report_date, supplierName),
    reportDate: capitalize(format(day, "EEEE d MMMM yyyy", { locale: it })),
    createdBy: report.created_by_name || "—",
    sentAt: report.created_at
      ? capitalize(format(new Date(report.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it }))
      : "",
    notes: report.notes,
    sections,
  };
}

function SupplierTable({ rows }: { rows: InventoryPdfRow[] }) {
  return (
    <View>
      <View style={styles.tableHead}>
        <Text style={[styles.tableHeadText, styles.cellName]}>Articolo</Text>
        <Text style={[styles.tableHeadText, styles.cellUnit]}>Unità</Text>
        <Text style={[styles.tableHeadText, styles.cellStock]}>Giacenza</Text>
        <Text style={[styles.tableHeadText, styles.cellToOrder]}>Da ordinare</Text>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          <Text style={styles.cellName}>{row.name}</Text>
          <Text style={styles.cellUnit}>{row.unit}</Text>
          <Text style={styles.cellStock}>{row.stock}</Text>
          <Text style={styles.cellToOrder}>{row.toOrder}</Text>
        </View>
      ))}
    </View>
  );
}

function InventoryDocument({ model }: { model: InventoryPdfModel }) {
  return (
    <Document title={`${model.title} ${model.reportDate}`} author="Casale del Notaio" creator="Casale del Notaio">
      <Page size="A4" style={styles.page}>
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

        {model.sections.length === 0 ? (
          <Text style={styles.empty}>Nessun prodotto.</Text>
        ) : (
          model.sections.map((section) => (
            <View key={section.supplierId} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.label}</Text>
              <SupplierTable rows={section.rows} />
            </View>
          ))
        )}

        {model.notes ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.eyebrow}>Note</Text>
            <Text style={styles.bodyText}>{model.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{SHEET_FOOTER}</Text>
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
  return renderToBuffer(<InventoryDocument model={model} />);
}
