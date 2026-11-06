import { normalizeRotation, tableBounds, type Meters } from "@/lib/floor-geometry";
import type { FloorBooking, FloorEvent, Room, RoomTable, TableShape } from "@/lib/types";

/** Filtro dei tavoli nella vista stanza. */
export type TableFilter = "tutti" | "liberi" | "occupati";

export const TABLE_FILTER_OPTIONS: Array<{ value: TableFilter; label: string }> = [
  { value: "tutti", label: "Tutti" },
  { value: "liberi", label: "Liberi" },
  { value: "occupati", label: "Occupati" },
];

/** Ambito della disposizione in modifica: "always" = standard della sala, "day" = solo giorno e pasto mostrati. */
export type EditScope = "always" | "day";

/** Coperti massimi per tavolo (stepper e tavolate generate da un evento). */
export const MAX_TABLE_SEATS = 300;

/** Tavolo come lo disegna la vista stanza: tavolo salvato (key = id) o bozza in modifica (key locale). */
export interface TableItem {
  key: string;
  /** Id del tavolo salvato; assente per i tavoli aggiunti in modifica o copiati dalla standard. */
  id?: string;
  number: number;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  /** Gradi in senso orario, 0–359 (0 = orizzontale). */
  rotation: number;
}

/** Prenotazione o evento da assegnare a un tavolo (lista "Da assegnare"). `bookingId` vale per entrambi. */
export interface AssignTarget {
  bookingId: string;
  event: boolean;
  label: string;
  covers: number;
}

/** Assegnazione in attesa di salvataggio (modifica disposizione): mostrata come occupato in anteprima. */
export interface PendingAssignment extends AssignTarget {
  tableNumber: number;
}

/** Chi è seduto a un tavolo, o l'anteprima di un'assegnazione non ancora salvata. */
export interface TableSeat {
  kind: "evento" | "prenotazione";
  /** Anteprima di una modifica non ancora salvata. */
  preview: boolean;
  /** Tutte le prenotazioni in opzione. */
  waiting: boolean;
  /** Evento: titolo. Prenotazione: nome del primo ospite. */
  name: string;
  covers: number;
  /** Altre prenotazioni o eventi sullo stesso tavolo (> 0 = tavolo assegnato due volte, da sistemare). */
  extra: number;
  /** Tutti i nomi seduti al tavolo (evento prima), per il riepilogo accessibile dei doppi. */
  names: string[];
  /** Evento su più tavoli: posizione di questo tavolo ("1 di 3"). Null se l'evento ha un solo tavolo. */
  eventPart: { index: number; total: number } | null;
  /** Evento in scelta o in attesa di salvataggio: il tavolo prende il ring. */
  extending: boolean;
}

export interface FloorIndex {
  /** Tavoli attivi per sala, ordinati per numero. */
  tablesByRoom: Map<string, RoomTable[]>;
  /** Prenotazioni sedute: chiave tableKey(sala, numero). */
  bookingsByTable: Map<string, FloorBooking[]>;
  /** Eventi seduti a un tavolo (uno per ogni tavolo dell'evento presente in mappa): chiave tableKey(sala, numero). */
  eventsByTable: Map<string, FloorEvent[]>;
  /** Eventi che riservano la sala (solo eventi con una sala). */
  eventsByRoom: Map<string, FloorEvent[]>;
  /** Prenotazioni senza un tavolo presente sulla mappa. */
  unseated: FloorBooking[];
  /** Eventi senza tavoli presenti sulla mappa (anche senza sala). */
  unseatedEvents: FloorEvent[];
}

export interface RoomStatus {
  total: number;
  free: number;
  /** Coperti seduti ai tavoli della sala (prenotazioni ed eventi). */
  seatedCovers: number;
  event: FloorEvent | null;
}

export interface FloorSummary {
  covers: number;
  bookings: number;
  unseated: number;
  eventCovers: number;
  events: number;
}

export function tableKey(roomId: string, number: number): string {
  return `${roomId}:${number}`;
}

