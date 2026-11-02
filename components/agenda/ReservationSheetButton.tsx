"use client";

import { SheetDocumentButton } from "@/components/documents/SheetDocumentButton";
import { SheetPreview, type SheetPreviewColumn } from "@/components/documents/SheetPreview";
import { SHEET_PREVIEW_FOOTER, SHEET_PREVIEW_ISSUER } from "@/components/documents/sheet-issuer";
import type { ReservationSheetView } from "@/lib/documents/reservations-view";

/** Colonne del foglio come nel PDF (larghezze in pt; il nome prende lo spazio residuo). */
const COLUMNS: SheetPreviewColumn[] = [
  { label: "Nome" },
  { label: "Sala", widthPt: 110 },
  { label: "Tavolo", widthPt: 60, align: "center", strong: true },
  { label: "Orario", widthPt: 55, align: "center" },
  { label: "Cellulare", widthPt: 100 },
];

/** Pulsante "Foglio prenotazioni": anteprima A4 della vista del PDF/DOCX, con download PDF e Word. */
export function ReservationSheetButton({ date }: { date: string }) {
  return (
    <SheetDocumentButton<ReservationSheetView>
      label="Foglio prenotazioni"
      apiBase="/api/reservations"
      fileBase="prenotazioni"
      date={date}
      renderSheet={(view, pxPerMm) => (
        <SheetPreview
          ariaLabel="Anteprima foglio prenotazioni"
          title={view.title}
          subtitle={view.dateLong}
          meta={view.countLabel}
          issuer={SHEET_PREVIEW_ISSUER}
          footer={SHEET_PREVIEW_FOOTER}
          pxPerMm={pxPerMm ?? undefined}
          columns={COLUMNS}
          rows={view.rows.map((row) => [row.name, row.room, row.table, row.time, row.phone])}
          emptyText="Nessuna prenotazione"
        />
      )}
    />
  );
}
