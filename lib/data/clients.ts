import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import { getAdminPb } from "@/lib/pocketbase/admin";
import { isRecordId, toDateOnly } from "@/lib/pocketbase/helpers";
import { mapClient } from "@/lib/pocketbase/mappers";
import { fetchOne, listAll } from "@/lib/pocketbase/queries";
import { romeToday } from "@/lib/dates";
import { canSeeAppointments } from "@/lib/permissions";
import type { Client, ClientOption, ClientWithStats, BookingListItem } from "@/lib/types";
import { BOOKING_LIST_EXPAND, bookingListItems, sortBookingRecords } from "./shared";

/** Rimuove i caratteri con significato nei filtri (LIKE / ~) e nelle stringhe. */
function sanitizeSearch(term: string | undefined): string {
  return (term ?? "").replace(/[%_,()*"\\'\[\]{}]/g, " ").trim().slice(0, 100);
}

function byName(a: { last_name: string; first_name: string }, b: { last_name: string; first_name: string }): number {
  return a.last_name.localeCompare(b.last_name, "it") || a.first_name.localeCompare(b.first_name, "it");
}

export async function getClients(search?: string): Promise<ClientWithStats[]> {
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();

  const term = sanitizeSearch(search);
  const filter = term
    ? db.filter("first_name ~ {:t} || last_name ~ {:t} || phone ~ {:t}", { t: term })
    : "";
  const clients = (await listAll(db, "clients", filter)).map(mapClient).sort(byName);
  if (clients.length === 0) return [];

  // Prenotazioni non annullate dei clienti in elenco (una sola query, filtrata in memoria).
  const ids = new Set(clients.map((c) => c.id));
  // La sala non vede gli appuntamenti: esclusi anche dal conteggio e dalla prossima data.
  const seeAppointments = canSeeAppointments(me);
  const bookingFilter = seeAppointments
    ? db.filter("status != {:s}", { s: "annullato" })
    : db.filter("status != {:s} && kind != {:ka}", { s: "annullato", ka: "appuntamento" });
  const bookings = await listAll(db, "bookings", bookingFilter, {
    fields: "id,client,event_date",
  });

  const today = romeToday();
  const stats = new Map<string, { count: number; next: string | null }>();
  for (const b of bookings) {
    const clientId = String(b.client ?? "");
    if (!ids.has(clientId)) continue;
    const eventDate = toDateOnly(b.event_date);
    const s = stats.get(clientId) ?? { count: 0, next: null };
    s.count += 1;
    if (eventDate >= today && (s.next === null || eventDate < s.next)) s.next = eventDate;
    stats.set(clientId, s);
  }

  return clients.map((c) => ({
    ...c,
    bookings_count: stats.get(c.id)?.count ?? 0,
    next_event_date: stats.get(c.id)?.next ?? null,
  }));
}

/** Elenco minimo per i selettori (es. nuova prenotazione), ordinato per cognome e nome. */
export async function getClientOptions(): Promise<ClientOption[]> {
  if (!(await getCurrentProfile())) return [];
  const db = await getAdminPb();
  const records = await listAll(db, "clients", "");
  return records
    .map(mapClient)
    .sort(byName)
    .map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone }));
}

export async function getClient(id: string): Promise<Client | null> {
  if (!isRecordId(id)) return null;
  if (!(await getCurrentProfile())) return null;
  const db = await getAdminPb();
  const record = await fetchOne(db, "clients", id);
  return record ? mapClient(record) : null;
}

export async function getClientBookings(clientId: string): Promise<BookingListItem[]> {
  if (!isRecordId(clientId)) return [];
  const me = await getCurrentProfile();
  if (!me) return [];
  const db = await getAdminPb();
  const filter = canSeeAppointments(me)
    ? db.filter("client = {:id}", { id: clientId })
    : db.filter("client = {:id} && kind != {:ka}", { id: clientId, ka: "appuntamento" });
  const records = await listAll(db, "bookings", filter, {
    expand: BOOKING_LIST_EXPAND,
  });
  // Data piu' recente per prima; a parita' di data, l'ora in ordine crescente.
  const sorted = sortBookingRecords(records).sort((a, b) => {
    const da = toDateOnly(a.event_date);
    const dbDate = toDateOnly(b.event_date);
    return da === dbDate ? 0 : da < dbDate ? 1 : -1;
  });
  return bookingListItems(db, sorted);
}
