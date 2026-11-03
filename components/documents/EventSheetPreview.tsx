import type { EventFieldView, EventSheetView } from "@/lib/documents/events-view";
import { SheetFrame } from "./SheetPreview";
import styles from "./SheetPreview.module.css";
import { SHEET_PREVIEW_FOOTER, SHEET_PREVIEW_ISSUER } from "./sheet-issuer";

export interface EventSheetPreviewProps {
  /** Vista formattata del foglio eventi (la stessa del PDF e del DOCX). */
  view: EventSheetView;
  /** Pixel per millimetro (zoom); assente = scala sulla larghezza disponibile. */
  pxPerMm?: number;
}

/** Righe di testo di una voce (una per riga, senza margini). */
function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} className={styles.lineText}>
          {line}
        </p>
      ))}
    </>
  );
}

function FieldRow({ field }: { field: EventFieldView }) {
  return (
    <div className={styles.field}>
      <p className={styles.fieldLabel}>{field.label}</p>
      <div className={styles.fieldValue}>
        <Lines lines={field.lines} />
      </div>
    </div>
  );
}

/**
 * Anteprima HTML del foglio eventi: riepilogo della giornata e una scheda per banchetto
 * (pasto, nome, coperti, poi voci etichetta/valore). Layout di events-pdf.tsx, sullo stesso foglio A4 di SheetPreview.
 */
export function EventSheetPreview({ view, pxPerMm }: EventSheetPreviewProps) {
  return (
    <SheetFrame
      title={view.title}
      subtitle={view.dateLong}
      meta={view.countLabel}
      issuer={SHEET_PREVIEW_ISSUER}
      footer={SHEET_PREVIEW_FOOTER}
      ariaLabel="Anteprima foglio eventi"
      pxPerMm={pxPerMm}
    >
      <section>
        <h4 className={styles.sectionLabel}>Riepilogo della giornata</h4>
        {view.summary.map((item) => (
          <div key={item.label} className={styles.summaryRow}>
            <p className={styles.summaryLabel}>{item.label}</p>
            <div className={styles.summaryValue}>
              <Lines lines={item.lines} />
            </div>
          </div>
        ))}
      </section>

      {view.blocks.length === 0 ? (
        <p className={styles.empty}>Nessun evento</p>
      ) : (
        view.blocks.map((block, i) => (
          <section key={i} className={styles.block}>
            <div className={styles.blockHead}>
              <p className={styles.blockTime}>{block.meal}</p>
              <h4 className={styles.blockHeading}>{block.heading}</h4>
              <p className={styles.blockCovers}>{block.covers}</p>
            </div>
            {block.fields.map((field) => (
              <FieldRow key={field.label} field={field} />
            ))}
          </section>
        ))
      )}
    </SheetFrame>
  );
}
