import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { dayEndPb, dayStartPb, nn, num, type PbRecord } from "@/lib/pocketbase/helpers";
import { listAll } from "@/lib/pocketbase/queries";
import { extraTableNumbersOf, mapRoomTable } from "@/lib/pocketbase/mappers";
import { bookingPersonName, bookingPhone } from "@/components/bookings/format";
import { canViewFloorPlan } from "@/lib/permissions";
import {
  BOOKING_MEALS,
  type BookingMeal,
  type BookingStatus,
  type FloorBooking,
  type FloorEvent,
  type FloorPlanData,
} from "@/lib/types";
import { getRooms } from "./catalog";
import { bookingPersonOf } from "./shared";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Titolo dell'evento nella mappa: tipo + cognome del cliente (es. "Matrimonio Rossi"); senza tipo "Evento". */
function floorEventTitle(r: PbRecord): string {
  const client = r.expand?.client as PbRecord | undefined;
  const lastName = nn(client?.last_name)?.trim() ?? "";
  const who = lastName || bookingPersonName(bookingPersonOf(r));
  return [nn(r.event_type) ?? "Evento", who].filter(Boolean).join(" ");
}

/**
 * Mappa sala di un giorno e pasto. Tavoli: per ogni sala, se esiste una disposizione speciale del giorno/pasto
 * (tavoli con layout_date) si usa solo quella (sala in `dayLayoutRoomIds`), altrimenti quella standard.
 * Prenotazioni normali non annullate; eventi non annullati anche senza sala (room_id null = da assegnare).
 * Pasto vuoto sul record = vale per entrambi i pasti. Appuntamenti esclusi. Dati vuoti se non loggato,
 * senza permesso o con data non valida.
 */
export async function getFloorPlan(date: string, meal: BookingMeal): Promise<FloorPlanData> {
  const empty: FloorPlanData = { date, meal, rooms: [], tables: [], dayLayoutRoomIds: [], bookings: [], events: [] };
  if (!ISO_DATE.test(date) || !(BOOKING_MEALS as readonly string[]).includes(meal)) return empty;
  const me = await getCurrentProfile();
  if (!me || !canViewFloorPlan(me)) return empty;

  const db = await getAdminPb();
  // Giorno, non annullato, pasto (o nessun pasto sul record = entrambi i pasti).
  const dayFilter = db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && (meal = {:m} || meal = '')", {
    from: dayStartPb(date),
    to: dayEndPb(date),
    s: "annullato",
    m: meal,
  });
  // Tavoli attivi: la disposizione standard (layout_date vuoto) e quella speciale di questo giorno e pasto.
  const tableFilter = db.filter("active = {:a} && (layout_date = '' || (layout_date = {:d} && layout_meal = {:m}))", {
    a: true,
    d: date,
    m: meal,
  });

  const [rooms, tableRecords, bookingRecords, eventRecords] = await Promise.all([
    getRooms(),
    listAll(db, "room_tables", tableFilter, {
      sort: "number",
      fields: "id,room,number,seats,shape,x,y,rotation,active,layout_date,layout_meal",
    }),
    listAll(db, "bookings", `${db.filter("kind = {:k}", { k: "normale" })} && ${dayFilter}`, { expand: "client" }),
    listAll(db, "bookings", `${db.filter("kind = {:k}", { k: "evento" })} && ${dayFilter}`, { expand: "client" }),
  ]);

  const roomIds = new Set(rooms.map((r) => r.id));
  // Sale con una disposizione speciale per questo giorno e pasto: lì si usano solo i suoi tavoli.
  const dayRoomIds = new Set(
    tableRecords.filter((r) => nn(r.layout_date) !== null).map((r) => String(r.room ?? "")),
  );
  const tables = tableRecords
    .map(mapRoomTable)
    .filter((t) => roomIds.has(t.room_id))
    .filter((t) => (dayRoomIds.has(t.room_id) ? t.layout_date !== null : t.layout_date === null));
  const dayLayoutRoomIds = [...dayRoomIds].filter((id) => roomIds.has(id)).sort();

  const bookings: FloorBooking[] = bookingRecords
    .map((r) => {
      const person = bookingPersonOf(r);
      const adults = num(r.adults);
      const children = num(r.children);
      return {
        id: r.id,
        name: bookingPersonName(person),
        phone: bookingPhone(person),
        covers: adults + children,
        adults,
        children,
        status: r.status as BookingStatus,
        room_id: nn(r.room),
        table_number: num(r.table_number) > 0 ? num(r.table_number) : null,
        notes: nn(r.notes)?.trim() || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  const events: FloorEvent[] = eventRecords.map((r) => {
    // Tavolo principale; se manca, il primo tavolo extra diventa il principale. table_numbers = tutti, senza duplicati.
    const principal = num(r.table_number) > 0 ? num(r.table_number) : null;
    const extras = extraTableNumbersOf(r);
    const tableNumber = principal ?? extras[0] ?? null;
    return {
      id: r.id,
      room_id: nn(r.room),
      table_number: tableNumber,
      table_numbers: tableNumber === null ? [] : [tableNumber, ...extras.filter((n) => n !== tableNumber)],
      title: floorEventTitle(r),
      covers: num(r.adults) + num(r.children),
      status: r.status as BookingStatus,
    };
  });

  return { date, meal, rooms, tables, dayLayoutRoomIds, bookings, events };
}
