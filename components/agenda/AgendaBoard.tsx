"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusLegend, cn } from "@/components/ui";
import type { BookingListItem } from "@/lib/types";
import { AgendaToolbar } from "./AgendaToolbar";
import { MobileAgenda } from "./MobileAgenda";
import { MonthView } from "./MonthView";
import { DayView, WeekView } from "./PeriodViews";
import {
  agendaHref,
  groupByDate,
  isRangeInside,
  monthGridDates,
  monthGridRange,
  periodTitle,
  toDate,
  weekDates,
  type AgendaView,
  type IsoRange,
} from "./agenda-utils";

export interface AgendaBoardProps {
  bookings: BookingListItem[];
  /** Giorno selezionato all'apertura (query `date`). */
  initialDate: string;
  initialView: AgendaView;
  /** Griglia mensile caricata dal server: navigare dentro questo intervallo non richiede rete. */
  loadedRange: IsoRange;
  today: string;
  isAdmin: boolean;
}

/**
 * Stato dell'agenda lato client. Selezione del giorno e vista cambiano in locale (istantanee);
 * l'URL si aggiorna con replaceState senza refetch. Solo quando si esce dalla griglia caricata
 * si passa dal server, dentro una transizione (la UI precedente resta visibile, con leggero fade).
 */
export function AgendaBoard({
  bookings,
  initialDate,
  initialView,
  loadedRange,
  today,
  isAdmin,
}: AgendaBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(initialDate);
  const [view, setView] = useState<AgendaView>(initialView);
  const byDate = useMemo(() => groupByDate(bookings), [bookings]);

  const navigate = useCallback(
    (target: string, nextView: AgendaView) => {
      const href = agendaHref({ date: target, view: nextView });
      if (isRangeInside(monthGridRange(target), loadedRange)) {
        setSelected(target);
        setView(nextView);
        window.history.replaceState(window.history.state, "", href);
        return;
      }
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [loadedRange, router],
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
          onNavigate={navigate}
        />
        <StatusLegend className="mb-5" />

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
        {view === "day" && <DayView items={byDate.get(selected) ?? []} />}
      </div>

      <div className="lg:hidden">
        <MobileAgenda
          selected={selected}
          today={today}
          byDate={byDate}
          isAdmin={isAdmin}
          onNavigate={(iso) => navigate(iso, view)}
        />
      </div>
    </div>
  );
}
