import "server-only";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId } from "@/lib/pocketbase/helpers";
import type { ActionResult, Profile } from "./types";

// Helper condivisi dalle Server Actions. Non vanno in file "use server" (lì si esportano solo funzioni async).

export { isRecordId };
/** @deprecated Alias legacy: gli id non sono piu' UUID ma id PocketBase (usare isRecordId). */
export const isUuid = isRecordId;

export type Authorized =
  | { ok: true; db: PocketBase; profile: Profile }
  | { ok: false; error: string; code?: "unauthenticated" | "in_progress" };

/**
 * Verifica il profilo attivo (token nel cookie) e il permesso.
 * Ritorna il client di servizio (`db`, account app_services) per letture/scritture dopo i controlli.
 */
export async function authorize(
  allowed: (p: Profile) => boolean,
  denied = "Operazione non consentita.",
): Promise<Authorized> {
  let profile: Profile | null;
  try {
    profile = await getCurrentProfile();
  } catch (err) {
    // PocketBase irraggiungibile o 5xx (getCurrentProfile ora rilancia): esito strutturato e transitorio, la coda riprova.
    console.error("[auth] profilo non verificabile:", err);
    return { ok: false, error: "Servizio momentaneamente non disponibile. Riprova tra poco.", code: "in_progress" };
  }
  // Il code permette alla coda offline di fermarsi e chiedere di rientrare (lib/offline/contract.ts).
  if (!profile) return { ok: false, error: "Sessione non valida o utente non abilitato.", code: "unauthenticated" };
  if (!allowed(profile)) return { ok: false, error: denied };
  return { ok: true, db: await getAdminPb(), profile };
}

/** Errori Zod → fieldErrors (chiave = path puntato, "_form" per errori globali). */
export function invalidInput<T = never>(error: z.ZodError): ActionResult<T> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Controlla i campi evidenziati.", fieldErrors };
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/** Errore applicativo con messaggio leggibile (lanciato dai write layer in lib/rpc). */
export class UserFacingError extends Error {}

/** Traduce un errore PocketBase o applicativo in un messaggio per l'utente. */
export function dbFail<T = never>(err: unknown, fallback = "Operazione non riuscita. Riprova."): ActionResult<T> {
  if (err instanceof UserFacingError) return fail(err.message);
  if (err instanceof ClientResponseError) {
    if (err.status === 404) return fail("Elemento non trovato.");
    if (err.status === 403) return fail("Operazione non consentita.");
    if (err.status === 400) {
      const codes = Object.values(err.response?.data ?? {}) as { code?: string }[];
      if (codes.some((c) => c?.code === "validation_not_unique")) {
        return fail("Esiste già un elemento con questi dati.");
      }
      if (codes.some((c) => c?.code === "validation_required")) {
        return fail("Operazione non possibile: mancano dati obbligatori.");
      }
    }
  }
  // Il dettaglio per campo di PocketBase (es. { password: { code, message } }) altrimenti nei log appare come [Object].
  const details = err instanceof ClientResponseError ? JSON.stringify(err.response?.data ?? {}) : "";
  console.error("[db]", details, err);
  return fail(fallback);
}
