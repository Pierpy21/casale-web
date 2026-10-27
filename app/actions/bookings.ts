"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { BookingInput, coversInputFor, DishesInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId, UserFacingError } from "@/lib/action-utils";
import { createQuote } from "@/lib/rpc/quotes";
import { canAssignRoom, canCreateAnyBooking, canCreateBooking, canEditBookingFully, canEditCovers, canEditDishes, isAdmin } from "@/lib/permissions";
import { fetchOne } from "@/lib/pocketbase/queries";
import { loadBookingBrief, notifyBookingDeleted, notifyBookingEvent } from "@/lib/notify";
import {
  assignBookingRoom as writeRoomAssignment,
  countPayments,
  setBookingStatusRecord,
  deleteBookingRecord,
  resetBookingDishesFromMenu,
  saveBookingDishes,
  updateBookingCovers as writeCovers,
  upsertBooking,
} from "@/lib/rpc/bookings";
import { eventStatusFor } from "@/lib/booking-status";
import type { ActionResult, BookingKind, BookingStatus } from "@/lib/types";

function revalidateBooking(id?: string, clientId?: string): void {
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/prenotazioni/nuova");
  if (id) revalidatePath(`/admin/prenotazioni/${id}`);
  if (clientId) revalidatePath(`/admin/clienti/${clientId}`);
}

/** Tipo della prenotazione (evento se mancante, come i dati precedenti). */
function kindOf(record: Record<string, unknown> | null): BookingKind {
  const k = String(record?.kind || "evento");
  return k === "normale" || k === "appuntamento" ? k : "evento";
}

/**
 * Crea una prenotazione di qualunque tipo (admin) o una prenotazione normale (sala).
 * Il cliente: rubrica (client_id, solo admin) oppure nuovo cliente (new_client), riusato se il telefono esiste gia'.
 */
