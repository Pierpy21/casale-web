import { addDays, format, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
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

export interface BookingDatePickerProps {
  /** Data selezionata (YYYY-MM-DD). */
  value: string;
  /** Oggi nel fuso del Casale (YYYY-MM-DD). Le date passate restano selezionabili ma attenuate. */
  today: string;
  onChange: (iso: string) => void;
}

const STEP_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream active:bg-sand/60";
const NAV_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream";

/**
 * Selettore data per il foglio di creazione: stepper giorno per giorno (frecce ai lati della data)
 * e calendario mensile sotto, che segue la data scelta. Controllato: value/onChange.
 */
export function BookingDatePicker({ value, today, onChange }: BookingDatePickerProps) {
  // Mese mostrato: segue la data scelta, poi si sfoglia con le frecce (senza cambiare la data).
  const [month, setMonth] = useState(value);
  const monthDate = toDate(month);
  const prevMonth = shiftPeriod(month, "month", -1);
  const nextMonth = shiftPeriod(month, "month", 1);
  const days = monthGridDates(month);
  const isToday = value === today;
  const dayTitle = capitalize(formatIt(toDate(value), "EEE d MMMM"));

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

        <div role="group" aria-label="Giorni del mese" className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const iso = toISO(day);
            const selected = iso === value;
            const isToday = iso === today;
            const isPast = iso < today;
            const inMonth = isSameMonth(day, monthDate);
            // Date passate: attenuate ma selezionabili (un evento può essere registrato a posteriori).
            const tone = inMonth ? (isPast ? "text-slate/60" : "text-ink") : "text-slate/40";
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={selected}
                aria-label={`${capitalize(formatIt(day, "EEEE d MMMM yyyy"))}${isToday ? ", oggi" : ""}`}
                onClick={() => select(iso)}
                className="grid h-11 w-full place-items-center"
              >
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-[15px] tabular-nums transition-colors duration-200",
                    selected
                      ? "bg-petrol font-medium text-paper"
                      : isToday
                        ? "text-petrol ring-1 ring-petrol"
                        : tone,
                  )}
                >
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
