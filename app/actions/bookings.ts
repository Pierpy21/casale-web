"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { BookingInput, coversInputFor, DishesInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId, UserFacingError } from "@/lib/action-utils";
import { createQuote } from "@/lib/rpc/quotes";
import { canCreateAnyBooking, canCreateBooking, canEditBookingFully, canEditCovers, canEditDishes, isAdmin } from "@/lib/permissions";
import { fetchOne } from "@/lib/pocketbase/queries";
import { loadBookingBrief, notifyBookingDeleted, notifyBookingEvent } from "@/lib/notify";
import {
  deleteBookingRecord,
  resetBookingDishesFromMenu,
  saveBookingDishes,
  updateBookingCovers as writeCovers,
  upsertBooking,
} from "@/lib/rpc/bookings";
import type { ActionResult, BookingKind } from "@/lib/types";

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
  const newStatus = parsed.data.status;
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
