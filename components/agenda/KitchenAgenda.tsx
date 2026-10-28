"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingCard } from "@/components/bookings/BookingCard";
import { cn } from "@/components/ui/cn";
import type { BookingListItem, BookingNote } from "@/lib/types";
import { AgendaKindSwitch } from "./AgendaKindSwitch";
import {
  agendaHref,
  capitalize,
  dayCountLabel,
  filterBookings,
  formatIt,
  groupByDate,
  isRangeInside,
  monthGridRange,
  toDate,
  type AgendaKindFilter,
  type IsoRange,
} from "./agenda-utils";
import { MenuChips, summarizeDay } from "./DaySummary";
import { MobileCalendar } from "./MobileCalendar";

export interface KitchenAgendaProps {
  /** Giorno selezionato all'apertura (YYYY-MM-DD). */
  initialDate: string;
  /** Filtro per tipo all'apertura (query `tipo`). */
  initialKind: AgendaKindFilter;
  today: string;
  /** Griglia mensile caricata dal server: navigare dentro questo intervallo non richiede rete. */
  loadedRange: IsoRange;
  /** Prenotazioni della griglia mensile (senza annullate). */
  bookings: BookingListItem[];
  /** Note cucina delle prenotazioni caricate. */
  notes: BookingNote[];
  canAddNote: boolean;
  currentUserId: string;
}

const NO_NOTES: BookingNote[] = [];

function groupNotes(notes: BookingNote[]): Map<string, BookingNote[]> {
  const map = new Map<string, BookingNote[]>();
  for (const note of notes) {
    const bucket = map.get(note.booking_id);
    if (bucket) bucket.push(note);
    else map.set(note.booking_id, [note]);
  }
  return map;
}

/**
 * Agenda della cucina: calendario in alto (con i giorni), filtro per tipo, schede uguali a quelle di sala e admin
 * (variante cucina di BookingCard). Sola lettura, tranne le note cucina.
 */
export function KitchenAgenda({
  initialDate,
  initialKind,
  today,
  loadedRange,
  bookings,
  notes,
  canAddNote,
  currentUserId,
}: KitchenAgendaProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(initialDate);
  const [kind, setKind] = useState<AgendaKindFilter>(initialKind);
  // Il calendario conta solo gli eventi: riceve tutti i banchetti.
  const allByDate = useMemo(() => groupByDate(bookings), [bookings]);
  const notesByBooking = useMemo(() => groupNotes(notes), [notes]);

  const navigate = useCallback(
    (target: string, nextKind: AgendaKindFilter = kind) => {
      const href = agendaHref({ date: target, view: "day", kind: nextKind });
      if (isRangeInside(monthGridRange(target), loadedRange)) {
        setSelected(target);
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

  const dayItems = [...(allByDate.get(selected) ?? [])].sort((a, b) =>
    (a.event_time ?? "").localeCompare(b.event_time ?? ""),
  );
  const items = filterBookings(dayItems, kind);
  const events = items.filter((b) => b.kind === "evento");
  const others = items.filter((b) => b.kind !== "evento");
  const summary = summarizeDay(items);
  const headline = capitalize(formatIt(toDate(selected), "EEEE d MMMM"));

  const subline = dayCountLabel(items);

  const kitchenCard = (booking: BookingListItem) => (
    <li key={booking.id} className="min-w-0">
      <BookingCard
        booking={booking}
        variant="full"
        kitchen={{
          notes: notesByBooking.get(booking.id) ?? NO_NOTES,
          canAddNote,
          currentUserId,
        }}
      />
    </li>
  );

  return (
    <div
      aria-busy={isPending}
      className={cn("min-w-0 transition-opacity duration-200", isPending && "pointer-events-none opacity-60")}
    >
      <div className="flex min-w-0 flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:items-start xl:gap-10">
        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-6">
          <MobileCalendar selected={selected} today={today} byDate={allByDate} onNavigate={(iso) => navigate(iso)} />
          <AgendaKindSwitch value={kind} onChange={(next) => navigate(selected, next)} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex min-w-0 flex-col gap-4 border-b border-sand pb-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              {selected === today && (
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-petrol">Oggi</p>
              )}
              <h1 className="break-words text-3xl leading-tight sm:text-4xl">{headline}</h1>
              <p className="text-[15px] text-slate-dark">{subline}</p>
            </div>
          </header>

          <MenuChips menus={summary.menus} size="lg" />

          {items.length === 0 ? (
            <p className="rounded-[2px] border border-dashed border-sand px-6 py-10 text-center text-[15px] text-slate-dark">
              {kind === "tutti" ? "Nessuna prenotazione in questa giornata." : "Nessun elemento di questo tipo in questa giornata."}
            </p>
          ) : (
            <>
              {events.length > 0 && (
                <section aria-label="Eventi del giorno" className="flex min-w-0 flex-col gap-4">
                  <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                    Eventi · {events.length}
                  </h2>
                  <ul className="flex min-w-0 flex-col gap-5">{events.map(kitchenCard)}</ul>
                </section>
              )}

              {others.length > 0 && (
                <section aria-label="Prenotazioni" className="flex min-w-0 flex-col gap-4">
                  <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
                    Prenotazioni · {others.length}
                  </h2>
                  <ul className="flex min-w-0 flex-col gap-5">{others.map(kitchenCard)}</ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
