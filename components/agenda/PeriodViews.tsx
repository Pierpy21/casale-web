import { format } from "date-fns";
import { BookingCard } from "@/components/bookings/BookingCard";
import { EmptyState, cn } from "@/components/ui";
import type { BookingListItem } from "@/lib/types";
import { formatIt, toISO } from "./agenda-utils";
import { DaySummary } from "./DaySummary";

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
              aria-label={`${formatIt(day, "EEEE d MMMM")}, ${items.length} banchetti`}
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

/** Vista giorno desktop: card ricche in griglia a due colonne. */
export function DayView({ items }: { items: BookingListItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nessun banchetto"
        description="Non ci sono eventi in questa giornata. Dalla vista mese puoi scegliere un altro giorno."
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DaySummary bookings={items} />
      <section aria-label="Banchetti della giornata" className="grid gap-5 xl:grid-cols-2">
        {items.map((booking) => (
          <BookingCard key={booking.id} booking={booking} variant="full" dishes="inline" />
        ))}
      </section>
    </div>
  );
}
