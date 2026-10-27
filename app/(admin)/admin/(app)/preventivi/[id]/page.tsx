import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { bookingTitle } from "@/components/bookings/format";
import { QuoteEditor } from "@/components/quotes/QuoteEditor";
import { QuotePrintStyles } from "@/components/quotes/QuotePrintStyles";
import { ButtonLink, PageHeader } from "@/components/ui";
import { isUuid } from "@/lib/action-utils";
import { requireAdmin } from "@/lib/auth";
import { getQuote } from "@/lib/data/quotes";

export const metadata: Metadata = {
  title: "Preventivo · Casale del Notaio",
};

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const quote = await getQuote(id);
  if (!quote) notFound();

  // Chiave sulla versione salvata: dopo un salvataggio l'editor riparte dai dati del server.
  const version = JSON.stringify([quote.issued_at, quote.valid_until, quote.discount, quote.final_total, quote.vat_rate, quote.notes, quote.lines]);

  return (
    <div className="flex flex-col gap-6">
      {/* Stampa: solo il foglio A4 del preventivo (vedi QuotePrintStyles). */}
      <QuotePrintStyles />
      <PageHeader
        eyebrow="Preventivo"
        title={`Preventivo n. ${quote.number}`}
        description={`${bookingTitle(quote.booking)} · ${formatIt(toDate(quote.booking.event_date), "EEEE d MMMM yyyy")}`}
        actions={
          <ButtonLink href={`/admin/prenotazioni/${quote.booking_id}`} variant="ghost" size="md" className="no-print">
            Torna alla prenotazione
          </ButtonLink>
        }
      />
      <QuoteEditor key={version} quote={quote} />
    </div>
  );
}
