"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { assignBookingRoom } from "@/app/actions/bookings";
import { clientFullName, formatCovers, formatTime, totalCovers } from "@/components/bookings/format";
import { Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { BookingListItem, Room } from "@/lib/types";

/** Sopra questo numero di sale il selettore diventa una tendina: i chip andrebbero su troppe righe. */
const CHIP_LIMIT = 4;

export interface ReservationListProps {
  /** Solo prenotazioni normali del giorno. */
  bookings: BookingListItem[];
  rooms: Room[];
  /** Permesso `canAssignRoom(profile, "normale")`: senza, la sala è in sola lettura. */
  canAssign: boolean;
}

/** Assegnazione mostrata subito dopo il tap; vale solo finché la sala salvata è quella di partenza. */
interface RoomOverride {
  base: string | null;
  roomId: string | null;
}

function byTimeThenName(a: BookingListItem, b: BookingListItem): number {
  const ta = a.event_time ?? "99:99";
  const tb = b.event_time ?? "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return clientFullName(a).localeCompare(clientFullName(b), "it");
}

/**
 * Prenotazioni normali del giorno come lista compatta: ora · cliente · coperti · note, e la sala a destra.
 * Tap sulla sala = assegnazione istantanea (ottimistica, con rollback e messaggio in caso di errore).
 */
export function ReservationList({ bookings, rooms, canAssign }: ReservationListProps) {
  const [overrides, setOverrides] = useState<Record<string, RoomOverride>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inFlight = useRef(new Set<string>());

  const activeRooms = rooms.filter((room) => room.active).sort((a, b) => a.sort - b.sort);
  const sorted = [...bookings].sort(byTimeThenName);

  const roomIdOf = (booking: BookingListItem): string | null => {
    const override = overrides[booking.id];
    return override && override.base === booking.room_id ? override.roomId : booking.room_id;
  };

  const assign = (booking: BookingListItem, roomId: string | null) => {
    if (roomIdOf(booking) === roomId || inFlight.current.has(booking.id)) return;
    const id = booking.id;
    const label = clientFullName(booking);
    inFlight.current.add(id);
    setMessage(null);
    setOverrides((prev) => ({ ...prev, [id]: { base: booking.room_id, roomId } }));

    startTransition(async () => {
      const result = await assignBookingRoom(id, roomId);
      inFlight.current.delete(id);
      if (!result.ok) {
        // Rollback: torna la sala salvata prima del tap.
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setMessage(`Sala non salvata per ${label}. ${result.error}`);
      }
    });
  };

  return (
    <section aria-labelledby="prenotazioni-titolo" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-end justify-between gap-3 border-b border-sand pb-2">
        <h3 id="prenotazioni-titolo" className="text-xl">
          Prenotazioni
        </h3>
        <span className="shrink-0 text-[13px] text-slate-dark tabular-nums">
          {sorted.length} {sorted.length === 1 ? "tavolo" : "tavoli"}
        </span>
      </div>

      {message && (
        <p role="alert" className="text-[13px] text-danger">
          {message}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-sand rounded-[2px] border border-sand bg-paper">
        {sorted.map((booking) => {
          const currentId = roomIdOf(booking);
          const currentInfo = rooms.find((room) => room.id === currentId) ?? null;
          const currentName = currentInfo?.name ?? (booking.room?.id === currentId ? booking.room.name : null);
          // Sala attuale disattivata: resta visibile in sola lettura, ma non è tra le scelte proposte.
          const inactiveCurrent = currentInfo && !currentInfo.active ? currentInfo : null;
          const options = activeRooms;
          const title = clientFullName(booking);
          const notes = booking.notes?.trim();

          return (
            <li
              key={booking.id}
              className="flex min-w-0 flex-col gap-2.5 px-4 py-3 lg:grid lg:grid-cols-[4rem_minmax(0,1fr)_minmax(0,auto)] lg:items-center lg:gap-4"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{formatTime(booking.event_time) ?? "—"}</span>
                  <Link
                    href={`/admin/prenotazioni/${booking.id}`}
                    className="min-w-0 break-words font-serif text-[16px] leading-snug text-petrol hover:underline"
                  >
                    {title}
                  </Link>
                </div>
                <p className="flex min-w-0 flex-wrap gap-x-2 text-[13px] text-slate-dark">
                  <span className="tabular-nums">
                    {totalCovers(booking)} coperti <span className="opacity-75">({formatCovers(booking)})</span>
                  </span>
                  {notes && (
                    <span className="min-w-0 truncate" title={notes}>
                      · {notes}
                    </span>
                  )}
                </p>
              </div>

              {canAssign ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  {inactiveCurrent && (
                    <p className="text-[13px] text-slate-dark">
                      Sala attuale: <span className="text-ink">{inactiveCurrent.name} (non attiva)</span>
                    </p>
                  )}
                  {options.length > CHIP_LIMIT ? (
                    <div className="flex min-w-0 items-center gap-2 text-[13px] text-slate-dark">
                      <span className="shrink-0">Sala</span>
                      <Select
                        aria-label={`Sala per ${title}`}
                        value={currentId ?? ""}
                        onChange={(e) => assign(booking, e.target.value === "" ? null : e.target.value)}
                        wrapperClassName="min-w-0 flex-1"
                      >
                        <option value="">Nessuna</option>
                        {inactiveCurrent && (
                          <option value={inactiveCurrent.id} disabled>
                            {inactiveCurrent.name} (non attiva)
                          </option>
                        )}
                        {options.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <div role="group" aria-label={`Sala per ${title}`} className="flex min-w-0 flex-col gap-1.5">
                      <span aria-hidden="true" className="text-[10px] font-medium uppercase tracking-[0.12em] text-bronze">
                        Sala
                      </span>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        <RoomChip selected={currentId === null} onSelect={() => assign(booking, null)}>
                          Nessuna
                        </RoomChip>
                        {options.map((room) => (
                          <RoomChip key={room.id} selected={currentId === room.id} onSelect={() => assign(booking, room.id)}>
                            {room.name}
                          </RoomChip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-slate-dark">
                  Sala: <span className="text-ink">{currentName ?? "Da assegnare"}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoomChip({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "min-h-11 rounded-lg lg:min-h-9 border px-3 py-1.5 text-[13px] leading-snug transition-colors duration-150",
        selected ? "border-petrol bg-petrol text-paper" : "border-field-edge bg-field text-ink hover:border-field-edge-hover hover:bg-cream/60",
      )}
    >
      {children}
    </button>
  );
}
