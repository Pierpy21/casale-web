// Periodi delle statistiche (puro: usabile anche nei Client Component). Fuso di riferimento: Europe/Rome.
// Il periodo parte dal 1° del mese di `anchor` e dura 1, 3 o 12 mesi. Le settimane sono lun–dom.
import { addDaysISO, romeToday } from "./dates";
import type { StatsKind, StatsPeriod } from "./types";

export const STATS_PERIODS = ["mese", "3mesi", "anno"] as const satisfies readonly StatsPeriod[];
export const STATS_KINDS = ["tutti", "evento", "normale"] as const satisfies readonly StatsKind[];

const PERIOD_MONTHS: Record<StatsPeriod, number> = { mese: 1, "3mesi": 3, anno: 12 };

const MONTHS_LONG = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface StatsRange {
  from: string;
  to: string;
  label: string;
  prevAnchor: string;
  nextAnchor: string;
}

/** Primo giorno del mese (YYYY-MM-01) che contiene la data, oppure "" se non valida. */
function firstOfMonth(iso: string): string {
  if (!ISO_DATE.test(iso)) return "";
  const month = Number(iso.slice(5, 7));
  if (month < 1 || month > 12) return "";
  return `${iso.slice(0, 8)}01`;
}

/** Primo giorno del mese, spostato di `months` mesi (anche negativi). */
export function shiftMonths(firstDay: string, months: number): string {
  const y = Number(firstDay.slice(0, 4));
  const m = Number(firstDay.slice(5, 7));
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** Lunedì della settimana che contiene la data (YYYY-MM-DD). */
export function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = domenica
  return addDaysISO(iso, -((dow + 6) % 7));
}

function periodLabel(periodo: StatsPeriod, from: string, to: string): string {
  const y1 = from.slice(0, 4);
  const m1 = Number(from.slice(5, 7)) - 1;
  const y2 = to.slice(0, 4);
  const m2 = Number(to.slice(5, 7)) - 1;
  if (periodo === "mese") return `${MONTHS_LONG[m1]} ${y1}`;
  if (y1 === y2) return `${MONTHS_SHORT[m1]} – ${MONTHS_SHORT[m2]} ${y2}`;
  return `${MONTHS_SHORT[m1]} ${y1} – ${MONTHS_SHORT[m2]} ${y2}`;
}

/**
 * Intervallo del periodo. `anchor` (YYYY-MM-DD) indica il mese di partenza (il 1° di quel mese);
 * senza anchor, o se non valido, parte dal mese corrente (Europe/Rome).
 */
export function resolveStatsRange(periodo: StatsPeriod, anchor?: string): StatsRange {
  const months = PERIOD_MONTHS[periodo] ?? 1;
  const anchorFirst = firstOfMonth(anchor ?? "") || firstOfMonth(romeToday());
  const nextFirst = shiftMonths(anchorFirst, months);
  const to = addDaysISO(nextFirst, -1);
  return {
    from: anchorFirst,
    to,
    label: periodLabel(periodo, anchorFirst, to),
    prevAnchor: shiftMonths(anchorFirst, -months),
    nextAnchor: nextFirst,
  };
}

/** Periodo dal parametro di URL; default "mese". */
export function parseStatsPeriod(v: unknown): StatsPeriod {
  return (STATS_PERIODS as readonly string[]).includes(String(v)) ? (String(v) as StatsPeriod) : "mese";
}

/** Tipo dal parametro di URL; default "tutti". */
export function parseStatsKind(v: unknown): StatsKind {
  return (STATS_KINDS as readonly string[]).includes(String(v)) ? (String(v) as StatsKind) : "tutti";
}
