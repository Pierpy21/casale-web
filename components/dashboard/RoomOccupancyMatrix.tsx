import Link from "next/link";
import { formatIt, toDate } from "@/components/agenda/agenda-utils";
import { bookingTitle, totalCovers } from "@/components/bookings/format";
import { useMenuColor } from "@/components/menu/MenuColorsProvider";
import { EmptyState, StatusDot } from "@/components/ui";
import { STATUS_LABELS, type BookingListItem, type Room } from "@/lib/types";

export interface RoomOccupancyMatrixProps {
  rooms: Room[];
  days: string[];
  bookings: BookingListItem[];
}

/** Matrice sale x giorni della settimana. Cella piena = sala occupata (coperti / capienza), nel colore del menù. */
export function RoomOccupancyMatrix({ rooms, days, bookings }: RoomOccupancyMatrixProps) {
  if (rooms.length === 0) {
    return (
      <EmptyState title="Nessuna sala attiva" description="Configura le sale dal catalogo per vedere l'occupazione." />
    );
  }

  const byCell = new Map<string, BookingListItem>();
  for (const booking of bookings) {
    if (booking.room_id) byCell.set(`${booking.room_id}|${booking.event_date}`, booking);
  }

  return (
    <div className="overflow-x-auto rounded-[2px] border border-sand bg-paper">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <caption className="sr-only">Occupazione delle sale nei giorni della settimana</caption>
        <thead>
          <tr className="border-b border-sand bg-cream/60">
            <th scope="col" className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-bronze">
              Sala
            </th>
            {days.map((iso) => (
              <th
                key={iso}
                scope="col"
                className="px-2 py-3 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-bronze"
              >
                {formatIt(toDate(iso), "EEE d")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} className="border-b border-sand last:border-b-0">
              <th scope="row" className="px-4 py-2 text-left align-middle">
                <span className="block font-medium text-ink">{room.name}</span>
                <span className="block text-[12px] text-slate-dark">cap. {room.capacity}</span>
              </th>
              {days.map((iso) => {
                const booking = byCell.get(`${room.id}|${iso}`);
                if (!booking) {
                  return (
                    <td key={iso} className="p-1.5 align-middle">
                      <div className="flex min-h-20 items-center justify-center rounded-[2px] border border-dashed border-sand">
                        <span className="sr-only">Libera</span>
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={iso} className="p-1.5 align-middle">
                    <OccupancyCell booking={booking} capacity={room.capacity} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OccupancyCell({ booking, capacity }: { booking: BookingListItem; capacity: number }) {
  const color = useMenuColor(booking.menu?.id ?? null);
  const covers = totalCovers(booking);
  const menuName = booking.menu?.name ?? "Menù da definire";
  return (
    <Link
      href={`/admin/prenotazioni/${booking.id}`}
      title={`${menuName} · ${bookingTitle(booking)}: ${covers} coperti su capienza ${capacity} · ${STATUS_LABELS[booking.status]}`}
      style={{ backgroundColor: color.solid, color: color.onSolid }}
      className="flex min-h-20 flex-col justify-center gap-1.5 rounded-[2px] px-3 py-2.5 transition-[filter] duration-200 hover:brightness-95"
    >
      <span className="flex min-w-0 items-start gap-2">
        {booking.kind !== "normale" && <StatusDot status={booking.status} size="sm" onDark className="mt-1.5" />}
        <span className="line-clamp-2 min-w-0 font-serif text-[15px] font-semibold leading-snug break-words">{menuName}</span>
      </span>
      <span className="text-[12px] font-semibold tabular-nums">
        {covers}/{capacity} coperti
      </span>
      <span className="line-clamp-1 break-words text-[12px]">{bookingTitle(booking)}</span>
    </Link>
  );
}
