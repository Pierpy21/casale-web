import type { ActivityEntry } from "@/lib/types";
import { AGENDA_TZ, capitalize, formatIt, shiftPeriod, toDate } from "@/components/agenda/agenda-utils";
import {
  SINGLE_VALUE_FIELDS,
  changeFieldLabel,
  formatChangeValue,
  type NameLookup,
} from "@/components/bookings/change-labels";

export const ACTIVITY_FILTERS = ["tutte", "eventi", "prenotazioni"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export function parseActivityFilter(value: string | undefined): ActivityFilter {
  return value === "eventi" || value === "prenotazioni" ? value : "tutte";
}

/** Eventi = banchetti; prenotazioni = servizi alla carta e appuntamenti. */
export function filterActivity(entries: ActivityEntry[], filter: ActivityFilter): ActivityEntry[] {
  if (filter === "tutte") return entries;
  if (filter === "eventi") return entries.filter((entry) => entry.booking_kind === "evento");
  return entries.filter((entry) => entry.booking_kind === "normale" || entry.booking_kind === "appuntamento");
}

const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: AGENDA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ROME_TIME = new Intl.DateTimeFormat("it-IT", {
  timeZone: AGENDA_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Giorno di calendario (Europe/Rome) di un timestamp, come YYYY-MM-DD. */
export function romeDayKey(iso: string): string {
  return ROME_DAY.format(new Date(iso));
}

export function romeTimeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ROME_TIME.format(date);
}

export interface ActivityDayGroup {
  key: string;
  label: string;
  entries: ActivityEntry[];
}

/** Etichetta del gruppo: "Oggi", "Ieri" o la data in italiano. */
export function activityDayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Oggi";
  if (key === shiftPeriod(todayKey, "day", -1)) return "Ieri";
  return capitalize(formatIt(toDate(key), "EEEE d MMMM yyyy"));
}

/** Raggruppa per giorno mantenendo l'ordine (più recenti per primi) di getActivityLog. */
export function groupActivityByDay(entries: ActivityEntry[], todayKey: string): ActivityDayGroup[] {
  const groups = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const key = romeDayKey(entry.created_at);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups].map(([key, groupEntries]) => ({
    key,
    label: activityDayLabel(key, todayKey),
    entries: groupEntries,
  }));
}

/** Titolo della prenotazione nel registro: cliente, altrimenti l'etichetta salvata. */
export function activityBookingTitle(entry: ActivityEntry): string {
  return entry.client_name?.trim() || entry.booking_label?.trim() || "Prenotazione";
}

export interface ActivityChangeText {
  label: string;
  /** Creazione/eliminazione e cambi cliente: un solo valore, nessun "da → a". */
  single: boolean;
  from: string;
  to: string;
}

/**
 * Testo di una voce del registro. Il cambio di cliente non ha un nome risolvibile nel registro:
 * si dichiara solo che è cambiato.
 */
export function describeActivityChange(entry: ActivityEntry, lookup: NameLookup): ActivityChangeText {
  const label = changeFieldLabel(entry.field);
  if (entry.field === "client_id") {
    return { label, single: true, from: "", to: "modificato" };
  }
  if (SINGLE_VALUE_FIELDS.has(entry.field)) {
    return {
      label,
      single: true,
      from: "",
      to: formatChangeValue(entry.field, entry.new_value ?? entry.old_value, lookup),
    };
  }
  return {
    label,
    single: entry.old_value === null,
    from: formatChangeValue(entry.field, entry.old_value, lookup),
    to: formatChangeValue(entry.field, entry.new_value, lookup),
  };
}
