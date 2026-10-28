import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import type { WeekStats } from "@/lib/types";

/** Intervallo compatto da una settimana (o gruppo di settimane) alla successiva: "12 – 18 ott", "30 ott – 5 nov". */
export function rangeLabel(from: WeekStats, to: WeekStats): string {
  const start = toDate(from.week_start);
  const end = toDate(to.week_end);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startFormat = sameMonth ? "d" : sameYear ? "d MMM" : "d MMM yyyy";
  const endFormat = sameYear ? "d MMM" : "d MMM yyyy";
  return `${formatIt(start, startFormat)} – ${formatIt(end, endFormat)}`;
}

export function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Coperti totali della settimana (eventi + prenotazioni). */
export function weekTotal(week: WeekStats): number {
  return week.event_covers + week.normal_covers;
}

/** Settimana senza nessun evento né prenotazione. */
export function isEmptyWeek(week: WeekStats): boolean {
  return week.event_covers === 0 && week.normal_covers === 0 && week.events === 0 && week.normal_bookings === 0;
}

/** Scala comune delle settimane del periodo: massimo per le barre, totale e media settimanale per i confronti. */
export interface WeekScale {
  /** Coperti della settimana più piena (100% della barra). Minimo 1. */
  max: number;
  /** Coperti totali di tutto il periodo. */
  periodTotal: number;
  /** Media coperti per settimana nel periodo (settimane vuote incluse). */
  average: number;
}

export function buildWeekScale(weeks: WeekStats[]): WeekScale {
  const totals = weeks.map((week) => weekTotal(week));
  const periodTotal = totals.reduce((sum, value) => sum + value, 0);
  return {
    max: Math.max(1, ...totals),
    periodTotal,
    average: weeks.length > 0 ? periodTotal / weeks.length : 0,
  };
}

/** Quota percentuale della settimana sul totale del periodo (intero). */
export function shareOfPeriod(week: WeekStats, scale: WeekScale): number {
  if (scale.periodTotal === 0) return 0;
  return Math.round((weekTotal(week) / scale.periodTotal) * 100);
}

export type VsAverage = "above" | "below" | "even";

/** Confronto con la media settimanale: "in linea" se la differenza arrotondata è zero. */
export function vsAverage(week: WeekStats, scale: WeekScale): VsAverage {
  const diff = Math.round(weekTotal(week) - scale.average);
  if (diff === 0) return "even";
  return diff > 0 ? "above" : "below";
}

const NUMBER_FORMAT = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** Numero con separatore italiano (es. 14,5). */
export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}

export function busiestDayLabel(day: { date: string; covers: number }): string {
  const date = formatIt(toDate(day.date), "EEEE d MMM");
  return `${date} · ${countLabel(day.covers, "coperto", "coperti")}`;
}
