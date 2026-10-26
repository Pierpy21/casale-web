/** Date helpers puri. Fuso di riferimento: Europe/Rome. Le date evento sono stringhe YYYY-MM-DD. */

const ROME_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data odierna nel fuso Europe/Rome, formato YYYY-MM-DD. */
export function romeToday(now: Date = new Date()): string {
  return ROME_DAY.format(now);
}

/** Aggiunge giorni a una data YYYY-MM-DD (aritmetica UTC, nessuno slittamento di fuso). */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Primo e ultimo giorno (YYYY-MM-DD) del mese che contiene la data indicata. */
export function monthBounds(date: string): { from: string; to: string } {
  const [y, m] = date.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}
