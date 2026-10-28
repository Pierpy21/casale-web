import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { mapBookingNote } from "@/lib/pocketbase/mappers";
import { listAll, listByParents } from "@/lib/pocketbase/queries";
import { canSeeAppointments } from "@/lib/permissions";
import type { BookingNote } from "@/lib/types";
import { appointmentIdsAmong } from "./shared";

// Note interne sulle prenotazioni (collezione booking_notes). Lettura per tutti i ruoli attivi.
// Scritture (aggiungi/elimina) in app/actions/bookings.ts.

function newestFirst(a: BookingNote, b: BookingNote): number {
  return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/** Note interne di una prenotazione, più recenti per primo. Tutti i ruoli attivi. */
export async function getBookingNotes(bookingId: string): Promise<BookingNote[]> {
  if (!isRecordId(bookingId)) return [];
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  // Note di un appuntamento: nascoste alla sala.
  if (!canSeeAppointments(me) && (await appointmentIdsAmong(db, [bookingId])).has(bookingId)) return [];
  const records = await listAll(db, "booking_notes", db.filter("booking = {:id}", { id: bookingId }), {
    sort: "-created,-id",
  });
  return records.map(mapBookingNote).sort(newestFirst);
}

/**
 * Note di più prenotazioni in poche query (agenda cucina). Il risultato contiene ogni id richiesto,
 * anche senza note (array vuoto). Ordine: più recenti per primo.
 */
export async function getBookingNotesFor(bookingIds: string[]): Promise<Record<string, BookingNote[]>> {
  const ids = [...new Set(bookingIds.filter(isRecordId))];
  const out: Record<string, BookingNote[]> = {};
  for (const id of ids) out[id] = [];
  const me = await getCurrentProfile();
  if (ids.length === 0 || !me) return out;
  const db = await getAdminPb();
  // Per la sala le note degli appuntamenti non escono (restano liste vuote).
  const hidden = canSeeAppointments(me) ? new Set<string>() : await appointmentIdsAmong(db, ids);
  const visibleIds = ids.filter((id) => !hidden.has(id));
  if (visibleIds.length === 0) return out;
  const notes = (await listByParents(db, "booking_notes", "booking", visibleIds)).map(mapBookingNote);
  for (const note of notes) {
    const list = out[note.booking_id];
    if (list) list.push(note);
  }
  for (const id of ids) out[id]?.sort(newestFirst);
  return out;
}
