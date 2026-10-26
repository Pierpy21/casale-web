import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId } from "@/lib/pocketbase/helpers";
import { fetchOne, listAll } from "@/lib/pocketbase/queries";
import { mapQuote } from "@/lib/pocketbase/mappers";
import { isAdmin } from "@/lib/permissions";
import type { Quote, QuoteWithBooking } from "@/lib/types";
import { BOOKING_DETAIL_EXPAND, bookingDetail } from "./shared";

// I preventivi sono solo per l'admin (come la vecchia policy quotes_admin_all).

export async function getQuote(id: string): Promise<QuoteWithBooking | null> {
  if (!isRecordId(id)) return null;
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return null;
  const db = await getAdminPb();
  const quote = await fetchOne(db, "quotes", id);
  if (!quote) return null;
  const booking = await fetchOne(db, "bookings", String(quote.booking), BOOKING_DETAIL_EXPAND);
  if (!booking) return null;
  return { ...mapQuote(quote), booking: await bookingDetail(db, booking) };
}

export async function getQuotesForBooking(bookingId: string): Promise<Quote[]> {
  if (!isRecordId(bookingId)) return [];
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return [];
  const db = await getAdminPb();
  const records = await listAll(db, "quotes", db.filter("booking = {:id}", { id: bookingId }), {
    sort: "-created",
  });
  return records.map(mapQuote);
}
