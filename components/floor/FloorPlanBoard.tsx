"use client";

import { ChevronLeft, ChevronRight, ClipboardList, Info, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type MouseEvent } from "react";
import { resetDayLayout, saveRoomLayout, seatBooking, setEventTables } from "@/app/actions/floor";
import { capitalize, formatIt, shiftPeriod, toDate } from "@/components/agenda/agenda-utils";
import { compactSidebar, isDeskLayout, subscribeDeskLayout } from "@/components/shell/shell-mode";
import { Button, cn } from "@/components/ui";
import {
  clampTableCenter,
  geometryForRoomName,
  normalizeRotation,
  roomMeters,
  shapeForCovers,
  suggestTableShape,
  type RoomGeometry,
} from "@/lib/floor-geometry";
import {
  BOOKING_MEALS,
  BOOKING_MEAL_LABELS,
  type BookingMeal,
  type FloorBooking,
  type FloorEvent,
  type FloorPlanData,
  type LayoutScope,
  type Room,
  type RoomTable,
  type RoomTableDraft,
} from "@/lib/types";
import { AssignMenu } from "./AssignMenu";
import { CasaleMap, type MapRoomEntry } from "./CasaleMap";
import { FloorPopover } from "./FloorPopover";
import { CountBadge, FLOAT_SURFACE, FloatButton, FloatingError, FloorLegend } from "./floating";
import {
  MAX_TABLE_SEATS,
  activeRooms,
  buildFloorIndex,
  duplicateNumbers,
  eventPartOf,
  findFreeSpot,
  floorHref,
  floorSummary,
  nextTableNumber,
  previewSeat,
  roomStatus,
  serializeDrafts,
  summaryText,
  tableFitsRoom,
  tableKey,
  tableSeat,
  toTableItem,
  type AssignTarget,
  type EditScope,
  type PendingAssignment,
  type RoomStatus,
  type TableFilter,
  type TableItem,
  type TableSeat,
} from "./floor-model";
import { RoomView } from "./RoomView";
import { TableEditor } from "./TableEditor";
import { EventSummaryRow, TableMenu, tableMenuTitle } from "./TableMenu";
import { useDocumentTop } from "./use-document-top";

export interface FloorPlanBoardProps {
  data: FloorPlanData;
  /** Admin: può modificare la disposizione dei tavoli e assegnare gli eventi. */
  canEditLayout: boolean;
  /** Admin e sala: può sedere e liberare le prenotazioni. */
  canSeat: boolean;
  /** Oggi (YYYY-MM-DD, Europe/Rome). */
  today: string;
}

/** Disposizione appena salvata: mostrata finché il server non rimanda i tavoli (stesso array `base`). */
interface SavedLayout {
  base: RoomTable[];
  roomId: string;
  tables: RoomTable[];
}

/** Sala/tavolo appena assegnati: valgono finché il record è lo stesso oggetto ricevuto dal server. */
interface SeatOverride<T> {
  base: T;
  room_id: string | null;
  table_number: number | null;
}

/** Sala e tavoli di un evento appena cambiati (valgono come SeatOverride, con tutti i tavoli). */
interface EventOverride {
  base: FloorEvent;
  room_id: string | null;
  table_numbers: number[];
}

/**
 * Evento da assegnare su più tavoli: scelta locale (vista o modifica), salvata con "Conferma".
 * roomId null = evento scelto dalla piantina: la scelta parte alla prima apertura di una sala.
 */
interface EventPick {
  target: AssignTarget;
  roomId: string | null;
  numbers: number[];
  /** Riaperta da "Modifica tavoli" (tavoli attuali già nell'elenco): niente ridimensionamento alla conferma. */
  reopened: boolean;
}

/** Cambio (to = numero) o eliminazione (to = null) di un tavolo nelle scelte pendenti degli eventi. */
function renumberEventTables(map: Record<string, number[]>, from: number, to: number | null): Record<string, number[]> {
  const next: Record<string, number[]> = {};
  for (const [id, numbers] of Object.entries(map)) {
    const mapped = numbers.flatMap((n) => (n !== from ? [n] : to === null ? [] : [to]));
    if (mapped.length > 0) next[id] = mapped;
  }
  return next;
}

/** Tavolo come evento (anteprima: scelta in corso o assegnazione in attesa di salvataggio). */
function eventTableSeat(label: string, covers: number, part: { index: number; total: number } | null): TableSeat {
  const name = label || "Senza nome";
  return { kind: "evento", preview: false, waiting: false, name, covers, extra: 0, names: [name], eventPart: part, extending: true };
}

/** Menu della barra flottante aperto (uno alla volta; il menu del tavolo è a parte). */
type BarMenu = "unseated" | "legend" | "rooms";

interface RoomEntry {
  room: Room;
  geometry: RoomGeometry | null;
  status: RoomStatus;
}

/** Altezza della pagina prima della prima misura (header mobile + padding). */
const FALLBACK_TOP_PX = 100;

const CHANGE_SCOPE_CONFIRM = "Cambiando ambito, le modifiche non salvate andranno perse. Continuare?";
const RESET_DAY_CONFIRM = "Ripristinare la disposizione standard? La disposizione propria di questo giorno e pasto verrà eliminata.";

/*
 * La scheda riempie la viewport senza far scorrere la pagina:
 * --floor-reserve: margine inferiore (sotto desk: la barra di navigazione fissa, ~3.7rem + respiro);
 * --floor-safe: safe area iOS (solo con la barra mobile, che la include);
 * --floor-main-pb: padding inferiore del <main> dello shell (pb-32 / desk:pb-14), da compensare.
 */
const VIEWPORT_VARS =
  "[--floor-reserve:4.25rem] [--floor-safe:env(safe-area-inset-bottom)] [--floor-main-pb:8rem] desk:[--floor-reserve:1.25rem] desk:[--floor-safe:0px] desk:[--floor-main-pb:3.5rem]";

const FILL_STYLE: CSSProperties = {
  marginBottom: "calc(var(--floor-reserve) + var(--floor-safe) - var(--floor-main-pb))",
};

function useIsDesk(): boolean {
  return useSyncExternalStore(subscribeDeskLayout, isDeskLayout, () => false);
}

/**
 * Mappa sala a tutto schermo: sopra solo la barra del giorno (‹ data › · Oggi · Pranzo|Cena), sotto la scena
 * (piantina del casale o stanza) con tutti i comandi flottanti sopra il disegno. Tocco su una stanza → zoom
 * animato e vista tavoli; tocco su un tavolo → menu (card ancorata su desk, foglio dal basso sotto desk).
 * L'admin modifica la disposizione (bozza locale, salvata con "Salva") con ambito "Sempre" o solo il giorno.
 * "Da assegnare": eventi e prenotazioni senza tavolo; scelta una voce, si tocca un tavolo libero.
 */
