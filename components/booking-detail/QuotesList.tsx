import Link from "next/link";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { DocumentDownload, buttonClasses } from "@/components/ui";
import type { Quote } from "@/lib/types";
import { DOCX_MIME, computeQuoteTotals, formatEUR, quoteFileName } from "@/lib/quote-utils";

/** Elenco dei preventivi della prenotazione (solo admin), dal più recente. Dentro Pagamenti e acconti. */
export function QuotesList({ quotes }: { quotes: Quote[] }) {
  if (quotes.length === 0) {
    return (
      <p className="text-[13px] text-slate">
        Nessun preventivo emesso. Crealo dal pulsante Preventivo accanto al nome dell’evento.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-sand border-y border-sand">
      {quotes.map((quote) => {
        const totals = computeQuoteTotals(quote);
        return (
          <li key={quote.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="wrap-anywhere text-[14px] font-medium text-ink">n. {quote.number}</p>
              <p className="text-[12px] text-slate-dark">
                {formatIt(toDate(quote.issued_at), "d MMM yyyy")} · {formatEUR(totals.total)} IVA incl.
              </p>
            </div>
            <div className="no-print flex min-w-0 flex-wrap gap-2">
              <Link href={`/admin/preventivi/${quote.id}`} className={buttonClasses("ghost", "sm", "min-h-11")}>
                Apri
              </Link>
              <DocumentDownload
                href={`/api/quotes/${quote.id}/pdf`}
                fileName={quoteFileName(quote.number, "pdf")}
                mimeType="application/pdf"
                className={buttonClasses("outline", "sm", "min-h-11")}
              >
                PDF
              </DocumentDownload>
              <DocumentDownload
                href={`/api/quotes/${quote.id}/docx`}
                fileName={quoteFileName(quote.number, "docx")}
                mimeType={DOCX_MIME}
                className={buttonClasses("outline", "sm", "min-h-11")}
              >
                DOCX
              </DocumentDownload>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
