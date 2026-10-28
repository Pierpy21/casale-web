import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import type { BookingListItem } from "@/lib/types";

export type AgendaView = "month" | "week" | "day";

/** Filtro per tipo nelle agende (query `tipo`). "Prenotazioni" = tutto ciò che non è evento. */
export type AgendaKindFilter = "tutti" | "eventi" | "prenotazioni";

export const AGENDA_KIND_OPTIONS: Array<{ value: AgendaKindFilter; label: string }> = [
  { value: "tutti", label: "Tutti" },
  { value: "eventi", label: "Eventi" },
  { value: "prenotazioni", label: "Prenotazioni" },
];

export function parseKindFilter(value: string | undefined): AgendaKindFilter {
  return value === "eventi" || value === "prenotazioni" ? value : "tutti";
}

export function filterBookings(bookings: BookingListItem[], filter: AgendaKindFilter): BookingListItem[] {
  if (filter === "tutti") return bookings;
  if (filter === "eventi") return bookings.filter((b) => b.kind === "evento");
  return bookings.filter((b) => b.kind !== "evento");
}

/** Conteggio di un giorno: solo gli eventi (banchetti), con singolare/plurale. Le prenotazioni non si contano. */
export function dayCountLabel(items: BookingListItem[]): string {
  const events = items.filter((b) => b.kind === "evento").length;
  return events > 0 ? `${events} ${events === 1 ? "banchetto" : "banchetti"}` : "Nessun banchetto";
}

/** Intervallo di date in formato ISO (YYYY-MM-DD), estremi inclusi. */
export interface IsoRange {
  from: string;
  to: string;
}

export const AGENDA_TZ = "Europe/Rome";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data odierna nel fuso del Casale (YYYY-MM-DD). */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENDA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Valida il parametro `date` della query; fallback a oggi. */
export function parseDateParam(value: string | undefined): string {
  if (value && ISO_DATE_RE.test(value) && isValid(parseISO(value))) return value;
  return todayISO();
}

export function parseView(value: string | undefined): AgendaView {
  return value === "week" || value === "day" ? value : "month";
}

export function toDate(iso: string): Date {
  return parseISO(iso);
}

export function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatIt(date: Date, pattern: string): string {
  return format(date, pattern, { locale: it });
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Link alla vista agenda con searchParams. */
export function agendaHref({
  date,
  view = "month",
  kind = "tutti",
}: {
  date: string;
  view?: AgendaView;
  kind?: AgendaKindFilter;
}): string {
  const params = new URLSearchParams({ date, view });
  if (kind !== "tutti") params.set("tipo", kind);
  return `/admin/agenda?${params.toString()}`;
}

/** Sposta il periodo selezionato di una unità della vista corrente. */
export function shiftPeriod(iso: string, view: AgendaView, direction: 1 | -1): string {
  const date = toDate(iso);
  if (view === "month") return toISO(direction > 0 ? addMonths(date, 1) : subMonths(date, 1));
  if (view === "week") return toISO(direction > 0 ? addWeeks(date, 1) : subWeeks(date, 1));
  return toISO(direction > 0 ? addDays(date, 1) : subDays(date, 1));
}

/** I 7 giorni (lun-dom) della settimana che contiene `iso`. */
export function weekDates(iso: string): Date[] {
  const start = startOfWeek(toDate(iso), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Griglia mensile lun-dom (5 o 6 settimane) che contiene il mese di `iso`. */
export function monthGridRange(iso: string): IsoRange {
  const date = toDate(iso);
  return {
    from: toISO(startOfWeek(startOfMonth(date), { weekStartsOn: 1 })),
    to: toISO(endOfWeek(endOfMonth(date), { weekStartsOn: 1 })),
  };
}

/** Tutti i giorni della griglia mensile di `iso` (multiplo di 7). */
export function monthGridDates(iso: string): Date[] {
  const { from, to } = monthGridRange(iso);
  return eachDayOfInterval({ start: toDate(from), end: toDate(to) });
}

/** true se `inner` è interamente contenuto in `outer` (ISO a confronto lessicografico). */
export function isRangeInside(inner: IsoRange, outer: IsoRange): boolean {
  return inner.from >= outer.from && inner.to <= outer.to;
}

/** Titolo del periodo per la toolbar desktop. */
export function periodTitle(view: AgendaView, iso: string): string {
  const date = toDate(iso);
  if (view === "week") {
    const from = startOfWeek(date, { weekStartsOn: 1 });
    const to = endOfWeek(date, { weekStartsOn: 1 });
    return `${formatIt(from, "d MMM")} – ${formatIt(to, "d MMM yyyy")}`;
  }
  if (view === "day") return capitalize(formatIt(date, "EEEE d MMMM yyyy"));
  return capitalize(formatIt(date, "LLLL yyyy"));
}

export function groupByDate(bookings: BookingListItem[]): Map<string, BookingListItem[]> {
  const map = new Map<string, BookingListItem[]>();
  for (const booking of bookings) {
    const bucket = map.get(booking.event_date);
    if (bucket) bucket.push(booking);
    else map.set(booking.event_date, [booking]);
  }
  return map;
}