export function FloorPlanBoard({ data, canEditLayout, canSeat, today }: FloorPlanBoardProps) {
  const router = useRouter();
  const isDesk = useIsDesk();
  const [navPending, startNav] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [rootRef, rootTop] = useDocumentTop<HTMLDivElement>();
  const unseatedRef = useRef<HTMLButtonElement>(null);
  const legendRef = useRef<HTMLButtonElement>(null);
  const roomsRef = useRef<HTMLButtonElement>(null);

  const [view, setView] = useState<"map" | "room">("map");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [zoomRoomId, setZoomRoomId] = useState<string | null>(null);
  const [returnRoomId, setReturnRoomId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [barMenu, setBarMenu] = useState<BarMenu | null>(null);
  const [filter, setFilter] = useState<TableFilter>("tutti");

  // --- Modifica disposizione ---
  const [editMode, setEditMode] = useState(false);
  const [editScope, setEditScope] = useState<EditScope>("always");
  const [drafts, setDrafts] = useState<TableItem[]>([]);
  /** Bozze al momento dell'ingresso in modifica: il confronto dice se ci sono modifiche non salvate. */
  const [baseline, setBaseline] = useState("");
  const [draftSeq, setDraftSeq] = useState(0);
  const [pending, setPending] = useState<PendingAssignment[]>([]);
  /** Voce scelta da "Da assegnare", in attesa di un tavolo libero. */
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  const [savedLayout, setSavedLayout] = useState<SavedLayout | null>(null);
  const [seatOverrides, setSeatOverrides] = useState<Record<string, SeatOverride<FloorBooking>>>({});
  const [eventOverrides, setEventOverrides] = useState<Record<string, EventOverride>>({});
  /** Evento scelto da "Da assegnare" in attesa dei tavoli (selezione multipla locale, nessun salvataggio a ogni tocco). */
  const [eventPick, setEventPick] = useState<EventPick | null>(null);
  /** Modifica disposizione: eventi con più tavoli, salvati dopo la disposizione ("Salva"). Chiave: id evento. */
  const [pendingEventTables, setPendingEventTables] = useState<Record<string, number[]>>({});
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Dati effettivi (server + modifiche appena salvate, in attesa del refresh) ---
  const tables = useMemo(() => {
    if (!savedLayout || savedLayout.base !== data.tables) return data.tables;
    return [...data.tables.filter((t) => t.room_id !== savedLayout.roomId), ...savedLayout.tables];
  }, [data.tables, savedLayout]);

  const bookings = useMemo(
    () =>
      data.bookings.map((b) => {
        const o = seatOverrides[b.id];
        return o && o.base === b ? { ...b, room_id: o.room_id, table_number: o.table_number } : b;
      }),
    [data.bookings, seatOverrides],
  );

  const events = useMemo(
    () =>
      data.events.map((e) => {
        const o = eventOverrides[e.id];
        return o && o.base === e ? { ...e, room_id: o.room_id, table_numbers: o.table_numbers, table_number: o.table_numbers[0] ?? null } : e;
      }),
    [data.events, eventOverrides],
  );

  const rooms = useMemo(() => activeRooms(data.rooms), [data.rooms]);
  const roomNames = useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms]);
  const index = useMemo(() => buildFloorIndex(tables, bookings, events), [tables, bookings, events]);
  const summary = floorSummary(bookings, events, index.unseated.length);

  const roomEntries: RoomEntry[] = useMemo(
    () => rooms.map((room) => ({ room, geometry: geometryForRoomName(room.name), status: roomStatus(index, room.id) })),
    [rooms, index],
  );
  const mapEntries: MapRoomEntry[] = roomEntries.flatMap((e) => (e.geometry ? [{ room: e.room, geometry: e.geometry, status: e.status }] : []));
  const hasOffMapRooms = roomEntries.some((e) => !e.geometry);

  const current = view === "room" ? roomEntries.find((e) => e.room.id === selectedRoomId) ?? null : null;
  const tablesOf = (roomId: string): RoomTable[] => index.tablesByRoom.get(roomId) ?? [];
  const dayLayoutActive = (roomId: string): boolean => data.dayLayoutRoomIds.includes(roomId);
  const roomTables = current ? tablesOf(current.room.id) : [];
  const items: TableItem[] = editMode ? drafts : roomTables.map(toTableItem);
  const duplicates = editMode ? duplicateNumbers(drafts) : new Set<number>();
  // Scelta dei tavoli di un evento ("Da assegnare" o "Modifica tavoli"): nella sala della scelta, in vista o in modifica.
  const picking = current && eventPick && eventPick.roomId === current.room.id ? eventPick : null;
  const pickId = picking?.target.bookingId ?? null;
  const pickNumbers = new Set<number>(picking?.numbers ?? []);
  // Eventi con modifiche in attesa o in scelta: i loro tavoli salvati non contano come occupati finché non si salva.
  const editedIds = new Set<string>([...Object.keys(pendingEventTables), ...pending.map((p) => p.bookingId), ...(pickId ? [pickId] : [])]);
  // Tavoli già presi da altri eventi in attesa di salvataggio (quelli dell'evento in scelta non contano).
  const pendingEventNumbers = new Set<number>();
  for (const [id, numbers] of Object.entries(pendingEventTables)) {
    if (id === pickId) continue;
    for (const n of numbers) pendingEventNumbers.add(n);
  }

  // Occupazione salvata della sala aperta: tavolo → chi è seduto (prenotazioni ed eventi).
  const bookingsByNumber = new Map<number, FloorBooking[]>();
  const eventsByNumber = new Map<number, FloorEvent[]>();
  const savedSeats = new Map<number, TableSeat>();
  if (current) {
    for (const table of roomTables) {
      const key = tableKey(current.room.id, table.number);
      const seatedBookings = index.bookingsByTable.get(key) ?? [];
      const seatedEvents = index.eventsByTable.get(key) ?? [];
      if (seatedBookings.length > 0) bookingsByNumber.set(table.number, seatedBookings);
      if (seatedEvents.length > 0) eventsByNumber.set(table.number, seatedEvents);
      const seat = tableSeat(seatedBookings, seatedEvents);
      if (seat) {
        const [event] = seatedEvents;
        savedSeats.set(table.number, { ...seat, eventPart: event ? eventPartOf(event, table.number) : null });
      }
    }
  }
  // Occupato da prenotazioni o da eventi non in modifica (quelli in modifica si spostano con il salvataggio).
  const savedOccupied = (number: number) => bookingsByNumber.has(number) || (eventsByNumber.get(number) ?? []).some((e) => !editedIds.has(e.id));
  // In modifica si mostrano le anteprime delle assegnazioni in attesa (singole, tolta la scelta in corso).
  const previewSeats = new Map<number, TableSeat>(
    pending.filter((p) => p.bookingId !== pickId).map((p): [number, TableSeat] => [p.tableNumber, previewSeat(p)]),
  );
  const isFreeNumber = (number: number) =>
    !savedOccupied(number) && !previewSeats.has(number) && !pendingEventNumbers.has(number) && !pickNumbers.has(number);
  // Modifica: tavoli degli eventi in attesa (come evento, "1 di N"), esclusa la scelta in corso.
  const pendingEventSeats = new Map<number, TableSeat>();
  if (editMode) {
    for (const [eventId, numbers] of Object.entries(pendingEventTables)) {
      if (eventId === pickId) continue;
      const event = events.find((e) => e.id === eventId);
      numbers.forEach((number, i) => {
        pendingEventSeats.set(number, eventTableSeat(event?.title ?? "", event?.covers ?? 0, numbers.length > 1 ? { index: i + 1, total: numbers.length } : null));
      });
    }
  }
  const shownSeats = new Map<number, TableSeat>(editMode ? [...pendingEventSeats, ...previewSeats] : savedSeats);
  // In vista, mentre si riscelgono i tavoli di un evento, i suoi tavoli salvati risultano liberi finché non sono scelti.
  if (picking && !editMode) {
    for (const [number, evs] of eventsByNumber) {
      if (!bookingsByNumber.has(number) && evs.every((e) => e.id === pickId)) shownSeats.delete(number);
    }
  }
  // Scelta in corso: i tavoli scelti appaiono come evento (ring mustard, "1 di N").
  const seats = new Map<number, TableSeat>(shownSeats);
  if (picking) {
    picking.numbers.forEach((number, i) => {
      seats.set(
        number,
        eventTableSeat(picking.target.label, picking.target.covers, picking.numbers.length > 1 ? { index: i + 1, total: picking.numbers.length } : null),
      );
    });
  }
  // Tavoli liberi destinazione: di un'assegnazione in corso o della scelta dei tavoli di un evento.
  const assignable = new Set<number>((assignTarget || picking) && current ? items.filter((item) => isFreeNumber(item.number)).map((item) => item.number) : []);
  /** Posti dei tavoli (bozze in modifica, salvati in vista) con questi numeri. */
  const seatsOf = (numbers: number[]) => items.reduce((sum, t) => (numbers.includes(t.number) ? sum + t.seats : sum), 0);
  const pickedSeats = picking ? seatsOf(picking.numbers) : 0;

  const selectedItem = current ? items.find((item) => item.key === selectedKey) ?? null : null;
  const menuMode = isDesk ? "popover" : "sheet";

  /** Evento a cui appartiene un tavolo: prima le modifiche in attesa (modifica), poi i salvati. */
  const eventForNumber = (number: number): FloorEvent | null => {
    const owner = Object.keys(pendingEventTables).find((id) => pendingEventTables[id].includes(number)) ?? pending.find((p) => p.tableNumber === number)?.bookingId;
    if (owner !== undefined) return events.find((e) => e.id === owner) ?? null;
    return (eventsByNumber.get(number) ?? []).find((e) => !editedIds.has(e.id)) ?? null;
  };
  /** Tavoli attuali di un evento: in modifica le modifiche in attesa, altrimenti i salvati. */
  const eventNumbersNow = (event: FloorEvent): number[] => {
    const queued = pendingEventTables[event.id];
    if (queued !== undefined) return queued;
    const single = pending.find((p) => p.bookingId === event.id);
    return single ? [single.tableNumber] : event.table_numbers;
  };
  // Tavolo selezionato di un evento: barra con posti/pax e "Modifica tavoli" (anche fuori dalla scelta).
  const selectedEvent = selectedItem && !picking ? eventForNumber(selectedItem.number) : null;
  const selectedEventSeats = selectedEvent ? seatsOf(eventNumbersNow(selectedEvent)) : 0;

  // Dentro una stanza (e durante lo zoom verso di essa) la sidebar desk si riduce a sola icona.
  const wantsCompactSidebar = view === "room" || zoomRoomId !== null;
  useEffect(() => {
    if (!wantsCompactSidebar) return;
    return compactSidebar();
  }, [wantsCompactSidebar]);

  // --- Lista "Da assegnare": prenotazioni e eventi senza tavolo (escluse le assegnazioni in attesa) ---
  const pendingIds = new Set([...pending.map((p) => p.bookingId), ...Object.keys(pendingEventTables)]);
  // Eventi svuotati in modifica (tavoli tolti, da salvare): tornano in "Da assegnare".
  const releasedEvents = canEditLayout ? events.filter((e) => e.id in pendingEventTables && pendingEventTables[e.id].length === 0) : [];
  const assignEvents = canEditLayout ? [...index.unseatedEvents.filter((e) => !pendingIds.has(e.id)), ...releasedEvents] : [];
  const assignBookings = index.unseated.filter((b) => !pendingIds.has(b.id));
  const assignCount = assignEvents.length + assignBookings.length;

  // --- Navigazione giorno/pasto (URL) ---
  const navigate = (date: string, meal: BookingMeal) => {
    setError(null);
    setBarMenu(null);
    startNav(() => router.push(floorHref(date, meal), { scroll: false }));
  };
  const sameYear = data.date.slice(0, 4) === today.slice(0, 4);
  const day = toDate(data.date);
  const dateTitle = capitalize(formatIt(day, sameYear ? "EEEE d MMMM" : "EEEE d MMMM yyyy"));
  const dateShort = capitalize(formatIt(day, sameYear ? "EEE d MMM" : "d MMM yy"));
  /** "06/11 pranzo": etichetta del controllo "Solo …" in modifica. */
  const dayLabel = `${data.date.slice(8, 10)}/${data.date.slice(5, 7)} ${BOOKING_MEAL_LABELS[data.meal].toLowerCase()}`;

  // --- Bozze e modifica ---
  /** Bozze di partenza: la disposizione mostrata; con ambito "solo giorno" senza disposizione propria, copie senza id. */
  const draftsFor = (roomId: string, scope: EditScope): TableItem[] => {
    const copy = scope === "day" && !dayLayoutActive(roomId);
    return tablesOf(roomId).map((table) => {
      const item = toTableItem(table);
      return copy ? { ...item, key: `copia-${table.number}`, id: undefined } : item;
    });
  };

  const enterEdit = (roomId: string, scope: EditScope) => {
    const next = draftsFor(roomId, scope);
    setEditScope(scope);
    setDrafts(next);
    setBaseline(serializeDrafts(next));
    setPending([]);
    setSelectedKey(null);
    setBarMenu(null);
    // La scelta di tavoli per un evento resta (anche in modifica); le assegnazioni pendenti ripartono da zero.
    setPendingEventTables({});
    setError(null);
    setEditMode(true);
  };

  const isDirty = editMode && (serializeDrafts(drafts) !== baseline || pending.length > 0 || Object.keys(pendingEventTables).length > 0);

  // --- Stanze ---
  const openRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setView("room");
    setZoomRoomId(null);
    setReturnRoomId(null);
    // Scelta di un evento fatta dalla piantina: si lega alla prima sala aperta; un'altra sala la chiude.
    setEventPick((prev) => (prev && (prev.roomId === null || prev.roomId === roomId) ? { ...prev, roomId } : null));
    // Sala senza tavoli: l'admin entra direttamente nella modifica disposizione (bozza vuota).
    if (canEditLayout && tablesOf(roomId).length === 0) {
      enterEdit(roomId, dayLayoutActive(roomId) ? "day" : "always");
    } else {
      setDrafts([]);
      setPending([]);
      setEditMode(false);
    }
  };

  const selectRoom = (roomId: string) => {
    if (zoomRoomId) return;
    setSelectedKey(null);
    setBarMenu(null);
    setFilter("tutti");
    setError(null);
    const entry = roomEntries.find((e) => e.room.id === roomId);
    if (entry?.geometry) setZoomRoomId(roomId);
    else openRoom(roomId);
  };

  const backToMap = () => {
    const entry = roomEntries.find((e) => e.room.id === selectedRoomId);
    setReturnRoomId(entry?.geometry ? entry.room.id : null);
    setEditMode(false);
    setDrafts([]);
    setPending([]);
    setSelectedRoomId(null);
    setSelectedKey(null);
    setBarMenu(null);
    setEventPick(null);
    setPendingEventTables({});
    setError(null);
    setView("map");
  };

  // --- Sedere / liberare ---
  const runSeat = (id: string, isEvent: boolean, roomId: string, tableNumber: number | null) => {
    const baseBooking = isEvent ? undefined : data.bookings.find((b) => b.id === id);
    const baseEvent = isEvent ? data.events.find((e) => e.id === id) : undefined;
    if (!baseBooking && !baseEvent) return;
    setError(null);
    setPendingBookingId(id);
    startAction(async () => {
      const result = await seatBooking(id, roomId, tableNumber, data.meal);
      setPendingBookingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (baseBooking) setSeatOverrides((prev) => ({ ...prev, [id]: { base: baseBooking, room_id: roomId, table_number: tableNumber } }));
      if (baseEvent) {
        setEventOverrides((prev) => ({
          ...prev,
          [id]: { base: baseEvent, room_id: roomId, table_numbers: tableNumber === null ? [] : [tableNumber] },
        }));
      }
      router.refresh();
    });
  };

  /** "Modifica tavoli": riapre la scelta con i tavoli attuali dell'evento (togli/aggiungi, poi Conferma). Nessun ridimensionamento. */
  const startEventEdit = (event: FloorEvent) => {
    if (!current || !canEditLayout) return;
    setSelectedKey(null);
    setBarMenu(null);
    setAssignTarget(null);
    setError(null);
    setEventPick({
      target: { bookingId: event.id, event: true, label: event.title, covers: event.covers },
      roomId: current.room.id,
      numbers: eventNumbersNow(event),
      reopened: true,
    });
  };

  /** Salva i tavoli dell'evento subito: l'override locale evita l'attesa; errore → si torna ai dati del server. */
  const saveEventTables = (event: FloorEvent, roomId: string, numbers: number[]) => {
    setError(null);
    // La base dell'override è il record del server (l'override vale solo finché è lo stesso oggetto).
    const base = data.events.find((e) => e.id === event.id) ?? event;
    setEventOverrides((prev) => ({ ...prev, [event.id]: { base, room_id: roomId, table_numbers: numbers } }));
    startAction(async () => {
      const result = await setEventTables(event.id, roomId, numbers, data.meal);
      if (!result.ok) {
        setEventOverrides((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        setError(result.error);
      }
      router.refresh();
    });
  };

  /** Vista: toglie un tavolo dall'evento (gli altri restano), salvando subito. */
  const removeEventTable = (event: FloorEvent, tableNumber: number) => {
    if (!current) return;
    setSelectedKey(null);
    saveEventTables(event, current.room.id, event.table_numbers.filter((n) => n !== tableNumber));
  };

  // --- Scelta dei tavoli di un evento (da "Da assegnare" o "Modifica tavoli"): locale, "Conferma" salva ---
  /** Tocco durante la scelta: libero → aggiunto; già scelto → tolto; occupato da altri → niente. */
  const togglePickTable = (tableNumber: number) => {
    if (!picking) return;
    const { numbers } = picking;
    if (numbers.includes(tableNumber)) setEventPick({ ...picking, numbers: numbers.filter((n) => n !== tableNumber) });
    else if (isFreeNumber(tableNumber)) setEventPick({ ...picking, numbers: [...numbers, tableNumber] });
  };

  const cancelEventPick = () => {
    setEventPick(null);
    setError(null);
  };

  /**
   * Conferma. Riaperta ("Modifica tavoli") o più tavoli: l'elenco completo dell'evento (anche vuoto = libera tutto).
   * - Vista: salvataggio subito (setEventTables, o seatBooking null se vuoto).
   * - Modifica: pendingEventTables, salvato con "Salva"; il pending singolo dello stesso evento viene tolto.
   * Primo tavolo solo (non riaperta): come prima, assegnazione singola con la misura dell'evento se serve (bozza, "Salva").
   */
  const confirmEventPick = () => {
    if (!picking || !current) return;
    const { target, numbers, reopened } = picking;
    if (numbers.length === 0 && !reopened) return;
    const roomId = current.room.id;
    const id = target.bookingId;
    const item = numbers.length === 1 ? items.find((i) => i.number === numbers[0]) ?? null : null;
    setEventPick(null);
    setSelectedKey(null);
    if (editMode && (reopened || numbers.length > 1)) {
      setPending((prev) => prev.filter((p) => p.bookingId !== id));
      setPendingEventTables((prev) => ({ ...prev, [id]: numbers }));
      return;
    }
    if (editMode) {
      if (!item) return;
      setPendingEventTables((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (needsResize(item, target.covers)) {
        seatOnResizedTable(target, item.number);
        return;
      }
      setPending((prev) => [...prev.filter((p) => p.bookingId !== id), { ...target, tableNumber: item.number }]);
      return;
    }
    // Vista, riaperta: nessun ridimensionamento. Vuoto = libera l'evento (la sala resta).
    if (reopened) {
      if (numbers.length === 0) runSeat(id, true, roomId, null);
      else {
        const event = events.find((e) => e.id === id);
        if (event) saveEventTables(event, roomId, numbers);
      }
      return;
    }
    // Vista, prima assegnazione: un tavolo che non regge i pax prende la misura dell'evento (bozza, "Salva").
    if (item && needsResize(item, target.covers)) {
      seatOnResizedTable(target, item.number);
      return;
    }
    const event = events.find((e) => e.id === id);
    if (event) saveEventTables(event, roomId, numbers);
  };

  const pickingId = eventPick?.target.bookingId ?? null;
  useEffect(() => {
    if (pickingId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEventPick(null);
        setError(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pickingId]);

  /** Solo chi modifica la disposizione ridimensiona il tavolo; la sala siede soltanto. */
  const needsResize = (item: TableItem, covers: number) => {
    if (!canEditLayout) return false;
    const seats = Math.min(MAX_TABLE_SEATS, Math.max(1, covers));
    return item.seats !== seats || item.shape !== shapeForCovers(item.shape, seats);
  };

  const onSeat = (booking: FloorBooking) => {
    if (!current || !selectedItem) return;
    if (needsResize(selectedItem, booking.covers)) {
      seatOnResizedTable({ bookingId: booking.id, event: false, label: booking.name, covers: booking.covers }, selectedItem.number);
      return;
    }
    runSeat(booking.id, false, current.room.id, selectedItem.number);
  };
  const onUnseat = (booking: FloorBooking) => {
    if (current) runSeat(booking.id, false, current.room.id, null);
  };
  const onUnseatEvent = (event: FloorEvent) => {
    if (current) runSeat(event.id, true, current.room.id, null);
  };

  // --- "Da assegnare": scelta di una voce, poi un tavolo libero ---
  const pickEntry = (target: AssignTarget) => {
    setBarMenu(null);
    setSelectedKey(null);
    setError(null);
    // Evento (admin): si scelgono tutti i suoi tavoli, in vista o in modifica, anche prima di aprire la sala.
    if (target.event && canEditLayout) {
      setAssignTarget(null);
      setEventPick((prev) =>
        prev?.target.bookingId === target.bookingId ? null : { target, roomId: current?.room.id ?? null, numbers: [], reopened: false },
      );
      return;
    }
    setEventPick(null);
    setAssignTarget((prev) => (prev?.bookingId === target.bookingId ? null : target));
  };

  const assignToTable = (item: TableItem) => {
    if (!current || !assignTarget) return;
    const target = assignTarget;
    setAssignTarget(null);
    // Evento o prenotazione (admin): il tavolo prende i posti dei pax e, se serve, la forma da tavolata
    // (bozza del giorno, si conferma con Salva).
    if (needsResize(item, target.covers)) {
      seatOnResizedTable(target, item.number);
      return;
    }
    if (editMode) {
      setPending((prev) => [...prev.filter((p) => p.bookingId !== target.bookingId), { ...target, tableNumber: item.number }]);
      setSelectedKey(null);
      return;
    }
    runSeat(target.bookingId, target.event, current.room.id, item.number);
  };

  const selectTable = (key: string | null) => {
    const item = key && current ? items.find((i) => i.key === key) ?? null : null;
    if (item && picking) {
      togglePickTable(item.number);
      return;
    }
    if (item && assignTarget && isFreeNumber(item.number)) {
      assignToTable(item);
      return;
    }
    setBarMenu(null);
    setSelectedKey(key);
  };

  const toggleBarMenu = (menu: BarMenu) => {
    setSelectedKey(null);
    setBarMenu((open) => (open === menu ? null : menu));
  };

  // --- Modifica disposizione ---
  const startEdit = () => {
    if (current) enterEdit(current.room.id, dayLayoutActive(current.room.id) ? "day" : "always");
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDrafts([]);
    setPending([]);
    setPendingEventTables({});
    setEventPick(null);
    setSelectedKey(null);
    setError(null);
  };

  /** Cambio di ambito in modifica: riparte dalle bozze del nuovo ambito (con conferma se ci sono modifiche). */
  const changeScope = (next: EditScope) => {
    if (!current || next === editScope) return;
    if (isDirty && !window.confirm(CHANGE_SCOPE_CONFIRM)) return;
    enterEdit(current.room.id, next);
  };

  /** Tavolata per un evento: bozza sul giorno (forma e posti dai coperti), assegnata all'evento, selezionata. */
  /** Tavolo generato per un evento o una prenotazione: bozza sul giorno (forma e posti dai coperti), assegnata, selezionata. */
  const generateTable = (target: AssignTarget) => {
    if (!current || !canEditLayout) return;
    const roomId = current.room.id;
    const onDay = editMode && editScope === "day";
    if (!onDay && isDirty && !window.confirm(CHANGE_SCOPE_CONFIRM)) return;
    const base = onDay ? drafts : draftsFor(roomId, "day");
    const keep = onDay ? pending : [];
    const number = nextTableNumber(base);
    const key = `nuovo-${draftSeq}`;
    setDraftSeq((n) => n + 1);
    const draft: TableItem = {
      key,
      number,
      seats: Math.min(MAX_TABLE_SEATS, Math.max(1, target.covers)),
      shape: suggestTableShape(target.covers),
      ...findFreeSpot(base),
      rotation: 0,
    };
    const placed: TableItem = { ...draft, ...clampTableCenter(draft, roomMeters(current.geometry)) };
    setEditScope("day");
    setDrafts([...base, placed]);
    if (!onDay) setBaseline(serializeDrafts(base));
    setPending([
      ...keep.filter((p) => p.bookingId !== target.bookingId),
      { ...target, tableNumber: number },
    ]);
    setEditMode(true);
    setSelectedKey(key);
    setBarMenu(null);
    setError(null);
  };

  /**
   * Evento o prenotazione su un tavolo esistente: bozza sul giorno con i posti del tavolo pari ai pax dell'evento (e forma da tavolata se la forma attuale non li regge), assegnazione in attesa,
   * tavolo selezionato (si salva con "Salva"). La disposizione standard non cambia: si lavora sempre sul giorno e pasto.
   */
  const seatOnResizedTable = (target: AssignTarget, tableNumber: number) => {
    if (!current || !canEditLayout) return;
    const roomId = current.room.id;
    const onDay = editMode && editScope === "day";
    if (!onDay && isDirty && !window.confirm(CHANGE_SCOPE_CONFIRM)) return;
    const base = onDay ? drafts : draftsFor(roomId, "day");
    const keep = onDay ? pending : [];
    const meters = roomMeters(current.geometry);
    const seats = Math.min(MAX_TABLE_SEATS, Math.max(1, target.covers));
    const next = base.map((d) => {
      if (d.number !== tableNumber) return d;
      const resized = { ...d, seats, shape: shapeForCovers(d.shape, seats) };
      return { ...resized, ...clampTableCenter(resized, meters) };
    });
    setEditScope("day");
    setDrafts(next);
    if (!onDay) setBaseline(serializeDrafts(base));
    setPending([...keep.filter((p) => p.bookingId !== target.bookingId), { ...target, tableNumber }]);
    setEditMode(true);
    setSelectedKey(next.find((d) => d.number === tableNumber)?.key ?? null);
    setBarMenu(null);
    setError(null);
  };

  const addTable = () => {
    const spot = findFreeSpot(drafts);
    const key = `nuovo-${draftSeq}`;
    setDraftSeq((n) => n + 1);
    setDrafts((prev) => [...prev, { key, number: nextTableNumber(prev), seats: 4, shape: "quadrato", x: spot.x, y: spot.y, rotation: 0 }]);
    setSelectedKey(key);
  };

  /** Modifica della bozza: il centro resta dentro la stanza con l'ingombro ruotato (anche dopo rotazione, posti, forma). */
  const patchDraft = (key: string, patch: Partial<TableItem>) => {
    const meters = roomMeters(current?.geometry ?? null);
    const old = drafts.find((d) => d.key === key);
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d;
        const next = { ...d, ...patch };
        if (patch.rotation !== undefined) next.rotation = normalizeRotation(patch.rotation);
        return { ...next, ...clampTableCenter(next, meters) };
      }),
    );
    // Cambio numero: l'assegnazione in attesa (e la scelta in corso) seguono il tavolo.
    if (old && patch.number !== undefined && patch.number !== old.number) {
      const from = old.number;
      const to = patch.number;
      setPending((prev) => prev.map((p) => (p.tableNumber === from ? { ...p, tableNumber: to } : p)));
      setPendingEventTables((prev) => renumberEventTables(prev, from, to));
      setEventPick((prev) => (prev ? { ...prev, numbers: prev.numbers.map((n) => (n === from ? to : n)) } : prev));
    }
  };

  const deleteDraft = (key: string) => {
    const victim = drafts.find((d) => d.key === key);
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    // Il tavolo sparisce: chi era assegnato lì torna da assegnare (anche gli eventi con più tavoli, dal tavolo tolto).
    if (victim) {
      setPending((prev) => prev.filter((p) => p.tableNumber !== victim.number));
      setPendingEventTables((prev) => renumberEventTables(prev, victim.number, null));
      setEventPick((prev) => (prev ? { ...prev, numbers: prev.numbers.filter((n) => n !== victim.number) } : prev));
    }
    setSelectedKey(null);
  };

  /** Ambito "Sempre" con disposizione propria del giorno: le bozze sarebbero quelle del giorno, quindi non si salva. */
  const saveBlocked: string | null =
    editMode && current !== null && editScope === "always" && dayLayoutActive(current.room.id)
      ? `Questo giorno usa una disposizione propria: modificala con «Solo ${dayLabel}» o ripristina la standard.`
      : null;

  const saveLayout = () => {
    if (!current || duplicates.size > 0 || saveBlocked) return;
    const roomId = current.room.id;
    const base = data.tables;
    const scope: LayoutScope = editScope === "day" ? { date: data.date, meal: data.meal } : null;
    const payload: RoomTableDraft[] = drafts.map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      number: d.number,
      seats: d.seats,
      shape: d.shape,
      x: d.x,
      y: d.y,
      rotation: d.rotation,
    }));
    const assignments = pending.map((p) => ({ bookingId: p.bookingId, tableNumber: p.tableNumber }));
    const eventTables = Object.entries(pendingEventTables);
    setError(null);
    startAction(async () => {
      const result = await saveRoomLayout(roomId, payload, scope, assignments);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // La disposizione è salvata: ora i tavoli degli eventi (in sequenza). Un errore non annulla il resto.
      const failures: string[] = [];
      for (const [eventId, numbers] of eventTables) {
        const base = data.events.find((e) => e.id === eventId);
        // Elenco vuoto = l'evento perde i suoi tavoli (la sala resta), come dal menu del tavolo.
        const saved = numbers.length === 0 ? await seatBooking(eventId, roomId, null, data.meal) : await setEventTables(eventId, roomId, numbers, data.meal);
        if (!saved.ok) {
          failures.push(`${base?.title ?? "evento"}: ${saved.error}`);
          continue;
        }
        if (base) setEventOverrides((prev) => ({ ...prev, [eventId]: { base, room_id: roomId, table_numbers: numbers } }));
      }
      if (failures.length > 0) setError(`Disposizione salvata, ma i tavoli non sono stati assegnati. ${failures.join("; ")}`);
      setSavedLayout({
        base,
        roomId,
        tables: drafts.map((d) => ({
          id: d.id ?? d.key,
          room_id: roomId,
          active: true,
          number: d.number,
          seats: d.seats,
          shape: d.shape,
          x: d.x,
          y: d.y,
          rotation: d.rotation,
          layout_date: scope?.date ?? null,
          layout_meal: scope?.meal ?? null,
        })),
      });
      setEditMode(false);
      setDrafts([]);
      setPending([]);
      setPendingEventTables({});
      setEventPick(null);
      setSelectedKey(null);
      router.refresh();
    });
  };

  /** Ripristina la standard per questo giorno e pasto (elimina la disposizione propria). */
  const resetDay = () => {
    if (!current || !dayLayoutActive(current.room.id)) return;
    if (!window.confirm(RESET_DAY_CONFIRM)) return;
    const roomId = current.room.id;
    setError(null);
    startAction(async () => {
      const result = await resetDayLayout(roomId, data.date, data.meal);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditMode(false);
      setDrafts([]);
      setPending([]);
      setPendingEventTables({});
      setEventPick(null);
      setSelectedKey(null);
      router.refresh();
    });
  };

  // --- Comandi flottanti comuni (piantina e stanza): "Da assegnare" e legenda ---
  const sceneButtons = (
    <>
      <FloatButton
        ref={unseatedRef}
        label="Da assegnare"
        icon={<ClipboardList aria-hidden="true" className="size-4" />}
        badge={<CountBadge count={assignCount} alert={assignCount > 0} />}
        aria-label={`Da assegnare: ${assignCount} ${assignCount === 1 ? "voce" : "voci"}`}
        aria-haspopup="dialog"
        aria-expanded={barMenu === "unseated"}
        tone={barMenu === "unseated" ? "active" : "default"}
        onClick={() => toggleBarMenu("unseated")}
      />
      <FloatButton
        ref={legendRef}
        label="Legenda"
        showLabel="never"
        icon={<Info aria-hidden="true" className="size-4" />}
        aria-haspopup="dialog"
        aria-expanded={barMenu === "legend"}
        tone={barMenu === "legend" ? "active" : "default"}
        onClick={() => toggleBarMenu("legend")}
      />
    </>
  );

  // Il menu del tavolo (in vista) mostra già l'errore: a parte, l'avviso flottante.
  const viewMenuOpen = selectedItem !== null && !editMode;
  const showFloatingError = error !== null && !viewMenuOpen;

  return (
    <div
      ref={rootRef}
      aria-busy={navPending}
      style={{
        ...FILL_STYLE,
        // Dal punto in cui inizia la scheda fino al fondo dello schermo (meno barra mobile o margine).
        height: `calc(100dvh - ${rootTop ?? FALLBACK_TOP_PX}px - var(--floor-reserve) - var(--floor-safe))`,
      }}
      className={cn(
        "flex min-h-[20rem] min-w-0 flex-col gap-2 transition-opacity duration-200 sm:gap-3",
        VIEWPORT_VARS,
        navPending && "pointer-events-none opacity-60",
      )}
    >
      <h1 className="sr-only">Mappa sala</h1>
      <DayBar
        date={data.date}
        title={dateTitle}
        shortTitle={dateShort}
        prev={shiftPeriod(data.date, "day", -1)}
        next={shiftPeriod(data.date, "day", 1)}
        today={data.date !== today ? today : null}
        meal={data.meal}
        onNavigate={navigate}
      />

      {/* Scena: piantina o stanza, con i comandi flottanti sopra il disegno. */}
      <div className="relative min-h-0 min-w-0 flex-1">
        {current ? (
          <RoomView
            key={current.room.id}
            room={current.room}
            geometry={current.geometry}
            items={items}
            seats={seats}
            event={current.status.event}
            status={current.status}
            filter={filter}
            onFilterChange={setFilter}
            selectedKey={selectedItem ? selectedKey : null}
            onSelect={selectTable}
            canEditLayout={canEditLayout}
            editing={editMode}
            duplicates={duplicates}
            assignable={assignable}
            saving={actionPending}
            saveBlocked={saveBlocked}
            menuMode={menuMode}
            topRight={sceneButtons}
            showBack={!editMode || (drafts.length === 0 && roomTables.length === 0)}
            onBack={backToMap}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSave={saveLayout}
            onAddTable={addTable}
            onMoveTable={(key, x, y) => patchDraft(key, { x, y })}
            onRotateTable={(key, rotation) => patchDraft(key, { rotation })}
            dayLayoutActive={dayLayoutActive(current.room.id)}
            scope={editScope}
            dayLabel={dayLabel}
            onScopeChange={changeScope}
            onResetDay={resetDay}
          />
        ) : (
          <>
            <CasaleMap
              entries={mapEntries}
              focusRoomId={zoomRoomId}
              startRoomId={returnRoomId}
              onSelectRoom={selectRoom}
              onFocusSettled={(roomId) => {
                if (roomId) openRoom(roomId);
              }}
            />
            {/* Durante lo zoom verso una stanza i comandi si nascondono. */}
            {!zoomRoomId && (
              <>
                <div className="absolute left-2 top-2 z-30">
                  <FloatButton
                    ref={roomsRef}
                    label="Sale"
                    showLabel="always"
                    icon={<LayoutGrid aria-hidden="true" className="size-4" />}
                    aria-haspopup="dialog"
                    aria-expanded={barMenu === "rooms"}
                    tone={barMenu === "rooms" ? "active" : "default"}
                    onClick={() => toggleBarMenu("rooms")}
                    className={hasOffMapRooms ? undefined : "desk:hidden"}
                  />
                </div>
                <div className="absolute right-2 top-2 z-30 flex items-start gap-1.5">{sceneButtons}</div>
                <p className={cn(FLOAT_SURFACE, "absolute bottom-2 left-2 z-30 max-w-[calc(100%-6rem)] truncate px-2.5 py-1 text-[11px] tabular-nums text-slate-dark")}>
                  {summaryText(summary)}
                </p>
              </>
            )}
          </>
        )}

        {/* Assegnazione in corso: avviso flottante con l'annullamento. */}
        {assignTarget && (
          <div
            role="status"
            className={cn(
              FLOAT_SURFACE,
              "absolute bottom-14 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap px-3 py-1.5 text-[13px] text-ink",
            )}
          >
            <span>{current ? "Tocca un tavolo libero" : "Scegli una sala"}</span>
            <span aria-hidden="true" className="text-slate">
              ·
            </span>
            <button
              type="button"
              onClick={() => setAssignTarget(null)}
              className="shrink-0 font-medium text-petrol underline-offset-2 hover:underline"
            >
              Annulla
            </button>
          </div>
        )}

        {/* Scelta dei tavoli per un evento da assegnare: nulla si salva finché non si conferma. */}
        {eventPick && !picking && (
          <div
            role="status"
            className={cn(
              FLOAT_SURFACE,
              "absolute bottom-14 left-1/2 z-30 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 px-3 py-1 text-[13px] text-ink",
            )}
          >
            <span className="min-w-0">
              Scegli una sala per <span className="font-serif font-medium">{eventPick.target.label}</span>
            </span>
            <span aria-hidden="true" className="text-slate">
              ·
            </span>
            <button type="button" onClick={cancelEventPick} className="min-h-10 shrink-0 font-medium text-petrol underline-offset-2 hover:underline">
              Annulla
            </button>
          </div>
        )}

        {picking && current && (
          <div
            role="status"
            className={cn(
              FLOAT_SURFACE,
              // In modifica i comandi stanno in basso a sinistra: la scelta va in basso a destra.
              "absolute z-30 flex w-max max-w-[calc(100%-1rem)] items-center gap-2 px-3 py-1 text-[13px] text-ink",
              editMode ? "bottom-16 left-1/2 -translate-x-1/2" : "bottom-14 left-1/2 -translate-x-1/2",
            )}
          >
            <span className="min-w-0">
              Scegli i tavoli per <span className="font-serif font-medium">{picking.target.label}</span>
              <span aria-hidden="true" className="text-slate">
                {" "}
                ·{" "}
              </span>
              <span className={cn("tabular-nums", pickedSeats < picking.target.covers ? "text-warning" : "text-ink")}>
                {pickedSeats}/{picking.target.covers} posti
              </span>
            </span>
            <button
              type="button"
              onClick={cancelEventPick}
              className="min-h-10 shrink-0 font-medium text-petrol underline-offset-2 hover:underline"
            >
              Annulla
            </button>
            <Button
              size="sm"
              className="min-h-10 shrink-0"
              disabled={picking.numbers.length === 0 || actionPending}
              onClick={confirmEventPick}
            >
              Conferma
            </Button>
          </div>
        )}

        {/* Tavolo di un evento: posti coperti sul totale, sempre visibili (vista e modifica); "Modifica tavoli" riapre la scelta. */}
        {selectedEvent && current && (
          <div
            role="status"
            className={cn(
              FLOAT_SURFACE,
              "absolute z-30 flex w-max max-w-[calc(100%-1rem)] items-center gap-2 px-3 py-1 text-[13px] text-ink",
              editMode ? "bottom-16 left-1/2 -translate-x-1/2" : "bottom-14 left-1/2 -translate-x-1/2",
            )}
          >
            <span className="min-w-0">
              <span className="font-serif font-medium">{selectedEvent.title}</span>
              <span aria-hidden="true" className="text-slate">
                {" "}
                ·{" "}
              </span>
              <span className={cn("tabular-nums", selectedEventSeats < selectedEvent.covers ? "text-warning" : "text-ink")}>
                {selectedEventSeats}/{selectedEvent.covers} posti
              </span>
            </span>
            <button
              type="button"
              onClick={() => (eventPick?.target.bookingId === selectedEvent.id ? cancelEventPick() : startEventEdit(selectedEvent))}
              className="min-h-10 shrink-0 font-medium text-petrol underline-offset-2 hover:underline"
            >
              {eventPick?.target.bookingId === selectedEvent.id ? "Indietro" : "Modifica tavoli"}
            </button>
          </div>
        )}

        {showFloatingError && error && (
          <FloatingError
            message={error}
            onDismiss={() => setError(null)}
            className={eventPick || selectedEvent ? "bottom-28" : assignTarget ? "bottom-24" : "bottom-14"}
          />
        )}
      </div>

      {/* Menu del tavolo: ancorato al tavolo (desk) o foglio dal basso. In modifica: solo l'editor compatto. */}
      {current && selectedItem && (
        <FloorPopover
          key={`${menuMode}-${selectedItem.key}`}
          mode={menuMode}
          title={tableMenuTitle(selectedItem)}
          bare={editMode}
          width={editMode ? "auto" : "md"}
          getAnchor={() => document.querySelector<HTMLElement>(`[data-table-key="${CSS.escape(selectedItem.key)}"]`)}
          onClose={() => setSelectedKey(null)}
        >
          {editMode ? (
            <div className="flex flex-col gap-2">
              {selectedEvent && (
                <EventSummaryRow
                  event={selectedEvent}
                  seats={selectedEventSeats}
                  picking={eventPick?.target.bookingId === selectedEvent.id}
                  onEdit={() => startEventEdit(selectedEvent)}
                  onBack={cancelEventPick}
                />
              )}
              <TableEditor
                key={selectedItem.key}
                item={selectedItem}
                duplicate={duplicates.has(selectedItem.number)}
                tooBig={!tableFitsRoom(selectedItem, roomMeters(current.geometry))}
                onChange={(patch) => patchDraft(selectedItem.key, patch)}
                onDelete={() => deleteDraft(selectedItem.key)}
                assigned={pending.find((p) => p.tableNumber === selectedItem.number) ?? null}
                onUnassign={() => setPending((prev) => prev.filter((p) => p.tableNumber !== selectedItem.number))}
              />
            </div>
          ) : (
            <TableMenu
              room={current.room}
              table={selectedItem}
              tables={roomTables}
              bookings={bookingsByNumber.get(selectedItem.number) ?? []}
              events={eventsByNumber.get(selectedItem.number) ?? []}
              roomEvent={current.status.event}
              unseated={index.unseated}
              roomNames={roomNames}
              canSeat={canSeat}
              canEditLayout={canEditLayout}
              pendingBookingId={actionPending ? pendingBookingId : null}
              error={error}
              onSeat={onSeat}
              onUnseat={onUnseat}
              onUnseatEvent={onUnseatEvent}
              onEditEvent={startEventEdit}
              onRemoveEventTable={removeEventTable}
            />
          )}
        </FloorPopover>
      )}

      {barMenu === "unseated" && (
        <FloorPopover
          key={`${menuMode}-da-assegnare`}
          mode={menuMode}
          title={`Da assegnare · ${BOOKING_MEAL_LABELS[data.meal]}`}
          placement="below"
          getAnchor={() => unseatedRef.current}
          onClose={() => setBarMenu(null)}
        >
          <AssignMenu
            summary={summary}
            events={assignEvents}
            bookings={assignBookings}
            roomNames={roomNames}
            canSeat={canSeat}
            canEditLayout={canEditLayout}
            canGenerate={current !== null && canEditLayout}
            selectedId={(eventPick?.target ?? assignTarget)?.bookingId ?? null}
            onPick={pickEntry}
            onGenerate={generateTable}
          />
        </FloorPopover>
      )}

      {barMenu === "legend" && (
        <FloorPopover
          key={`${menuMode}-legenda`}
          mode={menuMode}
          title="Legenda"
          placement="below"
          getAnchor={() => legendRef.current}
          onClose={() => setBarMenu(null)}
        >
          <FloorLegend />
        </FloorPopover>
      )}

      {barMenu === "rooms" && !current && (
        <FloorPopover
          key={`${menuMode}-sale`}
          mode={menuMode}
          title="Sale"
          placement="below"
          getAnchor={() => roomsRef.current}
          onClose={() => setBarMenu(null)}
        >
          <RoomsMenu entries={roomEntries} onSelect={selectRoom} />
        </FloorPopover>
      )}
    </div>
  );
}

