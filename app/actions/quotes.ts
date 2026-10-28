"use server";

import { revalidatePath } from "next/cache";
import { EventFinalTotalInput, QuoteInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { checkConflict, checkConflictById, withMutation } from "@/lib/mutations";
import type { MutationOptions } from "@/lib/offline/contract";
import { fetchOne } from "@/lib/pocketbase/queries";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import {
  createQuoteFromBooking as writeQuoteFromBooking,
  deleteQuoteRecord,
  setEventFinalTotal,
  updateQuoteRecord,
} from "@/lib/rpc/quotes";
import type { ActionResult } from "@/lib/types";

/** Crea il preventivo con le righe automatiche da menù e coperti (numero progressivo per anno, race-safe). */
export async function createQuoteFromBooking(bookingId: string, opts?: MutationOptions): Promise<ActionResult<{ id: string }>> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "quotes.createQuoteFromBooking", auth.profile.id, async (): Promise<ActionResult<{ id: string }>> => {
    try {
      const id = await writeQuoteFromBooking(auth.db, bookingId, { id: auth.profile.id });
      revalidatePath(`/admin/prenotazioni/${bookingId}`);
      return { ok: true, data: { id } };
    } catch (err) {
      return dbFail(err);
    }
  });
}

export async function updateQuote(id: string, input: unknown, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Preventivo non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "quotes.updateQuote", auth.profile.id, async (): Promise<ActionResult> => {
    const parsed = QuoteInput.safeParse(input);
    if (!parsed.success) return invalidInput(parsed.error);

    const conflict = await checkConflictById(auth.db, "quotes", id, opts);
    if (conflict) return conflict;

    try {
      const bookingId = await updateQuoteRecord(auth.db, id, parsed.data);
      revalidatePath(`/admin/preventivi/${id}`);
      revalidatePath(`/admin/prenotazioni/${bookingId}`);
      return { ok: true, data: undefined };
    } catch (err) {
      return dbFail(err);
    }
  });
}

export async function deleteQuote(id: string, opts?: MutationOptions): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Preventivo non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "quotes.deleteQuote", auth.profile.id, async (): Promise<ActionResult> => {
    // Coda offline: preventivo già eliminato (solo nel reinvio) = successo. Dal form resta com'era.
    if (opts?.replay === true && !(await fetchOne(auth.db, "quotes", id))) return { ok: true, data: undefined };
    const conflict = await checkConflictById(auth.db, "quotes", id, opts);
    if (conflict) return conflict;

    try {
      const bookingId = await deleteQuoteRecord(auth.db, id);
      revalidatePath(`/admin/prenotazioni/${bookingId}`);
      return { ok: true, data: undefined };
    } catch (err) {
      return dbFail(err);
    }
  });
}

/**
 * Prezzo finale di un evento (IVA inclusa) sul preventivo più recente (lo crea se manca).
 * `finalTotal` null = torna al calcolo automatico. Solo admin, solo eventi, con audit "Prezzo finale".
 * Conflitto: se è passato `expectedUpdated`, si confronta il `updated` del preventivo più recente
 * (è quello che il prezzo finale modifica). Senza preventivi non c'è nulla da confrontare.
 */
export async function setEventFinalPrice(
  bookingId: string,
  finalTotal: number | null,
  opts?: MutationOptions,
): Promise<ActionResult<{ quoteId: string }>> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const parsed = EventFinalTotalInput.safeParse(finalTotal);
  if (!parsed.success) return invalidInput(parsed.error);
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  return withMutation(auth.db, opts, "quotes.setEventFinalPrice", auth.profile.id, async (): Promise<ActionResult<{ quoteId: string }>> => {
    if (opts?.expectedUpdated) {
      const latest = (
        await auth.db.collection("quotes").getList(1, 1, {
          filter: auth.db.filter("booking = {:id}", { id: bookingId }),
          sort: "-created,-id",
          skipTotal: true,
        })
      ).items[0] as PbRecord | undefined;
      if (latest) {
        const conflict = await checkConflict(auth.db, opts, latest);
        if (conflict) return conflict;
      }
    }

    try {
      const quoteId = await setEventFinalTotal(auth.db, bookingId, parsed.data, {
        id: auth.profile.id,
        full_name: auth.profile.full_name,
      });
      revalidatePath(`/admin/prenotazioni/${bookingId}`);
      revalidatePath(`/admin/preventivi/${quoteId}`);
      return { ok: true, data: { quoteId } };
    } catch (err) {
      return dbFail(err);
    }
  });
}
