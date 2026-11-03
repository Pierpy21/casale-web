"use client";

import { endOfWeek } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState, useTransition, type ReactNode } from "react";
import { getWeekOccupancy } from "@/app/actions/dashboard";
import { capitalize, formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import { DayBookingsDisclosure } from "@/components/dashboard/DayBookingsDisclosure";
import { DayStrip } from "@/components/dashboard/DayStrip";
import { RoomDayView } from "@/components/dashboard/RoomDayView";
import { RoomOccupancyMatrix } from "@/components/dashboard/RoomOccupancyMatrix";
import { SelectedDayHeading } from "@/components/dashboard/SelectedDayHeading";
import { addWeeksIso, resolveWeekStart, weekLabel, weekRange, weeksBetween } from "@/components/dashboard/week";
import { PageHeader, PinnedBar, StatusLegend } from "@/components/ui";
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

/** Settimane caricate nella striscia: da `from` a `to` (lunedì). `anchor` è la settimana su cui è stata centrata. */
interface StripRange {
  from: string;
  to: string;
  anchor: string;
}

/** Striscia centrata su una settimana: la precedente, quella e la successiva. */
function stripAround(week: string): StripRange {
  return { from: addWeeksIso(week, -1), to: addWeeksIso(week, 1), anchor: week };
}

/** Settimana dentro la striscia (confronto tra date ISO, ordinabili come stringhe). */
function inStrip(range: StripRange, week: string): boolean {
  return week >= range.from && week <= range.to;
}

function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

function minIso(a: string, b: string): string {
  return a < b ? a : b;
}

/** Quante settimane si aggiungono per volta quando lo scorrimento arriva a un bordo. */
const STRIP_CHUNK_WEEKS = 4;
/** Limite di scorrimento in ciascuna direzione, contato dalla settimana di ancoraggio. */
const STRIP_MAX_WEEKS = 52;

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
  // Ri-render quando una settimana della striscia arriva in background (i pallini si aggiornano).
  const [, bumpCache] = useReducer((n: number) => n + 1, 0);
  // Ultima settimana richiesta: le risposte arrivate in ritardo per altre settimane vengono scartate.
  const latestRequest = useRef(initialWeekStart);
  // Settimana e giorno effettivamente mostrati (dati applicati): base per il ripristino in caso di errore.
  const applied = useRef({ week: initialWeekStart, day: initialSelectedDay });
  const [cache] = useState(
    () => new Map<string, WeekData>([[initialWeekStart, { weekStart: initialWeekStart, days: initialDays, bookings: initialBookings }]]),
  );
  // Settimane della striscia (lunedì compresi) e ancora per il limite di scorrimento. Cresce solo scorrendo ai bordi.
  const [strip, setStrip] = useState<StripRange>(() => stripAround(initialWeekStart));
  // Settimane con una richiesta in corso: niente duplicati.
  const inFlight = useRef(new Set<string>());

  // Carica in background i dati (per i pallini) di tutte le settimane della striscia non ancora in cache.
  useEffect(() => {
    for (const iso of weeksBetween(strip.from, strip.to)) {
      if (cache.has(iso) || inFlight.current.has(iso)) continue;
      inFlight.current.add(iso);
      getWeekOccupancy(iso)
        .then((result) => {
          if (result.ok) {
            cache.set(iso, result.data);
            bumpCache();
          }
        })
        .catch(() => {
          // Il caricamento dei pallini è opportunistico: gli errori vengono ignorati (riprova al prossimo ampliamento).
        })
        .finally(() => {
          inFlight.current.delete(iso);
        });
    }
  }, [strip.from, strip.to, cache]);

  /** Aggiunge settimane in un bordo della striscia, fino al limite dalla settimana di ancoraggio. */
  function extendStrip(edge: "start" | "end") {
    setStrip((prev) => {
      if (edge === "start") {
        const floor = addWeeksIso(prev.anchor, -STRIP_MAX_WEEKS);
        const from = maxIso(addWeeksIso(prev.from, -STRIP_CHUNK_WEEKS), floor);
        return from === prev.from ? prev : { ...prev, from };
      }
      const ceil = addWeeksIso(prev.anchor, STRIP_MAX_WEEKS);
      const to = minIso(addWeeksIso(prev.to, STRIP_CHUNK_WEEKS), ceil);
      return to === prev.to ? prev : { ...prev, to };
    });
  }

  /** Cambia settimana; `preferredDay` (se appartiene alla settimana) diventa il giorno selezionato. */
  function goToWeek(target: string, preferredDay?: string) {
    const days = daysOf(target);
    let nextDay = days.includes(todayIso) ? todayIso : days[0];
    if (preferredDay && days.includes(preferredDay)) nextDay = preferredDay;
    latestRequest.current = target;
    setRequestedWeek(target);
    setSelectedDay(nextDay);
    // Settimana già nella striscia: la striscia resta com'è (niente salti). Altrimenti si ricentra su di essa.
    setStrip((prev) => (inStrip(prev, target) ? prev : stripAround(target)));
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
        setStrip((prev) => (inStrip(prev, shown.week) ? prev : stripAround(shown.week)));
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
  // Incrementato da "Oggi": la striscia si ricentra anche se il giorno selezionato non cambia.
  const [recenterKey, setRecenterKey] = useState(0);

  function goToday() {
    pickDay(todayIso);
    setRecenterKey((k) => k + 1);
  }

  function pickDay(iso: string) {
    if (daysOf(requestedWeek).includes(iso)) selectDay(iso);
    else goToWeek(toISO(resolveWeekStart(iso, iso)), iso);
  }

  const requestedStart = toDate(requestedWeek);
  const requestedEnd = endOfWeek(requestedStart, { weekStartsOn: 1 });


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

  // Striscia dei giorni: tutte le settimane caricate (si allarga scorrendo ai bordi), con i dati già in cache.
  // Memoizzato: la striscia riallinea lo scorrimento solo quando cambiano davvero i giorni.
  const stripDays = useMemo(() => weeksBetween(strip.from, strip.to).flatMap(daysOf), [strip.from, strip.to]);
  // Eventi e prenotazioni: la striscia mostra un pallino per tipo.
  const stripBookings = weeksBetween(strip.from, strip.to)
    .flatMap((iso) => (iso === data.weekStart ? data.bookings : (cache.get(iso)?.bookings ?? [])))
    .filter((b) => b.kind === "evento" || b.kind === "normale");
  const canExtendStart = strip.from > addWeeksIso(strip.anchor, -STRIP_MAX_WEEKS);
  const canExtendEnd = strip.to < addWeeksIso(strip.anchor, STRIP_MAX_WEEKS);

  return (
    <>
      {/* Giorni in cima su ogni dispositivo, prima di tutto: su telefono/tablet barra fissa sotto l'header (PinnedBar). */}
      <PinnedBar aria-label="Scegli il giorno" className="border-b border-sand pb-1.5">
        <DayStrip
          days={stripDays}
          selectedDay={selectedDay}
          todayIso={todayIso}
          bookings={stripBookings}
          onSelectDay={pickDay}
          canExtendStart={canExtendStart}
          canExtendEnd={canExtendEnd}
          onReachEdge={extendStrip}
          recenterKey={recenterKey}
        />
      </PinnedBar>

      {/* Su telefono titolo più piccolo perché "Dashboard · Domenica 28 marzo" resti su una riga; da sm in su invariato. */}
      {/* "Oggi" a destra, centrato sulla riga del titolo "Dashboard · giorno": torna a oggi (settimana corrente e giorno). */}
      <div className="flex min-w-0 items-end justify-between gap-3 [&_h1]:text-xl sm:[&_h1]:text-3xl desk:[&_h1]:text-4xl">
        <div className="min-w-0 flex-1">
          <PageHeader compact eyebrow="Direzione" title={`Dashboard · ${selectedDayShort}`} />
        </div>
        <button
          type="button"
          // Sempre attivo: anche con oggi già selezionato riporta la striscia su oggi dopo averla scorsa.
          onClick={goToday}
          // -mb: il pulsante (44/48px) è più alto della riga del titolo; il margine negativo lo centra su di essa.
          className="-mb-2.5 inline-flex min-h-11 shrink-0 items-center rounded-btn border border-petrol px-4 text-[12px] font-medium uppercase tracking-[0.12em] text-petrol transition-colors duration-200 hover:bg-petrol hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol sm:-mb-1.5 desk:-mb-1 desk:min-h-12 desk:px-6 desk:text-[14px]"
        >
          Oggi
        </button>
      </div>

      {/* Indicatori: una riga sola a 4 colonne, senza riquadri: separatori verticali tra gli indicatori. */}
      <section aria-label="Indicatori principali" className="grid min-w-0 grid-cols-4 divide-x divide-sand border-y border-sand">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            aria-label={`${tile.label}, ${tile.sub}: ${tile.value ?? "caricamento"}`}
            className={cn(
              // Contenuto centrato in ogni colonna (etichetta, numero, giorno).
              "flex min-w-0 flex-col items-center gap-1 px-2 py-3 text-center transition-colors duration-200 hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-petrol sm:px-4",
            )}
          >
            <span className="min-h-7 text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-bronze sm:min-h-0 sm:text-[11px] sm:tracking-[0.14em]">
              {tile.label}
            </span>
            {/* Evidenza (es. eventi senza acconto): numero in rosso, come "Dom", senza sfondo. */}
            <span className={cn("font-serif text-xl leading-none tabular-nums sm:text-2xl", tile.highlight ? "text-danger" : "text-ink")}>
              {tile.value ?? "–"}
            </span>
            <span className="max-w-full truncate text-[11px] text-slate-dark sm:text-[12px]">{tile.sub}</span>
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
        </div>

        {error && (
          <p role="alert" className="rounded-btn border border-warning/60 bg-warning/10 px-4 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}

        <StatusLegend />

        <div className={cn("flex min-w-0 flex-col transition-opacity duration-200", isPending && "opacity-60")}>
                      <div className="flex min-w-0 flex-col gap-5">
              <SelectedDayHeading selectedDay={selectedDay} todayIso={todayIso} rooms={rooms} bookings={eventBookings} />

              <div className="hidden min-w-0 desk:block">
                <RoomOccupancyMatrix rooms={rooms} days={data.days} bookings={eventBookings} />
              </div>

              <div className="min-w-0 desk:hidden">
                <RoomDayView rooms={rooms} selectedDay={selectedDay} bookings={eventBookings} />
              </div>
            </div>
        </div>
      </section>

      {children}
    </>
  );
}