interface DayBarProps {
  /** Giorno mostrato (YYYY-MM-DD). */
  date: string;
  title: string;
  /** Titolo breve per il telefono ("Ven 6 nov"). */
  shortTitle: string;
  prev: string;
  next: string;
  /** Data di oggi se diversa da quella mostrata (link "Oggi"). */
  today: string | null;
  meal: BookingMeal;
  onNavigate: (date: string, meal: BookingMeal) => void;
}

const DAY_ARROW =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-paper text-ink shadow-sm shadow-ink/5 transition-colors duration-200 hover:text-petrol";

/** Barra del giorno compatta, una riga: ‹ data › · Oggi · Pranzo|Cena. Link veri con navigazione lato client. */
function DayBar({ date, title, shortTitle, prev, next, today, meal, onNavigate }: DayBarProps) {
  const link = (date: string, nextMeal: BookingMeal) => ({
    href: floorHref(date, nextMeal),
    scroll: false,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onNavigate(date, nextMeal);
    },
  });

  return (
    <section aria-label="Mappa sala: giorno e pasto" className="flex min-w-0 shrink-0 items-center gap-1 rounded-xl bg-cream/70 p-1 sm:gap-2">
      <Link {...link(prev, meal)} prefetch aria-label="Giorno precedente" className={DAY_ARROW}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Link>
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-center text-[14px] font-medium leading-tight text-ink sm:text-[16px]">
        <span className="sm:hidden">{shortTitle}</span>
        <span className="max-sm:hidden">{title}</span>
      </p>
      <Link {...link(next, meal)} prefetch aria-label="Giorno successivo" className={DAY_ARROW}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </Link>
      {today && (
        <Link
          {...link(today, meal)}
          className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-petrol bg-paper px-2.5 text-[12px] font-medium text-petrol transition-colors hover:bg-petrol hover:text-paper sm:px-3 sm:text-[13px]"
        >
          Oggi
        </Link>
      )}
      <div role="group" aria-label="Pasto" className="inline-flex shrink-0 gap-0.5 rounded-lg border border-petrol/40 bg-paper/60 p-0.5">
        {BOOKING_MEALS.map((option) => {
          const active = option === meal;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) onNavigate(date, option);
              }}
              className={cn(
                "min-h-9 rounded-md px-2 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors duration-200 sm:px-3 desk:tracking-[0.12em]",
                active ? "bg-petrol text-paper shadow-sm shadow-ink/10" : "text-petrol hover:bg-paper",
              )}
            >
              {BOOKING_MEAL_LABELS[option]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Menu "Sale": tutte le sale con lo stato (utile su telefono, e per le sale fuori dalla piantina). */
function RoomsMenu({ entries, onSelect }: { entries: RoomEntry[]; onSelect: (roomId: string) => void }) {
  if (entries.length === 0) return <p className="text-[13px] text-slate-dark">Nessuna sala attiva.</p>;
  return (
    <ul className="-mx-1 flex flex-col">
      {entries.map(({ room, geometry, status }) => {
        const reserved = status.event !== null;
        return (
          <li key={room.id}>
            <button
              type="button"
              onClick={() => onSelect(room.id)}
              className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-cream"
            >
              <span className="min-w-0 truncate font-serif text-[15px] leading-snug text-ink">
                {room.name}
                {!geometry && <span className="ml-1.5 font-sans text-[11px] text-slate">fuori piantina</span>}
              </span>
              <span className={cn("shrink-0 text-[12px] tabular-nums", reserved ? "text-mustard" : "text-slate-dark")}>
                {reserved ? `Evento · ${status.event?.covers ?? 0} pax` : status.total > 0 ? `${status.free}/${status.total} liberi` : "Nessun tavolo"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
