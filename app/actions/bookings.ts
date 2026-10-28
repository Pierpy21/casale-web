"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { BookingAllergiesInput, BookingInput, BookingNoteBody, coversInputFor, DishesInput, type DishInputType } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId, UserFacingError } from "@/lib/action-utils";
import { createQuote } from "@/lib/rpc/quotes";
import { canAddBookingNote, canAssignRoom, canCreateAnyBooking, canCreateBooking, canEditAllergies, canEditBookingFully, canEditCovers, canEditDishes, canSeeAppointments, isAdmin } from "@/lib/permissions";
import { fetchOne } from "@/lib/pocketbase/queries";
import { loadBookingBrief, notifyBookingDeleted, notifyBookingEvent } from "@/lib/notify";
import { checkConflict, withMutation } from "@/lib/mutations";
import type { MutationOptions } from "@/lib/offline/contract";
import {
  assignBookingRoom as writeRoomAssignment,
  countPayments,
  setBookingStatusRecord,
  deleteBookingRecord,
  resetBookingDishesFromMenu,
  saveBookingAllergies as writeAllergies,
  saveBookingDishes,
  updateBookingCovers as writeCovers,
  upsertBooking,
} from "@/lib/rpc/bookings";
import { eventStatusFor } from "@/lib/booking-status";
import type { ActionResult, BookingAllergyDraft, BookingKind, BookingStatus } from "@/lib/types";

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

type CreatedBooking = { id: string; quote_id: string | null; warnings: string[] };

/**
 * Crea una prenotazione di qualunque tipo (admin) o una prenotazione normale (sala).
 * Il cliente: rubrica (client_id, solo admin) oppure nuovo cliente (new_client), riusato se il telefono esiste gia'.
 */
/**
 * Crea una prenotazione. `dishes` (solo eventi, facoltativo): piatti personalizzati nel form di creazione,
 * salvati al posto della copia del menù prima del preventivo.
 */
export async function createBooking(
  input: unknown,
  dishes?: unknown,
  opts?: MutationOptions,
): Promise<ActionResult<CreatedBooking>> {
  const auth = await authorize(canCreateAnyBooking, "Non sei autorizzato a creare prenotazioni.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.createBooking", auth.profile.id, async (): Promise<ActionResult<CreatedBooking>> => {
    const parsed = BookingInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    if (!canCreateBooking(auth.profile, parsed.data.kind)) {
      return fail("Non sei autorizzato a creare questo tipo di prenotazione.");
    }
    // Piatti personalizzati: validati prima di creare, così un errore non lascia un evento a metà.
    let customDishes: DishInputType[] | null = null;
    if (dishes !== undefined && dishes !== null) {
      if (parsed.data.kind !== "evento" || !canEditDishes(auth.profile)) {
        return fail("I piatti si personalizzano solo sugli eventi, dall'amministratore.");
      }
      const parsedDishes = DishesInput.safeParse(dishes);
      if (!parsedDishes.success) return invalidInput(parsedDishes.error);
      customDishes = parsedDishes.data;
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

    const warnings: string[] = [];
    // Piatti personalizzati al posto della copia del menu'. Come per il preventivo: un errore e' un avviso.
    if (customDishes) {
      try {
        await saveBookingDishes(
          auth.db,
          id,
          customDishes.map((d, index) => ({ ...d, sort: index })),
          { id: auth.profile.id, full_name: auth.profile.full_name },
        );
      } catch (err) {
        console.error("[bookings] piatti personalizzati non salvati:", err);
        warnings.push("Piatti personalizzati non salvati: l'evento ha i piatti del menù, modificali dalla pagina della prenotazione.");
      }
    }

    // Preventivo (solo eventi, se richiesto). La prenotazione e' gia' salvata: un errore qui e' un avviso, non un annullamento.
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
  });
}

/** Modifica una prenotazione (solo admin). Se `dishes` è presente sostituisce i piatti (solo eventi). */
export async function updateBooking(id: string, input: unknown, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditBookingFully, "Solo l'amministratore può modificare la prenotazione.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.updateBooking", auth.profile.id, async (): Promise<ActionResult> => {
    const parsed = BookingInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    // Stato precedente, per scegliere il tipo di notifica (cambio stato / annullamento / modifica generica).
    const previous = await fetchOne(auth.db, "bookings", id);
    if (!previous) return fail("Prenotazione non trovata.");
    const conflict = await checkConflict(auth.db, opts, previous);
    if (conflict) return conflict;

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
  });
}

