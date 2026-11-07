import { SheetFrame, SheetTable, type SheetIssuer, type SheetPreviewColumn } from "./SheetPreview";
import type { ReservationSheetView } from "@/lib/documents/reservations-view";
import styles from "./ReservationSheetPreview.module.css";

/** Colonne di ogni sala come nel PDF (larghezze in pt; il nome prende lo spazio residuo). La sala è nel titolo. */
const COLUMNS: SheetPreviewColumn[] = [
  { label: "Nome" },
  { label: "Tavolo", widthPt: 50, align: "center", strong: true },
  { label: "Coperti", widthPt: 115, align: "center" },
  { label: "Pasto", widthPt: 55, align: "center" },
  { label: "Cellulare", widthPt: 100 },
];

export interface ReservationSheetPreviewProps {
  view: ReservationSheetView;
  issuer: SheetIssuer;
  footer: string;
  pxPerMm?: number;
}

/**
 * Anteprima del foglio prenotazioni come nel PDF: un foglio A4 per pagina (Sala 1-2-3, Sala Grande, Palmento,
 * Terrazza e Pozzo, più le altre sale se servono), con le sale della stessa pagina separate da una linea.
 */
export function ReservationSheetPreview({ view, issuer, footer, pxPerMm }: ReservationSheetPreviewProps) {
  return (
    <div className={styles.pages}>
      {view.pages.map((page, pageIndex) => (
        <SheetFrame
          key={pageIndex}
          ariaLabel={`Anteprima foglio prenotazioni, pagina ${pageIndex + 1} di ${view.pages.length}`}
          title={view.title}
          subtitle={view.dateLong}
          meta={view.countLabel}
          issuer={issuer}
          footer={footer}
          pxPerMm={pxPerMm}
          compact={pageIndex > 0}
        >
          {page.sections.map((section, i) => (
            <section key={section.room} aria-label={section.room}>
              {i > 0 ? <div className={styles.divider} aria-hidden="true" /> : null}
              <div className={styles.roomHead}>
                <h4 className={styles.roomName}>{section.room}</h4>
                <p className={styles.roomCount}>{section.countLabel}</p>
              </div>
              <SheetTable
                columns={COLUMNS}
                caption={`Prenotazioni ${section.room}`}
                rows={section.rows.map((row) => [row.name, row.table, row.covers, row.meal, row.phone])}
                emptyText="Nessuna prenotazione"
              />
            </section>
          ))}
        </SheetFrame>
      ))}
    </div>
  );
}
