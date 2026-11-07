import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import styles from "./SheetPreview.module.css";

/** Colonna della tabella. Le larghezze sono in punti (pt), come nei PDF: senza larghezza la colonna prende lo spazio residuo. */
export interface SheetPreviewColumn {
  label: string;
  widthPt?: number;
  align?: "left" | "center" | "right";
  /** Testo in grassetto (es. il numero di tavolo). */
  strong?: boolean;
}

/** Riga dei totali; `strong` evidenzia il totale finale (come nel preventivo). */
export interface SheetPreviewTotal {
  label: string;
  value: string;
  strong?: boolean;
}

/** Intestazione del documento: nome, slogan, righe di contatto e logo facoltativo. */
export interface SheetIssuer {
  name: string;
  tagline?: string;
  lines: readonly string[];
  logoSrc?: string;
}

/** Parti comuni a tutti i fogli: foglio A4, intestazione, titolo e piè di pagina. */
export interface SheetFrameProps {
  /** Titolo grande del foglio, es. "Foglio prenotazioni". */
  title: string;
  /** Sottotitolo corsivo sotto il titolo, es. la data estesa. */
  subtitle?: string;
  /** Riga piccola a destra del titolo, es. il conteggio. */
  meta?: string;
  issuer: SheetIssuer;
  /** Testo del piè di pagina in fondo al foglio. */
  footer?: string;
  /** Nome accessibile dell'anteprima. */
  ariaLabel: string;
  /**
   * Pixel per millimetro del foglio (zoom). Assente = scala sulla larghezza disponibile (default).
   * Con un valore il foglio ha la sua larghezza reale e chi lo contiene scorre.
   */
  pxPerMm?: number;
  /** Pagine dopo la prima: niente intestazione del Casale, solo titolo e sottotitolo su una riga (come nel PDF). */
  compact?: boolean;
  children: ReactNode;
}

export interface SheetPreviewProps extends Omit<SheetFrameProps, "children"> {
  /** Una riga per elemento: un valore per colonna, nello stesso ordine di `columns`. */
  columns: SheetPreviewColumn[];
  rows: string[][];
  /** Testo mostrato quando non ci sono righe. */
  emptyText?: string;
  totals?: SheetPreviewTotal[];
}

const ALIGN_CLASS: Record<NonNullable<SheetPreviewColumn["align"]>, string> = {
  left: styles.alignLeft,
  center: styles.alignCenter,
  right: styles.alignRight,
};

/** Larghezza in pt -> CSS in mm del foglio (1 pt = 0,3528 mm). */
function widthStyle(widthPt: number | undefined): { width: string } | undefined {
  return widthPt === undefined ? undefined : { width: `calc(${widthPt} * 0.3528 * var(--mm))` };
}

/** Zoom: la variabile --sheet-w è la larghezza del foglio (210 mm × px/mm); senza, il CSS scala sul contenitore. */
function frameStyle(pxPerMm: number | undefined): CSSProperties | undefined {
  return pxPerMm === undefined ? undefined : ({ "--sheet-w": `${210 * pxPerMm}px` } as CSSProperties);
}

/**
 * Foglio A4 (210 × 297 mm) con intestazione, titolo e piè di pagina; il contenuto (tabella, schede) va nei children.
 * Stesse misure e tipografia dei PDF react-pdf (pt → mm). Di default il foglio si scala sulla larghezza disponibile.
 */
export function SheetFrame({
  title,
  subtitle,
  meta,
  issuer,
  footer,
  ariaLabel,
  pxPerMm,
  compact = false,
  children,
}: SheetFrameProps) {
  return (
    <div className={styles.frame} style={frameStyle(pxPerMm)}>
      <article aria-label={ariaLabel} className={styles.sheet}>
        {compact ? (
          <div className={styles.compactHead}>
            <h3 className={styles.compactTitle}>{title}</h3>
            {subtitle ? <p className={styles.compactSubtitle}>{subtitle}</p> : null}
          </div>
        ) : (
          <>
            <header className={styles.header}>
              <div className={styles.issuer}>
                <p className={styles.issuerName}>{issuer.name}</p>
                {issuer.tagline ? <p className={styles.issuerTagline}>{issuer.tagline}</p> : null}
                {issuer.lines.map((line) => (
                  <p key={line} className={styles.issuerText}>
                    {line}
                  </p>
                ))}
              </div>
              {issuer.logoSrc ? (
                <Image src={issuer.logoSrc} alt="" width={150} height={50} unoptimized className={styles.logo} />
              ) : null}
            </header>
            <div className={styles.rule} aria-hidden="true" />

            <div className={styles.titleRow}>
              <div className={styles.titleBlock}>
                <h3 className={styles.docTitle}>{title}</h3>
                {subtitle ? <p className={styles.docSubtitle}>{subtitle}</p> : null}
              </div>
              {meta ? <p className={styles.metaText}>{meta}</p> : null}
            </div>
          </>
        )}

        {children}

        {footer ? (
          <footer className={styles.footer}>
            <p className={styles.footerText}>{footer}</p>
          </footer>
        ) : null}
      </article>
    </div>
  );
}

/** Tabella del foglio (o il testo vuoto se non ci sono righe), riusabile dentro uno SheetFrame. */
export function SheetTable({
  columns,
  rows,
  caption,
  emptyText = "Nessun dato",
}: {
  columns: SheetPreviewColumn[];
  rows: string[][];
  caption: string;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <table className={styles.table}>
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        {columns.map((column, i) => (
          <col key={i} style={widthStyle(column.widthPt)} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column, i) => (
            <th key={i} scope="col" className={cn(styles.th, ALIGN_CLASS[column.align ?? "left"])}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r} className={styles.tr}>
            {cells.map((cell, i) => {
              const column = columns[i];
              return (
                <td
                  key={i}
                  className={cn(styles.td, ALIGN_CLASS[column?.align ?? "left"], column?.strong && styles.strong)}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Foglio con una tabella (es. eventi), eventuali totali in fondo. */
export function SheetPreview({ columns, rows, emptyText = "Nessun dato", totals, ...frame }: SheetPreviewProps) {
  return (
    <SheetFrame {...frame}>
      <SheetTable columns={columns} rows={rows} caption={frame.title} emptyText={emptyText} />

      {totals && totals.length > 0 ? (
        <div className={styles.totalsWrap}>
          <dl className={styles.totalsBox} aria-label="Totali">
            {totals.map((total) => (
              <div key={total.label} className={total.strong ? styles.grandRow : styles.totalsRow}>
                <dt className={total.strong ? styles.grandLabel : styles.totalsLabel}>{total.label}</dt>
                <dd className={total.strong ? styles.grandValue : styles.totalsValue}>{total.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </SheetFrame>
  );
}