export function toTableItem(table: RoomTable): TableItem {
  return {
    key: table.id,
    id: table.id,
    number: table.number,
    seats: table.seats,
    shape: table.shape,
    x: table.x,
    y: table.y,
    // Record salvati prima del campo rotation: 0.
    rotation: normalizeRotation(table.rotation ?? 0),
  };
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Chiave del tavolo in cui il record siede, o null se la sala/tavolo non è in mappa. */
function placedKey(tablesByRoom: Map<string, RoomTable[]>, roomId: string | null, tableNumber: number | null): string | null {
  if (roomId === null || tableNumber === null) return null;
  const exists = (tablesByRoom.get(roomId) ?? []).some((t) => t.number === tableNumber);
  return exists ? tableKey(roomId, tableNumber) : null;
}

export function buildFloorIndex(tables: RoomTable[], bookings: FloorBooking[], events: FloorEvent[]): FloorIndex {
  const tablesByRoom = new Map<string, RoomTable[]>();
  for (const table of tables) {
    if (!table.active) continue;
    pushTo(tablesByRoom, table.room_id, table);
  }
  for (const list of tablesByRoom.values()) list.sort((a, b) => a.number - b.number);

  const bookingsByTable = new Map<string, FloorBooking[]>();
  const unseated: FloorBooking[] = [];
  for (const booking of bookings) {
    const key = placedKey(tablesByRoom, booking.room_id, booking.table_number);
    if (key === null) unseated.push(booking);
    else pushTo(bookingsByTable, key, booking);
  }
  unseated.sort((a, b) => a.name.localeCompare(b.name, "it"));

  // Un evento senza sala non riserva nessuna sala: resta solo da assegnare.
  const eventsByRoom = new Map<string, FloorEvent[]>();
  const eventsByTable = new Map<string, FloorEvent[]>();
  const unseatedEvents: FloorEvent[] = [];
  for (const event of events) {
    if (event.room_id !== null) pushTo(eventsByRoom, event.room_id, event);
    // Un evento occupa ogni suo tavolo presente sulla mappa.
    const keys = new Set<string>();
    for (const number of event.table_numbers) {
      const key = placedKey(tablesByRoom, event.room_id, number);
      if (key !== null) keys.add(key);
    }
    if (keys.size === 0) unseatedEvents.push(event);
    for (const key of keys) pushTo(eventsByTable, key, event);
  }
  unseatedEvents.sort((a, b) => a.title.localeCompare(b.title, "it"));

  return { tablesByRoom, bookingsByTable, eventsByTable, eventsByRoom, unseated, unseatedEvents };
}

export function roomStatus(index: FloorIndex, roomId: string): RoomStatus {
  const tables = index.tablesByRoom.get(roomId) ?? [];
  let free = 0;
  let seatedCovers = 0;
  // Un evento su più tavoli compare su ciascuno: i coperti si contano una volta sola.
  const countedEvents = new Set<FloorEvent>();
  for (const table of tables) {
    const key = tableKey(roomId, table.number);
    const seatedBookings = index.bookingsByTable.get(key) ?? [];
    const seatedEvents = index.eventsByTable.get(key) ?? [];
    if (seatedBookings.length === 0 && seatedEvents.length === 0) free += 1;
    seatedCovers += seatedBookings.reduce((sum, b) => sum + b.covers, 0);
    for (const event of seatedEvents) {
      if (countedEvents.has(event)) continue;
      countedEvents.add(event);
      seatedCovers += event.covers;
    }
  }
  return { total: tables.length, free, seatedCovers, event: index.eventsByRoom.get(roomId)?.[0] ?? null };
}

/** Chi è seduto a un tavolo salvato (null = libero). */
export function tableSeat(bookings: FloorBooking[], events: FloorEvent[]): TableSeat | null {
  const covers = bookings.reduce((sum, b) => sum + b.covers, 0) + events.reduce((sum, e) => sum + e.covers, 0);
  const names = [...events.map((e) => e.title), ...bookings.map((b) => b.name || "Senza nome")];
  const [event] = events;
  if (event) {
    return {
      kind: "evento",
      preview: false,
      waiting: false,
      name: event.title,
      covers,
      extra: events.length - 1 + bookings.length,
      names,
      eventPart: null,
      extending: false,
    };
  }
  const [booking] = bookings;
  if (!booking) return null;
  return {
    kind: "prenotazione",
    preview: false,
    waiting: bookings.every((b) => b.status === "opzione"),
    name: booking.name || "Senza nome",
    covers,
    extra: bookings.length - 1,
    names,
    eventPart: null,
    extending: false,
  };
}

/** Anteprima di un'assegnazione in attesa di salvataggio. */
export function previewSeat(pending: PendingAssignment): TableSeat {
  return {
    kind: pending.event ? "evento" : "prenotazione",
    preview: true,
    waiting: false,
    name: pending.label || "Senza nome",
    covers: pending.covers,
    extra: 0,
    names: [pending.label || "Senza nome"],
    eventPart: null,
    extending: false,
  };
}

/** Posizione del tavolo tra quelli dell'evento ("1 di 3"); null se l'evento ha un solo tavolo o il tavolo non è suo. */
export function eventPartOf(event: FloorEvent, tableNumber: number): { index: number; total: number } | null {
  const total = event.table_numbers.length;
  const index = event.table_numbers.indexOf(tableNumber);
  return total > 1 && index >= 0 ? { index: index + 1, total } : null;
}

/** Posti dei tavoli dell'evento presenti nella sala (i numeri non in mappa non contano). */
export function eventSeats(event: FloorEvent, tables: Pick<RoomTable, "number" | "seats">[]): number {
  return tables.reduce((sum, table) => (event.table_numbers.includes(table.number) ? sum + table.seats : sum), 0);
}

/** La tavolata (sedie comprese, ruotata) sta nella stanza. */
export function tableFitsRoom(item: Pick<TableItem, "shape" | "seats" | "rotation">, room: Meters): boolean {
  const bounds = tableBounds(item.shape, item.seats, item.rotation);
  return bounds.w <= room.w + 0.001 && bounds.h <= room.h + 0.001;
}

/** Confronto delle bozze (modifiche non salvate). */
export function serializeDrafts(items: TableItem[]): string {
  return JSON.stringify(items.map((i) => [i.id ?? null, i.number, i.seats, i.shape, i.x, i.y, i.rotation]));
}

export function floorSummary(bookings: FloorBooking[], events: FloorEvent[], unseated: number): FloorSummary {
  return {
    covers: bookings.reduce((sum, b) => sum + b.covers, 0),
    bookings: bookings.length,
    unseated,
    eventCovers: events.reduce((sum, e) => sum + e.covers, 0),
    events: events.length,
  };
}

/** "48 coperti · 12 prenotazioni · eventi 80 pax". */
export function summaryText(summary: FloorSummary): string {
  const parts = [
    `${summary.covers} ${summary.covers === 1 ? "coperto" : "coperti"}`,
    `${summary.bookings} ${summary.bookings === 1 ? "prenotazione" : "prenotazioni"}`,
  ];
  if (summary.events > 0) parts.push(`eventi ${paxLabel(summary.eventCovers)}`);
  return parts.join(" · ");
}

/** Prossimo numero libero nella sala (max + 1). */
export function nextTableNumber(items: Pick<TableItem, "number">[]): number {
  return Math.min(9999, items.reduce((max, t) => Math.max(max, t.number), 0) + 1);
}

/** Posizione libera per un nuovo tavolo: il centro, oppure il primo punto della griglia lontano dagli altri. */
export function findFreeSpot(items: Pick<TableItem, "x" | "y">[], minDistance = 14): { x: number; y: number } {
  const far = (x: number, y: number) => items.every((t) => Math.hypot(t.x - x, t.y - y) >= minDistance);
  if (far(50, 50)) return { x: 50, y: 50 };
  for (let ring = 1; ring <= 4; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = 50 + dx * 10;
        const y = 50 + dy * 10;
        if (x < 5 || x > 95 || y < 5 || y > 95) continue;
        if (far(x, y)) return { x, y };
      }
    }
  }
  return { x: 50, y: 50 };
}

/** Numeri di tavolo ripetuti nella bozza. */
export function duplicateNumbers(items: Pick<TableItem, "number">[]): Set<number> {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const t of items) {
    if (seen.has(t.number)) dupes.add(t.number);
    seen.add(t.number);
  }
  return dupes;
}

export function matchesFilter(filter: TableFilter, occupied: boolean): boolean {
  if (filter === "tutti") return true;
  return filter === "occupati" ? occupied : !occupied;
}

/** Sale attive in ordine di visualizzazione. */
export function activeRooms(rooms: Room[]): Room[] {
  return rooms.filter((room) => room.active).sort((a, b) => a.sort - b.sort);
}

export function paxLabel(covers: number): string {
  return `${covers} pax`;
}

export function seatsLabel(seats: number): string {
  return `${seats} ${seats === 1 ? "posto" : "posti"}`;
}

/** Link alla mappa per giorno e pasto. */
export function floorHref(date: string, meal: string): string {
  const params = new URLSearchParams({ date, pasto: meal });
  return `/admin/sala?${params.toString()}`;
}
