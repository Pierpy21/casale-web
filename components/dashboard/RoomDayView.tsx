import { addDays } from "date-fns";
import Link from "next/link";
import { capitalize, formatIt, toDate, toISO } from "@/components/agenda/agenda-utils";
import { bookingTitle, clientFullName, formatCovers, totalCovers } from "@/components/bookings/format";
import { MenuBadge } from "@/components/menu/MenuBadge";
import { useMenuColor } from "@/components/menu/MenuColorsProvider";
import { Badge, EmptyState, StatusDot } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { STATUS_LABELS, type BookingListItem, type Room } from "@/lib/types";

export interface RoomDayViewProps {
  rooms: Room[];
  /** I 7 giorni (YYYY-MM-DD) della settimana mostrata. */
  days: string[];
  /** Giorno selezionato (YYYY-MM-DD), appartenente a `days`. */
  selectedDay: string;
  todayIso: string;
  bookings: BookingListItem[];
  /** Selezione di un giorno (stato locale, nessuna navigazione). */
  onSelectDay: (iso: string) => void;
}

/** Etichetta sopra il giorno: "Oggi", "Domani" oppure "Giorno selezionato". */
function dayEyebrow(selectedDay: string, todayIso: string): string {
  if (selectedDay === todayIso) return "Oggi";
  const tomorrow = toISO(addDays(toDate(todayIso), 1));
  if (selectedDay === tomorrow) return "Domani";
  return "Giorno selezionato";
}

/** Vista mobile delle sale: selettore dei giorni scrollabile e, per il giorno scelto, l'elenco delle sale. */
export function RoomDayView({ rooms, days, selectedDay, todayIso, bookings, onSelectDay }: RoomDayViewProps) {
  const dayBookings = bookings.filter((b) => b.event_date === selectedDay);
  const byRoom = new Map<string, BookingListItem>();
  for (const booking of dayBookings) {
    if (booking.room_id && !byRoom.has(booking.room_id)) byRoom.set(booking.room_id, booking);
  }
  const unassigned = dayBookings.filter((b) => !b.room_id);
  const occupiedCount = rooms.filter((room) => byRoom.has(room.id)).length;
  const selectedDate = toDate(selectedDay);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Griglia a 7 colonne che sta sempre nello schermo: su iOS Safari una striscia scorrevole fa scorrere tutta la pagina. */}
      <div className="min-w-0">
        <ul className="grid grid-cols-7 gap-1 sm:gap-2" aria-label="Giorni della settimana">
          {days.map((iso) => {
            const date = toDate(iso);
            const active = iso === selectedDay;
            const count = bookings.filter((b) => b.event_date === iso).length;
            return (
              <li key={iso} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectDay(iso)}
                  className={cn(
                    "flex w-full min-w-0 flex-col items-center gap-0.5 rounded-btn border px-0.5 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-petrol focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                    active ? "border-petrol bg-petrol text-paper" : "border-sand bg-paper text-ink hover:bg-cream",
                  )}
                >
                  <span className="max-w-full truncate text-[10px] font-medium uppercase tracking-[0.06em] opacity-80 sm:text-[11px] sm:tracking-[0.12em]">
                    {formatIt(date, "EEE")}
                  </span>
                  <span className="font-serif text-xl leading-none tabular-nums">{formatIt(date, "d")}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 size-1.5 rounded-full",
                      count === 0 ? "bg-transparent" : active ? "bg-paper" : "bg-bronze",
                    )}
                  />
                  <span className="sr-only">
                    {iso === todayIso ? "oggi, " : ""}
                    {count === 0 ? "nessun evento" : `${count} ${count === 1 ? "evento" : "eventi"}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1 border-b border-sand pb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
          {dayEyebrow(selectedDay, todayIso)}
        </p>
        <h3 className="text-xl">{capitalize(formatIt(selectedDate, "EEEE d MMMM"))}</h3>
        <p className="text-[13px] text-slate-dark">
          {rooms.length === 0 ? "Nessuna sala attiva" : `${occupiedCount} su ${rooms.length} sale occupate`}
        </p>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          title="Nessuna sala attiva"
          description="Configura le sale dal catalogo per vedere l'occupazione."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => {
            const booking = byRoom.get(room.id);
            return (
              <li key={room.id}>
                <article className="overflow-hidden rounded-btn border border-sand bg-paper shadow-sm shadow-ink/5">
                  <header className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <h4 className="font-serif text-lg leading-tight break-words">{room.name}</h4>
                      <p className="text-[12px] text-slate-dark">Capienza {room.capacity}</p>
                    </div>
                    <Badge tone={booking ? "petrol" : "neutral"} className="shrink-0">
                      {booking ? "Occupata" : "Libera"}
                    </Badge>
                  </header>

                  {booking ? (
                    <BookingBlock booking={booking} capacity={room.capacity} />
                  ) : (
                    <p className="border-t border-dashed border-sand px-4 py-3 text-[13px] text-slate-dark">
                      Nessun evento in questa sala.
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {unassigned.length > 0 && (
        <section aria-labelledby="senza-sala" className="flex flex-col gap-3">
          <h4 id="senza-sala" className="text-[12px] font-medium uppercase tracking-[0.12em] text-bronze">
            Senza sala assegnata
          </h4>
          <ul className="flex flex-col gap-3">
            {unassigned.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/admin/prenotazioni/${booking.id}`}
                  aria-label={`${booking.menu?.name ?? "Menù da definire"}, ${bookingTitle(booking)}, stato ${STATUS_LABELS[booking.status]}`}
                  className="flex flex-col gap-1.5 rounded-btn border border-dashed border-slate/50 bg-paper px-4 py-3 hover:bg-cream"
                >
                  <span className="flex items-start gap-2">
                    {booking.kind !== "normale" && <StatusDot status={booking.status} size="sm" className="mt-2" />}
                    <MenuBadge
                      menuId={booking.menu?.id ?? null}
                      name={booking.menu?.name ?? "Menù da definire"}
                      size="md"
                    />
                  </span>
                  <span className="break-words text-[13px] text-slate-dark">
                    {bookingTitle(booking)} · {formatCovers(booking)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingBlock({ booking, capacity }: { booking: BookingListItem; capacity: number }) {
  const covers = totalCovers(booking);
  const menuName = booking.menu?.name ?? null;
  const title = bookingTitle(booking);
  // Il blocco prende il colore del menù (stesso colore di card e calendario).
  const color = useMenuColor(booking.menu?.id ?? null);
  return (
    <Link
      href={`/admin/prenotazioni/${booking.id}`}
      aria-label={`${menuName ?? "Menù da definire"}, ${title}, ${covers} coperti su capienza ${capacity}, stato ${STATUS_LABELS[booking.status]}`}
      style={{ backgroundColor: color.solid, color: color.onSolid }}
      className="flex flex-col gap-2 px-4 py-4 transition-[filter] duration-200 hover:brightness-95"
    >
      <span className="flex items-start gap-2.5">
        {booking.kind !== "normale" && <StatusDot status={booking.status} onDark className="mt-2" />}
        {menuName ? (
          <span className="min-w-0 font-serif text-xl leading-tight break-words">{menuName}</span>
        ) : (
          <span className="min-w-0 font-serif text-xl italic leading-tight">Menù da definire</span>
        )}
      </span>
      <span className="text-[13px] font-semibold tabular-nums">
        {covers}/{capacity} coperti · {formatCovers(booking)}
      </span>
      <span className="break-words text-[13px]">
        {clientFullName(booking)}
        {booking.event_name ? ` · ${booking.event_name}` : ""}
      </span>
    </Link>
  );
}
