import { addDays, format, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBookingDayMarks } from "@/app/actions/bookings";
import {
  capitalize,
  formatIt,
  monthGridDates,
  shiftPeriod,
  toDate,
  toISO,
} from "@/components/agenda/agenda-utils";
import { MonthYearPicker } from "@/components/agenda/MonthYearPicker";
import { cn } from "@/components/ui";
import type { BookingDayMark } from "@/lib/types";

export interface BookingDatePickerProps {
  /** Data selezionata (YYYY-MM-DD). */
  value: string;
  /** Oggi nel fuso del Casale (YYYY-MM-DD). Le date passate restano selezionabili ma attenuate. */
  today: string;
  onChange: (iso: string) => void;
}

/** Conteggi di un giorno: eventi (pallino bronzo) e prenotazioni normali (pallino blu). */
interface DayMarks {
  events: number;
  reservations: number;
}

const STEP_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream active:bg-sand/60";
const NAV_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream";

/** Raggruppa i record del server per giorno (ISO). */
function marksByDate(items: BookingDayMark[]): Map<string, DayMarks> {
  const map = new Map<string, DayMarks>();
  for (const item of items) {
    const current = map.get(item.event_date) ?? { events: 0, reservations: 0 };
    if (item.kind === "evento") current.events += 1;
    else current.reservations += 1;
    map.set(item.event_date, current);
  }
  return map;
}

/**
 * Pallini sotto il numero (come il calendario mobile dell'agenda). Sul giorno selezionato, dentro il cerchio petrol,
 * usano i colori chiari (senape e carta) per restare visibili.
 */
function DayDots({ marks, onPetrol }: { marks: DayMarks; onPetrol: boolean }) {
  return (
    <>
      {marks.events > 0 && <span className={cn("size-1 rounded-full", onPetrol ? "bg-mustard" : "bg-bronze")} />}
      {marks.reservations > 0 && <span className={cn("size-1 rounded-full", onPetrol ? "bg-paper" : "bg-petrol")} />}
    </>
  );
}

/**
 * Selettore data per il foglio di creazione: stepper giorno per giorno (frecce ai lati della data)
 * e calendario mensile sotto, che segue la data scelta. Controllato: value/onChange.
 * Pallini: eventi e prenotazioni del mese mostrato (caricati in background, niente pallini finché non arrivano).
 */
