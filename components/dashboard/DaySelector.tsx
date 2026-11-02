import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { cn } from "@/components/ui/cn";
import type { BookingListItem } from "@/lib/types";

export interface DaySelectorProps {
  /** I 7 giorni (YYYY-MM-DD) della settimana mostrata. */
  days: string[];
  /** Giorno selezionato (YYYY-MM-DD), appartenente a `days`. */
  selectedDay: string;
  todayIso: string;
  /** Eventi della settimana: il pallino indica i giorni con almeno un evento. */
  bookings: BookingListItem[];
  /** Selezione di un giorno (stato locale, nessuna navigazione). */
  onSelectDay: (iso: string) => void;
}

/** Selettore dei giorni della settimana per la vista sale su tablet e telefono. */
export function DaySelector({ days, selectedDay, todayIso, bookings, onSelectDay }: DaySelectorProps) {
  // Griglia a 7 colonne che sta sempre nello schermo: su iOS Safari una striscia scorrevole fa scorrere tutta la pagina.
  return (
    <ul className="grid grid-cols-7 gap-1 sm:gap-2" aria-label="Giorni della settimana">
      {days.map((iso) => {
        const date = toDate(iso);
        const active = iso === selectedDay;
        const count = bookings.filter((b) => b.event_date === iso).length;
        return (
          <li key={iso} className="min-w-0">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelectDay(iso)}
              className={cn(
                "flex min-h-11 w-full min-w-0 flex-col items-center gap-0.5 rounded-btn border px-0.5 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                active ? "border-petrol bg-petrol text-paper" : "border-sand bg-paper text-ink hover:bg-cream",
              )}
            >
              <span className="max-w-full truncate text-[10px] font-medium uppercase tracking-[0.06em] opacity-80 sm:text-[11px] sm:tracking-[0.12em]">
                {formatIt(date, "EEE")}
              </span>
              <span className="font-serif text-xl leading-none tabular-nums">{formatIt(date, "d")}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 size-1.5 rounded-full",
                  count === 0 ? "bg-transparent" : active ? "bg-paper" : "bg-bronze",
                )}
              />
              <span className="sr-only">
                {iso === todayIso ? "oggi, " : ""}
                {count === 0 ? "nessun evento" : `${count} ${count === 1 ? "evento" : "eventi"}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
