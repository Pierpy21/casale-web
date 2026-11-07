"use client";

import { SheetDocumentButton } from "@/components/documents/SheetDocumentButton";
import { ReservationSheetPreview } from "@/components/documents/ReservationSheetPreview";
import { SHEET_PREVIEW_FOOTER, SHEET_PREVIEW_ISSUER } from "@/components/documents/sheet-issuer";
import type { ReservationSheetView } from "@/lib/documents/reservations-view";

/** Pulsante "Foglio prenotazioni": anteprima A4 per sala (come il PDF/DOCX), con download PDF e Word. */
export function ReservationSheetButton({ date }: { date: string }) {
  return (
    <SheetDocumentButton<ReservationSheetView>
      label="Foglio prenotazioni"
      apiBase="/api/reservations"
      fileBase="prenotazioni"
      date={date}
      renderSheet={(view, pxPerMm) => (
        <ReservationSheetPreview
          view={view}
          issuer={SHEET_PREVIEW_ISSUER}
          footer={SHEET_PREVIEW_FOOTER}
          pxPerMm={pxPerMm ?? undefined}
        />
      )}
    />
  );
}
