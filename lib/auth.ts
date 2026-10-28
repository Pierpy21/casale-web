import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { createUserPb, readAuthToken } from "@/lib/pocketbase/server";
import { mapProfile } from "@/lib/pocketbase/mappers";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import { isAdmin } from "./permissions";
import type { Profile } from "./types";

export { isAdmin, canEditCovers, canEditDishes } from "./permissions";

/** Risposte di PocketBase che significano "sessione non valida": token scaduto/errato, utente eliminato o senza accesso. */
const AUTH_FAILURE_STATUSES = [401, 403, 404];

/**
 * Carica il profilo dal token dell'utente. authRefresh valida il token col server PocketBase
 * (e la regola authRule blocca gli operatori disattivati).
 * - Null: nessun token, token non valido/scaduto, utente inattivo o senza accesso (vera sessione assente).
 * - Eccezione: errori di rete, timeout, 5xx. Non è un logout: la pagina va in errore, non si rimanda al login.
 */
export async function loadProfileFromToken(token: string | null): Promise<Profile | null> {
  if (!token) return null;
  let record: PbRecord | undefined;
  try {
    const pb = createUserPb(token);
    const res = await pb.collection("users").authRefresh();
    record = res.record as unknown as PbRecord | undefined;
  } catch (err) {
    if (err instanceof ClientResponseError && AUTH_FAILURE_STATUSES.includes(err.status)) return null;
    throw err;
  }
  if (!record || !record.active) return null;
  return mapProfile(record);
}

/** Profilo corrente per la request (deduplicato con cache di React). */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  return loadProfileFromToken(await readAuthToken());
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/admin/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect("/admin/agenda");
  return profile;
}
