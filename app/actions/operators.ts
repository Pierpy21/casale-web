"use server";

import { revalidatePath } from "next/cache";
import { OperatorInput, OperatorUpdateInput, PasswordInput } from "@/lib/validation";
import { authorize, dbFail, fail, invalidInput, isRecordId } from "@/lib/action-utils";
import { isAdmin } from "@/lib/permissions";
import { fetchOne } from "@/lib/pocketbase/queries";
import type { ActionResult } from "@/lib/types";

/** Crea l'utente (collezione users) con il profilo: ruolo, chef, stato. */
export async function createOperator(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = OperatorInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { full_name, email, password, role, is_chef } = parsed.data;

  try {
    const record = await auth.db.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      full_name,
      role,
      is_chef,
      active: true,
      // Niente `verified`: lo può impostare solo chi ha la manage rule di users; il login con password non lo richiede.
      emailVisibility: true,
    });
    revalidatePath("/admin/operatori");
    return { ok: true, data: { id: record.id } };
  } catch (err) {
    const data = (err as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
    if (data?.email?.code === "validation_not_unique") {
      return fail("Esiste già un utente con questa email.");
    }
    if (data?.password) {
      return fail("Password non accettata: usa almeno 8 caratteri.");
    }
    return dbFail(err, "Impossibile creare l'utente. Controlla i dati e riprova.");
  }
}

/** Modifica nome, ruolo, flag chef e stato attivo. Non è possibile modificare l'amministratore. */
export async function updateOperator(id: string, input: unknown): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Operatore non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = OperatorUpdateInput.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);

  const target = await fetchOne(auth.db, "users", id);
  if (!target) return fail("Operatore non trovato.");
  if (target.role === "admin") return fail("Non è possibile modificare l'amministratore.");

  try {
    // authRule (active = true) blocca il login degli operatori disattivati; la sessione esistente
    // viene rifiutata alla prossima verifica (loadProfileFromToken).
    await auth.db.collection("users").update(id, parsed.data);
  } catch (err) {
    return dbFail(err);
  }

  revalidatePath("/admin/operatori");
  return { ok: true, data: undefined };
}

/** Imposta una nuova password (invalida le sessioni dell'operatore). Non consentito per l'amministratore. */
export async function resetOperatorPassword(id: string, password: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Operatore non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;

  const parsed = PasswordInput.safeParse({ password });
  if (!parsed.success) return invalidInput(parsed.error);

  const target = await fetchOne(auth.db, "users", id);
  if (!target) return fail("Operatore non trovato.");
  if (target.role === "admin") return fail("Non è possibile reimpostare la password dell'amministratore da qui.");

  try {
    await auth.db.collection("users").update(id, {
      password: parsed.data.password,
      passwordConfirm: parsed.data.password,
    });
  } catch {
    return fail("Impossibile aggiornare la password. Riprova.");
  }

  return { ok: true, data: undefined };
}

/**
 * Elimina definitivamente un operatore. Non si può eliminare l'amministratore né il proprio account.
 * Prenotazioni, storico, preventivi e giacenze restano: il riferimento all'utente si svuota
 * (relazioni facoltative), il nome resta nei campi *_name. Notifiche e iscrizioni push vanno via in cascata.
 */
export async function deleteOperator(id: string): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Operatore non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;
  if (id === auth.profile.id) return fail("Non puoi eliminare il tuo account.");

  const target = await fetchOne(auth.db, "users", id);
  if (!target) return fail("Operatore non trovato.");
  if (target.role === "admin") return fail("Non è possibile eliminare l'amministratore.");

  try {
    await auth.db.collection("users").delete(id);
  } catch (err) {
    return dbFail(err, "Impossibile eliminare l'operatore. Riprova.");
  }

  revalidatePath("/admin/operatori");
  return { ok: true, data: undefined };
}

/** Attiva o disattiva l'accesso di un operatore (switch nella lista). Non per l'amministratore né per sé stessi. */
export async function setOperatorActive(id: string, active: boolean): Promise<ActionResult> {
  if (!isRecordId(id)) return fail("Operatore non valido.");
  const auth = await authorize(isAdmin);
  if (!auth.ok) return auth;
  if (id === auth.profile.id) return fail("Non puoi disattivare il tuo account.");

  const target = await fetchOne(auth.db, "users", id);
  if (!target) return fail("Operatore non trovato.");
  if (target.role === "admin") return fail("Non è possibile disattivare l'amministratore.");

  try {
    // authRule (active = true) blocca il login; la sessione esistente viene rifiutata alla prossima verifica.
    await auth.db.collection("users").update(id, { active: active === true });
  } catch (err) {
    return dbFail(err);
  }

  revalidatePath("/admin/operatori");
  return { ok: true, data: undefined };
}
