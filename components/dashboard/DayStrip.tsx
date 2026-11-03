"use client";

import { useEffect, useRef } from "react";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { cn } from "@/components/ui/cn";
import type { BookingListItem } from "@/lib/types";

export interface DayStripProps {
  /** Giorni (YYYY-MM-DD) in ordine, anche di più settimane: la striscia scorre su tutti. */
  days: string[];
  /** Giorno selezionato (YYYY-MM-DD), appartenente a `days`. Viene centrato nella striscia. */
  selectedDay: string;
  todayIso: string;
  /** Solo eventi: il pallino indica i giorni con almeno un evento non annullato. */
  bookings: BookingListItem[];
  /** Selezione di un giorno (se il giorno è di un'altra settimana, la settimana cambia). */
  onSelectDay: (iso: string) => void;
}

/**
 * Striscia orizzontale dei giorni per telefono e tablet, sempre in cima alla dashboard.
 * Il giorno selezionato viene centrato; lo scorrimento è a scatti sui giorni (scroll-snap).
 */
export function DayStrip({ days, selectedDay, todayIso, bookings, onSelectDay }: DayStripProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);

  // Centra il giorno selezionato. Al primo render nessuna animazione; con "prefers-reduced-motion" nemmeno dopo.
  // La striscia è sticky, quindi block "nearest" non sposta la pagina in verticale.
  useEffect(() => {
    const el = selectedRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce || !mounted.current ? "auto" : "smooth";
    mounted.current = true;
    el.scrollIntoView({ behavior, block: "nearest", inline: "center" });
  }, [selectedDay]);

  const counts = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === "annullato") continue;
    counts.set(booking.event_date, (counts.get(booking.event_date) ?? 0) + 1);
  }

  return (
    // Scorrimento orizzontale contenuto nella striscia (niente trascinamento della pagina su iOS), scrollbar nascosta.
    <div className="min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul aria-label="Giorni" className="flex w-max items-stretch gap-1.5 px-4">
        {days.map((iso) => {
          const date = toDate(iso);
          const active = iso === selectedDay;
          const isToday = iso === todayIso;
          const count = counts.get(iso) ?? 0;
          const startsWeek = date.getDay() === 1;
          const label = `${capitalize(formatIt(date, "EEEE d MMMM"))}${isToday ? ", oggi" : ""}, ${
            count === 0 ? "nessun evento" : `${count} ${count === 1 ? "evento" : "eventi"}`
          }`;
          return (
            <li key={iso} className={cn("shrink-0 snap-center", startsWeek && "ml-3")}>
              <button
                ref={active ? selectedRef : undefined}
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => onSelectDay(iso)}
                className={cn(
                  "flex min-h-11 w-14 flex-col items-center gap-0.5 rounded-btn border pb-1 pt-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                  active
                    ? "border-petrol bg-petrol text-paper"
                    : isToday
                      ? "border-bronze bg-paper text-ink hover:bg-cream"
                      : "border-sand bg-paper text-ink hover:bg-cream",
                )}
              >
                <span aria-hidden="true" className="text-[10px] font-medium uppercase leading-none tracking-[0.08em] opacity-80">
                  {formatIt(date, "EEE")}
                </span>
                <span aria-hidden="true" className="font-serif text-xl leading-none tabular-nums">
                  {formatIt(date, "d")}
                </span>
                <span aria-hidden="true" className="text-[10px] font-medium uppercase leading-none tracking-[0.08em] opacity-80">
                  {formatIt(date, "MMM")}
                </span>
                {/* Riga fissa: "Oggi" e pallino dei giorni con eventi, così tutti i giorni hanno la stessa altezza. */}
                <span aria-hidden="true" className="flex h-2.5 items-center gap-1 text-[9px] font-semibold uppercase leading-none tracking-[0.06em]">
                  {isToday && <span className={active ? undefined : "text-bronze"}>Oggi</span>}
                  {count > 0 && <span className={cn("size-1.5 rounded-full", active ? "bg-paper" : "bg-bronze")} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
