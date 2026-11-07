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
import {
  clientFields,
  guestsLabel,
  splitCoursesInColumns,
  type QuoteDocumentCourse,
  type QuoteDocumentMenu,
  type QuoteDocumentModel,
} from "@/lib/documents/quote-model";

const COLOR = {
  ink: "#1C2B2D",
  petrol: "#355A63",
  slate: "#5A6668",
  bronze: "#8B6B4A",
  line: "#D5D5B7",
  paper: "#FFFFFF",
  zebra: "#F7F7F4",
} as const;

const FONT = {
  sans: "Helvetica",
  sansBold: "Helvetica-Bold",
  serif: "Times-Roman",
  serifBold: "Times-Bold",
  serifItalic: "Times-Italic",
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT.sans,
    fontSize: 10,
    color: COLOR.ink,
    paddingTop: 32,
    paddingBottom: 46,
    paddingHorizontal: 40,
    backgroundColor: COLOR.paper,
    lineHeight: 1.35,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexGrow: 1, paddingRight: 16 },
  // Logo in alto a sinistra, al posto del nome del Casale.
  logo: { width: 135, height: 45, marginBottom: 4 },
  issuerTagline: { fontFamily: FONT.serifItalic, fontSize: 9.5, lineHeight: 1.3, color: COLOR.petrol, marginBottom: 4 },
  issuerText: { fontSize: 8.5, color: COLOR.slate, marginBottom: 1 },
  // Dettagli evento in alto a destra, dove prima c'era il logo.
  eventBlock: { width: 250 },
  rule: { height: 0.75, backgroundColor: COLOR.line, marginTop: 10, marginBottom: 10 },
  rulePlain: { height: 0.5, backgroundColor: COLOR.line, marginTop: 6, marginBottom: 6 },
  eyebrow: {
    fontFamily: FONT.sansBold,
    fontSize: 8,
    color: COLOR.bronze,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 },
  docTitle: { fontFamily: FONT.serif, fontSize: 20, color: COLOR.ink },
  metaBlock: { alignItems: "flex-end" },
  metaText: { fontSize: 9, color: COLOR.slate, marginBottom: 1 },
  twoCols: { flexDirection: "row", gap: 24 },
  col: { flexGrow: 1, flexBasis: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "50%", paddingRight: 12 },
  kvRow: { flexDirection: "row", marginBottom: 2 },
  kvLabel: { width: 78, fontSize: 8.5, color: COLOR.slate },
  kvLabelCompact: { width: 44 },
  kvValue: { flexGrow: 1, flexShrink: 1, fontSize: 10, color: COLOR.ink },
  section: { marginBottom: 8 },
  sectionTitle: { fontFamily: FONT.serif, fontSize: 13, color: COLOR.ink },
  menuHeading: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 5 },
  menuEyebrow: { marginBottom: 0 },
  courseRow: { flexDirection: "row", marginBottom: 3 },
  courseLabel: { width: 66, fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.bronze, textTransform: "uppercase", letterSpacing: 0.8, paddingTop: 1 },
  courseDishes: { flexGrow: 1, flexShrink: 1 },
  dish: { fontSize: 9.5, lineHeight: 1.25, color: COLOR.ink, marginBottom: 1 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 0.9,
    borderBottomColor: COLOR.ink,
    paddingVertical: 3,
  },
  tableHeadText: { fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.ink, textTransform: "uppercase", letterSpacing: 0.8 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.line,
    paddingVertical: 3,
  },
  cellDescription: { flexGrow: 4, paddingRight: 8, fontSize: 9.5 },
  cellQty: { width: 50, textAlign: "right", fontSize: 9.5 },
  cellUnit: { width: 90, textAlign: "right", fontSize: 9.5 },
  cellAmount: { width: 90, textAlign: "right", fontSize: 9.5 },
  totalsWrap: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  besideTotals: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 24 },
  besideBlock: { marginBottom: 6 },
  totalsBox: { width: 230 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  totalsLabel: { fontSize: 9, color: COLOR.slate },
  totalsValue: { fontSize: 9, color: COLOR.ink },
  totalsGrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.9,
    borderTopColor: COLOR.ink,
    paddingTop: 6,
    marginTop: 4,
  },
  totalsGrandLabel: { fontFamily: FONT.sansBold, fontSize: 10, color: COLOR.ink },
  totalsGrandValue: { fontFamily: FONT.serifBold, fontSize: 14, color: COLOR.ink },
  bodyText: { fontSize: 9.5, color: COLOR.ink },
  // Due colonne: ogni voce occupa metà riga.
  allergyList: { flexDirection: "row", flexWrap: "wrap" },
  allergyItem: { width: "50%", paddingRight: 12, fontSize: 9.5, color: COLOR.ink, marginBottom: 1 },
  signatureRow: { flexDirection: "row", gap: 40, marginTop: 8 },
  signatureBox: { flexGrow: 1, flexBasis: 0 },
  signatureLine: { borderBottomWidth: 0.6, borderBottomColor: COLOR.ink, height: 24, marginBottom: 4 },
  signatureLabel: { fontSize: 8.5, color: COLOR.slate },
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

