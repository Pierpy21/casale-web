// Regole pure sullo stato delle prenotazioni (usabili anche nei client component).
// - evento: stato calcolato dagli acconti (opzione senza acconti, confermato con acconti);
//   "saldato" (solo con acconti) e "annullato" sono impostati a mano dall'admin.
// - normale: sempre confermato; ammesso solo "annullato" come eccezione.
// - appuntamento: scelta manuale (invariato).
import type { BookingStatus } from "@/lib/types";

/** Stato di un evento dopo un salvataggio. `requested` = stato inviato; `previous` = stato in DB (null alla creazione). */
export function eventStatusFor(input: {
  requested: BookingStatus;
  previous: BookingStatus | null;
  paidCount: number;
}): BookingStatus {
  const { requested, previous, paidCount } = input;
  if (requested === "annullato") return "annullato";
  if (paidCount <= 0) return "opzione";
  if (requested === "saldato" || previous === "saldato") return "saldato";
  return "confermato";
}

/** Stato di una prenotazione normale: sempre confermata, salvo annullamento. */
export function normalBookingStatus(requested: BookingStatus): BookingStatus {
  return requested === "annullato" ? "annullato" : "confermato";
}

/** Stato di un evento dopo l'aggiunta o l'eliminazione di un acconto (paidCount = acconti rimasti). */
export function statusAfterPayments(current: BookingStatus, paidCount: number): BookingStatus {
  if (current === "annullato") return current;
  if (paidCount > 0) return current === "opzione" ? "confermato" : current;
  return current === "confermato" || current === "saldato" ? "opzione" : current;
}