export async function createBooking(
  input: unknown,
): Promise<ActionResult<{ id: string; quote_id: string | null; warnings: string[] }>> {
  const auth = await authorize(canCreateAnyBooking, "Non sei autorizzato a creare prenotazioni.");
  if (!auth.ok) return auth;

  const parsed = BookingInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  if (!canCreateBooking(auth.profile, parsed.data.kind)) {
    return fail("Non sei autorizzato a creare questo tipo di prenotazione.");
  }
  // La rubrica clienti e' riservata all'admin: la sala indica sempre il cliente come nuovo cliente.
  if (!isAdmin(auth.profile) && parsed.data.client_id) {
    return fail("Inserisci il cliente come nuovo cliente (nome, cognome, telefono).");
  }

  let id: string;
  try {
    id = await upsertBooking(auth.db, parsed.data, null, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  // Preventivo (solo eventi, se richiesto). La prenotazione e' gia' salvata: un errore qui e' un avviso, non un annullamento.
  const warnings: string[] = [];
  let quoteId: string | null = null;
  if (parsed.data.kind === "evento" && parsed.data.create_quote) {
    try {
      quoteId = await createQuote(auth.db, id, { id: auth.profile.id }, parsed.data.quote ?? null);
    } catch (err) {
      console.error("[bookings] preventivo non creato:", err);
      warnings.push(
        err instanceof UserFacingError
          ? `Preventivo non creato: ${err.message}`
          : "Preventivo non creato: puoi crearlo dalla pagina della prenotazione.",
      );
    }
  }

  revalidateBooking(id, parsed.data.client_id ?? undefined);
  revalidatePath("/admin/clienti");
  const actor = auth.profile;
  after(() => notifyBookingEvent({ type: "booking_created", bookingId: id, actor }));
  return { ok: true, data: { id, quote_id: quoteId, warnings } };
}

/** Modifica una prenotazione (solo admin). Se `dishes` è presente sostituisce i piatti (solo eventi). */
export async function updateBooking(id: string, input: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditBookingFully, "Solo l'amministratore può modificare la prenotazione.");
  if (!auth.ok) return auth;

  const parsed = BookingInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  // Stato precedente, per scegliere il tipo di notifica (cambio stato / annullamento / modifica generica).
  const previous = await fetchOne(auth.db, "bookings", id);
  if (!previous) return fail("Prenotazione non trovata.");

  try {
    await upsertBooking(auth.db, parsed.data, id, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(id, parsed.data.client_id ?? undefined);
  // Lo stato degli eventi è ricalcolato dal server (acconti): si legge quello salvato.
  const saved = await fetchOne(auth.db, "bookings", id);
  const newStatus = String(saved?.status ?? parsed.data.status);
  const previousStatus = String(previous.status);
  const type =
    newStatus === "annullato" && previousStatus !== "annullato"
      ? "booking_cancelled"
      : previousStatus !== newStatus
        ? "booking_status"
        : "booking_updated";
  const actor = auth.profile;
  after(() => notifyBookingEvent({ type, bookingId: id, actor }));
  return { ok: true, data: undefined };
}

export async function deleteBooking(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  // Dati per la notifica: vanno letti prima della cancellazione.
  const brief = await loadBookingBrief(id);

  try {
    await deleteBookingRecord(auth.db, id, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking();
  const actor = auth.profile;
  if (brief) after(() => notifyBookingDeleted(brief, actor));
  return { ok: true, data: undefined };
}

/** Coperti: admin o sala (con audit). Per gli appuntamenti sono consentiti 0 ospiti. */
export async function updateBookingCovers(id: string, input: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditCovers, "Non sei autorizzato a modificare i coperti.");
  if (!auth.ok) return auth;

  const booking = await fetchOne(auth.db, "bookings", id);
  if (!booking) return fail("Prenotazione non trovata.");
  const parsed = coversInputFor(kindOf(booking)).safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await writeCovers(auth.db, id, parsed.data, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(id);
  const actor = auth.profile;
  after(() => notifyBookingEvent({ type: "covers_updated", bookingId: id, actor }));
  return { ok: true, data: undefined };
}

/** Piatti: solo admin, e solo per gli eventi (con audit). */
export async function updateBookingDishes(id: string, dishes: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditDishes, "Solo l'amministratore può modificare i piatti.");
  if (!auth.ok) return auth;

  const booking = await fetchOne(auth.db, "bookings", id);
  if (!booking) return fail("Prenotazione non trovata.");
  if (kindOf(booking) !== "evento") return fail("I piatti si modificano solo sugli eventi.");

  const parsed = DishesInput.safeParse(dishes);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    await saveBookingDishes(
      auth.db,
      id,
      parsed.data.map((d, index) => ({ ...d, sort: index })),
      { id: auth.profile.id, full_name: auth.profile.full_name },
    );
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(id);
  const actor = auth.profile;
  after(() => notifyBookingEvent({ type: "dishes_updated", bookingId: id, actor }));
  return { ok: true, data: undefined };
}

/** Stati ammessi per tipo. Evento: "opzione"/"confermato" = torna al calcolo automatico dagli acconti. */
const ALLOWED_STATUS: Record<BookingKind, readonly BookingStatus[]> = {
  evento: ["opzione", "confermato", "saldato", "annullato"],
  appuntamento: ["opzione", "confermato", "annullato"],
  normale: ["confermato", "annullato"],
};

/**
 * Cambio di stato manuale (solo admin). Eventi: "saldato" solo con almeno un acconto; "opzione"/"confermato"
 * ricalcolano lo stato dagli acconti. Con audit e notifica (cancellazione o cambio di stato).
 */
export async function setBookingStatus(bookingId: string, status: BookingStatus): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const booking = await fetchOne(auth.db, "bookings", bookingId);
  if (!booking) return fail("Prenotazione non trovata.");
  const kind = kindOf(booking);
  if (!ALLOWED_STATUS[kind].includes(status)) {
    return fail("Stato non disponibile per questo tipo di prenotazione.");
  }
  const current = String(booking.status) as BookingStatus;

  let next: BookingStatus = status;
  if (kind === "evento") {
    const paid = await countPayments(auth.db, bookingId);
    if (status === "saldato" && paid === 0) {
      return fail("Per segnare l'evento come saldato serve almeno un acconto.");
    }
    if (status === "opzione" || status === "confermato") {
      next = eventStatusFor({ requested: "confermato", previous: null, paidCount: paid });
    }
  }
  if (next === current) return { ok: true, data: undefined };

  const actor = auth.profile;
  try {
    await setBookingStatusRecord(auth.db, bookingId, next, { id: actor.id, full_name: actor.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(bookingId, String(booking.client ?? "") || undefined);
  const type = next === "annullato" && current !== "annullato" ? "booking_cancelled" : "booking_status";
  after(() => notifyBookingEvent({ type, bookingId, actor }));
  return { ok: true, data: undefined };
}

/**
 * Sala di una prenotazione normale (admin, o sala attiva). `roomId` null = nessuna sala.
 * Solo prenotazioni normali; la sala deve esistere ed essere attiva. Registra l'audit e aggiorna le viste.
 */
export async function assignBookingRoom(bookingId: string, roomId: string | null): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  if (roomId !== null && !isRecordId(roomId)) return fail("Sala non valida.");
  const auth = await authorize(
    (p) => isAdmin(p) || (p.active && p.role === "sala"),
    "Non sei autorizzato ad assegnare la sala.",
  );
  if (!auth.ok) return auth;

  const booking = await fetchOne(auth.db, "bookings", bookingId);
  if (!booking) return fail("Prenotazione non trovata.");
  if (!canAssignRoom(auth.profile, kindOf(booking))) {
    return fail("Solo le prenotazioni normali hanno la sala assegnabile.");
  }

  if (roomId) {
    const room = await fetchOne(auth.db, "rooms", roomId);
    if (!room || !Boolean(room.active)) return fail("La sala selezionata non esiste o non è attiva.");
  }

  try {
    await writeRoomAssignment(auth.db, bookingId, roomId, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(bookingId, String(booking.client ?? "") || undefined);
  return { ok: true, data: undefined };
}

/** Ripristina i piatti copiandoli dal menù della prenotazione (solo admin, solo eventi). */
export async function resetDishesFromMenu(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditDishes, "Solo l'amministratore può modificare i piatti.");
  if (!auth.ok) return auth;

  const booking = await fetchOne(auth.db, "bookings", id);
  if (!booking) return fail("Prenotazione non trovata.");
  if (kindOf(booking) !== "evento") return fail("I piatti si modificano solo sugli eventi.");

  try {
    await resetBookingDishesFromMenu(auth.db, id, { id: auth.profile.id, full_name: auth.profile.full_name });
  } catch (err) {
    return dbFail(err);
  }

  revalidateBooking(id);
  const actor = auth.profile;
  after(() => notifyBookingEvent({ type: "dishes_updated", bookingId: id, actor }));
  return { ok: true, data: undefined };
}
