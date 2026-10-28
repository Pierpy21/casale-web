import "server-only";
import type PocketBase from "pocketbase";
import { pocketbasePublicUrl } from "@/lib/pocketbase/config";
import { listByParents } from "@/lib/pocketbase/queries";
import { type PbRecord } from "@/lib/pocketbase/helpers";
import {
  mapBooking,
  mapClient,
  mapDish,
  mapAllergy,
  mapMenu,
  mapMenuItem,
  mapRoom,
  sortDishes,
} from "@/lib/pocketbase/mappers";
import type {
  BookingAllergy,
  BookingDetail,
  BookingDish,
  BookingListItem,
  Client,
  Menu,
  MenuItem,
} from "@/lib/types";

// Espansioni PocketBase per le prenotazioni (relazioni per nome campo).
export const BOOKING_LIST_EXPAND = "client,room,menu,kids_menu";
export const BOOKING_DETAIL_EXPAND = "client,room,menu,kids_menu";

/** Ordine agenda: data, poi ora (senza ora in fondo). */
export function sortBookingRecords(records: PbRecord[]): PbRecord[] {
  return [...records].sort((a, b) => {
    const da = String(a.event_date ?? "");
    const db_ = String(b.event_date ?? "");
    if (da !== db_) return da < db_ ? -1 : 1;
    const ta = String(a.event_time ?? "");
    const tb = String(b.event_time ?? "");
    if (ta === tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta < tb ? -1 : 1;
  });
}

/** Id (tra quelli dati) delle prenotazioni che sono appuntamenti. Una sola query per gruppo di id. */
export async function appointmentIdsAmong(db: PocketBase, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const rows = await listByParents(db, "bookings", "id", ids, { fields: "id,kind" });
  for (const r of rows) if (String(r.kind || "evento") === "appuntamento") out.add(r.id);
  return out;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/** Voci dei menu, raggruppate per id menu. */
export async function menusWithItems(db: PocketBase, menuRecords: PbRecord[]): Promise<Map<string, Menu>> {
  const base = pocketbasePublicUrl();
  const items = await listByParents(db, "menu_items", "menu", menuRecords.map((m) => m.id));
  const byMenu = groupBy(items.map(mapMenuItem), (i: MenuItem) => i.menu_id);
  const out = new Map<string, Menu>();
  for (const m of menuRecords) out.set(m.id, mapMenu(m, byMenu.get(m.id) ?? [], base));
  return out;
}

function listClient(c: Client): BookingListItem["client"] {
  return { id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone };
}

/** Righe prenotazione per liste (agenda, cliente): con cliente, sala, menu, piatti e allergie. */
export async function bookingListItems(db: PocketBase, records: PbRecord[]): Promise<BookingListItem[]> {
  const ids = records.map((r) => r.id);
  const [dishRecords, allergyRecords] = await Promise.all([
    listByParents(db, "booking_dishes", "booking", ids),
    listByParents(db, "booking_allergies", "booking", ids),
  ]);
  const dishesBy = groupBy(dishRecords.map(mapDish), (d: BookingDish) => d.booking_id);
  const allergiesBy = groupBy(allergyRecords.map(mapAllergy), (a: BookingAllergy) => a.booking_id);

  return records.map((r) => {
    const b = mapBooking(r);
    const client = r.expand?.client as PbRecord | undefined;
    const room = r.expand?.room as PbRecord | undefined;
    const menu = r.expand?.menu as PbRecord | undefined;
    const kidsMenu = r.expand?.kids_menu as PbRecord | undefined;
    return {
      ...b,
      // Solo i campi che le liste mostrano: codice fiscale, P.IVA e note del cliente non vanno al browser di sala e cucina.
      client: client
        ? listClient(mapClient(client))
        : { id: b.client_id, first_name: "", last_name: "", phone: "" },
      room: room ? mapRoom(room) : null,
      menu: menu
        ? { id: menu.id, name: String(menu.name ?? ""), price_per_person: Number(menu.price_per_person ?? 0) }
        : null,
      kids_menu: kidsMenu
        ? { id: kidsMenu.id, name: String(kidsMenu.name ?? "") }
        : null,
      dishes: sortDishes(dishesBy.get(b.id) ?? []),
      allergies: allergiesBy.get(b.id) ?? [],
    };
  });
}

/** Dettaglio prenotazione completo (menu e menu bambini con le voci). */
export async function bookingDetail(db: PocketBase, record: PbRecord): Promise<BookingDetail> {
  const b = mapBooking(record);
  const menuRecords = [record.expand?.menu, record.expand?.kids_menu]
    .filter(Boolean)
    .map((m) => m as PbRecord);
  const [dishRecords, allergyRecords, menusById] = await Promise.all([
    listByParents(db, "booking_dishes", "booking", [b.id]),
    listByParents(db, "booking_allergies", "booking", [b.id]),
    menusWithItems(db, menuRecords),
  ]);
  const client = record.expand?.client as PbRecord | undefined;
  const room = record.expand?.room as PbRecord | undefined;

  return {
    ...b,
    client: client
      ? mapClient(client)
      : ({ id: b.client_id, first_name: "", last_name: "", phone: "", email: null, tax_code: null, vat_number: null, notes: null, created_at: "", updated_at: "" } as Client),
    room: room ? mapRoom(room) : null,
    menu: b.menu_id ? menusById.get(b.menu_id) ?? null : null,
    kids_menu: b.kids_menu_id ? menusById.get(b.kids_menu_id) ?? null : null,
    dishes: sortDishes(dishRecords.map(mapDish)),
    allergies: allergyRecords.map(mapAllergy),
  };
}
