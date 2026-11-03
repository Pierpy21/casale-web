"use client";

import { addDays, endOfWeek } from "date-fns";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState, useTransition, type ReactNode } from "react";
import { getWeekOccupancy } from "@/app/actions/dashboard";
import { capitalize, formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import { SwipeDay } from "@/components/agenda/SwipeDay";
import { DayBookingsDisclosure } from "@/components/dashboard/DayBookingsDisclosure";
import { DayStrip } from "@/components/dashboard/DayStrip";
import { RoomDayView } from "@/components/dashboard/RoomDayView";
import { RoomOccupancyMatrix } from "@/components/dashboard/RoomOccupancyMatrix";
import { SelectedDayHeading } from "@/components/dashboard/SelectedDayHeading";
import { WeekNav } from "@/components/dashboard/WeekNav";
import { resolveWeekStart, weekLabel, weekRange } from "@/components/dashboard/week";
import { PageHeader, StatusLegend } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { BookingListItem, Room } from "@/lib/types";

interface WeekData {
  weekStart: string;
  days: string[];
  bookings: BookingListItem[];
}

/** Indicatori che non dipendono dal giorno selezionato: valori calcolati dal server, con il link alla pagina che li spiega. */
export interface DashboardIndicatorValues {
  /** Eventi non annullati del mese corrente. */
  eventsThisMonth: number;
  /** Eventi senza acconto (stato "opzione") da oggi in poi. */
  pendingOptions: number;
  eventsThisMonthHref: string;
  pendingOptionsHref: string;
}

export interface WeekOccupancyProps {
  rooms: Room[];
  todayIso: string;
  /** Lunedì della settimana corrente. */
  currentWeekIso: string;
  initialWeekStart: string;
  initialDays: string[];
  initialBookings: BookingListItem[];
  initialSelectedDay: string;
  /** Indicatori in cima: "Eventi" e "Coperti" seguono il giorno selezionato, gli altri restano valori del server. */
  indicators: DashboardIndicatorValues;
  /** Sezioni successive della dashboard (prossimi eventi, eliminazioni), già renderizzate dal server. */
  children?: ReactNode;
}

interface IndicatorTile {
  label: string;
  /** null mentre la settimana del giorno selezionato si sta caricando. */
  value: number | null;
  /** Riga sotto il valore: il giorno ("Oggi", "Gio 5 nov") oppure lo stato. */
  sub: string;
  href: string;
  highlight?: boolean;
}

/** Sostituisce il solo parametro di query senza navigazione Next, senza scroll. */
function writeUrl(weekStart: string, day: string): void {
  try {
    window.history.replaceState(window.history.state, "", `/admin/dashboard?week=${weekStart}&day=${day}`);
  } catch {
    // URL non aggiornabile (ambiente non browser): la vista resta corretta.
  }
}

/** Settimana (lunedì → domenica) a partire da un lunedì YYYY-MM-DD. */
function daysOf(weekStart: string): string[] {
  return weekRange(resolveWeekStart(weekStart, weekStart)).days;
}

/**
 * Intestazione della dashboard, indicatori, prenotazioni del giorno e sezione "Occupazione sale" (settimana,
 * giorno selezionato, sale). Possiede lo stato di settimana e giorno: per questo titolo, indicatori, striscia
 * dei giorni e prenotazioni del giorno stanno qui.
 */
export function WeekOccupancy({
  rooms,
  todayIso,
  currentWeekIso,
  initialWeekStart,
  initialDays,
  initialBookings,
  initialSelectedDay,
  indicators,
  children,
}: WeekOccupancyProps) {
  const [data, setData] = useState<WeekData>({
    weekStart: initialWeekStart,
    days: initialDays,
    bookings: initialBookings,
  });
  const [requestedWeek, setRequestedWeek] = useState(initialWeekStart);
  const [selectedDay, setSelectedDay] = useState(initialSelectedDay);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Ri-render quando una settimana vicina arriva dal prefetch (la striscia mostra i pallini di tutte e tre).
  const [, bumpCache] = useReducer((n: number) => n + 1, 0);
  // Ultima settimana richiesta: le risposte arrivate in ritardo per altre settimane vengono scartate.
  const latestRequest = useRef(initialWeekStart);
  // Settimana e giorno effettivamente mostrati (dati applicati): base per il ripristino in caso di errore.
  const applied = useRef({ week: initialWeekStart, day: initialSelectedDay });
  const [cache] = useState(
    () => new Map<string, WeekData>([[initialWeekStart, { weekStart: initialWeekStart, days: initialDays, bookings: initialBookings }]]),
  );

  // Prefetch in background della settimana precedente e successiva di quella richiesta.
  useEffect(() => {
    let cancelled = false;
    const base = toDate(requestedWeek);
    const neighbours = [toISO(addDays(base, -7)), toISO(addDays(base, 7))];
    for (const iso of neighbours) {
      if (cache.has(iso)) continue;
      getWeekOccupancy(iso)
        .then((result) => {
          if (!cancelled && result.ok) {
            cache.set(iso, result.data);
            bumpCache();
          }
        })
        .catch(() => {
          // Il prefetch è opportunistico: gli errori vengono ignorati.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [requestedWeek, cache]);

  /** Cambia settimana; `preferredDay` (se appartiene alla settimana) diventa il giorno selezionato. */
  function goToWeek(target: string, preferredDay?: string) {
    const days = daysOf(target);
    let nextDay = days.includes(todayIso) ? todayIso : days[0];
    if (preferredDay && days.includes(preferredDay)) nextDay = preferredDay;
    latestRequest.current = target;
    setRequestedWeek(target);
    setSelectedDay(nextDay);
    setError(null);
    writeUrl(target, nextDay);

    const cached = cache.get(target);
    if (cached) {
      setData(cached);
      applied.current = { week: target, day: nextDay };
      return;
    }

    startTransition(async () => {
      const result = await getWeekOccupancy(target);
      if (latestRequest.current !== target) return;
      if (result.ok) {
        cache.set(target, result.data);
        setData(result.data);
        applied.current = { week: target, day: nextDay };
      } else {
        // Torna alla settimana i cui dati sono a schermo, così intestazione e griglia restano coerenti.
        const shown = applied.current;
        latestRequest.current = shown.week;
        setRequestedWeek(shown.week);
        setSelectedDay(shown.day);
        writeUrl(shown.week, shown.day);
        setError(result.error);
      }
    });
  }

  function selectDay(iso: string) {
    setSelectedDay(iso);
    if (applied.current.week === requestedWeek) applied.current = { week: requestedWeek, day: iso };
    writeUrl(requestedWeek, iso);
  }

  /** Selezione dalla striscia: un giorno di una settimana vicina cambia anche la settimana. */
  function pickDay(iso: string) {
    if (daysOf(requestedWeek).includes(iso)) selectDay(iso);
    else goToWeek(toISO(resolveWeekStart(iso, iso)), iso);
  }

  const requestedStart = toDate(requestedWeek);
  const requestedEnd = endOfWeek(requestedStart, { weekStartsOn: 1 });
  const isCurrentWeek = requestedWeek === currentWeekIso;

  /** Swipe orizzontale: sposta il giorno selezionato di uno, cambiando settimana quando si esce dal bordo. */
  function shiftDay(delta: number) {
    const target = toISO(addDays(toDate(selectedDay), delta));
    if (daysOf(requestedWeek).includes(target)) selectDay(target);
    else goToWeek(toISO(addDays(requestedStart, delta * 7)), target);
  }

  // La matrice e la vista giorno mostrano solo gli eventi; le prenotazioni normali stanno nella tendina del giorno.
  const eventBookings = data.bookings.filter((b) => b.kind === "evento");
  const selectedNormalBookings = data.bookings.filter((b) => b.kind === "normale" && b.event_date === selectedDay);
  const selectedDayShort = capitalize(formatIt(toDate(selectedDay), "EEE d MMMM"));
  const selectedDayLabel = capitalize(formatIt(toDate(selectedDay), "EEEE d MMMM"));

  // Dati del giorno: validi solo quando la settimana richiesta è quella caricata (altrimenti "–" invece di zeri falsi).
  const dataReady = data.weekStart === requestedWeek;
  const dayEvents = dataReady
    ? eventBookings.filter((b) => b.event_date === selectedDay && b.status !== "annullato").length
    : null;
  // Coperti: adulti e bambini di eventi e prenotazioni normali (appuntamenti esclusi), non annullati.
  const dayCovers = dataReady
    ? data.bookings
        .filter((b) => b.event_date === selectedDay && b.kind !== "appuntamento" && b.status !== "annullato")
        .reduce((sum, b) => sum + b.adults + b.children, 0)
    : null;
  const dayTag = selectedDay === todayIso ? "Oggi" : capitalize(formatIt(toDate(selectedDay), "EEE d MMM"));
  const monthName = capitalize(formatIt(toDate(todayIso), "LLLL"));

  const dayHref = `/admin/agenda?date=${selectedDay}&view=day`;
  const tiles: IndicatorTile[] = [
    { label: "Eventi", value: dayEvents, sub: dayTag, href: dayHref },
    { label: "Eventi nel mese", value: indicators.eventsThisMonth, sub: monthName, href: indicators.eventsThisMonthHref },
    { label: "Coperti", value: dayCovers, sub: dayTag, href: dayHref },
    {
      label: "Senza acconto",
      value: indicators.pendingOptions,
      sub: indicators.pendingOptions > 0 ? "In attesa" : "Nessuno",
      href: indicators.pendingOptionsHref,
      highlight: indicators.pendingOptions > 0,
    },
  ];

  // Striscia dei giorni: settimana precedente, corrente e successiva, così scorre senza cambiare settimana a ogni bordo.
  const windowWeeks = [-7, 0, 7].map((delta) => toISO(addDays(requestedStart, delta)));
  const stripDays = windowWeeks.flatMap(daysOf);
  const stripEvents = windowWeeks
    .flatMap((iso) => (iso === data.weekStart ? data.bookings : (cache.get(iso)?.bookings ?? [])))
    .filter((b) => b.kind === "evento");

  return (
    <>
      <PageHeader compact eyebrow="Direzione" title={`Dashboard · ${selectedDayShort}`} />

      {/* Giorni in cima su ogni dispositivo, sempre visibili mentre si scorre la pagina (margini come la ricerca della giacenza). */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+4rem-1px)] z-20 -mx-4 min-w-0 border-b border-sand bg-paper/95 pb-1.5 pt-2 backdrop-blur sm:-mx-6 desk:top-0 desk:-mx-10 optouch:-mx-8">
        <DayStrip
          days={stripDays}
          selectedDay={selectedDay}
          todayIso={todayIso}
          bookings={stripEvents}
          onSelectDay={pickDay}
        />
      </div>

      {/* Indicatori: una riga sola a 4 colonne, senza riquadri: separatori verticali tra gli indicatori. */}
      <section aria-label="Indicatori principali" className="grid min-w-0 grid-cols-4 divide-x divide-sand border-y border-sand">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            aria-label={`${tile.label}, ${tile.sub}: ${tile.value ?? "caricamento"}`}
            className={cn(
              "flex min-w-0 flex-col gap-1 px-2 py-3 transition-colors duration-200 first:pl-0 hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol sm:px-4",
              tile.highlight && "bg-warning/10 first:pl-2 sm:first:pl-4",
            )}
          >
            <span className="min-h-7 text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-bronze sm:min-h-0 sm:text-[11px] sm:tracking-[0.14em]">
              {tile.label}
            </span>
            <span className="font-serif text-xl leading-none tabular-nums text-ink sm:text-2xl">{tile.value ?? "–"}</span>
            <span className="truncate text-[11px] text-slate-dark sm:text-[12px]">{tile.sub}</span>
          </Link>
        ))}
      </section>

      <DayBookingsDisclosure dayLabel={selectedDayLabel} bookings={selectedNormalBookings} className="min-w-0" />

      <section aria-labelledby="sale-settimana" className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 border-b border-sand pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p aria-live="polite" className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
              {weekLabel(requestedStart, toDate(currentWeekIso))}
            </p>
            <h2 id="sale-settimana" className="text-2xl">
              Occupazione sale
            </h2>
            <p aria-live="polite" className="flex items-center gap-2 text-[13px] text-slate-dark">
              <span>
                {formatIt(requestedStart, "d MMMM")} – {formatIt(requestedEnd, "d MMMM yyyy")}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block size-1.5 rounded-full bg-bronze transition-opacity duration-200",
                  isPending ? "animate-pulse opacity-100" : "opacity-0",
                )}
              />
            </p>
          </div>
          <WeekNav
            onPrev={() => goToWeek(toISO(addDays(requestedStart, -7)))}
            onNext={() => goToWeek(toISO(addDays(requestedStart, 7)))}
            onToday={() => goToWeek(currentWeekIso)}
            isCurrentWeek={isCurrentWeek}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-btn border border-warning/60 bg-warning/10 px-4 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}

        <StatusLegend />

        {/* Swipe orizzontale sull'area: cambia giorno (e settimana al bordo). Le matrici scorribili con il dito non lo attivano. */}
        <div className={cn("flex min-w-0 flex-col transition-opacity duration-200", isPending && "opacity-60")}>
          <SwipeDay onPrev={() => shiftDay(-1)} onNext={() => shiftDay(1)}>
            <div className="flex min-w-0 flex-col gap-5">
              <SelectedDayHeading selectedDay={selectedDay} todayIso={todayIso} rooms={rooms} bookings={eventBookings} />

              <div className="hidden min-w-0 desk:block">
                <RoomOccupancyMatrix rooms={rooms} days={data.days} bookings={eventBookings} />
              </div>

              <div className="min-w-0 desk:hidden">
                <RoomDayView rooms={rooms} selectedDay={selectedDay} bookings={eventBookings} />
              </div>
            </div>
          </SwipeDay>
        </div>
      </section>

      {children}
    </>
  );
}
