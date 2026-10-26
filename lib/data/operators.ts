import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { listAll } from "@/lib/pocketbase/queries";
import { mapProfile } from "@/lib/pocketbase/mappers";
import { isAdmin } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

/** Elenco operatori (solo admin: per gli altri ritorna array vuoto). */
export async function getOperators(): Promise<Profile[]> {
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return [];

  const db = await getAdminPb();
  const records = await listAll(db, "users", "", { sort: "role,full_name" });
  return records
    .map(mapProfile)
    .sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name, "it"));
}
