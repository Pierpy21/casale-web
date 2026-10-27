import { BookingCard } from "@/components/bookings/BookingCard";
import { EmptyState, StatusLegend } from "@/components/ui";
import type { BookingListItem, Room } from "@/lib/types";
import { DaySummary } from "./DaySummary";
import { MobileCalendar } from "./MobileCalendar";
import { ReservationList } from "./ReservationList";
import { SwipeDay } from "./SwipeDay";
import { capitalize, formatIt, shiftPeriod, toDate } from "./agenda-utils";

export interface MobileAgendaProps {
  selected: string;
  today: string;
  byDate: Map<string, BookingListItem[]>;
  isAdmin: boolean;
  rooms: Room[];
  /** Permesso di assegnare la sala alle prenotazioni normali. */
  canAssignRooms: boolean;
  onNavigate: (iso: string) => void;
}

/** Agenda mobile (< lg): calendario mensile in alto, lista del giorno sotto. La creazione è nel pulsante + globale (layout admin). */
export function MobileAgenda({ selected, today, byDate, isAdmin, rooms, canAssignRooms, onNavigate }: MobileAgendaProps) {
  const selectedDate = toDate(selected);
  const items = byDate.get(selected) ?? [];
  const cards = items.filter((b) => b.kind !== "normale");
  const reservations = items.filter((b) => b.kind === "normale");
  const dayLabel = capitalize(formatIt(selectedDate, "EEEE d MMMM"));

  return (
    <div className="flex flex-col gap-6">
      <StatusLegend />
      <MobileCalendar selected={selected} today={today} byDate={byDate} onNavigate={onNavigate} />

      <section aria-labelledby="giorno-titolo" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 border-b border-sand pb-3">
          <div className="flex min-w-0 flex-col gap-1">
            {selected === today && (
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-petrol">Oggi</p>
            )}
            <h2 id="giorno-titolo" className="text-2xl">
              {dayLabel}
            </h2>
          </div>
          <span className="shrink-0 text-[13px] text-slate-dark tabular-nums">
            {items.length === 0 ? "Nessun evento" : `${items.length} ${items.length === 1 ? "banchetto" : "banchetti"}`}
          </span>
        </div>

        <DaySummary bookings={items} />

        <SwipeDay
          onPrev={() => onNavigate(shiftPeriod(selected, "day", -1))}
          onNext={() => onNavigate(shiftPeriod(selected, "day", 1))}
        >
          {items.length === 0 ? (
            <EmptyState
              title="Nessun banchetto"
              description={
                isAdmin
                  ? "Questa giornata è libera. Puoi aggiungere una nuova prenotazione."
                  : "Questa giornata è libera."
              }
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              {cards.map((booking) => (
                <BookingCard key={booking.id} booking={booking} variant="full" dishes="collapsible" wholeCardLink />
              ))}
              {reservations.length > 0 && <ReservationList bookings={reservations} rooms={rooms} canAssign={canAssignRooms} />}
            </div>
          )}
        </SwipeDay>
      </section>

    </div>
  );
}
