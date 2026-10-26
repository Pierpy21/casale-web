import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId, dayEndPb, dayStartPb, num, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";

import { mapChange } from "@/lib/pocketbase/mappers";
import { listAll, fetchOne } from "@/lib/pocketbase/queries";
import { addDaysISO, monthBounds, romeToday } from "@/lib/dates";
import type {
  BookingChange,
  BookingDetail,
  BookingListItem,
  DashboardStats,
  RoomBookingSlot,
} from "@/lib/types";
import {
  BOOKING_DETAIL_EXPAND,
  BOOKING_LIST_EXPAND,
  bookingDetail,
  bookingListItems,
  sortBookingRecords,
} from "./shared";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Prenotazioni con sala assegnata nell'intervallo (esclusi gli annullati), select minima. */
export async function getRoomBookingSlots(from: string, to: string): Promise<RoomBookingSlot[]> {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return [];
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const records = await listAll(
    db,
    "bookings",
    db.filter(
      "event_date >= {:from} && event_date <= {:to} && status != {:s} && kind != {:k} && room != ''",
      { from: dayStartPb(from), to: dayEndPb(to), s: "annullato", k: "appuntamento" },
    ),
    { expand: "client" },
  );
  return sortBookingRecords(records).map((r) => {
    const client = r.expand?.client as PbRecord | undefined;
    return {
      id: r.id,
      event_date: toDateOnly(r.event_date),
      event_name: r.event_name ? String(r.event_name) : null,
      room_id: String(r.room ?? ""),
      client_name: client ? `${client.first_name} ${client.last_name}` : "",
      adults: num(r.adults),
      children: num(r.children),
    };
  });
}

export async function getBookingsInRange(
  from: string,
  to: string,
  opts?: { includeCancelled?: boolean },
): Promise<BookingListItem[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const cancelled = opts?.includeCancelled ? "" : " && status != {:s}";
  const records = await listAll(
    db,
    "bookings",
    db.filter(`event_date >= {:from} && event_date <= {:to}${cancelled}`, {
      from: dayStartPb(from),
      to: dayEndPb(to),
      s: "annullato",
    }),
    { expand: BOOKING_LIST_EXPAND },
  );
  return bookingListItems(db, sortBookingRecords(records));
}

export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!isRecordId(id)) return null;
  if (!(await getCurrentProfile())) return null;
  const db = await getAdminPb();
  const record = await fetchOne(db, "bookings", id, BOOKING_DETAIL_EXPAND);
  return record ? bookingDetail(db, record) : null;
}

export async function getBookingChanges(bookingId: string): Promise<BookingChange[]> {
  if (!isRecordId(bookingId)) return [];
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const records = await listAll(db, "booking_changes", db.filter("booking = {:id}", { id: bookingId }), {
    sort: "-created,-id",
  });
  return records.map(mapChange);
}

/** Registro delle eliminazioni di prenotazioni (più recenti per primo), per la dashboard admin. */
export async function getDeletionLog(limit: number): Promise<BookingChange[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const max = Math.max(1, Math.min(limit, 100));
  const page = await db.collection("booking_changes").getList(1, max, {
    filter: db.filter("field = {:f}", { f: "eliminazione" }),
    sort: "-created,-id",
    skipTotal: true,
  });
  return (page.items as unknown as PbRecord[]).map(mapChange);
}

export async function getRoomOccupancy(date: string): Promise<{ room_id: string; booking_id: string }[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const records = await listAll(
    db,
    "bookings",
    db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind != {:k} && room != ''", {
      from: dayStartPb(date),
      to: dayEndPb(date),
      s: "annullato",
      k: "appuntamento",
    }),
    { fields: "id,room" },
  );
  return records.map((r) => ({ room_id: String(r.room), booking_id: r.id }));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const empty: DashboardStats = { eventsThisMonth: 0, coversNext7Days: 0, pendingOptions: 0, eventsToday: 0 };
  if (!(await getCurrentProfile())) return empty;
  const db = await getAdminPb();
  const today = romeToday();
  const { from, to } = monthBounds(today);
  const weekEnd = addDaysISO(today, 6);
  const notCancelled = db.filter("status != {:s}", { s: "annullato" });

  const count = async (filter: string): Promise<number> =>
    (await db.collection("bookings").getList(1, 1, { filter, skipTotal: false })).totalItems;

  const [eventsThisMonth, eventsToday, pendingOptions, week] = await Promise.all([
    count(db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind != {:k}", { from: dayStartPb(from), to: dayEndPb(to), s: "annullato", k: "appuntamento" })),
    count(db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind != {:k}", { from: dayStartPb(today), to: dayEndPb(today), s: "annullato", k: "appuntamento" })),
    count(db.filter("status = {:s} && event_date >= {:from}", { s: "opzione", from: dayStartPb(today) })),
    listAll(
      db,
      "bookings",
      `${db.filter("event_date >= {:from} && event_date <= {:to}", { from: dayStartPb(today), to: dayEndPb(weekEnd) })} && ${notCancelled}`,
      { fields: "adults,children" },
    ),
  ]);

  const coversNext7Days = week.reduce((acc, b) => acc + num(b.adults) + num(b.children), 0);
  return { eventsThisMonth, eventsToday, pendingOptions, coversNext7Days };
}

export async function getUpcomingBookings(limit: number): Promise<BookingListItem[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const records = await listAll(
    db,
    "bookings",
    db.filter("event_date >= {:from} && status != {:s}", { from: dayStartPb(romeToday()), s: "annullato" }),
    { expand: BOOKING_LIST_EXPAND },
  );
  const max = Math.max(1, Math.min(limit, 100));
  return bookingListItems(db, sortBookingRecords(records).slice(0, max));
}
