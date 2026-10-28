import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { countWhere, listAll } from "@/lib/pocketbase/queries";
import { mapNotification } from "@/lib/pocketbase/mappers";
import type { PbRecord } from "@/lib/pocketbase/helpers";
import { canSeeAppointments } from "@/lib/permissions";
import type { AppNotification } from "@/lib/types";
import { appointmentIdsAmong } from "./shared";

/** Notifiche in-app dell'utente corrente, più recenti per prime. La sala non riceve quelle sugli appuntamenti. */
export async function getNotifications(limit = 30): Promise<AppNotification[]> {
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  const max = Math.max(1, Math.min(limit, 100));
  const seeAppointments = canSeeAppointments(me);
  // Per la sala si scartano gli appuntamenti: si leggono pagine finche' non ci sono `max` notifiche visibili.
  const visible: PbRecord[] = [];
  for (let page = 1; visible.length < max; page++) {
    const records = await db.collection("notifications").getList(page, max, {
      filter: db.filter("user = {:id}", { id: me.id }),
      sort: "-created",
      skipTotal: true,
    });
    const items = records.items as unknown as PbRecord[];
    const hidden = seeAppointments ? new Set<string>() : await appointmentIdsAmong(db, items.map((r) => String(r.booking ?? "")));
    for (const r of items) if (!hidden.has(String(r.booking ?? ""))) visible.push(r);
    if (items.length < max) break;
  }
  return visible.slice(0, max).map(mapNotification);
}

/** Numero di notifiche non lette dell'utente corrente (esclusi gli appuntamenti per la sala). */
export async function getUnreadCount(): Promise<number> {
  const me = await getCurrentProfile();
  if (!me) return 0;
  const db = await getAdminPb();
  const unread = db.filter("user = {:id} && read_at = ''", { id: me.id });
  if (canSeeAppointments(me)) return countWhere(db, "notifications", unread);
  const rows = await listAll(db, "notifications", unread, { fields: "id,booking" });
  const hidden = await appointmentIdsAmong(db, rows.map((r) => String(r.booking ?? "")));
  return rows.filter((r) => !hidden.has(String(r.booking ?? ""))).length;
}
