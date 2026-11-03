"use client";

import { addMonths, getDaysInMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { capitalize, formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import { cn } from "@/components/ui/cn";
import { MonthYearPicker } from "@/components/agenda/MonthYearPicker";
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
  /** Ci sono altre settimane da caricare in testa / in coda (false al limite massimo). */
  canExtendStart: boolean;
  canExtendEnd: boolean;
  /** Chiesta di altre settimane quando lo scorrimento si avvicina a un bordo. */
  onReachEdge: (edge: "start" | "end") => void;
  /** Cambia per chiedere di ricentrare il giorno selezionato anche se non è cambiato (tasto "Oggi"). */
  recenterKey?: number;
}

const NAV_BUTTON =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-paper text-ink shadow-sm shadow-ink/5 transition-colors duration-200 hover:text-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol";
const SIDE_BUTTON =
  "size-10 shrink-0 items-center justify-center rounded-lg border border-sand bg-paper text-ink transition-colors duration-200 hover:border-petrol hover:text-petrol focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol";

/** Posizione di un elemento nel contenuto della striscia: non cambia con lo scorrimento. */
function contentX(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
}

function pillOf(scroller: HTMLElement, iso: string): HTMLElement | null {
  return scroller.querySelector<HTMLElement>(`[data-iso="${iso}"]`);
}

/**
 * Striscia orizzontale dei giorni per telefono e tablet, sempre in cima alla dashboard.
 * Il giorno selezionato viene centrato solo in orizzontale (mai scrollIntoView, che può muovere la pagina su iOS).
 * Scorrendo verso un bordo chiede altre settimane; quando arrivano, la posizione visiva resta la stessa.
 */
export function DayStrip({
  days,
  selectedDay,
  todayIso,
  bookings,
  onSelectDay,
  canExtendStart,
  canExtendEnd,
  onReachEdge,
  recenterKey = 0,
}: DayStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  // Richiesta di settimane in corso: evita richieste duplicate finché i giorni non cambiano.
  const requesting = useRef(false);
  // Primo giorno al commit precedente, con la sua posizione nel contenuto: ancora per il ripristino dopo un prepend.
  const anchor = useRef<{ iso: string; x: number; selected: string } | null>(null);

  // Centra il giorno selezionato solo in orizzontale. Al primo render nessuna animazione; con "prefers-reduced-motion" nemmeno dopo.
  useEffect(() => {
    const scroller = scrollRef.current;
    const el = selectedRef.current;
    if (!scroller || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce || !mounted.current ? "auto" : "smooth";
    mounted.current = true;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const center = contentX(el, scroller) + el.offsetWidth / 2 - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.min(Math.max(center, 0), max), behavior });
  }, [selectedDay, recenterKey]);

  // Rotazione o ridimensionamento: il giorno selezionato torna al centro (senza animazione).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let width = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (scroller.clientWidth === width) return;
      width = scroller.clientWidth;
      const el = selectedRef.current;
      if (!el) return;
      const max = scroller.scrollWidth - scroller.clientWidth;
      const center = contentX(el, scroller) + el.offsetWidth / 2 - scroller.clientWidth / 2;
      scroller.scrollTo({ left: Math.min(Math.max(center, 0), max), behavior: "auto" });
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Dopo ogni cambio di giorni: se sono state aggiunte settimane in testa, sposta lo scorrimento della stessa distanza
  // (così il contenuto visibile non salta). Non tocca lo scorrimento quando cambia anche il giorno selezionato.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const prev = anchor.current;
    if (prev && prev.selected === selectedDay) {
      const el = pillOf(scroller, prev.iso);
      if (el) {
        const delta = contentX(el, scroller) - prev.x;
        if (delta !== 0) scroller.scrollLeft += delta;
      }
    }
    const firstIso = days[0];
    const first = firstIso ? pillOf(scroller, firstIso) : null;
    anchor.current = firstIso && first ? { iso: firstIso, x: contentX(first, scroller), selected: selectedDay } : null;
    requesting.current = false;
  }, [days, selectedDay]);

  /** Solo orizzontale e solo vicino a un bordo: non aggiorna lo stato a ogni scorrimento. */
  function handleScroll() {
    const el = scrollRef.current;
    if (!el || requesting.current) return;
    const screen = el.clientWidth;
    if (canExtendStart && el.scrollLeft < screen) {
      requesting.current = true;
      onReachEdge("start");
    } else if (canExtendEnd && el.scrollWidth - el.clientWidth - el.scrollLeft < screen) {
      requesting.current = true;
      onReachEdge("end");
    }
  }

  const counts = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === "annullato") continue;
    counts.set(booking.event_date, (counts.get(booking.event_date) ?? 0) + 1);
  }

  // Frecce del mese: stesso giorno del mese precedente/successivo (date-fns accorcia a fine mese, es. 31 → 30).
  const shiftMonth = (delta: number) => onSelectDay(toISO(addMonths(toDate(selectedDay), delta)));
  // Mese e anno scelti dal pannello: stesso giorno del mese, accorciato a fine mese (es. 31 → 30).
  const pickMonth = (year: number, month: number) => {
    const day = toDate(selectedDay).getDate();
    onSelectDay(toISO(new Date(year, month, Math.min(day, getDaysInMonth(new Date(year, month, 1))))));
  };
  // Frecce laterali: scorrono la striscia di circa una settimana, senza cambiare il giorno selezionato.
  const scrollWeek = (direction: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollBy({ left: direction * Math.max(scroller.clientWidth - 64, 200), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 pt-2 sm:px-6 desk:px-10 desk:pt-1.5 optouch:px-8">
      {/* Mese del giorno selezionato con frecce mese precedente / successivo; toccandolo si scelgono mese e anno. */}
      <div className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-cream/70 p-1">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mese precedente" className={NAV_BUTTON}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <MonthYearPicker value={toDate(selectedDay)} onPick={pickMonth} />
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Mese successivo" className={NAV_BUTTON}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1">
        <button type="button" onClick={() => scrollWeek(-1)} aria-label="Giorni precedenti" className={cn(SIDE_BUTTON, "inline-flex")}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        {/* Scorrimento orizzontale contenuto nella striscia (niente trascinamento della pagina su iOS), scrollbar nascosta.
            Attrito: ogni giorno è un punto di aggancio (snap); niente snap-always, che su iOS fa ricalcolare l'aggancio durante lo scroll della pagina.
            Sfumatura ai bordi: i giorni tagliati a metà svaniscono invece di finire di netto. */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [overflow-anchor:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [&::-webkit-scrollbar]:hidden"
        >
          <ul aria-label="Giorni" className="flex w-max items-stretch gap-1">
            {days.map((iso) => {
              const date = toDate(iso);
              const active = iso === selectedDay;
              const isToday = iso === todayIso;
              const count = counts.get(iso) ?? 0;
              const startsWeek = date.getDay() === 1;
              // Solo l'etichetta "Dom" in rosso (tranne quando selezionata: lì vale il testo chiaro sul blu).
              const sunday = date.getDay() === 0;
              const label = `${capitalize(formatIt(date, "EEEE d MMMM"))}${isToday ? ", oggi" : ""}, ${
                count === 0 ? "nessun evento" : `${count} ${count === 1 ? "evento" : "eventi"}`
              }`;
              return (
                <li key={iso} className={cn("relative shrink-0 snap-center", startsWeek && "ml-2.5")}>
                  {/* Lineetta verde accennata a metà dello stacco tra due settimane (ml-2.5 + gap-1 = 14px). */}
                  {startsWeek && (
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-4 -left-[7.5px] w-px rounded-full bg-success/45" />
                  )}
                  <button
                    ref={active ? selectedRef : undefined}
                    type="button"
                    data-iso={iso}
                    aria-pressed={active}
                    aria-label={label}
                    onClick={() => onSelectDay(iso)}
                    className={cn(
                      "flex w-14 flex-col items-center gap-1 rounded-xl pb-1.5 pt-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                      active ? "bg-petrol text-paper shadow-sm shadow-petrol/30" : "text-ink hover:bg-cream",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("text-[12px] leading-none", active ? "text-paper/85" : sunday ? "text-danger" : "text-slate-dark")}
                    >
                      {capitalize(formatIt(date, "EEE"))}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn("font-serif text-2xl leading-none tabular-nums", !active && isToday && "text-petrol")}
                    >
                      {formatIt(date, "dd")}
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
        <button type="button" onClick={() => scrollWeek(1)} aria-label="Giorni successivi" className={cn(SIDE_BUTTON, "inline-flex")}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
