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
import type { QuoteDocumentMenu, QuoteDocumentModel } from "@/lib/documents/quote-model";

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
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    backgroundColor: COLOR.paper,
    lineHeight: 1.35,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexGrow: 1, paddingRight: 16 },
  // lineHeight esplicito: evita che il motto in corsivo si sovrapponga al nome del Casale.
  issuerName: { fontFamily: FONT.serif, fontSize: 20, lineHeight: 1.2, color: COLOR.ink, marginBottom: 6 },
  issuerTagline: { fontFamily: FONT.serifItalic, fontSize: 9.5, lineHeight: 1.3, color: COLOR.petrol, marginBottom: 8 },
  issuerText: { fontSize: 8.5, color: COLOR.slate, marginBottom: 1 },
  logo: { width: 150, height: 50 },
  rule: { height: 0.75, backgroundColor: COLOR.line, marginTop: 14, marginBottom: 14 },
  rulePlain: { height: 0.5, backgroundColor: COLOR.line, marginTop: 6, marginBottom: 6 },
  eyebrow: {
    fontFamily: FONT.sansBold,
    fontSize: 8,
    color: COLOR.bronze,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26 },
  docTitle: { fontFamily: FONT.serif, fontSize: 22, color: COLOR.ink },
  metaBlock: { alignItems: "flex-end" },
  metaText: { fontSize: 9, color: COLOR.slate, marginBottom: 1 },
  twoCols: { flexDirection: "row", gap: 24, marginBottom: 14 },
  col: { flexGrow: 1, flexBasis: 0 },
  kvRow: { flexDirection: "row", marginBottom: 3 },
  kvLabel: { width: 78, fontSize: 8.5, color: COLOR.slate },
  kvValue: { flexGrow: 1, fontSize: 10, color: COLOR.ink },
  section: { marginBottom: 14 },
  sectionTitle: { fontFamily: FONT.serif, fontSize: 13, color: COLOR.ink, marginBottom: 6 },
  courseRow: { flexDirection: "row", marginBottom: 4 },
  courseLabel: { width: 78, fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.bronze, textTransform: "uppercase", letterSpacing: 0.8, paddingTop: 1 },
  courseDishes: { flexGrow: 1 },
  dish: { fontSize: 9.5, color: COLOR.ink, marginBottom: 1 },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 0.9,
    borderBottomColor: COLOR.ink,
    paddingVertical: 5,
  },
  tableHeadText: { fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.ink, textTransform: "uppercase", letterSpacing: 0.8 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.line,
    paddingVertical: 6,
  },
  cellDescription: { flexGrow: 4, paddingRight: 8, fontSize: 9.5 },
  cellQty: { width: 50, textAlign: "right", fontSize: 9.5 },
  cellUnit: { width: 90, textAlign: "right", fontSize: 9.5 },
  cellAmount: { width: 90, textAlign: "right", fontSize: 9.5 },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
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
  conditionText: { fontSize: 8, color: COLOR.slate, marginBottom: 2 },
  signatureRow: { flexDirection: "row", gap: 40, marginTop: 28 },
  signatureBox: { flexGrow: 1, flexBasis: 0 },
  signatureLine: { borderBottomWidth: 0.6, borderBottomColor: COLOR.ink, height: 36, marginBottom: 4 },
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

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function MenuBlock({ title, menu }: { title: string; menu: QuoteDocumentMenu }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{title}</Text>
      {menu.name ? <Text style={styles.sectionTitle}>{menu.name}</Text> : null}
      {menu.courses.map((course) => (
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

function QuoteDocument({ model, logo }: { model: QuoteDocumentModel; logo: Buffer }) {
  const { issuer, meta, client, event, setup, totals } = model;
  return (
    <Document title={`Preventivo ${meta.number}`} author={issuer.name} creator={issuer.name}>
      <Page size="A4" style={styles.page}>
        {/* Intestazione: dati Casale a sinistra, logo in alto a destra */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.issuerName}>{issuer.name}</Text>
            <Text style={styles.issuerTagline}>{issuer.tagline}</Text>
            {issuer.addressLines.map((line) => (
              <Text key={line} style={styles.issuerText}>{line}</Text>
            ))}
            <Text style={styles.issuerText}>{issuer.phone}</Text>
            <Text style={styles.issuerText}>{issuer.email}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image non supporta la prop alt */}
          <Image src={logo} style={styles.logo} />
        </View>
        <View style={styles.rule} />

        {/* Titolo e metadati */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.eyebrow}>{model.title}</Text>
            <Text style={styles.docTitle}>N. {meta.number}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaText}>Data di emissione: {meta.issuedAt}</Text>
            {meta.validUntil ? (
              <Text style={styles.metaText}>Valido fino al: {meta.validUntil}</Text>
            ) : null}
          </View>
        </View>

        {/* Cliente ed evento */}
        <View style={styles.twoCols}>
          <View style={styles.col}>
            <Text style={styles.eyebrow}>Cliente</Text>
            <KeyValue label="Nome" value={client.fullName} />
            <KeyValue label="Telefono" value={client.phone} />
            {client.email ? <KeyValue label="Email" value={client.email} /> : null}
            {client.taxCode ? <KeyValue label="Codice fiscale" value={client.taxCode} /> : null}
            {client.vatNumber ? <KeyValue label="Partita IVA" value={client.vatNumber} /> : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.eyebrow}>Evento</Text>
            {event.name ? <KeyValue label="Evento" value={event.name} /> : null}
            <KeyValue label="Data" value={event.dateLong} />
            {event.time ? <KeyValue label="Ora" value={event.time} /> : null}
            <KeyValue label="Sala" value={event.room} />
            <KeyValue label="Adulti" value={String(event.adults)} />
            <KeyValue label="Bambini" value={String(event.children)} />
            {event.kidsMenus > 0 ? (
              <KeyValue label="Menù bambini" value={String(event.kidsMenus)} />
            ) : null}
          </View>
        </View>

        {/* Menù */}
        {model.menu ? <MenuBlock title="Menù" menu={model.menu} /> : null}
        {model.kidsMenu ? <MenuBlock title="Menù bambini" menu={model.kidsMenu} /> : null}

        {/* Allestimento */}
        {setup.colors.length > 0 || setup.notes ? (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Allestimento</Text>
            {setup.colors.length > 0 ? (
              <KeyValue label="Colori" value={setup.colors.join(", ")} />
            ) : null}
            {setup.notes ? <Text style={styles.bodyText}>{setup.notes}</Text> : null}
          </View>
        ) : null}

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

          {/* Totali (prezzi IVA inclusa) */}
          <View style={styles.totalsWrap} wrap={false}>
            <View style={styles.totalsBox}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Subtotale (IVA inclusa)</Text>
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
                <Text style={styles.totalsGrandLabel}>Totale</Text>
                <Text style={styles.totalsGrandValue}>{totals.total}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Note */}
        {model.notes ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.eyebrow}>Note</Text>
            <Text style={styles.bodyText}>{model.notes}</Text>
          </View>
        ) : null}

        {/* Condizioni e firma */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.eyebrow}>Condizioni</Text>
          {model.conditions.map((c, i) => (
            <Text key={i} style={styles.conditionText}>- {c}</Text>
          ))}
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
      </Page>
    </Document>
  );
}

/** Renderizza il modello del preventivo in un PDF A4 (Buffer). */
export async function renderQuotePdf(model: QuoteDocumentModel): Promise<Buffer> {
  const logo = await loadLogo();
  return renderToBuffer(<QuoteDocument model={model} logo={logo} />);
}
