"use client";

import { useRouter } from "next/navigation";
import { setBookingStatus } from "@/app/actions/bookings";
import type { BookingKind, BookingStatus } from "@/lib/types";
import { ConfirmAction } from "./ConfirmAction";

export interface BookingStatusActionsProps {
  bookingId: string;
  kind: BookingKind;
  status: BookingStatus;
  /** Numero di acconti registrati: "Segna come saldato" richiede almeno un acconto. */
  paymentsCount: number;
}

/**
 * Azioni admin sullo stato, dal dettaglio prenotazione. Per gli eventi lo stato "confermato" significa
 * tornare al calcolo automatico dagli acconti. Gli appuntamenti si gestiscono dalla modifica.
 */
export function BookingStatusActions({ bookingId, kind, status, paymentsCount }: BookingStatusActionsProps) {
  const router = useRouter();
  if (kind === "appuntamento") return null;

  const refresh = () => router.refresh();
  const run = (next: BookingStatus) => () => setBookingStatus(bookingId, next);
  const isEvent = kind === "evento";

  const restore = status === "annullato" || status === "saldato";
  const canSettle = isEvent && status !== "saldato" && status !== "annullato";
  const canCancel = status !== "annullato";

  return (
    <>
      {canSettle && paymentsCount > 0 && (
        <ConfirmAction
          label="Segna come saldato"
          variant="outline"
          title="Segnare come saldato?"
          description="L’evento risulta pagato per intero. Lo stato resta impostato finché non lo ripristini."
          confirmLabel="Segna come saldato"
          pendingLabel="Salvataggio…"
          run={run("saldato")}
          onSuccess={refresh}
        />
      )}
      {canCancel && (
        <ConfirmAction
          label="Annulla"
          variant="danger"
          title="Annullare la prenotazione?"
          description="La prenotazione resta nello storico ma non compare più come attiva nell’agenda."
          confirmLabel="Annulla prenotazione"
          pendingLabel="Annullamento…"
          run={run("annullato")}
          onSuccess={refresh}
        />
      )}
      {restore && (
        <ConfirmAction
          label="Ripristina"
          variant="outline"
          title="Ripristinare la prenotazione?"
          description={
            isEvent
              ? "Lo stato torna calcolato dagli acconti registrati."
              : "La prenotazione torna attiva e confermata."
          }
          confirmLabel="Ripristina"
          pendingLabel="Salvataggio…"
          run={run("confermato")}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
