import { format, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BookingListItem } from "@/lib/types";
import { buttonClasses, cn } from "@/components/ui";
import { AgendaNavLink } from "./AgendaNavLink";
import { SwipeDay } from "./SwipeDay";
import {
  capitalize,
  formatIt,
  monthGridDates,
  shiftPeriod,
  toDate,
  toISO,
} from "./agenda-utils";


export interface MobileCalendarProps {
  selected: string;
  today: string;
  /** Tutti i banchetti per giorno: i pallini contano solo gli eventi (kind "evento"). */
  byDate: Map<string, BookingListItem[]>;
  onNavigate: (iso: string) => void;
  /** Intestazione con mese, "Oggi" e frecce. Falso quando la barra dell'agenda la sostituisce. */
  showHeader?: boolean;
}

/** Calendario mensile compatto (mobile): swipe orizzontale o frecce cambiano mese. Pallini = eventi del giorno. */
export function MobileCalendar({ selected, today, byDate, onNavigate, showHeader = true }: MobileCalendarProps) {
  const selectedDate = toDate(selected);
  const days = monthGridDates(selected);
  const title = capitalize(formatIt(selectedDate, "LLLL yyyy"));
  const prevMonth = shiftPeriod(selected, "month", -1);
  const nextMonth = shiftPeriod(selected, "month", 1);
  const navButton =
    "grid size-11 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream";

  return (
    <SwipeDay onPrev={() => onNavigate(prevMonth)} onNext={() => onNavigate(nextMonth)}>
      <section aria-label="Calendario mensile" className="flex flex-col gap-3">
        {showHeader && (
          <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3">
            <h1 className="min-w-0 break-words font-serif text-3xl leading-tight">{title}</h1>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onNavigate(today)} className={cn(buttonClasses("outline", "sm"), "min-h-11")}>
                Oggi
              </button>
              <AgendaNavLink iso={prevMonth} view="month" label="Mese precedente" className={navButton} onNavigate={(iso) => onNavigate(iso)}>
                <ChevronLeft aria-hidden="true" className="size-5" />
              </AgendaNavLink>
              <AgendaNavLink iso={nextMonth} view="month" label="Mese successivo" className={navButton} onNavigate={(iso) => onNavigate(iso)}>
                <ChevronRight aria-hidden="true" className="size-5" />
              </AgendaNavLink>
            </div>
          </header>
        )}

        <div className="grid grid-cols-7 text-center">
          {days.slice(0, 7).map((day) => (
            <span
              key={toISO(day)}
              className={cn("text-[11px] font-medium uppercase tracking-[0.06em]", day.getDay() === 0 ? "text-danger" : "text-bronze")}
            >
              {formatIt(day, "EEE")}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toISO(day);
            const dayItems = (byDate.get(iso) ?? []).filter((b) => b.status !== "annullato");
            const count = dayItems.filter((b) => b.kind === "evento").length;
            // Un pallino per tipo: bronzo se ci sono eventi, blu se ci sono prenotazioni.
            const hasReservations = dayItems.some((b) => b.kind === "normale");
            const inMonth = isSameMonth(day, selectedDate);
            const isSelected = iso === selected;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onNavigate(iso)}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${formatIt(day, "EEEE d MMMM")}${count > 0 ? `, ${count} ${count === 1 ? "evento" : "eventi"}` : ""}`}
                className="flex h-12 flex-col items-center gap-0.5 pt-0.5"
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-[15px] tabular-nums transition-colors duration-200",
                    isSelected
                      ? "bg-petrol font-medium text-paper"
                      : isToday
                        ? "text-petrol ring-1 ring-petrol"
                        : inMonth
                          ? "text-ink"
                          : "text-slate/50",
                  )}
                >
                  {format(day, "d")}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("flex h-1.5 items-center gap-0.5", !inMonth && "opacity-40")}
                >
                  {count > 0 && <span className="size-1 rounded-full bg-bronze" />}
                  {hasReservations && <span className="size-1 rounded-full bg-petrol" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </SwipeDay>
  );
}
