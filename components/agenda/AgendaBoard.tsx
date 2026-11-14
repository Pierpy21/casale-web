"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PinnedBar, StatusLegend, cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { AgendaMealSwitch } from "./AgendaMealSwitch";
import { AgendaToolbar } from "./AgendaToolbar";
import { MobileAgenda } from "./MobileAgenda";
import { MonthView } from "./MonthView";
import { DayView, WeekView } from "./PeriodViews";
import { nextEventFrom } from "./NextEventHint";
import {
  SALA_PARAM,
  agendaHref,
  filterBookings,
  groupByDate,
  isRangeInside,
  monthGridDates,
  monthGridRange,
  toDate,
  weekDates,
  type AgendaKindFilter,
  type AgendaMealFilter,
  type AgendaView,
  type IsoRange,
} from "./agenda-utils";

export interface AgendaBoardProps {
  bookings: BookingListItem[];
  /** Giorno selezionato all'apertura (query `date`). */
  initialDate: string;
  initialView: AgendaView;
  /** Filtro per tipo all'apertura (query `tipo`). */
  initialKind: AgendaKindFilter;
  /** Filtro per pasto all'apertura (query `pasto`): vale solo per le liste del giorno. */
  initialMeal: AgendaMealFilter;
  /** Griglia mensile caricata dal server: navigare dentro questo intervallo non richiede rete. */
  loadedRange: IsoRange;
  today: string;
  isAdmin: boolean;
  /** Sale per l'assegnazione nelle prenotazioni normali della giornata. */
  rooms: Room[];
  /** `canAssignRoom(profile, "normale")`: senza, le sale sono in sola lettura. */
  canAssignRooms: boolean;
  /** Vista per sale (ruolo sala): il giorno mostra una griglia di sale invece della lista. */
  roomsView?: boolean;
  /** Primo evento oltre la griglia caricata (null se non c'è). */
  nextEventAfterRange: NextEventBrief | null;
}

/** Stessa barra delle statistiche: bordo inferiore sottile, padding come le pagine. */
const AGENDA_BAR = "border-b border-sand px-4 pb-2 pt-1 sm:px-6 desk:px-10 desk:pb-3 desk:pt-3";

/**
 * Stato dell'agenda lato client. Selezione del giorno, vista e filtri (tipo e pasto) cambiano in locale (istantanei);
 * l'URL si aggiorna con replaceState senza refetch. Solo quando si esce dalla griglia caricata
 * si passa dal server, dentro una transizione (la UI precedente resta visibile, con leggero fade).
 */
