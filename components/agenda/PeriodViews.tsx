import { format } from "date-fns";
import { BookingCard } from "@/components/bookings/BookingCard";
import { cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { dayCountLabel, filterByMeal, formatIt, toISO, type AgendaKindFilter, type AgendaMealFilter } from "./agenda-utils";
import { DaySummary } from "./DaySummary";
import { EmptyDay } from "./NextEventHint";
import { ReservationList } from "./ReservationList";
import { RoomDayBoard } from "./RoomDayBoard";

/** Vista settimana desktop: 7 colonne con card ricche (menù per portata, allergie). */
export function WeekView({
  days,
  today,
  byDate,
}: {
  days: Date[];
  today: string;
  byDate: Map<string, BookingListItem[]>;
}) {
  return (
    <section aria-label="Calendario settimanale" className="pb-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 deskxl:grid-cols-4 desk2xl:grid-cols-7">
        {days.map((day) => {
          const iso = toISO(day);
          const items = byDate.get(iso) ?? [];
          const isToday = iso === today;
          return (
            <section
              key={iso}
              aria-label={`${formatIt(day, "EEEE d MMMM")}, ${dayCountLabel(items)}`}
              className={cn(
                "flex min-h-[20rem] flex-col gap-3 rounded-[2px] bg-cream/40 p-2.5",
                isToday && "ring-1 ring-petrol/60",
              )}
            >
              <header className="flex items-baseline justify-between border-b border-sand pb-2">
                <h2 className={cn("text-[12px] font-medium uppercase tracking-[0.14em]", day.getDay() === 0 ? "text-danger" : "text-bronze")}>
                  {formatIt(day, "EEE")}
                </h2>
                <span
                  className={cn(
                    "font-serif text-2xl tabular-nums",
                    isToday ? "text-petrol" : "text-ink",
                  )}
                >
                  {format(day, "d")}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="px-1 text-[13px] text-slate">Nessun evento</p>
              ) : (
                items.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} variant="full" dishes="inline" wholeCardLink />
                ))
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Vista giorno desktop: eventi e appuntamenti come card ricche, in un unico elenco verticale;
 * le prenotazioni normali sotto, come lista compatta con la sala assegnabile.
 */
export function DayView({
  items: dayItems,
  rooms,
  canAssignRooms,
  canDeleteBookings,
  roomsView = false,
  selected,
  kind,
  meal = "tutti",
  nextEvent = null,
  onOpenNextEvent,
}: {
  /** Prenotazioni del giorno già filtrate per tipo; il filtro pasto si applica qui. */
  items: BookingListItem[];
  rooms: Room[];
  canAssignRooms: boolean;
  /** Permesso di eliminare le prenotazioni normali (solo admin). */
  canDeleteBookings: boolean;
  /** Vista per sale (ruolo sala): eventi e prenotazioni diventano la griglia delle sale. */
  roomsView?: boolean;
  /** Giorno selezionato (ISO): riferimento per il riquadro "Prossimo evento". */
  selected: string;
  nextEvent?: NextEventBrief | null;
  /** Filtro tipo attivo: con "prenotazioni" il giorno vuoto invita a cambiarlo. */
  kind: AgendaKindFilter;
  /** Filtro pasto attivo (Tutti / Pranzo / Cena). */
  meal?: AgendaMealFilter;
  onOpenNextEvent: (iso: string) => void;
}) {
  const items = filterByMeal(dayItems, meal);
  if (items.length === 0) {
    return (
      <EmptyDay
        kind={kind}
        meal={meal}
        hasBookings={dayItems.length > 0}
        nextEvent={nextEvent}
        selected={selected}
        onOpen={onOpenNextEvent}
      />
    );
  }
  if (roomsView) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <DaySummary bookings={items} />
        <RoomDayBoard items={items} rooms={rooms} selected={selected} canAssignRooms={canAssignRooms} canDeleteBookings={canDeleteBookings} />
      </div>
    );
  }
  const cards = items.filter((b) => b.kind !== "normale");
  const reservations = items.filter((b) => b.kind === "normale");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DaySummary bookings={items} />
      {cards.length > 0 && (
        <section aria-label="Eventi della giornata" className="flex min-w-0 flex-col gap-4">
          {cards.map((booking) => (
            <BookingCard key={booking.id} booking={booking} variant="full" dishes="inline" wholeCardLink />
          ))}
        </section>
      )}
      {reservations.length > 0 && <ReservationList bookings={reservations} rooms={rooms} date={selected} canAssign={canAssignRooms} canDeleteBookings={canDeleteBookings} />}
    </div>
  );
}
