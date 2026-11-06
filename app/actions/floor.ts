"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { canEditFloorLayout, canSeatBooking, canViewFloorPlan } from "@/lib/permissions";
import { fetchOne } from "@/lib/pocketbase/queries";
import { nn } from "@/lib/pocketbase/helpers";
import { resetDayLayoutRecords, saveRoomLayoutRecords, seatBookingRecord, setEventTablesRecord } from "@/lib/rpc/floor";
import {
  assignmentsTableIssue,
  DayLayoutInput,
  EventTablesInput,
  FloorSeatInput,
  LayoutAssignmentsInput,
  LayoutScopeInput,
  RoomLayoutInput,
} from "@/lib/validation";
import type { Actor } from "@/lib/rpc/bookings";
import type { ActionResult, BookingKind, BookingMeal, LayoutScope, Profile, RoomTableDraft } from "@/lib/types";

// Mappa sala (/admin/sala). Le letture sono in lib/data/floor.ts; le scritture in lib/rpc/floor.ts.

function actorOf(profile: Profile): Actor {
  return { id: profile.id, full_name: profile.full_name };
}

function revalidateFloor(bookingIds: string[] = []): void {
  revalidatePath("/admin/sala");
  if (bookingIds.length > 0) revalidatePath("/admin/agenda");
  for (const id of bookingIds) revalidatePath(`/admin/prenotazioni/${id}`);
}

/**
 * Salva la disposizione dei tavoli di una sala (solo admin). `tables` è la lista completa della disposizione indicata da `scope`:
 * null = standard della sala; { date, meal } = disposizione speciale solo per quel giorno e pasto. I tavoli dello scope non
 * presenti vengono disattivati. `assignments` sistema prenotazioni/eventi sui numeri di tavolo della disposizione inviata.
 * Numeri unici nella sala, posti 1–300, posizione 0–100 (fuori range si porta al bordo).
 */
export async function saveRoomLayout(
  roomId: string,
  tables: RoomTableDraft[],
  scope: LayoutScope = null,
  assignments: { bookingId: string; tableNumber: number }[] = [],
): Promise<ActionResult> {
  if (!isRecordId(roomId)) return fail("Sala non valida.");
  const auth = await authorize(canEditFloorLayout, "Solo admin e sala possono modificare la disposizione dei tavoli.");
  if (!auth.ok) return auth;

  const parsedTables = RoomLayoutInput.safeParse(tables);
  if (!parsedTables.success) return invalidInput(parsedTables.error);
  const parsedScope = LayoutScopeInput.safeParse(scope);
  if (!parsedScope.success) return invalidInput(parsedScope.error);
  const parsedAssignments = LayoutAssignmentsInput.safeParse(assignments);
  if (!parsedAssignments.success) return invalidInput(parsedAssignments.error);
  const issue = assignmentsTableIssue(parsedTables.data, parsedAssignments.data);
  if (issue) return fail(issue);

  try {
    const room = await fetchOne(auth.db, "rooms", roomId);
    if (!room) return fail("Sala non trovata.");
    await saveRoomLayoutRecords(
      auth.db,
      roomId,
      parsedTables.data,
      parsedScope.data,
      parsedAssignments.data,
      actorOf(auth.profile),
    );
    return { ok: true, data: undefined };
  } catch (err) {
    return dbFail(err);
  } finally {
    // Anche se una sistemazione fallisce i tavoli possono essere già salvati: si aggiorna comunque la vista.
    revalidateFloor(parsedAssignments.data.map((a) => a.bookingId));
  }
}

/**
 * Sistema una prenotazione su un tavolo di una sala. Admin: qualunque tipo (non appuntamenti). Sala attiva: solo
 * prenotazioni normali. `tableNumber` null = libera il tavolo e lascia la sala. `meal` facoltativo: pasto della disposizione
 * in cui cercare il tavolo (altrimenti quello della prenotazione). Rifiuta se il tavolo non esiste nella disposizione del
 * giorno e pasto o è già occupato. Registra in audit "Sala" e "Tavolo" solo se cambiano.
 */