export function BookingDatePicker({ value, today, onChange }: BookingDatePickerProps) {
  // Mese mostrato: segue la data scelta, poi si sfoglia con le frecce (senza cambiare la data).
  const [month, setMonth] = useState(value);
  const monthDate = toDate(month);
  const prevMonth = shiftPeriod(month, "month", -1);
  const nextMonth = shiftPeriod(month, "month", 1);
  const days = monthGridDates(month);
  const gridFrom = toISO(days[0]);
  const gridTo = toISO(days[days.length - 1]);
  const monthKey = month.slice(0, 7);
  const isToday = value === today;
  const dayTitle = capitalize(formatIt(toDate(value), "EEE d MMMM"));

  // Pallini già caricati per mese (il foglio si smonta alla chiusura: la cache vive per apertura).
  const cache = useRef(new Map<string, Map<string, DayMarks>>());
  // Ultimo mese caricato: i pallini valgono solo se corrispondono al mese mostrato.
  const [loaded, setLoaded] = useState<{ key: string; byDate: Map<string, DayMarks> } | null>(null);
  const byDate = loaded?.key === monthKey ? loaded.byDate : null;

  useEffect(() => {
    const cached = cache.current.get(monthKey);
    if (cached) {
      setLoaded({ key: monthKey, byDate: cached });
      return;
    }
    // Risposte arrivate dopo il cambio di mese: salvate in cache ma non mostrate.
    let active = true;
    getBookingDayMarks(gridFrom, gridTo)
      .then((result) => {
        // Errori e offline: nessun pallino e nessun messaggio (il calendario resta utilizzabile).
        if (!result.ok) return;
        const next = marksByDate(result.data);
        cache.current.set(monthKey, next);
        if (active) setLoaded({ key: monthKey, byDate: next });
      })
      .catch(() => {
        // Rete assente o server irraggiungibile: il caricamento dei pallini è opportunistico.
      });
    return () => {
      active = false;
    };
  }, [monthKey, gridFrom, gridTo]);

  function select(iso: string) {
    onChange(iso);
    setMonth(iso);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Stepper: giorno precedente / successivo ai lati della data scelta (44px). */}
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2">
        <button
          type="button"
          aria-label="Giorno precedente"
          onClick={() => select(toISO(addDays(toDate(value), -1)))}
          className={STEP_BUTTON}
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>

        <div aria-live="polite" className="flex min-w-0 flex-col items-center text-center">
          {/* Slot fisso (h-6): "Oggi" oppure "Torna a oggi" nella stessa posizione, senza salti di altezza. Il pulsante tiene 44px di tocco con margine negativo. */}
          <div className="flex h-6 items-center justify-center">
            {isToday ? (
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-bronze">Oggi</span>
            ) : (
              <button
                type="button"
                onClick={() => select(today)}
                className="relative z-10 -my-2.5 min-h-11 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-petrol hover:underline hover:underline-offset-4"
              >
                Torna a oggi
              </button>
            )}
          </div>
          <p className="font-serif text-2xl leading-tight text-ink">{dayTitle}</p>
        </div>

        <button
          type="button"
          aria-label="Giorno successivo"
          onClick={() => select(toISO(addDays(toDate(value), 1)))}
          className={STEP_BUTTON}
        >
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* Mese e anno cliccabili: pannello con anno e 12 mesi; sfoglia il calendario senza cambiare la data. */}
          <MonthYearPicker
            value={monthDate}
            align="start"
            labelClassName="font-serif text-xl leading-tight"
            onPick={(year, monthIndex) => setMonth(toISO(new Date(year, monthIndex, 1)))}
          />
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Mese precedente" onClick={() => setMonth(prevMonth)} className={NAV_BUTTON}>
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <button type="button" aria-label="Mese successivo" onClick={() => setMonth(nextMonth)} className={NAV_BUTTON}>
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        {/* Intestazione dei giorni: decorativa, il nome completo è nell'aria-label di ogni giorno. */}
        <div aria-hidden="true" className="grid grid-cols-7 text-center">
          {days.slice(0, 7).map((day) => (
            <span
              key={toISO(day)}
              className={cn("text-[11px] font-medium uppercase tracking-[0.06em]", day.getDay() === 0 ? "text-danger" : "text-bronze")}
            >
              {formatIt(day, "EEE")}
            </span>
          ))}
        </div>

        <div role="group" aria-label="Giorni del mese" className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toISO(day);
            const selected = iso === value;
            const isToday = iso === today;
            const isPast = iso < today;
            const inMonth = isSameMonth(day, monthDate);
            const marks = byDate?.get(iso);
            // Date passate: attenuate ma selezionabili (un evento può essere registrato a posteriori).
            const tone = inMonth ? (isPast ? "text-slate/60" : "text-ink") : "text-slate/40";
            const dotsLabel = marks
              ? [
                  marks.events > 0 ? `${marks.events} ${marks.events === 1 ? "evento" : "eventi"}` : "",
                  marks.reservations > 0 ? `${marks.reservations} ${marks.reservations === 1 ? "prenotazione" : "prenotazioni"}` : "",
                ]
                  .filter(Boolean)
                  .map((part) => `, ${part}`)
                  .join("")
              : "";
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={selected}
                aria-label={`${capitalize(formatIt(day, "EEEE d MMMM yyyy"))}${isToday ? ", oggi" : ""}${dotsLabel}`}
                onClick={() => select(iso)}
                className="flex h-12 w-full flex-col items-center gap-0.5 pt-0.5"
              >
                <span
                  className={cn(
                    "relative grid size-9 place-items-center rounded-full text-[15px] tabular-nums transition-colors duration-200",
                    selected
                      ? "bg-petrol font-medium text-paper"
                      : isToday
                        ? "text-petrol ring-1 ring-petrol"
                        : tone,
                  )}
                >
                  {format(day, "d")}
                  {/* Sul giorno selezionato i pallini stanno dentro il cerchio petrol, per restare visibili. */}
                  {selected && marks && (
                    <span aria-hidden="true" className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-0.5">
                      <DayDots marks={marks} onPetrol />
                    </span>
                  )}
                </span>
                {!selected && (
                  <span aria-hidden="true" className={cn("flex h-1.5 items-center gap-0.5", !inMonth && "opacity-40")}>
                    {marks && <DayDots marks={marks} onPetrol={false} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
