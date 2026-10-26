"use client";

import { addDays, endOfWeek } from "date-fns";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { getWeekOccupancy } from "@/app/actions/dashboard";
import { formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import { RoomDayView } from "@/components/dashboard/RoomDayView";
import { RoomOccupancyMatrix } from "@/components/dashboard/RoomOccupancyMatrix";
import { WeekNav } from "@/components/dashboard/WeekNav";
import { resolveWeekStart, weekLabel, weekRange } from "@/components/dashboard/week";
import { StatusLegend } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { BookingListItem, Room } from "@/lib/types";

interface WeekData {
  weekStart: string;
  days: string[];
  bookings: BookingListItem[];
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

export function WeekOccupancy({
  rooms,
  todayIso,
  currentWeekIso,
  initialWeekStart,
  initialDays,
  initialBookings,
  initialSelectedDay,
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
          if (!cancelled && result.ok) cache.set(iso, result.data);
        })
        .catch(() => {
          // Il prefetch è opportunistico: gli errori vengono ignorati.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [requestedWeek, cache]);

  function goToWeek(target: string) {
    const days = daysOf(target);
    const nextDay = days.includes(todayIso) ? todayIso : days[0];
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

  const requestedStart = toDate(requestedWeek);
  const requestedEnd = endOfWeek(requestedStart, { weekStartsOn: 1 });
  const isCurrentWeek = requestedWeek === currentWeekIso;

  return (
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

      <div className={cn("flex min-w-0 flex-col transition-opacity duration-200", isPending && "opacity-60")}>
        <div className="hidden min-w-0 lg:block">
          <RoomOccupancyMatrix rooms={rooms} days={data.days} bookings={data.bookings} />
        </div>

        <div className="min-w-0 lg:hidden">
          <RoomDayView
            rooms={rooms}
            days={data.days}
            selectedDay={selectedDay}
            todayIso={todayIso}
            bookings={data.bookings}
            onSelectDay={selectDay}
          />
        </div>
      </div>

      <p className="text-[13px] text-slate-dark">
        Le sale piene sono occupate: coperti sulla capienza. Tocca o clicca per aprire la prenotazione.{" "}
        <Link href="/admin/catalogo" className="font-medium text-petrol underline-offset-2 hover:underline">
          Gestisci sale e menù
        </Link>
      </p>
    </section>
  );
}
