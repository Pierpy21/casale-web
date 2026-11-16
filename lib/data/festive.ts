import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { mapFestive } from "@/lib/festive";
import { FESTIVE_SECTION_KEY, type FestiveMenu } from "@/lib/festive-types";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { pocketbasePublicUrl } from "@/lib/pocketbase/config";
import { listAll } from "@/lib/pocketbase/queries";

/** Menù festivi per l'admin (Menù & Sale): tutti, anche inattivi e passati, in ordine di data. */
export async function getFestiveAdmin(): Promise<{ enabled: boolean; menus: FestiveMenu[] }> {
  if (!(await getCurrentProfile())) return { enabled: false, menus: [] };
  const db = await getAdminPb();
  const [settings, records] = await Promise.all([
    listAll(db, "site_settings", db.filter("key = {:k}", { k: FESTIVE_SECTION_KEY }), { fields: "id,enabled" }),
    listAll(db, "festive_menus", "", { sort: "date" }),
  ]);
  const base = pocketbasePublicUrl();
  return {
    enabled: Boolean(settings[0]?.enabled),
    menus: records.map((r) => mapFestive(r, base)),
  };
}
