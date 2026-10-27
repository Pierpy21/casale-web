"use server";

import type PocketBase from "pocketbase";
import { revalidatePath } from "next/cache";
import { PaymentInput, ReceiptFile, resolveReceiptType } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { sanitizeReceiptName } from "@/lib/payment-utils";
import { dayStartPb, nn, type PbRecord } from "@/lib/pocketbase/helpers";
import { fetchOne } from "@/lib/pocketbase/queries";
import { syncEventStatusFromPayments } from "@/lib/rpc/bookings";
import type { ActionResult } from "@/lib/types";

/** Riallinea lo stato dell'evento agli acconti. Il pagamento è già salvato: un errore qui non annulla l'operazione. */
async function syncStatus(db: PocketBase, bookingId: string, actor: { id: string; full_name: string }): Promise<void> {
  try {
    await syncEventStatusFromPayments(db, bookingId, actor);
  } catch (err) {
    console.error("[payments] stato evento non riallineato:", err);
  }
}

function revalidateBookingViews(bookingId: string): void {
  revalidatePath(`/admin/prenotazioni/${bookingId}`);
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/dashboard");
}

// Acconti e ricevute: solo admin. La ricevuta e' un campo file PROTETTO su PocketBase:
// si crea il record e il file in un'unica richiesta (atomica), e si legge solo via /api/receipts/[id].

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Aggiunge un acconto a una prenotazione, con ricevuta opzionale (foto o PDF). */
export async function addPayment(bookingId: string, formData: FormData): Promise<ActionResult<{ id: string }>> {
  if (!isRecordId(bookingId)) return fail("Prenotazione non valida.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = PaymentInput.safeParse({
    amount: field(formData, "amount"),
    paid_at: field(formData, "paid_at"),
    method: field(formData, "method"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return invalidInput(parsed.error);

  // Un campo file vuoto (nessuna selezione nel browser) equivale ad assenza di ricevuta.
  const entry = formData.get("receipt");
  let receipt: File | null = null;
  if (entry instanceof File && entry.size > 0) {
    const checked = ReceiptFile.safeParse(entry);
    if (!checked.success) {
      const message = checked.error.issues[0]?.message ?? "Ricevuta non valida.";
      return { ok: false, error: message, fieldErrors: { receipt: [message] } };
    }
    receipt = checked.data;
  }

  const { db, profile } = auth;

  const booking = await fetchOne(db, "bookings", bookingId);
  if (!booking) return fail("Prenotazione non trovata.");
  if (String(booking.kind || "evento") !== "evento") return fail("Gli acconti si registrano solo sugli eventi.");

  const body = new FormData();
  body.set("booking", bookingId);
  body.set("amount", String(parsed.data.amount));
  body.set("paid_at", dayStartPb(parsed.data.paid_at));
  body.set("method", parsed.data.method ?? "");
  body.set("notes", parsed.data.notes ?? "");
  body.set("created_by", profile.id);

  if (receipt) {
    const mime = resolveReceiptType(receipt);
    if (!mime) return fail("Formato ricevuta non ammesso.");
    const named = new File([receipt], sanitizeReceiptName(receipt.name, mime), { type: mime });
    body.set("receipt", named);
    body.set("receipt_name", receipt.name.slice(0, 200) || "ricevuta");
    body.set("receipt_type", mime);
  }

  try {
    const record = await db.collection("payments").create(body);
    await syncStatus(db, bookingId, profile);
    revalidateBookingViews(bookingId);
    return { ok: true, data: { id: record.id } };
  } catch (err) {
    console.error("[payments] salvataggio acconto fallito:", err);
    return dbFail(err, "Impossibile salvare l'acconto. Controlla la ricevuta e riprova.");
  }
}

/** Elimina un acconto e la sua ricevuta (PocketBase elimina anche il file). */
export async function deletePayment(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Acconto non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const row = await fetchOne(auth.db, "payments", id);
  if (!row) return fail("Acconto non trovato.");

  try {
    await auth.db.collection("payments").delete(id);
  } catch (err) {
    return dbFail(err);
  }

  const bookingId = String(row.booking);
  await syncStatus(auth.db, bookingId, auth.profile);
  revalidateBookingViews(bookingId);
  return { ok: true, data: undefined };
}

/**
 * Indirizzo per aprire la ricevuta di un acconto (solo admin). Il file viene servito da
 * GET /api/receipts/[id], che verifica la sessione e recupera il file con il token di servizio.
 */
export async function getReceiptUrl(paymentId: string): Promise<ActionResult<{ url: string }>> {
  if (!isRecordId(paymentId)) return fail("Acconto non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const row: PbRecord | null = await fetchOne(auth.db, "payments", paymentId);
  if (!row) return fail("Acconto non trovato.");
  if (!nn(row.receipt)) return fail("Nessuna ricevuta allegata a questo acconto.");

  return { ok: true, data: { url: `/api/receipts/${paymentId}` } };
}
