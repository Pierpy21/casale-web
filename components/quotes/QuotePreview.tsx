import Image from "next/image";
import {
  clientFields,
  guestsLabel,
  splitCoursesInColumns,
  type QuoteDocumentCourse,
  type QuoteDocumentMenu,
  type QuoteDocumentModel,
} from "@/lib/documents/quote-model";
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

function CourseColumn({ courses }: { courses: QuoteDocumentCourse[] }) {
  return (
    <div className={styles.col}>
      {courses.map((course) => (
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
    </div>
  );
}

/** Menù su due colonne bilanciate, come nel PDF. */
function MenuBlock({ title, menu }: { title: string; menu: QuoteDocumentMenu }) {
  const [left, right] = splitCoursesInColumns(menu.courses);
  return (
    <section className={styles.section}>
      <div className={styles.menuHeading}>
        <p className={`${styles.eyebrow} ${styles.menuEyebrow}`}>{title}</p>
        {menu.name && menu.name.trim().toLowerCase() !== title.trim().toLowerCase() ? (
          <p className={styles.sectionTitle}>{menu.name}</p>
        ) : null}
      </div>
      <div className={styles.twoCols}>
        <CourseColumn courses={left} />
        <CourseColumn courses={right} />
      </div>
    </section>
  );
}

/**
 * Anteprima dell'ordine di servizio come foglio A4 (210 × 297 mm), con gli stessi contenuti e margini del PDF.
 * Il foglio si scala sulla larghezza disponibile (vedi QuotePreview.module.css): niente scroll orizzontale.
 */
export function QuotePreview({ model }: QuotePreviewProps) {
  const { issuer, meta, client, event, setup, totals, menu, kidsMenu, lines, notes, allergies, signature } = model;

  return (
    // La classe quote-sheet-frame è quella usata dalla stampa (QuotePrintStyles).
    <div className={`${styles.frame} quote-sheet-frame`}>
      <article aria-label="Anteprima ordine di servizio" className={`${styles.sheet} quote-sheet`}>
        {/* Logo e dati Casale a sinistra, dettagli evento in alto a destra (come nel PDF) */}
        <header className={styles.header}>
          <div className={styles.issuer}>
            <Image src="/logo-dark.svg" alt="Il Casale del Notaio" width={150} height={50} unoptimized className={styles.logo} />
            <p className={styles.issuerTagline}>{issuer.tagline}</p>
            <p className={styles.issuerText}>{issuer.addressLines.join(", ")}</p>
            <p className={styles.issuerText}>
              {issuer.phone} · {issuer.email}
            </p>
          </div>
          <section className={styles.eventBlock} aria-label="Evento">
            <p className={styles.eyebrow}>Evento</p>
            <dl>
              <KeyValue label="Data" value={event.dateLong} />
              {event.meal ? <KeyValue label="Pasto" value={event.meal} /> : null}
              <KeyValue label="Sala" value={event.room} />
              <KeyValue label="Ospiti" value={guestsLabel(event)} />
            </dl>
          </section>
        </header>
        <div className={styles.rule} aria-hidden="true" />

        <div className={styles.titleRow}>
          <div className="min-w-0">
            <h2 className={styles.docTitle}>{model.title}</h2>
          </div>
          <div className={styles.meta}>
            <p className={styles.metaText}>
              N. {meta.number} · Data di emissione: {meta.issuedAt}
            </p>
            {meta.validUntil ? <p className={styles.metaText}>Valido fino al: {meta.validUntil}</p> : null}
          </div>
        </div>

        <section className={styles.section} aria-label="Cliente">
          <p className={styles.eyebrow}>Cliente</p>
          <dl className={styles.grid}>
            {clientFields(client).map(([label, value]) => (
              <div key={label} className={styles.gridCell}>
                <KeyValue label={label} value={value} />
              </div>
            ))}
          </dl>
        </section>

        {menu ? <MenuBlock title="Menù" menu={menu} /> : null}
        {kidsMenu ? <MenuBlock title="Menù bambini" menu={kidsMenu} /> : null}

        <section className={styles.section} aria-label="Allergie e intolleranze">
          <p className={styles.eyebrow}>Allergie e intolleranze</p>
          {allergies.length > 0 ? (
            <ul className={styles.allergyList}>
              {allergies.map((line, i) => (
                <li key={i} className={styles.allergyItem}>
                  • {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.bodyText}>Nessuna segnalata</p>
          )}
        </section>

        <section className={styles.section} aria-label="Righe dell’ordine di servizio">
          <p className={styles.eyebrow}>Dettaglio</p>
          <table className={styles.table}>
            <caption className="sr-only">Righe dell’ordine di servizio</caption>
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
            {/* Allestimento e note a sinistra dei totali, come nel PDF */}
            <div className={styles.besideTotals}>
              {setup.colors.length > 0 || setup.notes ? (
                <div className={styles.besideBlock}>
                  <p className={styles.eyebrow}>Allestimento</p>
                  {setup.colors.length > 0 ? (
                    <dl>
                      <KeyValue label="Colori" value={setup.colors.join(", ")} />
                    </dl>
                  ) : null}
                  {setup.notes ? <p className={styles.bodyText}>{setup.notes}</p> : null}
                </div>
              ) : null}
              {notes ? (
                <div className={styles.besideBlock}>
                  <p className={styles.eyebrow}>Note</p>
                  <p className={styles.bodyText}>{notes}</p>
                </div>
              ) : null}
            </div>
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


        <section className={styles.section}>
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
