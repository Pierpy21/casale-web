import type { Metadata } from "next";
import { toISO, todayISO } from "@/components/agenda/agenda-utils";
import { BookingCard } from "@/components/bookings/BookingCard";
import { formatChangeTimestamp } from "@/components/bookings/change-labels";
import { WeekOccupancy } from "@/components/dashboard/WeekOccupancy";
import { resolveWeekStart, weekRange } from "@/components/dashboard/week";
import { Card, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  getBookingsInRange,
  getDashboardStats,
  getDeletionLog,
  getUpcomingBookings,
} from "@/lib/data/bookings";
import { getRooms } from "@/lib/data/catalog";

export const metadata: Metadata = {
  title: "Dashboard · Casale del Notaio",
};

type SearchParams = Promise<{ week?: string; day?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const params = await searchParams;
  const today = todayISO();
  const currentWeekStart = resolveWeekStart(undefined, today);
  const weekStart = resolveWeekStart(params.week, today);
  const week = weekRange(weekStart);
  const weekDays = week.days;
  const selectedDay =
    params.day && weekDays.includes(params.day)
      ? params.day
      : weekDays.includes(today)
        ? today
        : weekDays[0];

  const [stats, upcoming, rooms, weekBookings, deletions] = await Promise.all([
    getDashboardStats(),
    getUpcomingBookings(8, { kinds: ["evento"] }),
    getRooms(),
    getBookingsInRange(week.startIso, week.endIso),
    getDeletionLog(5),
  ]);

  const activeRooms = rooms.filter((room) => room.active);

  // Ordine: intestazione con il giorno → striscia giorni (telefono) → indicatori → prenotazioni del giorno → occupazione sale → prossimi eventi → eliminazioni.
  // Eventi e coperti del giorno li calcola WeekOccupancy dal giorno selezionato; qui solo i valori del mese e i link.
  return (
    <div className="-mt-2 flex min-w-0 flex-col gap-6 lg:-mt-4">
      <WeekOccupancy
        key={`${week.startIso}|${selectedDay}|${weekBookings.map((b) => `${b.id}:${b.updated_at}`).join(",")}`}
        rooms={activeRooms}
        todayIso={today}
        currentWeekIso={toISO(currentWeekStart)}
        initialWeekStart={week.startIso}
        initialDays={weekDays}
        initialBookings={weekBookings}
        initialSelectedDay={selectedDay}
        indicators={{
          eventsThisMonth: stats.eventsThisMonth,
          pendingOptions: stats.pendingOptions,
          eventsThisMonthHref: "/admin/statistiche?periodo=mese&tipo=evento",
          pendingOptionsHref: "/admin/da-confermare",
        }}
      >
        <section aria-labelledby="prossimi-eventi" className="flex min-w-0 flex-col gap-5">
          <div className="flex items-end justify-between gap-4 border-b border-sand pb-3">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">In arrivo</p>
              <h2 id="prossimi-eventi" className="text-2xl">
                Prossimi eventi
              </h2>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState
              title="Nessun evento in programma"
              description="Quando verranno create nuove prenotazioni compariranno qui."
            />
          ) : (
            <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
              {upcoming.map((booking) => (
                <li key={booking.id} className="min-w-0">
                  <BookingCard booking={booking} variant="compact" showDate className="h-full" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="eliminazioni-recenti" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1 border-b border-sand pb-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">Registro</p>
            <h2 id="eliminazioni-recenti" className="text-xl">
              Eliminazioni recenti
            </h2>
          </div>

          {deletions.length === 0 ? (
            <p className="text-[13px] text-slate-dark">Nessuna prenotazione eliminata.</p>
          ) : (
            <Card className="min-w-0 divide-y divide-sand">
              <ul>
                {deletions.map((change) => (
                  <li
                    key={change.id}
                    className="flex min-w-0 flex-col gap-0.5 px-4 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <span className="min-w-0 break-words text-ink">
                      {change.booking_label ?? change.old_value ?? "Prenotazione"}
                    </span>
                    <span className="shrink-0 text-[12px] text-slate-dark">
                      Eliminata da {change.changed_by_name} · {formatChangeTimestamp(change.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </WeekOccupancy>
    </div>
  );
}
