import Link from "next/link";
import { bookingPersonName, formatCovers, totalCovers } from "@/components/bookings/format";
import { MenuBadge } from "@/components/menu/MenuBadge";
import { useMenuColor } from "@/components/menu/MenuColorsProvider";
import { Badge, EmptyState, StatusDot } from "@/components/ui";
import { STATUS_LABELS, type BookingListItem, type Room } from "@/lib/types";

export interface RoomDayViewProps {
  rooms: Room[];
  /** Giorno selezionato (YYYY-MM-DD). Il titolo del giorno è in SelectedDayHeading, sopra questa vista. */
  selectedDay: string;
  /** Solo eventi della settimana. */
  bookings: BookingListItem[];
}

/** Vista per giorno delle sale (tablet verticale e telefono): una card per sala con l'evento del giorno selezionato. */
export function RoomDayView({ rooms, selectedDay, bookings }: RoomDayViewProps) {
  const dayBookings = bookings.filter((b) => b.event_date === selectedDay);
  const byRoom = new Map<string, BookingListItem>();
  for (const booking of dayBookings) {
    if (booking.room_id && !byRoom.has(booking.room_id)) byRoom.set(booking.room_id, booking);
  }
  const unassigned = dayBookings.filter((b) => !b.room_id);

  return (
    <div className="flex min-w-0 flex-col gap-5">
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
                  aria-label={`${booking.menu?.name ?? "Menù da definire"}, ${bookingPersonName(booking)}, stato ${STATUS_LABELS[booking.status]}`}
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
                    {bookingPersonName(booking)} · {formatCovers(booking)}
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
  const title = bookingPersonName(booking);
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
        {bookingPersonName(booking)}
      </span>
    </Link>
  );
}
