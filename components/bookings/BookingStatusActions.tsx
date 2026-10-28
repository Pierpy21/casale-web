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
 * Azioni secondarie sullo stato di un evento, dal dettaglio prenotazione: "Segna come saldato" e
 * "Ripristina" (torna al calcolo automatico dagli acconti). Discrete, accanto alle azioni principali.
 * Nessuna azione per prenotazioni e appuntamenti: "Annulla" è stato rimosso (equivale a Elimina).
 */
export function BookingStatusActions({ bookingId, kind, status, paymentsCount }: BookingStatusActionsProps) {
  const router = useRouter();
  if (kind !== "evento") return null;

  const refresh = () => router.refresh();
  const run = (next: BookingStatus) => () => setBookingStatus(bookingId, next);

  const restore = status === "saldato" || status === "annullato";
  const canSettle = status !== "saldato" && status !== "annullato" && paymentsCount > 0;
  if (!restore && !canSettle) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSettle && (
        <ConfirmAction
          label="Segna come saldato"
          variant="outline"
          size="sm"
          title="Segnare come saldato?"
          description="L’evento risulta pagato per intero. Lo stato resta impostato finché non lo ripristini."
          confirmLabel="Segna come saldato"
          pendingLabel="Salvataggio…"
          run={run("saldato")}
          onSuccess={refresh}
        />
      )}
      {restore && (
        <ConfirmAction
          label="Ripristina"
          variant="outline"
          size="sm"
          title="Ripristinare l’evento?"
          description="Lo stato torna calcolato dagli acconti registrati."
          confirmLabel="Ripristina"
          pendingLabel="Salvataggio…"
          run={run("confermato")}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