export function AgendaBoard({
  bookings,
  initialDate,
  initialView,
  initialKind,
  initialMeal,
  loadedRange,
  today,
  isAdmin,
  rooms,
  canAssignRooms,
  roomsView = false,
  nextEventAfterRange,
}: AgendaBoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(initialDate);
  const [view, setView] = useState<AgendaView>(initialView);
  const [kind, setKind] = useState<AgendaKindFilter>(initialKind);
  /** Filtro pasto (query `pasto`): si conserva quando si cambia giorno, vista o tipo. */
  const [meal, setMeal] = useState<AgendaMealFilter>(initialMeal);
  /** Sala aperta nella vista sale (query `sala`): si conserva quando si cambia giorno, vista o tipo. */
  const openRoom = roomsView ? searchParams.get(SALA_PARAM) : null;

  // Pallini del calendario mensile mobile (allByDate): contano solo gli eventi.
  // Vista mese desktop, settimana, giorno e liste (byDate): pill filtrate dal filtro tipo.
  const byDate = useMemo(() => groupByDate(filterBookings(bookings, kind)), [bookings, kind]);
  const allByDate = useMemo(() => groupByDate(bookings), [bookings]);

  // Prossimo evento dopo il giorno selezionato (riquadro del giorno vuoto, per tutti i ruoli).
  const nextEvent = useMemo(() => nextEventFrom(bookings, selected, nextEventAfterRange), [bookings, selected, nextEventAfterRange]);

  const navigate = useCallback(
    (target: string, nextView: AgendaView, nextKind: AgendaKindFilter = kind) => {
      const href = agendaHref({ date: target, view: nextView, kind: nextKind, meal, sala: openRoom });
      if (isRangeInside(monthGridRange(target), loadedRange)) {
        setSelected(target);
        setView(nextView);
        setKind(nextKind);
        window.history.replaceState(window.history.state, "", href);
        return;
      }
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [kind, meal, loadedRange, openRoom, router],
  );

  const onKindChange = (next: AgendaKindFilter) => navigate(selected, view, next);

  // Il pasto è solo un filtro locale delle liste del giorno: nessuna richiesta al server, solo URL.
  const onMealChange = (next: AgendaMealFilter) => {
    setMeal(next);
    window.history.replaceState(
      window.history.state,
      "",
      agendaHref({ date: selected, view, kind, meal: next, sala: openRoom }),
    );
  };

  return (
    <div
      aria-busy={isPending}
      className={cn("transition-opacity duration-200", isPending && "pointer-events-none opacity-60")}
    >
      {/* Telefono e tablet: barra fissa sotto l'header (come le statistiche). Il periodo è il mese. */}
      <div className="-mt-2 flex min-w-0 flex-col gap-6 desk:hidden">
        <PinnedBar className={AGENDA_BAR}>
          <div className="optouch:mx-auto optouch:max-w-[56rem] optouch:px-8">
            <AgendaToolbar
              compact
              view={view}
              selected={selected}
              today={today}
              kind={kind}
              onNavigate={navigate}
              onKindChange={onKindChange}
            />
          </div>
        </PinnedBar>
        <MobileAgenda
          selected={selected}
          today={today}
          byDate={byDate}
          calendarByDate={allByDate}
          rooms={rooms}
          canAssignRooms={canAssignRooms}
          canDeleteBookings={isAdmin}
          kind={kind}
          meal={meal}
          onMealChange={onMealChange}
          roomsView={roomsView}
          onNavigate={(iso) => navigate(iso, view)}
          nextEvent={nextEvent}
          onOpenNextEvent={(iso) => navigate(iso, view)}
        />
      </div>

      {/* Desktop: barra sticky in cima, come le statistiche; sotto legenda e vista. */}
      <div className="hidden desk:-mt-4 desk:flex desk:min-w-0 desk:flex-col desk:gap-6">
        <PinnedBar className={AGENDA_BAR}>
          <AgendaToolbar
            view={view}
            selected={selected}
            today={today}
            kind={kind}
            onNavigate={navigate}
            onKindChange={onKindChange}
          />
        </PinnedBar>

        <div className="flex min-w-0 flex-col gap-5">
          {/* Legenda degli stati solo in settimana e giorno: nel mese le celle mostrano solo i coperti.
              Nel giorno la stessa riga ospita il filtro pasto a destra. */}
          {view === "day" && (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <StatusLegend className="min-w-0" />
              <AgendaMealSwitch value={meal} onChange={onMealChange} />
            </div>
          )}
          {view === "week" && <StatusLegend />}

          {view === "month" && (
            <MonthView
              monthDate={toDate(selected)}
              days={monthGridDates(selected)}
              today={today}
              byDate={byDate}
              isAdmin={isAdmin}
              onOpenDay={(iso) => navigate(iso, "day")}
            />
          )}
          {view === "week" && <WeekView days={weekDates(selected)} today={today} byDate={byDate} />}
          {view === "day" && (
            <DayView
              items={byDate.get(selected) ?? []}
              rooms={rooms}
              canAssignRooms={canAssignRooms}
              canDeleteBookings={isAdmin}
              roomsView={roomsView}
              selected={selected}
              kind={kind}
              meal={meal}
              nextEvent={nextEvent}
              onOpenNextEvent={(iso) => navigate(iso, "day")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
