import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import type PocketBase from "pocketbase";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId, dayEndPb, dayStartPb, nn, num, toDateOnly, type PbRecord } from "@/lib/pocketbase/helpers";

import { mapChange } from "@/lib/pocketbase/mappers";
import { listAll, listByParents, fetchOne } from "@/lib/pocketbase/queries";
import { addDaysISO, monthBounds, romeToday } from "@/lib/dates";
import { canAssignRoom, canSeeAppointments, canViewActivityLog, isAdmin } from "@/lib/permissions";
import { mondayOf } from "@/lib/stats-period";
import {
  BOOKING_KINDS,
  type ActivityEntry,
  type BookingChange,
  type BookingDetail,
  type BookingKind,
  type BookingListItem,
  type CoversStats,
  type DashboardStats,
  type MenuConsumption,
  type NextEventBrief,
  type Profile,
  type ReservationSheet,
  type ReservationSheetRow,
  type RoomBookingSlot,
  type StatsKind,
  type WeekStats,
} from "@/lib/types";
import {
  BOOKING_DETAIL_EXPAND,
  BOOKING_LIST_EXPAND,
  bookingDetail,
  bookingListItems,
  sortBookingRecords,
} from "./shared";

/** Clausola PocketBase che esclude gli appuntamenti (solo per la sala). Vuota per admin e cucina. */
function appointmentsClause(db: PocketBase, me: Profile): string {
  return canSeeAppointments(me) ? "" : ` && ${db.filter("kind != {:ka}", { ka: "appuntamento" })}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Campo di audit del prezzo finale evento: visibile solo all'admin (sala e cucina non devono vederlo). */
const PRICE_FIELD = "Prezzo finale";

type WithMenus = { menu?: object | null; kids_menu?: object | null };

/** Se il menù porta `price_per_person` lo azzera a 0 (le liste portano solo il nome del menù bambini). */
function zeroPrice<M extends object>(m: M): M {
  return "price_per_person" in m ? { ...m, price_per_person: 0 } : m;
}

/**
 * Azzera i prezzi dei menù (adulti e bambini) per i ruoli non admin, prima che il dato esca dal server.
 * Il campo resta presente con valore 0 così i tipi non cambiano.
 */
function zeroMenuPrices<T extends WithMenus>(item: T): T {
  return {
    ...item,
    ...(item.menu ? { menu: zeroPrice(item.menu) } : {}),
    ...(item.kids_menu ? { kids_menu: zeroPrice(item.kids_menu) } : {}),
  };
}

/** La cucina non riceve mai il telefono del cliente: il campo resta presente, vuoto. */
/** La cucina non riceve dati di contatto del cliente: telefono ed email azzerati (se presenti). */
function hideKitchenPhone<T extends { client: { phone: string; email?: string | null } }>(item: T, me: Profile): T {
  if (me.role !== "cucina") return item;
  const client = { ...item.client, phone: "" };
  if ("email" in client) client.email = null;
  return { ...item, client };
}

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
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  const cancelled = opts?.includeCancelled ? "" : " && status != {:s}";
  const records = await listAll(
    db,
    "bookings",
    db.filter(`event_date >= {:from} && event_date <= {:to}${cancelled}${appointmentsClause(db, me)}`, {
      from: dayStartPb(from),
      to: dayEndPb(to),
      s: "annullato",
    }),
    { expand: BOOKING_LIST_EXPAND },
  );
  const items = await bookingListItems(db, sortBookingRecords(records));
  return items.map((i) => hideKitchenPhone(isAdmin(me) ? i : zeroMenuPrices(i), me));
}

/** Tavolo di una prenotazione normale: numero > 0, altrimenti null (0 nel record = nessun tavolo). */
function tableOf(record: PbRecord): number | null {
  return num(record.table_number) > 0 ? num(record.table_number) : null;
}

/**
 * Foglio prenotazioni di un giorno (export PDF/DOCX): prenotazioni normali non annullate.
 * Ordine: sala (ordine della sala, poi nome; senza sala in fondo), tavolo crescente (senza tavolo in fondo), orario, nome.
 * Null se non loggato o se non admin / sala attiva. I dati mancanti restano null (non bloccano l'export).
 */
export async function getReservationSheet(date: string): Promise<ReservationSheet | null> {
  if (!ISO_DATE.test(date)) return null;
  const me = await getCurrentProfile();
  if (!me || !canAssignRoom(me, "normale")) return null;
  const db = await getAdminPb();
  const records = await listAll(
    db,
    "bookings",
    db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind = {:k}", {
      from: dayStartPb(date),
      to: dayEndPb(date),
      s: "annullato",
      k: "normale",
    }),
    { expand: "client,room" },
  );

  const roomOf = (r: PbRecord): PbRecord | undefined => r.expand?.room as PbRecord | undefined;
  const clientOf = (r: PbRecord): PbRecord | undefined => r.expand?.client as PbRecord | undefined;
  const nameOf = (r: PbRecord): string => {
    const client = clientOf(r);
    return [client?.first_name, client?.last_name].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  };

  const sorted = [...records].sort((a, b) => {
    const ra = roomOf(a);
    const rb = roomOf(b);
    if (!ra !== !rb) return ra ? -1 : 1;
    if (ra && rb) {
      const byRoomSort = num(ra.sort) - num(rb.sort);
      if (byRoomSort !== 0) return byRoomSort;
      const byRoomName = String(ra.name ?? "").localeCompare(String(rb.name ?? ""), "it");
      if (byRoomName !== 0) return byRoomName;
    }
    const ta = tableOf(a);
    const tb = tableOf(b);
    if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    const timeA = a.event_time ? String(a.event_time).slice(0, 5) : "99:99";
    const timeB = b.event_time ? String(b.event_time).slice(0, 5) : "99:99";
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;
    return nameOf(a).localeCompare(nameOf(b), "it");
  });

  const rows: ReservationSheetRow[] = sorted.map((r) => {
    const room = roomOf(r);
    return {
      name: nameOf(r),
      room: room?.name ? String(room.name) : null,
      table: tableOf(r),
      time: r.event_time ? String(r.event_time).slice(0, 5) : null,
      phone: nn(clientOf(r)?.phone)?.trim() || null,
    };
  });
  return { date, rows };
}

/**
 * Primo evento (banchetto non annullato) con data successiva a `date`, per l'empty state dell'agenda. Ogni profilo attivo; errori → null.
 */
export async function getNextEventAfter(date: string): Promise<NextEventBrief | null> {
  if (!ISO_DATE.test(date)) return null;
  try {
    const me = await getCurrentProfile();
    if (!me || !me.active) return null;
    const db = await getAdminPb();
    const page = await db.collection("bookings").getList(1, 1, {
      filter: db.filter("kind = {:k} && status != {:s} && event_date > {:after}", {
        k: "evento",
        s: "annullato",
        after: dayEndPb(date),
      }),
      sort: "event_date,event_time",
      expand: "client",
      skipTotal: true,
    });
    const r = page.items[0] as unknown as PbRecord | undefined;
    if (!r) return null;
    const client = r.expand?.client as PbRecord | undefined;
    const eventName = r.event_name ? String(r.event_name).trim() : "";
    const clientName = client ? `${client.first_name} ${client.last_name}`.trim() : "";
    return {
      id: r.id,
      event_date: toDateOnly(r.event_date),
      event_time: nn(r.event_time),
      // Stessa regola di bookingTitle (components/bookings/format.ts): nome evento, altrimenti cliente.
      title: eventName || clientName || "Evento",
    };
  } catch {
    return null;
  }
}

export async function getBooking(id: string): Promise<BookingDetail | null> {
  if (!isRecordId(id)) return null;
  const me = await getCurrentProfile();
  if (!me) return null;
  const db = await getAdminPb();
  const record = await fetchOne(db, "bookings", id, BOOKING_DETAIL_EXPAND);
  if (!record) return null;
  // Gli appuntamenti non esistono per la sala: come se la scheda non ci fosse.
  if (!canSeeAppointments(me) && String(record.kind || "evento") === "appuntamento") return null;
  const detail = await bookingDetail(db, record);
  return hideKitchenPhone(isAdmin(me) ? detail : zeroMenuPrices(detail), me);
}

export async function getBookingChanges(bookingId: string): Promise<BookingChange[]> {
  if (!isRecordId(bookingId)) return [];
  const me = await getCurrentProfile();
  if (!me) return [];
  // Il registro modifiche è riservato all'admin (vedi canViewActivityLog).
  if (!isAdmin(me)) return [];
  const db = await getAdminPb();
  const filter = isAdmin(me)
    ? db.filter("booking = {:id}", { id: bookingId })
    : db.filter("booking = {:id} && field != {:pf}", { id: bookingId, pf: PRICE_FIELD });
  const records = await listAll(db, "booking_changes", filter, {
    sort: "-created,-id",
  });
  return records.map(mapChange);
}

/** Registro delle eliminazioni di prenotazioni (più recenti per primo), per la dashboard admin. */
export async function getDeletionLog(limit: number): Promise<BookingChange[]> {
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return [];
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
    // "Eventi oggi" / "Eventi nel mese": solo banchetti (kind evento), come nelle statistiche.
    count(db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind = {:k}", { from: dayStartPb(from), to: dayEndPb(to), s: "annullato", k: "evento" })),
    count(db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s} && kind = {:k}", { from: dayStartPb(today), to: dayEndPb(today), s: "annullato", k: "evento" })),
    // Eventi senza acconto (stato "opzione"): le prenotazioni normali non passano mai da qui.
    count(db.filter("kind = {:k} && status = {:s} && event_date >= {:from}", { k: "evento", s: "opzione", from: dayStartPb(today) })),
    listAll(
      db,
      "bookings",
      // Coperti: eventi e prenotazioni, appuntamenti esclusi (stessa regola di getCoversStats).
      `${db.filter("event_date >= {:from} && event_date <= {:to} && kind != {:k}", { from: dayStartPb(today), to: dayEndPb(weekEnd), k: "appuntamento" })} && ${notCancelled}`,
      { fields: "adults,children" },
    ),
  ]);

  const coversNext7Days = week.reduce((acc, b) => acc + num(b.adults) + num(b.children), 0);
  return { eventsThisMonth, eventsToday, pendingOptions, coversNext7Days };
}

/** Prossime prenotazioni (esclusi gli annullati), in ordine di data. `kinds` limita ai tipi indicati. */
export async function getUpcomingBookings(
  limit: number,
  opts?: { kinds?: BookingKind[] },
): Promise<BookingListItem[]> {
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  const kinds = (opts?.kinds ?? []).filter((k): k is BookingKind => (BOOKING_KINDS as readonly string[]).includes(k));
  let filter = `${db.filter("event_date >= {:from} && status != {:s}", { from: dayStartPb(romeToday()), s: "annullato" })}${appointmentsClause(db, me)}`;
  if (kinds.length > 0) {
    const kindFilter = kinds.map((k) => db.filter("kind = {:k}", { k })).join(" || ");
    filter = `${filter} && (${kindFilter})`;
  }
  const records = await listAll(db, "bookings", filter, { expand: BOOKING_LIST_EXPAND });
  const max = Math.max(1, Math.min(limit, 100));
  const items = await bookingListItems(db, sortBookingRecords(records).slice(0, max));
  return items.map((i) => hideKitchenPhone(isAdmin(me) ? i : zeroMenuPrices(i), me));
}

/**
 * Solo gli id delle prossime prenotazioni (oggi + `days` giorni, esclusi gli annullati), in ordine di data.
 * Una sola richiesta leggera, senza espansioni: serve al layout per le URL di precaricamento.
 * Stesse regole di visibilità di getUpcomingBookings: gli appuntamenti non escono per chi non li vede.
 */
export async function getUpcomingBookingIds(days: number, limit = 40): Promise<string[]> {
  const me = await getCurrentProfile();
  if (!me) return [];
  const span = Math.floor(Number(days));
  if (!Number.isFinite(span) || span < 0) return [];
  const db = await getAdminPb();
  const today = romeToday();
  const to = addDaysISO(today, Math.min(span, 366));
  const max = Math.max(1, Math.min(Math.floor(limit), 100));
  const filter = `${db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s}", {
    from: dayStartPb(today),
    to: dayEndPb(to),
    s: "annullato",
  })}${appointmentsClause(db, me)}`;
  const page = await db.collection("bookings").getList(1, max, {
    filter,
    fields: "id",
    sort: "event_date,id",
    skipTotal: true,
  });
  return page.items.map((r) => r.id);
}

// ---------------------------------------------------------------------
// Note interne (cucina), registro attività, statistiche, da confermare
// ---------------------------------------------------------------------

// Note interne: getBookingNotes / getBookingNotesFor sono in lib/data/notes.ts (ri-esportate qui).
export { getBookingNotes, getBookingNotesFor } from "./notes";

/** Registro delle modifiche (più recenti per primo), anche le eliminazioni. Solo admin. */
export async function getActivityLog(limit = 100): Promise<ActivityEntry[]> {
  const me = await getCurrentProfile();
  if (!me || !canViewActivityLog(me)) return [];
  const db = await getAdminPb();
  const max = Math.max(1, Math.min(Math.floor(limit), 500));
  const page = await db.collection("booking_changes").getList(1, max, {
    sort: "-created,-id",
    skipTotal: true,
    ...(isAdmin(me) ? {} : { filter: db.filter("field != {:pf}", { pf: PRICE_FIELD }) }),
  });
  const changes = (page.items as unknown as PbRecord[]).map(mapChange);

  const bookingIds = [...new Set(changes.map((c) => c.booking_id).filter((id): id is string => Boolean(id)))];
  const bookings = await listByParents(db, "bookings", "id", bookingIds, { fields: "id,kind,event_date,client" });
  const clientIds = [...new Set(bookings.map((b) => String(b.client ?? "")).filter(Boolean))];
  const clients = await listByParents(db, "clients", "id", clientIds, { fields: "id,first_name,last_name" });
  const clientNames = new Map(clients.map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));

  const info = new Map<string, { date: string; kind: BookingKind; client: string | null }>();
  for (const b of bookings) {
    info.set(b.id, {
      date: toDateOnly(b.event_date),
      kind: (nn(b.kind) ?? "evento") as BookingKind,
      client: clientNames.get(String(b.client ?? "")) || null,
    });
  }

  return changes.map((c) => {
    const b = c.booking_id ? info.get(c.booking_id) : undefined;
    const fallbackLabel = b ? `Prenotazione del ${b.date} — ${b.client ?? "cliente sconosciuto"}` : null;
    return {
      ...c,
      booking_label: c.booking_label ?? fallbackLabel,
      booking_date: b?.date ?? null,
      booking_kind: b?.kind ?? null,
      client_name: b?.client ?? null,
    };
  });
}

/** Eventi e appuntamenti in "opzione" da oggi in poi, in ordine di data e ora. Solo admin. */
export async function getPendingConfirmations(): Promise<BookingListItem[]> {
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return [];
  const db = await getAdminPb();
  const filter = db.filter("event_date >= {:from} && status = {:s} && (kind = {:e} || kind = {:a})", {
    from: dayStartPb(romeToday()),
    s: "opzione",
    e: "evento",
    a: "appuntamento",
  });
  const records = await listAll(db, "bookings", filter, { expand: BOOKING_LIST_EXPAND });
  return bookingListItems(db, sortBookingRecords(records));
}

const ZERO_TOTALS = { event_covers: 0, normal_covers: 0, events: 0, normal_bookings: 0 } as const;

function addServings(servings: Map<string, number>, menuId: string | null, n: number): void {
  if (!menuId || n <= 0) return;
  servings.set(menuId, (servings.get(menuId) ?? 0) + n);
}

/** Porzioni per menù, con nome e tipo dal record menù; ordine: adulti prima, poi porzioni decrescenti, poi nome. */
function menuConsumptions(servings: Map<string, number>, menuRecords: PbRecord[]): MenuConsumption[] {
  const byId = new Map(menuRecords.map((m) => [m.id, m]));
  return [...servings.entries()]
    .map(([menuId, n]) => {
      const m = byId.get(menuId);
      return m ? { menu_id: menuId, name: String(m.name ?? ""), is_kids: Boolean(m.is_kids), servings: n } : null;
    })
    .filter((m): m is MenuConsumption => m !== null && m.servings > 0)
    .sort((a, b) => Number(a.is_kids) - Number(b.is_kids) || b.servings - a.servings || a.name.localeCompare(b.name));
}

/**
 * Coperti e menù consumati nel periodo [from, to] (YYYY-MM-DD, estremi inclusi), per settimana (lun–dom).
 * Esclude annullati e appuntamenti. Una query per le prenotazioni e una per i menù; aggregazione in memoria.
 * Per settimana: totali, giorno più pieno e menù più serviti. Solo admin: per gli altri ruoli riepilogo vuoto.
 */
export async function getCoversStats(opts: { from: string; to: string; kind?: StatsKind }): Promise<CoversStats> {
  const kind: StatsKind = opts.kind ?? "tutti";
  const empty: CoversStats = {
    from: opts.from,
    to: opts.to,
    weeks: [],
    totals: { ...ZERO_TOTALS },
    period_total_covers: 0,
    menus: [],
  };
  if (!ISO_DATE.test(opts.from) || !ISO_DATE.test(opts.to) || opts.from > opts.to) return empty;
  const me = await getCurrentProfile();
  if (!me || !isAdmin(me)) return empty;
  const db = await getAdminPb();

  const records = await listAll(
    db,
    "bookings",
    db.filter("event_date >= {:from} && event_date <= {:to} && status != {:s}", {
      from: dayStartPb(opts.from),
      to: dayEndPb(opts.to),
      s: "annullato",
    }),
    { fields: "id,kind,event_date,adults,children,kids_menus,menu,kids_menu" },
  );

  const weeks = new Map<string, WeekStats>();
  for (let start = mondayOf(opts.from); start <= opts.to; start = addDaysISO(start, 7)) {
    weeks.set(start, {
      week_start: start,
      week_end: addDaysISO(start, 6),
      event_covers: 0,
      normal_covers: 0,
      events: 0,
      normal_bookings: 0,
      busiest_day: null,
      menus: [],
    });
  }

  const periodServings = new Map<string, number>();
  const weekServings = new Map<string, Map<string, number>>();
  const dayCovers = new Map<string, number>();
  for (const r of records) {
    const k = nn(r.kind) ?? "evento";
    if (k === "appuntamento") continue;
    if (kind !== "tutti" && k !== kind) continue;
    const date = toDateOnly(r.event_date);
    const weekKey = mondayOf(date);
    const week = weeks.get(weekKey);
    if (!week) continue;
    const covers = num(r.adults) + num(r.children);
    dayCovers.set(date, (dayCovers.get(date) ?? 0) + covers);
    if (k === "evento") {
      week.event_covers += covers;
      week.events += 1;
      const ws = weekServings.get(weekKey) ?? new Map<string, number>();
      weekServings.set(weekKey, ws);
      addServings(ws, nn(r.menu), num(r.adults));
      addServings(ws, nn(r.kids_menu), num(r.kids_menus));
      addServings(periodServings, nn(r.menu), num(r.adults));
      addServings(periodServings, nn(r.kids_menu), num(r.kids_menus));
    } else {
      week.normal_covers += covers;
      week.normal_bookings += 1;
    }
  }

  // Giorno più pieno di ogni settimana (a parità vince il primo giorno).
  for (const date of [...dayCovers.keys()].sort()) {
    const covers = dayCovers.get(date) ?? 0;
    if (covers <= 0) continue;
    const week = weeks.get(mondayOf(date));
    if (week && (!week.busiest_day || covers > week.busiest_day.covers)) {
      week.busiest_day = { date, covers };
    }
  }

  const menuIds = [...new Set([...periodServings.keys(), ...[...weekServings.values()].flatMap((m) => [...m.keys()])])];
  const menuRecords = menuIds.length > 0 ? await listByParents(db, "menus", "id", menuIds, { fields: "id,name,is_kids" }) : [];
  const menus = menuConsumptions(periodServings, menuRecords);
  for (const [weekKey, ws] of weekServings) {
    const week = weeks.get(weekKey);
    if (week) week.menus = menuConsumptions(ws, menuRecords);
  }

  const weekList = [...weeks.values()];
  const totals = weekList.reduce<CoversStats["totals"]>(
    (acc, w) => ({
      event_covers: acc.event_covers + w.event_covers,
      normal_covers: acc.normal_covers + w.normal_covers,
      events: acc.events + w.events,
      normal_bookings: acc.normal_bookings + w.normal_bookings,
    }),
    { ...ZERO_TOTALS },
  );
  return {
    from: opts.from,
    to: opts.to,
    weeks: weekList,
    totals,
    period_total_covers: totals.event_covers + totals.normal_covers,
    menus,
  };
}
