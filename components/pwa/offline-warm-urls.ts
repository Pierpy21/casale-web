/**
 * URL admin da pre-caricare per la lettura offline (vedi OfflineProvider e public/sw.js).
 * Funzione pura: si può chiamare dal server (layout autenticato) passando gli id delle prenotazioni vicine.
 */

export interface AgendaWarmOptions {
  /** Data odierna YYYY-MM-DD (todayISO() da components/agenda/agenda-utils.ts). */
  today: string;
  /** Id delle prenotazioni da preparare, es. quelle dei prossimi 14 giorni. */
  bookingIds?: string[];
  /** Pagine extra già filtrate per ruolo, es. ["/admin/dashboard", "/admin/giacenza"]. */
  extraPaths?: string[];
}

const AGENDA_VIEWS = ["month", "week", "day"] as const;

/**
 * Elenco degli URL da preparare: agenda (senza parametri e con le tre viste per oggi),
 * pagine extra e, per ogni prenotazione, dettaglio e modifica.
 */
export function buildAgendaWarmUrls({ today, bookingIds = [], extraPaths = [] }: AgendaWarmOptions): string[] {
  const agenda = [
    "/admin/agenda",
    ...AGENDA_VIEWS.map((view) => `/admin/agenda?${new URLSearchParams({ date: today, view }).toString()}`),
  ];
  const bookings = bookingIds.flatMap((id) => {
    const base = `/admin/prenotazioni/${encodeURIComponent(id)}`;
    return [base, `${base}/modifica`];
  });
  return Array.from(new Set([...agenda, ...extraPaths, ...bookings]));
}
