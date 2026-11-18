import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { readFestiveEnabled } from "@/lib/festive";
import { getAdminPb } from "@/lib/pocketbase/admin";

/** Interruttore della fascia "Buone Feste" per l'admin (Menù & Sale). Non autenticato, mancante o errore → false. */
export async function getFestiveSectionEnabled(): Promise<boolean> {
  try {
    if (!(await getCurrentProfile())) return false;
    return await readFestiveEnabled(await getAdminPb());
  } catch {
    return false;
  }
}