export async function deleteBooking(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.deleteBooking", auth.profile.id, async (): Promise<ActionResult> => {
    // Coda offline: una prenotazione già eliminata è un successo solo nel reinvio. Dal form resta com'era.
    if (opts) {
      const row = await fetchOne(auth.db, "bookings", id);
      if (!row && opts.replay === true) return { ok: true, data: undefined };
      if (row) {
        const conflict = await checkConflict(auth.db, opts, row);
        if (conflict) return conflict;
      }
    }

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
  });
}

/** Coperti: admin o sala (con audit). Per gli appuntamenti sono consentiti 0 ospiti. */
export async function updateBookingCovers(id: string, input: unknown, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditCovers, "Non sei autorizzato a modificare i coperti.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.updateBookingCovers", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", id);
    if (!booking || (!canSeeAppointments(auth.profile) && kindOf(booking) === "appuntamento")) {
      return fail("Prenotazione non trovata.");
    }
    // Coperti: confronto con la prenotazione (il sub-record non ha un proprio `updated`).
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

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
  });
}

/** Piatti: solo admin, e solo per gli eventi (con audit). */
export async function updateBookingDishes(id: string, dishes: unknown, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditDishes, "Solo l'amministratore può modificare i piatti.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.updateBookingDishes", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", id);
    if (!booking) return fail("Prenotazione non trovata.");
    if (kindOf(booking) !== "evento") return fail("I piatti si modificano solo sugli eventi.");
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

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
  });
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
export async function setBookingStatus(bookingId: string, status: BookingStatus, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.setBookingStatus", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", bookingId);
    if (!booking) return fail("Prenotazione non trovata.");
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

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
  });
}

/**
 * Sala di una prenotazione normale (admin, o sala attiva). `roomId` null = nessuna sala.
 * Solo prenotazioni normali; la sala deve esistere ed essere attiva. Registra l'audit e aggiorna le viste.
 */
export async function assignBookingRoom(bookingId: string, roomId: string | null, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  if (roomId !== null && !isRecordId(roomId)) return fail("Sala non valida.");
  const auth = await authorize(
    (p) => isAdmin(p) || (p.active && p.role === "sala"),
    "Non sei autorizzato ad assegnare la sala.",
  );
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.assignBookingRoom", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", bookingId);
    if (!booking || (!canSeeAppointments(auth.profile) && kindOf(booking) === "appuntamento")) {
      return fail("Prenotazione non trovata.");
    }
    if (!canAssignRoom(auth.profile, kindOf(booking))) {
      return fail("Solo le prenotazioni normali hanno la sala assegnabile.");
    }
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

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
  });
}

/** Ripristina i piatti copiandoli dal menù della prenotazione (solo admin, solo eventi). */
export async function resetDishesFromMenu(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Prenotazione non valida.");
  const auth = await authorize(canEditDishes, "Solo l'amministratore può modificare i piatti.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.resetDishesFromMenu", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", id);
    if (!booking) return fail("Prenotazione non trovata.");
    if (kindOf(booking) !== "evento") return fail("I piatti si modificano solo sugli eventi.");
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

    try {
      await resetBookingDishesFromMenu(auth.db, id, { id: auth.profile.id, full_name: auth.profile.full_name });
    } catch (err) {
      return dbFail(err);
    }

    revalidateBooking(id);
    const actor = auth.profile;
    after(() => notifyBookingEvent({ type: "dishes_updated", bookingId: id, actor }));
    return { ok: true, data: undefined };
  });
}

/**
 * Allergie e patologie: sostituzione dell'elenco. Admin sempre; sala attiva su eventi e prenotazioni normali
 * (canEditAllergies). Audit e notifica (booking_updated) solo se qualcosa cambia.
 */
