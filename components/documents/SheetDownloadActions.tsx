import { Button, DocumentDownload, buttonClasses } from "@/components/ui";
import { DOCX_MIME } from "@/lib/quote-utils";

export interface SheetDownloadActionsProps {
  /** Base delle route del foglio: `${apiBase}/pdf` e `${apiBase}/docx`. */
  apiBase: string;
  /** Nome base dei file: `${fileBase}-${date}.pdf` e `.docx`. */
  fileBase: string;
  /** Giorno del foglio (YYYY-MM-DD). */
  date: string;
  onClose: () => void;
}

/** Ogni azione è piena larghezza sul telefono (44 px di altezza minima) e in riga, a destra, da sm in su. */
const ACTION = "min-h-11 w-full sm:w-auto";

/**
 * Piè della finestra di un foglio: Scarica PDF (primario), Scarica Word, Chiudi.
 * Telefono: colonna a tutta larghezza. Tablet e computer: riga allineata a destra.
 * Il padding in basso tiene le azioni sopra la barra del telefono (safe area).
 */
export function SheetDownloadActions({ apiBase, fileBase, date, onClose }: SheetDownloadActionsProps) {
  const documentDate = encodeURIComponent(date);
  return (
    <div className="flex w-full flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:flex-row sm:flex-wrap sm:justify-end">
      <DocumentDownload
        href={`${apiBase}/pdf?date=${documentDate}`}
        fileName={`${fileBase}-${date}.pdf`}
        mimeType="application/pdf"
        className={buttonClasses("primary", "md", ACTION)}
      >
        Scarica PDF
      </DocumentDownload>
      <DocumentDownload
        href={`${apiBase}/docx?date=${documentDate}`}
        fileName={`${fileBase}-${date}.docx`}
        mimeType={DOCX_MIME}
        className={buttonClasses("outline", "md", ACTION)}
      >
        Scarica Word
      </DocumentDownload>
      <Button variant="ghost" onClick={onClose} className={ACTION}>
        Chiudi
      </Button>
    </div>
  );
}
