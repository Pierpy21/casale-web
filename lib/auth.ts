import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createUserPb, readAuthToken } from "@/lib/pocketbase/server";
import { mapProfile } from "@/lib/pocketbase/mappers";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import { isAdmin } from "./permissions";
import type { Profile } from "./types";

export { isAdmin, canEditCovers, canEditDishes } from "./permissions";

/**
 * Carica il profilo dal token dell'utente. authRefresh valida il token col server PocketBase
 * (e la regola authRule blocca gli operatori disattivati). Null se non valido, inattivo o non raggiungibile.
 */
export async function loadProfileFromToken(token: string | null): Promise<Profile | null> {
  if (!token) return null;
  try {
    const pb = createUserPb(token);
    const { record } = await pb.collection("users").authRefresh();
    if (!record || !record.active) return null;
    return mapProfile(record as unknown as PbRecord);
  } catch {
    return null;
  }
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