export async function seatBooking(
  bookingId: string,
  roomId: string,
  tableNumber: number | null,
  meal?: BookingMeal,
): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  if (!isRecordId(roomId)) return fail("Sala non valida.");
  const input = FloorSeatInput.safeParse({ table_number: tableNumber, meal: meal ?? null });
  if (!input.success) return invalidInput(input.error);
  const auth = await authorize(canViewFloorPlan, "Non sei autorizzato ad assegnare i tavoli.");
  if (!auth.ok) return auth;

  try {
    const booking = await fetchOne(auth.db, "bookings", bookingId);
    if (!booking) return fail("Prenotazione non trovata.");
    const kind = (nn(booking.kind) ?? "evento") as BookingKind;
    if (!canSeatBooking(auth.profile, kind)) return fail("Gli appuntamenti non si sistemano sui tavoli.");

    await seatBookingRecord(
      auth.db,
      bookingId,
      roomId,
      input.data.table_number,
      actorOf(auth.profile),
      input.data.meal ?? null,
    );
  } catch (err) {
    return dbFail(err);
  }

  revalidateFloor([bookingId]);
  return { ok: true, data: undefined };
}

/**
 * Tavoli di un evento nella sala per un giorno e pasto (solo admin). `tableNumbers` in ordine: il primo è il tavolo principale,
 * gli altri sono extra. [] = nessun tavolo (la sala resta). Numeri 1–9999 senza ripetizioni (max 30); ogni tavolo deve esistere
 * nella disposizione effettiva del giorno e pasto e non essere occupato da altre prenotazioni o eventi. Registra in audit
 * "Sala" e "Tavoli" solo se cambiano.
 */
export async function setEventTables(
  eventId: string,
  roomId: string,
  tableNumbers: number[],
  meal: BookingMeal,
): Promise<ActionResult> {
  if (!isRecordId(eventId)) return fail("Evento non valido.");
  if (!isRecordId(roomId)) return fail("Sala non valida.");
  const auth = await authorize(canEditFloorLayout, "Solo admin e sala possono assegnare i tavoli a un evento.");
  if (!auth.ok) return auth;
  const input = EventTablesInput.safeParse({ eventId, roomId, tableNumbers, meal });
  if (!input.success) return invalidInput(input.error);

  try {
    await setEventTablesRecord(
      auth.db,
      eventId,
      roomId,
      input.data.tableNumbers,
      input.data.meal,
      actorOf(auth.profile),
    );
  } catch (err) {
    return dbFail(err);
  }

  revalidateFloor([eventId]);
  return { ok: true, data: undefined };
}

/**
 * Ripristina la disposizione standard per un giorno e pasto di una sala (solo admin): elimina i tavoli della disposizione
 * speciale di quel giorno/pasto. Le prenotazioni ed eventi di quel giorno/pasto con un tavolo che non esiste nella
 * disposizione standard perdono il tavolo (restano nella sala).
 */
export async function resetDayLayout(roomId: string, date: string, meal: BookingMeal): Promise<ActionResult> {
  if (!isRecordId(roomId)) return fail("Sala non valida.");
  const day = DayLayoutInput.safeParse({ date, meal });
  if (!day.success) return invalidInput(day.error);
  const auth = await authorize(canEditFloorLayout, "Solo admin e sala possono ripristinare la disposizione del giorno.");
  if (!auth.ok) return auth;

  try {
    const room = await fetchOne(auth.db, "rooms", roomId);
    if (!room) return fail("Sala non trovata.");
    await resetDayLayoutRecords(auth.db, roomId, day.data.date, day.data.meal, actorOf(auth.profile));
  } catch (err) {
    return dbFail(err);
  }

  revalidateFloor();
  return { ok: true, data: undefined };
}