export async function saveBookingAllergies(bookingId: string, allergies: BookingAllergyDraft[], opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize((p) => p.active, "Non sei autorizzato a modificare le allergie.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.saveBookingAllergies", auth.profile.id, async (): Promise<ActionResult> => {
    const booking = await fetchOne(auth.db, "bookings", bookingId);
    if (!booking) return fail("Prenotazione non trovata.");
    if (!canEditAllergies(auth.profile, kindOf(booking))) {
      return fail("Non sei autorizzato a modificare le allergie di questa prenotazione.");
    }
    const conflict = await checkConflict(auth.db, opts, booking);
    if (conflict) return conflict;

    const parsed = BookingAllergiesInput.safeParse(allergies);
    if (!parsed.success) return invalidInput(parsed.error);

    const actor = auth.profile;
    let changed: boolean;
    try {
      changed = await writeAllergies(auth.db, bookingId, parsed.data, { id: actor.id, full_name: actor.full_name });
    } catch (err) {
      return dbFail(err);
    }
    if (!changed) return { ok: true, data: undefined };

    revalidateBooking(bookingId, String(booking.client ?? "") || undefined);
    after(() => notifyBookingEvent({ type: "booking_updated", bookingId, actor }));
    return { ok: true, data: undefined };
  });
}

function revalidateNotes(bookingId: string): void {
  revalidatePath("/admin/agenda");
  revalidatePath(`/admin/prenotazioni/${bookingId}`);
}

/** Aggiunge una nota interna alla prenotazione (admin e cucina). Autore e nome dal profilo. */
export async function addBookingNote(bookingId: string, body: string, opts?: MutationOptions): Promise<ActionResult<{ id: string }>> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(canAddBookingNote, "Non sei autorizzato ad aggiungere note.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.addBookingNote", auth.profile.id, async (): Promise<ActionResult<{ id: string }>> => {
    const parsed = BookingNoteBody.safeParse(body);
    if (!parsed.success) return invalidInput(parsed.error);

    const booking = await fetchOne(auth.db, "bookings", bookingId);
    if (!booking || (!canSeeAppointments(auth.profile) && kindOf(booking) === "appuntamento")) {
      return fail("Prenotazione non trovata.");
    }

    const profile = auth.profile;
    try {
      const record = await auth.db.collection("booking_notes").create({
        booking: bookingId,
        author: profile.id,
        author_name: profile.full_name || "Utente",
        body: parsed.data,
      });
      revalidateNotes(bookingId);
      return { ok: true, data: { id: record.id } };
    } catch (err) {
      return dbFail(err);
    }
  });
}

/** Elimina una nota: l'autore o l'amministratore. */
export async function deleteBookingNote(noteId: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(noteId)) return fail("Nota non valida.");
  const auth = await authorize((p) => p.active, "Non sei autorizzato a eliminare la nota.");
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "bookings.deleteBookingNote", auth.profile.id, async (): Promise<ActionResult> => {
    const note = await fetchOne(auth.db, "booking_notes", noteId);
    if (!note) {
      // Coda offline: nota già eliminata (solo nel reinvio) = successo. Dal form: "non trovata", come prima.
      if (opts?.replay === true) return { ok: true, data: undefined };
      return fail("Nota non trovata.");
    }
    if (!isAdmin(auth.profile) && String(note.author ?? "") !== auth.profile.id) {
      return fail("Puoi eliminare solo le note che hai scritto.");
    }
    const parentBooking = await fetchOne(auth.db, "bookings", String(note.booking ?? ""));
    if (!parentBooking || (!canSeeAppointments(auth.profile) && kindOf(parentBooking) === "appuntamento")) {
      return fail("Nota non trovata.");
    }
    // La nota non ha un proprio `updated` utile per il conflitto: si confronta la prenotazione genitore.
    const conflict = await checkConflict(auth.db, opts, parentBooking);
    if (conflict) return conflict;

    try {
      await auth.db.collection("booking_notes").delete(noteId);
    } catch (err) {
      return dbFail(err);
    }
    revalidateNotes(String(note.booking ?? ""));
    return { ok: true, data: undefined };
  });
}
