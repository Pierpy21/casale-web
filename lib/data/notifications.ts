import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { countWhere } from "@/lib/pocketbase/queries";
import { mapNotification } from "@/lib/pocketbase/mappers";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import type { AppNotification } from "@/lib/types";

/** Notifiche in-app dell'utente corrente, più recenti per prime. */
export async function getNotifications(limit = 30): Promise<AppNotification[]> {
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  const max = Math.max(1, Math.min(limit, 100));
  const records = await db.collection("notifications").getList(1, max, {
    filter: db.filter("user = {:id}", { id: me.id }),
    sort: "-created",
    skipTotal: true,
  });
  return records.items.map((r) => mapNotification(r as unknown as PbRecord));
}

/** Numero di notifiche non lette dell'utente corrente. */
export async function getUnreadCount(): Promise<number> {
  const me = await getCurrentProfile();
  if (!me) return 0;
  const db = await getAdminPb();
  return countWhere(db, "notifications", db.filter("user = {:id} && read_at = ''", { id: me.id }));
}
