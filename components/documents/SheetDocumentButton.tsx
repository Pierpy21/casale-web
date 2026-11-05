"use client";

import { Printer } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useOnline } from "@/components/offline/useOnline";
import { SheetDialog } from "./SheetDialog";
import { SheetDownloadActions } from "./SheetDownloadActions";
import { useSheetFetch } from "./useSheetFetch";

export interface SheetDocumentButtonProps<T> {
  /** Testo del pulsante, es. "Foglio prenotazioni". */
  label: string;
  /** Base delle route del foglio: `${apiBase}/sheet` (JSON), `${apiBase}/pdf` e `${apiBase}/docx`. */
  apiBase: string;
  /** Nome base dei file scaricati: `${fileBase}-${date}.pdf` e `.docx`. */
  fileBase: string;
  /** Giorno del foglio (YYYY-MM-DD). */
  date: string;
  /** Disegna il foglio dalla vista formattata; `pxPerMm` null = adatta alla larghezza. */
  renderSheet: (data: T, pxPerMm: number | null) => ReactNode;
}

/**
 * Pulsante di un foglio del giorno: apre l'anteprima A4 (HTML, non iframe: Safari non mostra bene i PDF multipagina)
 * con la vista caricata dal server. Scarica PDF e Word restano nel piè della finestra (DocumentDownload gestisce
 * condivisione e offline).
 */
export function SheetDocumentButton<T>({ label, apiBase, fileBase, date, renderSheet }: SheetDocumentButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const documentDate = encodeURIComponent(date);
  const { load, reload } = useSheetFetch<T>(`${apiBase}/sheet?date=${documentDate}`, open);

  // Ogni apertura richiede il foglio aggiornato: la finestra non mostra mai un foglio vecchio.
  const openSheet = () => {
    reload();
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={openSheet}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-field-edge bg-field px-2.5 py-1.5 text-[13px] leading-snug text-ink transition-colors duration-150 hover:border-field-edge-hover hover:bg-cream/60 desk:min-h-9"
      >
        <Printer aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        {label}
      </button>

      <SheetDialog
        open={open}
        onClose={close}
        online={online}
        load={load}
        onRetry={reload}
        renderSheet={renderSheet}
        footer={<SheetDownloadActions apiBase={apiBase} fileBase={fileBase} date={date} onClose={close} />}
      />
    </>
  );
}
