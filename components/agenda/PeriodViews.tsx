import { format } from "date-fns";
import { BookingCard } from "@/components/bookings/BookingCard";
import { cn } from "@/components/ui";
import type { BookingListItem, NextEventBrief, Room } from "@/lib/types";
import { dayCountLabel, formatIt, toISO, type AgendaKindFilter } from "./agenda-utils";
import { DaySummary } from "./DaySummary";
import { EmptyDay } from "./NextEventHint";
import { ReservationList } from "./ReservationList";

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
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
                <h2 className="text-[12px] font-medium uppercase tracking-[0.14em] text-bronze">
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
                <p className="px-1 text-[13px] text-slate">Nessun banchetto</p>
              ) : (
                items.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} variant="full" dishes="inline" />
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
  items,
  rooms,
  canAssignRooms,
  selected,
  kind,
  nextEvent = null,
  onOpenNextEvent,
}: {
  items: BookingListItem[];
  rooms: Room[];
  canAssignRooms: boolean;
  /** Giorno selezionato (ISO): riferimento per il riquadro "Prossimo evento". */
  selected: string;
  nextEvent?: NextEventBrief | null;
  /** Filtro tipo attivo: con "prenotazioni" il giorno vuoto invita a cambiarlo. */
  kind: AgendaKindFilter;
  onOpenNextEvent: (iso: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyDay kind={kind} nextEvent={nextEvent} selected={selected} onOpen={onOpenNextEvent} />;
  }
  const cards = items.filter((b) => b.kind !== "normale");
  const reservations = items.filter((b) => b.kind === "normale");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DaySummary bookings={items} />
      {cards.length > 0 && (
        <section aria-label="Banchetti della giornata" className="flex min-w-0 flex-col gap-4">
          {cards.map((booking) => (
            <BookingCard key={booking.id} booking={booking} variant="full" dishes="inline" />
          ))}
        </section>
      )}
      {reservations.length > 0 && <ReservationList bookings={reservations} rooms={rooms} date={selected} canAssign={canAssignRooms} />}
    </div>
  );
}
