"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusLegend, cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { AgendaKindSwitch } from "./AgendaKindSwitch";
import { AgendaToolbar } from "./AgendaToolbar";
import { MobileAgenda } from "./MobileAgenda";
import { MonthView } from "./MonthView";
import { DayView, WeekView } from "./PeriodViews";
import { nextEventFrom } from "./NextEventHint";
import {
  agendaHref,
  filterBookings,
  groupByDate,
  isRangeInside,
  monthGridDates,
  monthGridRange,
  periodTitle,
  toDate,
  weekDates,
  type AgendaKindFilter,
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
  /** Griglia mensile caricata dal server: navigare dentro questo intervallo non richiede rete. */
  loadedRange: IsoRange;
  today: string;
  isAdmin: boolean;
  /** Sale per l'assegnazione nelle prenotazioni normali della giornata. */
  rooms: Room[];
  /** `canAssignRoom(profile, "normale")`: senza, le sale sono in sola lettura. */
  canAssignRooms: boolean;
  /** Primo evento oltre la griglia caricata (null se non c'è). */
  nextEventAfterRange: NextEventBrief | null;
}

/**
 * Stato dell'agenda lato client. Selezione del giorno, vista e filtro per tipo cambiano in locale (istantanei);
 * l'URL si aggiorna con replaceState senza refetch. Solo quando si esce dalla griglia caricata
 * si passa dal server, dentro una transizione (la UI precedente resta visibile, con leggero fade).
 */
export function AgendaBoard({
  bookings,
  initialDate,
  initialView,
  initialKind,
  loadedRange,
  today,
  isAdmin,
  rooms,
  canAssignRooms,
  nextEventAfterRange,
}: AgendaBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(initialDate);
  const [view, setView] = useState<AgendaView>(initialView);
  const [kind, setKind] = useState<AgendaKindFilter>(initialKind);

  // Pallini del calendario mensile mobile (allByDate): contano solo gli eventi.
  // Vista mese desktop, settimana, giorno e liste (byDate): pill filtrate dal filtro tipo.
  const byDate = useMemo(() => groupByDate(filterBookings(bookings, kind)), [bookings, kind]);
  const allByDate = useMemo(() => groupByDate(bookings), [bookings]);

  // Prossimo evento dopo il giorno selezionato (riquadro del giorno vuoto, per tutti i ruoli).
  const nextEvent = useMemo(() => nextEventFrom(bookings, selected, nextEventAfterRange), [bookings, selected, nextEventAfterRange]);

  const navigate = useCallback(
    (target: string, nextView: AgendaView, nextKind: AgendaKindFilter = kind) => {
      const href = agendaHref({ date: target, view: nextView, kind: nextKind });
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
    [kind, loadedRange, router],
  );

  const title = periodTitle(view, selected);

  return (
    <div
      aria-busy={isPending}
      className={cn("transition-opacity duration-200", isPending && "pointer-events-none opacity-60")}
    >
      <div className="hidden lg:block">
        <AgendaToolbar
          view={view}
          selected={selected}
          today={today}
          title={title}
          isAdmin={isAdmin}
          kind={kind}
          onNavigate={navigate}
        />
        <StatusLegend className="mb-5" />
        {/* Vista giorno: non c'è griglia, il filtro resta sopra l'elenco. Negli altri casi sta sotto il calendario. */}
        {view === "day" && (
          <div className="mb-5 flex justify-start">
            <AgendaKindSwitch value={kind} onChange={(next) => navigate(selected, view, next)} />
          </div>
        )}

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
            selected={selected}
            kind={kind}
            nextEvent={nextEvent}
            onOpenNextEvent={(iso) => navigate(iso, "day")}
          />
        )}
        {view !== "day" && (
          <div className="mt-5 flex justify-start">
            <AgendaKindSwitch value={kind} onChange={(next) => navigate(selected, view, next)} />
          </div>
        )}
      </div>

      <div className="lg:hidden">
        <MobileAgenda
          selected={selected}
          today={today}
          byDate={byDate}
          calendarByDate={allByDate}
          rooms={rooms}
          canAssignRooms={canAssignRooms}
          kind={kind}
          onKindChange={(next) => navigate(selected, view, next)}
          onNavigate={(iso) => navigate(iso, view)}
          nextEvent={nextEvent}
          onOpenNextEvent={(iso) => navigate(iso, view)}
        />
      </div>
    </div>
  );
}
