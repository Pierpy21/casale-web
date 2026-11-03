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
import type { EventSheet } from "@/lib/types";
import { buildEventSheetView, type EventBlockView, type EventFieldView, type EventSheetView } from "@/lib/documents/events-view";

// Foglio eventi del giorno in PDF: stessa impostazione tipografica del foglio prenotazioni (reservations-pdf.tsx).
// Per ogni banchetto una scheda: intestazione (pasto, nome) e voci etichetta/valore. I valori mancanti diventano "—".

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
  sectionLabel: {
    fontFamily: FONT.sansBold,
    fontSize: 8,
    color: COLOR.ink,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.9,
    borderBottomColor: COLOR.ink,
    paddingVertical: 5,
    marginBottom: 6,
  },
  summaryRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOR.line, paddingVertical: 5 },
  summaryLabel: { width: 110, fontSize: 8, color: COLOR.bronze, fontFamily: FONT.sansBold, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1 },
  summaryValue: { flexGrow: 1, fontSize: 9.5 },
  block: { marginTop: 14, borderTopWidth: 0.9, borderTopColor: COLOR.ink, paddingTop: 8 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  blockTime: { fontFamily: FONT.sansBold, fontSize: 11, width: 52, color: COLOR.petrol },
  blockHeading: { flexGrow: 1, fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.25, color: COLOR.ink, paddingRight: 10 },
  blockCovers: { fontSize: 9, color: COLOR.slate, textAlign: "right", paddingTop: 3 },
  field: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOR.line, paddingVertical: 4 },
  fieldLabel: { width: 110, fontSize: 8, color: COLOR.bronze, fontFamily: FONT.sansBold, textTransform: "uppercase", letterSpacing: 0.6, paddingTop: 1.5 },
  fieldValue: { flexGrow: 1, fontSize: 9.5 },
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

function FieldRow({ field }: { field: EventFieldView }) {
  return (
    <View style={styles.field} wrap={false}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <View style={styles.fieldValue}>
        {field.lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </View>
    </View>
  );
}

function EventBlock({ block }: { block: EventBlockView }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHead} wrap={false}>
        <Text style={styles.blockTime}>{block.meal}</Text>
        <Text style={styles.blockHeading}>{block.heading}</Text>
        <Text style={styles.blockCovers}>{block.covers}</Text>
      </View>
      {block.fields.map((field) => (
        <FieldRow key={field.label} field={field} />
      ))}
    </View>
  );
}

function EventsDocument({ view, logo }: { view: EventSheetView; logo: Buffer }) {
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

        <View>
          <Text style={styles.sectionLabel}>Riepilogo della giornata</Text>
          {view.summary.map((item) => (
            <View key={item.label} style={styles.summaryRow} wrap={false}>
              <Text style={styles.summaryLabel}>{item.label}</Text>
              <View style={styles.summaryValue}>
                {item.lines.map((line, i) => (
                  <Text key={i}>{line}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        {view.blocks.length === 0 ? (
          <Text style={styles.empty}>Nessun evento</Text>
        ) : (
          view.blocks.map((block, i) => <EventBlock key={i} block={block} />)
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

/** Renderizza il foglio eventi del giorno in un PDF A4 (Buffer). */
export async function renderEventsPdf(sheet: EventSheet): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<EventsDocument view={buildEventSheetView(sheet)} logo={logo} />);
}
