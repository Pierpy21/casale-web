import { BookingCard } from "@/components/bookings/BookingCard";
import { StatusLegend } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { AgendaKindSwitch } from "./AgendaKindSwitch";
import { DaySummary } from "./DaySummary";
import { MobileCalendar } from "./MobileCalendar";
import { EmptyDay } from "./NextEventHint";
import { ReservationList } from "./ReservationList";
import { SwipeDay } from "./SwipeDay";
import { capitalize, dayCountLabel, formatIt, shiftPeriod, toDate, type AgendaKindFilter } from "./agenda-utils";

export interface MobileAgendaProps {
  selected: string;
  today: string;
  /** Banchetti del filtro corrente, per giorno (liste e riepilogo). */
  byDate: Map<string, BookingListItem[]>;
  /** Tutti i banchetti per giorno (il calendario mostra i pallini solo degli eventi). */
  calendarByDate: Map<string, BookingListItem[]>;
  rooms: Room[];
  /** Permesso di assegnare la sala alle prenotazioni normali. */
  canAssignRooms: boolean;
  kind: AgendaKindFilter;
  onKindChange: (kind: AgendaKindFilter) => void;
  onNavigate: (iso: string) => void;
  /** Prossimo evento dopo il giorno selezionato (null se non ce n'è). */
  nextEvent?: NextEventBrief | null;
  onOpenNextEvent: (iso: string) => void;
}

/** Agenda mobile (< lg): filtro per tipo, calendario mensile in alto, lista del giorno sotto. La creazione è nel pulsante + globale (layout admin). */
export function MobileAgenda({
  selected,
  today,
  byDate,
  calendarByDate,
  rooms,
  canAssignRooms,
  kind,
  onKindChange,
  onNavigate,
  nextEvent = null,
  onOpenNextEvent,
}: MobileAgendaProps) {
  const selectedDate = toDate(selected);
  const items = byDate.get(selected) ?? [];
  const cards = items.filter((b) => b.kind !== "normale");
  const reservations = items.filter((b) => b.kind === "normale");
  const dayLabel = capitalize(formatIt(selectedDate, "EEEE d MMMM"));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StatusLegend />
      <MobileCalendar selected={selected} today={today} byDate={calendarByDate} onNavigate={onNavigate} />
      <AgendaKindSwitch value={kind} onChange={onKindChange} />

      <section aria-labelledby="giorno-titolo" className="flex flex-col gap-4">
        <div className="flex min-w-0 items-end justify-between gap-3 border-b border-sand pb-3">
          <div className="flex min-w-0 flex-col gap-1">
            {selected === today && (
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-petrol">Oggi</p>
            )}
            <h2 id="giorno-titolo" className="break-words text-2xl">
              {dayLabel}
            </h2>
          </div>
          <span className="min-w-0 max-w-[55%] text-right text-[13px] leading-snug text-slate-dark tabular-nums break-words">
            {dayCountLabel(items)}
          </span>
        </div>

        <DaySummary bookings={items} />

        <SwipeDay
          onPrev={() => onNavigate(shiftPeriod(selected, "day", -1))}
          onNext={() => onNavigate(shiftPeriod(selected, "day", 1))}
        >
          {items.length === 0 ? (
            <EmptyDay kind={kind} nextEvent={nextEvent} selected={selected} onOpen={onOpenNextEvent} />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              {cards.map((booking) => (
                <BookingCard key={booking.id} booking={booking} variant="full" dishes="collapsible" wholeCardLink />
              ))}
              {reservations.length > 0 && <ReservationList bookings={reservations} rooms={rooms} date={selected} canAssign={canAssignRooms} />}
            </div>
          )}
        </SwipeDay>
      </section>
    </div>
  );
}
