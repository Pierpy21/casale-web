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

const MAX_DOTS = 3;

export interface MobileCalendarProps {
  selected: string;
  today: string;
  byDate: Map<string, BookingListItem[]>;
  onNavigate: (iso: string) => void;
}

/** Calendario mensile compatto (mobile): swipe orizzontale o frecce cambiano mese. */
export function MobileCalendar({ selected, today, byDate, onNavigate }: MobileCalendarProps) {
  const selectedDate = toDate(selected);
  const days = monthGridDates(selected);
  const title = capitalize(formatIt(selectedDate, "LLLL yyyy"));
  const prevMonth = shiftPeriod(selected, "month", -1);
  const nextMonth = shiftPeriod(selected, "month", 1);
  const navButton =
    "grid size-10 place-items-center rounded-btn text-petrol transition-colors hover:bg-cream";

  return (
    <SwipeDay onPrev={() => onNavigate(prevMonth)} onNext={() => onNavigate(nextMonth)}>
      <section aria-label="Calendario mensile" className="flex flex-col gap-3">
        <header className="flex items-center justify-between gap-2">
          <h1 className="font-serif text-3xl leading-tight">{title}</h1>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onNavigate(today)} className={buttonClasses("outline", "sm")}>
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

        <div className="grid grid-cols-7 text-center">
          {days.slice(0, 7).map((day) => (
            <span key={toISO(day)} className="text-[11px] font-medium uppercase tracking-[0.06em] text-bronze">
              {formatIt(day, "EEE")}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toISO(day);
            const count = byDate.get(iso)?.length ?? 0;
            const dots = Math.min(count, MAX_DOTS);
            const inMonth = isSameMonth(day, selectedDate);
            const isSelected = iso === selected;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onNavigate(iso)}
                aria-current={isSelected ? "date" : undefined}
                aria-label={`${formatIt(day, "EEEE d MMMM")}${count > 0 ? `, ${count} ${count === 1 ? "banchetto" : "banchetti"}` : ""}`}
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
                  {Array.from({ length: dots }, (_, i) => (
                    <span key={i} className="size-1 rounded-full bg-bronze" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </SwipeDay>
  );
}
