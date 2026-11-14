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
  // Punto del marchio C.PINSAI (come nel piè di pagina del sito).
  pink: "#E5488A",
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
  // flexBasis 0: il blocco sinistro non deve mai restringere il blocco evento (250 pt), come nell'anteprima.
  headerLeft: { flexGrow: 1, flexBasis: 0, paddingRight: 16 },
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
  // Righe chiave/valore con respiro verticale di 3 pt; il filetto separa solo le righe successive alla prima.
  kvRow: { flexDirection: "row", paddingVertical: 3 },
  // Etichette a larghezza fissa (78 pt, 44 pt nel blocco evento). React-PDF forza flexShrink 0 a 1,
  // quindi il valore non deve mai superare lo spazio: per questo il valore parte da flexBasis 0.
  kvLabel: { width: 78, fontSize: 8.5, color: COLOR.slate },
  kvLabelCompact: { width: 44 },
  kvValue: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 10, color: COLOR.ink },
  section: { marginBottom: 6 },
  // Separatore sottile sopra una sezione (o un blocco) che non ha già un filetto a chiudere quella precedente.
  // Nome del menù (o etichetta "Menù" / "Menù bambini" se manca): serif, stesso bronzo delle portate.
  menuTitle: { fontFamily: FONT.serif, fontSize: 15, color: COLOR.bronze, marginBottom: 5 },
  // Ogni portata è una riga di tabella: filetto sotto, con 3 pt sopra e sotto.
  courseRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.line,
  },
  // Larghezza fissa 66 pt (come .courseLabel nel CSS): la voce più lunga (CONTORNO, ~53 pt) ci sta.
  // Piatti con flexBasis 0: la colonna dei piatti non può far restringere l'etichetta riga per riga.
  courseLabel: { width: 66, flexGrow: 0, fontFamily: FONT.sansBold, fontSize: 8, color: COLOR.bronze, textTransform: "uppercase", letterSpacing: 0.8, paddingTop: 1 },
  courseDishes: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
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
  // flexBasis 0: una descrizione lunga non deve restringere le colonne numeriche di quella riga.
  cellDescription: { flexGrow: 4, flexBasis: 0, paddingRight: 8, fontSize: 9.5 },
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
    // top e non bottom: con lineHeight sulla pagina, react-pdf 4.9 non disegna un footer fisso ancorato in basso
    // che contiene il numero di pagina. A4 = 841,89 pt: il bordo inferiore resta a circa 22 pt dal fondo.
    top: 801,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 0.5,
    borderTopColor: COLOR.line,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: COLOR.slate },
  // Marchio "Powered by C.PINSAI" nell'angolo in basso a destra (largo circa 98 pt).
  poweredBy: { flexDirection: "row", alignItems: "center" },
  // Numero di pagina allineato a destra, 14 pt a sinistra del marchio: 40 margine + 98 marchio + 14 = 152.
  footerPage: { position: "absolute", top: 808.5, right: 152, fontSize: 7.5, color: COLOR.slate, textAlign: "right" },
  poweredByLabel: { fontSize: 6.5, color: COLOR.slate, textTransform: "uppercase", letterSpacing: 0.9, marginRight: 4 },
  brandName: { fontFamily: FONT.sansBold, fontSize: 9, letterSpacing: 0.5, color: COLOR.ink },
  brandDot: { color: COLOR.pink },
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

/**
 * Menù su due colonne bilanciate, per stare in un unico foglio A4.
 * Il titolo è il nome del menù; se manca (o coincide con l'etichetta di sezione) resta l'etichetta.
 */
function MenuBlock({ title, menu }: { title: string; menu: QuoteDocumentMenu }) {
  const [left, right] = splitCoursesInColumns(menu.courses);
  const heading = menu.name && menu.name.trim().toLowerCase() !== title.trim().toLowerCase() ? menu.name : title;
  return (
    <View style={styles.section}>
      <Text style={styles.menuTitle}>{heading}</Text>
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
        {/* Footer con numerazione pagine e marchio C.PINSAI in basso a destra */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {issuer.name} · {issuer.addressLines.join(", ")} · {issuer.phone}
          </Text>
          <View style={styles.poweredBy}>
            <Text style={styles.poweredByLabel}>Powered by</Text>
            <Text style={styles.brandName}>
              C<Text style={styles.brandDot}>.</Text>PINSAI
            </Text>
          </View>
        </View>
        {/* Numero di pagina in un elemento fisso a parte: react-pdf 4.9 non disegna gli altri figli di una riga
            che contiene un testo con render. Sta subito a sinistra del marchio. */}
        <Text
          fixed
          style={styles.footerPage}
          render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
        />
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
            {/* Filetto tra una riga di coppie e la successiva (non sopra la prima riga) */}
            {clientFields(client).map(([label, value]) => (
              <View key={label} style={styles.gridCell}>
                <KeyValue label={label} value={value} />
              </View>
            ))}
          </View>
        </View>

        {/* Menù: il filetto sopra il menù bambini c'è solo se manca il menù adulti, perché le portate chiudono già con un filetto */}
        {model.menu ? <MenuBlock title="Menù" menu={model.menu} /> : null}
        {model.kidsMenu ? <MenuBlock title="Menù bambini" menu={model.kidsMenu} /> : null}

        {/* Allergie e intolleranze: filetto sopra solo se nessun menù ha già chiuso la sezione precedente */}
        <View
          style={styles.section}
          wrap={false}
        >
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
