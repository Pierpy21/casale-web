import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { listAll } from "@/lib/pocketbase/queries";
import { mapPayment } from "@/lib/pocketbase/mappers";
import { isAdmin } from "@/lib/permissions";
import type { Payment } from "@/lib/types";

/** Acconti di una prenotazione (solo admin: per gli altri ritorna array vuoto). */
export async function getPayments(bookingId: string): Promise<Payment[]> {
  if (!isRecordId(bookingId)) return [];
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return [];

  const db = await getAdminPb();
  const records = await listAll(db, "payments", db.filter("booking = {:id}", { id: bookingId }), {
    sort: "paid_at,created",
  });
  return records.map(mapPayment);
}
