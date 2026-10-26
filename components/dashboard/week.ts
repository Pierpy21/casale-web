import { addDays, endOfWeek, getYear, isSameMonth, isValid, parseISO, startOfWeek } from "date-fns";
import { formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Lunedì della settimana indicata da `?week=YYYY-MM-DD`; se assente o non valida, la settimana di `todayIso`. */
export function resolveWeekStart(param: string | undefined, todayIso: string): Date {
  const valid = !!param && ISO_DATE_RE.test(param) && isValid(parseISO(param));
  const source = valid ? param! : todayIso;
  return startOfWeek(toDate(source), { weekStartsOn: 1 });
}

export interface WeekRange {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  days: string[];
}

export function weekRange(weekStart: Date): WeekRange {
  const end = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  return { start: weekStart, end, startIso: toISO(weekStart), endIso: toISO(end), days };
}

/** Etichetta leggibile: "Settimana corrente", "Settimana prossima" o "Settimana del 2 – 8 novembre". */
export function weekLabel(weekStart: Date, currentWeekStart: Date): string {
  const diffWeeks = Math.round((weekStart.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (diffWeeks === 0) return "Settimana corrente";
  if (diffWeeks === 1) return "Settimana prossima";

  const end = endOfWeek(weekStart, { weekStartsOn: 1 });
  const yearSuffix = getYear(end) !== getYear(new Date()) ? ` ${getYear(end)}` : "";
  if (isSameMonth(weekStart, end)) {
    return `Settimana del ${formatIt(weekStart, "d")} – ${formatIt(end, "d MMMM")}${yearSuffix}`;
  }
  return `Settimana del ${formatIt(weekStart, "d MMMM")} – ${formatIt(end, "d MMMM")}${yearSuffix}`;
}
