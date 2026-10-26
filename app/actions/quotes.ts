"use server";

import { revalidatePath } from "next/cache";
import { QuoteInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { createQuoteFromBooking as writeQuoteFromBooking, deleteQuoteRecord, updateQuoteRecord } from "@/lib/rpc/quotes";
import type { ActionResult } from "@/lib/types";

/** Crea il preventivo con le righe automatiche da menù e coperti (numero progressivo per anno, race-safe). */
export async function createQuoteFromBooking(bookingId: string): Promise<ActionResult<{ id: string }>> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    const id = await writeQuoteFromBooking(auth.db, bookingId, { id: auth.profile.id });
    revalidatePath(`/admin/prenotazioni/${bookingId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return dbFail(err);
  }
}

export async function updateQuote(id: string, input: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Preventivo non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = QuoteInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const bookingId = await updateQuoteRecord(auth.db, id, parsed.data);
    revalidatePath(`/admin/preventivi/${id}`);
    revalidatePath(`/admin/prenotazioni/${bookingId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return dbFail(err);
  }
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Preventivo non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  try {
    const bookingId = await deleteQuoteRecord(auth.db, id);
    revalidatePath(`/admin/prenotazioni/${bookingId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return dbFail(err);
  }
}
