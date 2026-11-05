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
  /** Prepara anche la pagina di modifica di ogni prenotazione (solo admin: per gli altri ruoli rimanda altrove). */
  editPages?: boolean;
}

const AGENDA_VIEWS = ["month", "week", "day"] as const;

/**
 * Elenco degli URL da preparare: agenda (senza parametri e con le tre viste per oggi),
 * pagine extra e, per ogni prenotazione, dettaglio (e modifica con `editPages`).
 */
export function buildAgendaWarmUrls({ today, bookingIds = [], extraPaths = [], editPages = false }: AgendaWarmOptions): string[] {
  const agenda = [
    "/admin/agenda",
    ...AGENDA_VIEWS.map((view) => `/admin/agenda?${new URLSearchParams({ date: today, view }).toString()}`),
  ];
  const bookings = bookingIds.flatMap((id) => {
    const base = `/admin/prenotazioni/${encodeURIComponent(id)}`;
    return editPages ? [base, `${base}/modifica`] : [base];
  });
  return Array.from(new Set([...agenda, ...extraPaths, ...bookings]));
}

/** Giorni di fogli (eventi, prenotazioni) preparati per l'anteprima offline, da oggi in avanti. */
const SHEET_WARM_DAYS = 7;

/** Anteprime JSON dei fogli del giorno da oggi per `SHEET_WARM_DAYS` giorni (es. apiBase "/api/events"). */
export function buildSheetWarmUrls(today: string, apiBase: string): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: SHEET_WARM_DAYS }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    return `${apiBase}/sheet?date=${day}`;
  });
}
