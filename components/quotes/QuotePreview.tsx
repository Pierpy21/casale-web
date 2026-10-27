import Image from "next/image";
import type { QuoteDocumentMenu, QuoteDocumentModel } from "@/lib/documents/quote-model";
import styles from "./QuotePreview.module.css";

export interface QuotePreviewProps {
  /** Lo stesso modello di PDF e DOCX: l'anteprima mostra il contenuto dei file scaricati. */
  model: QuoteDocumentModel;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.kvRow}>
      <dt className={styles.kvLabel}>{label}</dt>
      <dd className={styles.kvValue}>{value}</dd>
    </div>
  );
}

function MenuBlock({ title, menu }: { title: string; menu: QuoteDocumentMenu }) {
  return (
    <section className={styles.section}>
      <p className={styles.eyebrow}>{title}</p>
      {menu.name ? <p className={styles.sectionTitle}>{menu.name}</p> : null}
      {menu.courses.map((course) => (
        <div key={course.course} className={styles.courseRow}>
          <p className={styles.courseLabel}>{course.label}</p>
          <div className={styles.courseDishes}>
            {course.dishes.map((dish, i) => (
              <p key={`${course.course}-${i}`} className={styles.dish}>
                {dish}
              </p>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Anteprima del preventivo come foglio A4 (210 × 297 mm), con gli stessi contenuti e margini del PDF.
 * Il foglio si scala sulla larghezza disponibile (vedi QuotePreview.module.css): niente scroll orizzontale.
 */
export function QuotePreview({ model }: QuotePreviewProps) {
  const { issuer, meta, client, event, setup, totals, menu, kidsMenu, lines, notes, conditions, signature } = model;

  return (
    // La classe quote-sheet-frame è quella usata dalla stampa (QuotePrintStyles).
    <div className={`${styles.frame} quote-sheet-frame`}>
      <article aria-label="Anteprima preventivo" className={`${styles.sheet} quote-sheet`}>
        <header className={styles.header}>
          <div className={styles.issuer}>
            <p className={styles.issuerName}>{issuer.name}</p>
            <p className={styles.issuerTagline}>{issuer.tagline}</p>
            {issuer.addressLines.map((line) => (
              <p key={line} className={styles.issuerText}>
                {line}
              </p>
            ))}
            <p className={styles.issuerText}>{issuer.phone}</p>
            <p className={styles.issuerText}>{issuer.email}</p>
          </div>
          <Image src="/logo-dark.svg" alt="Il Casale del Notaio" width={150} height={50} unoptimized className={styles.logo} />
        </header>
        <div className={styles.rule} aria-hidden="true" />

        <div className={styles.titleRow}>
          <div className="min-w-0">
            <p className={styles.eyebrow}>{model.title}</p>
            <h2 className={styles.docTitle}>N. {meta.number}</h2>
          </div>
          <div className={styles.meta}>
            <p className={styles.metaText}>Data di emissione: {meta.issuedAt}</p>
            {meta.validUntil ? <p className={styles.metaText}>Valido fino al: {meta.validUntil}</p> : null}
          </div>
        </div>

        <div className={styles.twoCols}>
          <section className={styles.col} aria-label="Cliente">
            <p className={styles.eyebrow}>Cliente</p>
            <dl>
              <KeyValue label="Nome" value={client.fullName} />
              <KeyValue label="Telefono" value={client.phone} />
              {client.email ? <KeyValue label="Email" value={client.email} /> : null}
              {client.taxCode ? <KeyValue label="Codice fiscale" value={client.taxCode} /> : null}
              {client.vatNumber ? <KeyValue label="Partita IVA" value={client.vatNumber} /> : null}
            </dl>
          </section>
          <section className={styles.col} aria-label="Evento">
            <p className={styles.eyebrow}>Evento</p>
            <dl>
              {event.name ? <KeyValue label="Evento" value={event.name} /> : null}
              <KeyValue label="Data" value={event.dateLong} />
              {event.time ? <KeyValue label="Ora" value={event.time} /> : null}
              <KeyValue label="Sala" value={event.room} />
              <KeyValue label="Adulti" value={String(event.adults)} />
              <KeyValue label="Bambini" value={String(event.children)} />
              {event.kidsMenus > 0 ? <KeyValue label="Menù bambini" value={String(event.kidsMenus)} /> : null}
            </dl>
          </section>
        </div>

        {menu ? <MenuBlock title="Menù" menu={menu} /> : null}
        {kidsMenu ? <MenuBlock title="Menù bambini" menu={kidsMenu} /> : null}

        {setup.colors.length > 0 || setup.notes ? (
          <section className={styles.section} aria-label="Allestimento">
            <p className={styles.eyebrow}>Allestimento</p>
            {setup.colors.length > 0 ? <KeyValue label="Colori" value={setup.colors.join(", ")} /> : null}
            {setup.notes ? <p className={styles.bodyText}>{setup.notes}</p> : null}
          </section>
        ) : null}

        <section className={styles.section} aria-label="Righe del preventivo">
          <p className={styles.eyebrow}>Dettaglio</p>
          <table className={styles.table}>
            <caption className="sr-only">Righe del preventivo</caption>
            <thead>
              <tr>
                <th scope="col" className={`${styles.th} ${styles.cellDescription}`}>
                  Descrizione
                </th>
                <th scope="col" className={`${styles.th} ${styles.cellQty}`}>
                  Qtà
                </th>
                <th scope="col" className={`${styles.th} ${styles.cellUnit}`}>
                  Prezzo unit.
                </th>
                <th scope="col" className={`${styles.th} ${styles.cellAmount}`}>
                  Importo
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className={`${styles.td} ${styles.cellDescription}`}>{line.description}</td>
                  <td className={`${styles.td} ${styles.cellQty}`}>{line.quantity}</td>
                  <td className={`${styles.td} ${styles.cellUnit}`}>{line.unitPrice}</td>
                  <td className={`${styles.td} ${styles.cellAmount}`}>{line.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.totalsWrap}>
            <dl className={styles.totalsBox} aria-label="Totali">
              <div className={styles.totalsRow}>
                <dt className={styles.totalsLabel}>{totals.subtotalLabel}</dt>
                <dd className={styles.totalsValue}>{totals.subtotal}</dd>
              </div>
              {totals.hasDiscount ? (
                <div className={styles.totalsRow}>
                  <dt className={styles.totalsLabel}>Sconto</dt>
                  <dd className={styles.totalsValue}>- {totals.discount}</dd>
                </div>
              ) : null}
              <div className={styles.totalsRow}>
                <dt className={styles.totalsLabel}>di cui imponibile</dt>
                <dd className={styles.totalsValue}>{totals.taxable}</dd>
              </div>
              <div className={styles.totalsRow}>
                <dt className={styles.totalsLabel}>di cui IVA {totals.vatRate}</dt>
                <dd className={styles.totalsValue}>{totals.vat}</dd>
              </div>
              <div className={styles.grandRow}>
                <dt className={styles.grandLabel}>{totals.totalLabel}</dt>
                <dd className={styles.grandValue}>{totals.total}</dd>
              </div>
            </dl>
          </div>
        </section>

        {notes ? (
          <section className={styles.section}>
            <p className={styles.eyebrow}>Note</p>
            <p className={styles.bodyText}>{notes}</p>
          </section>
        ) : null}

        <section className={styles.section}>
          <p className={styles.eyebrow}>Condizioni</p>
          {conditions.map((condition, i) => (
            <p key={i} className={styles.conditionText}>
              - {condition}
            </p>
          ))}
          <div className={styles.signatureRow}>
            <div className={styles.signatureBox}>
              <div className={styles.signatureLine} />
              <p className={styles.signatureLabel}>{signature.issuerLabel}</p>
            </div>
            <div className={styles.signatureBox}>
              <div className={styles.signatureLine} />
              <p className={styles.signatureLabel}>{signature.clientLabel}</p>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            {issuer.name} · {issuer.addressLines.join(", ")} · {issuer.phone}
          </p>
          <p className={styles.footerText}>Pagina 1 di 1</p>
        </footer>
      </article>
    </div>
  );
}
