import { BookingCard } from "@/components/bookings/BookingCard";
import { StatusLegend } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { DaySummary } from "./DaySummary";
import { MobileCalendar } from "./MobileCalendar";
import { EmptyDay } from "./NextEventHint";
import { ReservationList } from "./ReservationList";
import { RoomDayBoard } from "./RoomDayBoard";
import { SwipeDay } from "./SwipeDay";
import { AgendaMealSwitch } from "./AgendaMealSwitch";
import { capitalize, dayCountLabel, filterByMeal, formatIt, shiftPeriod, toDate, type AgendaKindFilter, type AgendaMealFilter } from "./agenda-utils";

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
  /** Permesso di eliminare le prenotazioni normali (solo admin). */
  canDeleteBookings: boolean;
  /** Filtro per tipo corrente (la scelta sta nella barra sopra, in AgendaBoard). */
  kind: AgendaKindFilter;
  /** Filtro pasto del giorno (Tutti / Pranzo / Cena), scelto sulla riga della legenda. */
  meal: AgendaMealFilter;
  onMealChange: (meal: AgendaMealFilter) => void;
  /** Vista per sale (ruolo sala): il giorno mostra le sale invece della lista. */
  roomsView?: boolean;
  onNavigate: (iso: string) => void;
  /** Prossimo evento dopo il giorno selezionato (null se non ce n'è). */
  nextEvent?: NextEventBrief | null;
  onOpenNextEvent: (iso: string) => void;
}

/** Agenda mobile (< desk): calendario mensile in alto, lista del giorno sotto. Periodo e filtro tipo stanno nella barra fissa (AgendaBoard). */
export function MobileAgenda({
  selected,
  today,
  byDate,
  calendarByDate,
  rooms,
  canAssignRooms,
  canDeleteBookings,
  kind,
  meal,
  onMealChange,
  roomsView = false,
  onNavigate,
  nextEvent = null,
  onOpenNextEvent,
}: MobileAgendaProps) {
  const selectedDate = toDate(selected);
  const dayItems = byDate.get(selected) ?? [];
  const items = filterByMeal(dayItems, meal);
  const cards = items.filter((b) => b.kind !== "normale");
  const reservations = items.filter((b) => b.kind === "normale");
  const dayLabel = capitalize(formatIt(selectedDate, "EEEE d MMMM"));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <MobileCalendar selected={selected} today={today} byDate={calendarByDate} onNavigate={onNavigate} showHeader={false} />

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

        {/* Legenda degli stati e filtro pasto sopra le schede del giorno (non sopra il calendario del mese). */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <StatusLegend className="min-w-0" />
          <AgendaMealSwitch value={meal} onChange={onMealChange} />
        </div>

        <SwipeDay
          onPrev={() => onNavigate(shiftPeriod(selected, "day", -1))}
          onNext={() => onNavigate(shiftPeriod(selected, "day", 1))}
        >
          {items.length === 0 ? (
            <EmptyDay kind={kind} meal={meal} hasBookings={dayItems.length > 0} nextEvent={nextEvent} selected={selected} onOpen={onOpenNextEvent} />
          ) : roomsView ? (
            <RoomDayBoard items={items} rooms={rooms} selected={selected} canAssignRooms={canAssignRooms} canDeleteBookings={canDeleteBookings} />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              {cards.map((booking) => (
                <BookingCard key={booking.id} booking={booking} variant="full" dishes="collapsible" wholeCardLink />
              ))}
              {reservations.length > 0 && <ReservationList bookings={reservations} rooms={rooms} date={selected} canAssign={canAssignRooms} canDeleteBookings={canDeleteBookings} />}
            </div>
          )}
        </SwipeDay>
      </section>
    </div>
  );
}
