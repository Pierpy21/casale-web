"use client";

import { SheetDocumentButton } from "@/components/documents/SheetDocumentButton";
import { EventSheetPreview } from "@/components/documents/EventSheetPreview";
import type { EventSheetView } from "@/lib/documents/events-view";

/** Pulsante "Foglio eventi" (cucina): anteprima A4 della vista del PDF/DOCX, con download PDF e Word. */
export function EventSheetButton({ date }: { date: string }) {
  return (
    <SheetDocumentButton<EventSheetView>
      label="Foglio eventi"
      apiBase="/api/events"
      fileBase="eventi"
      date={date}
      renderSheet={(view, pxPerMm) => <EventSheetPreview view={view} pxPerMm={pxPerMm ?? undefined} />}
    />
  );
}