function KeyValue({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={compact ? [styles.kvLabel, styles.kvLabelCompact] : styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function CourseColumn({ courses }: { courses: QuoteDocumentCourse[] }) {
  return (
    <View style={styles.col}>
      {courses.map((course) => (
        <View key={course.course} style={styles.courseRow} wrap={false}>
          <Text style={styles.courseLabel}>{course.label}</Text>
          <View style={styles.courseDishes}>
            {course.dishes.map((dish, i) => (
              <Text key={`${course.course}-${i}`} style={styles.dish}>
                {dish}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Menù su due colonne bilanciate, per stare in un unico foglio A4. */
function MenuBlock({ title, menu }: { title: string; menu: QuoteDocumentMenu }) {
  const [left, right] = splitCoursesInColumns(menu.courses);
  return (
    <View style={styles.section}>
      <View style={styles.menuHeading}>
        <Text style={[styles.eyebrow, styles.menuEyebrow]}>{title}</Text>
        {menu.name && menu.name.trim().toLowerCase() !== title.trim().toLowerCase() ? (
          <Text style={styles.sectionTitle}>{menu.name}</Text>
        ) : null}
      </View>
      <View style={styles.twoCols}>
        <CourseColumn courses={left} />
        <CourseColumn courses={right} />
      </View>
    </View>
  );
}

function QuoteDocument({ model, logo }: { model: QuoteDocumentModel; logo: Buffer }) {
  const { issuer, meta, client, event, setup, totals } = model;
  return (
    <Document title={`${model.title} ${meta.number}`} author={issuer.name} creator={issuer.name}>
      <Page size="A4" style={styles.page}>
        {/* Footer con numerazione pagine */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {issuer.name} · {issuer.addressLines.join(", ")} · {issuer.phone}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
          />
        </View>
        {/* Intestazione: logo e dati Casale a sinistra, dettagli evento in alto a destra */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image non supporta la prop alt */}
            <Image src={logo} style={styles.logo} />
            <Text style={styles.issuerTagline}>{issuer.tagline}</Text>
            <Text style={styles.issuerText}>{issuer.addressLines.join(", ")}</Text>
            <Text style={styles.issuerText}>
              {issuer.phone} · {issuer.email}
            </Text>
          </View>
          <View style={styles.eventBlock}>
            <Text style={styles.eyebrow}>Evento</Text>
            <KeyValue compact label="Data" value={event.dateLong} />
            {event.meal ? <KeyValue compact label="Pasto" value={event.meal} /> : null}
            <KeyValue compact label="Sala" value={event.room} />
            <KeyValue compact label="Ospiti" value={guestsLabel(event)} />
          </View>
        </View>
        <View style={styles.rule} />

        {/* Titolo e metadati */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.docTitle}>{model.title}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaText}>
              N. {meta.number} · Data di emissione: {meta.issuedAt}
            </Text>
            {meta.validUntil ? (
              <Text style={styles.metaText}>Valido fino al: {meta.validUntil}</Text>
            ) : null}
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Cliente</Text>
          {/* Griglia a due colonne: i campi si dispongono a coppie per riga */}
          <View style={styles.grid}>
            {clientFields(client).map(([label, value]) => (
              <View key={label} style={styles.gridCell}>
                <KeyValue label={label} value={value} />
              </View>
            ))}
          </View>
        </View>

        {/* Menù */}
        {model.menu ? <MenuBlock title="Menù" menu={model.menu} /> : null}
        {model.kidsMenu ? <MenuBlock title="Menù bambini" menu={model.kidsMenu} /> : null}

        {/* Allergie e intolleranze */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.eyebrow}>Allergie e intolleranze</Text>
          {model.allergies.length > 0 ? (
            <View style={styles.allergyList}>
              {model.allergies.map((line, i) => (
                <Text key={i} style={styles.allergyItem}>
                  • {line}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.bodyText}>Nessuna segnalata</Text>
          )}
        </View>

        {/* Righe */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Dettaglio</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadText, styles.cellDescription]}>Descrizione</Text>
            <Text style={[styles.tableHeadText, styles.cellQty]}>Qtà</Text>
            <Text style={[styles.tableHeadText, styles.cellUnit]}>Prezzo unit.</Text>
            <Text style={[styles.tableHeadText, styles.cellAmount]}>Importo</Text>
          </View>
          {model.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.cellDescription}>{line.description}</Text>
              <Text style={styles.cellQty}>{line.quantity}</Text>
              <Text style={styles.cellUnit}>{line.unitPrice}</Text>
              <Text style={styles.cellAmount}>{line.amount}</Text>
            </View>
          ))}

          {/* Allestimento e note a sinistra, totali (prezzi IVA inclusa) a destra */}
          <View style={styles.totalsWrap} wrap={false}>
            <View style={styles.besideTotals}>
              {setup.colors.length > 0 || setup.notes ? (
                <View style={styles.besideBlock}>
                  <Text style={styles.eyebrow}>Allestimento</Text>
                  {setup.colors.length > 0 ? (
                    <KeyValue label="Colori" value={setup.colors.join(", ")} />
                  ) : null}
                  {setup.notes ? <Text style={styles.bodyText}>{setup.notes}</Text> : null}
                </View>
              ) : null}
              {model.notes ? (
                <View style={styles.besideBlock}>
                  <Text style={styles.eyebrow}>Note</Text>
                  <Text style={styles.bodyText}>{model.notes}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.totalsBox}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{totals.subtotalLabel}</Text>
                <Text style={styles.totalsValue}>{totals.subtotal}</Text>
              </View>
              {totals.hasDiscount ? (
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Sconto</Text>
                  <Text style={styles.totalsValue}>- {totals.discount}</Text>
                </View>
              ) : null}
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>di cui imponibile</Text>
                <Text style={styles.totalsValue}>{totals.taxable}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>di cui IVA {totals.vatRate}</Text>
                <Text style={styles.totalsValue}>{totals.vat}</Text>
              </View>
              <View style={styles.totalsGrandRow}>
                <Text style={styles.totalsGrandLabel}>{totals.totalLabel}</Text>
                <Text style={styles.totalsGrandValue}>{totals.total}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Firme */}
        <View style={styles.section} wrap={false}>
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{model.signature.issuerLabel}</Text>
            </View>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>{model.signature.clientLabel}</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
}

/** Renderizza il modello dell'ordine di servizio in un PDF A4 (Buffer). */
export async function renderQuotePdf(model: QuoteDocumentModel): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<QuoteDocument model={model} logo={logo} />);
}
