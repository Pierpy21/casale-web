"use client";

import { formatCovers } from "@/components/bookings/format";
import { Alert, Button, ButtonLink, PhoneLink, StatusBadge } from "@/components/ui";
import type { FloorBooking, FloorEvent, Room, RoomTable } from "@/lib/types";
import { eventSeats, paxLabel, seatsLabel, type TableItem } from "./floor-model";

/** Riga compatta dell'evento sopra l'editor del tavolo (modifica): badge, titolo, posti/pax e "Modifica tavoli". */
export function EventSummaryRow({
  event,
  seats,
  picking = false,
  onEdit,
  onBack,
}: {
  event: FloorEvent;
  seats: number;
  /** Scelta dei tavoli di questo evento in corso: il pulsante diventa "Indietro" (esce dalla scelta). */
  picking?: boolean;
  onEdit: () => void;
  onBack: () => void;
}) {
  const missing = event.covers - seats;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-sand pb-2">
      <span className="shrink-0 border border-mustard/60 bg-mustard/15 px-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink">
        Evento
      </span>
      <span className="min-w-0 truncate font-serif text-[15px] leading-snug text-ink">{event.title}</span>
      <span className="text-[12px] tabular-nums text-ink">
        {seats}/{event.covers} posti
        {missing > 0 && <span className="ml-1 text-warning">· mancano {missing}</span>}
      </span>
      <Button variant="outline" size="sm" className="ml-auto min-h-9" onClick={picking ? onBack : onEdit}>
        {picking ? "Indietro" : "Modifica tavoli"}
      </Button>
    </div>
  );
}

/** Titolo (piccolo) del menu del tavolo: "Tavolo 4 · 6 posti". */
export function tableMenuTitle(table: Pick<TableItem, "number" | "seats">): string {
  return `Tavolo ${table.number} · ${seatsLabel(table.seats)}`;
}

/** "Tavolo 3" oppure "Tavoli 3 · 4 · 5" (il primo è il principale). */
function eventTablesLabel(numbers: number[]): string {
  return numbers.length === 1 ? `Tavolo ${numbers[0]}` : `Tavoli ${numbers.join(" · ")}`;
}

export interface TableMenuProps {
  room: Room;
  table: TableItem;
  /** Tavoli della sala (presenti in mappa): per i posti di un evento su più tavoli. */
  tables: Pick<RoomTable, "number" | "seats">[];
  /** Prenotazioni sedute al tavolo. */
  bookings: FloorBooking[];
  /** Eventi seduti al tavolo. */
  events: FloorEvent[];
  /** Evento che riserva la sala nel pasto (banner, se non è già tra gli eventi del tavolo). */
  roomEvent: FloorEvent | null;
  /** Prenotazioni del pasto senza un tavolo sulla mappa (candidati per "Siedi qui"). */
  unseated: FloorBooking[];
  roomNames: Map<string, string>;
  /** Admin e sala: può sedere e liberare le prenotazioni normali. */
  canSeat: boolean;
  /** Admin: può assegnare e liberare gli eventi. */
  canEditLayout: boolean;
  /** Prenotazione o evento con un'azione in corso. */
  pendingBookingId: string | null;
  error: string | null;
  onSeat: (booking: FloorBooking) => void;
  onUnseat: (booking: FloorBooking) => void;
  onUnseatEvent: (event: FloorEvent) => void;
  /** Admin: riapre la scelta dei tavoli dell'evento (con i tavoli attuali: togli, aggiungi, conferma). */
  onEditEvent: (event: FloorEvent) => void;
  /** Admin: toglie questo tavolo dall'evento (gli altri restano). */
  onRemoveEventTable: (event: FloorEvent, tableNumber: number) => void;
}

/**
 * Contenuto del menu sul singolo tavolo (il titolo è del contenitore, vedi tableMenuTitle).
 * Occupato: eventi e prenotazioni seduti, con "Apri" e "Libera". Libero: "Chi siedi qui?" con le prenotazioni senza tavolo.
 * Evento: tavoli, pax e posti; l'admin aggiunge o toglie tavoli.
 */
export function TableMenu({
  room,
  table,
  tables,
  bookings,
  events,
  roomEvent,
  unseated,
  roomNames,
  canSeat,
  canEditLayout,
  pendingBookingId,
  error,
  onSeat,
  onUnseat,
  onUnseatEvent,
  onEditEvent,
  onRemoveEventTable,
}: TableMenuProps) {
  const occupied = bookings.length > 0 || events.length > 0;
  // Prima le prenotazioni già in questa sala, poi quelle senza sala, poi le altre.
  const candidates = [...unseated].sort((a, b) => rank(a, room.id) - rank(b, room.id) || a.name.localeCompare(b.name, "it"));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {roomEvent && !events.some((e) => e.id === roomEvent.id) && (
        <p className="border-l-2 border-mustard bg-mustard/10 px-2.5 py-1.5 text-[12px] text-ink">
          Sala riservata · {roomEvent.title} · {paxLabel(roomEvent.covers)}
        </p>
      )}

      {bookings.length + events.length > 1 && (
        <p className="border-l-2 border-danger bg-danger/10 px-2.5 py-1.5 text-[12px] text-ink">
          Tavolo assegnato {bookings.length + events.length} volte: libera o sposta le prenotazioni in più.
        </p>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {occupied ? (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const pending = pendingBookingId === event.id;
            const multi = event.table_numbers.length > 1;
            const seats = eventSeats(event, tables);
            const missing = event.covers - seats;
            return (
              <li key={event.id} className="flex min-w-0 flex-col gap-1.5 border-t border-sand pt-3 first:border-t-0 first:pt-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="shrink-0 border border-mustard/60 bg-mustard/15 px-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-ink">
                    Evento
                  </span>
                  <h3 className="min-w-0 break-words text-lg leading-snug">{event.title}</h3>
                  <StatusBadge status={event.status} />
                </div>
                <p className="text-[13px] tabular-nums text-ink">{eventTablesLabel(event.table_numbers)}</p>
                <p className="text-[13px] tabular-nums text-ink">
                  {paxLabel(event.covers)} <span className="text-slate-dark">· {seatsLabel(seats)}</span>
                  {missing > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[12px] text-ink">
                      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-warning" />
                      mancano {missing} {missing === 1 ? "posto" : "posti"}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <ButtonLink href={`/admin/prenotazioni/${event.id}`} variant="outline" size="sm" className="min-h-9">
                    Apri prenotazione
                  </ButtonLink>
                  {canEditLayout && (
                    <Button variant="outline" size="sm" className="min-h-9" onClick={() => onEditEvent(event)}>
                      Modifica tavoli
                    </Button>
                  )}
                  {canEditLayout && multi && (
                    <Button variant="ghost" size="sm" className="min-h-9" onClick={() => onRemoveEventTable(event, table.number)}>
                      Togli questo tavolo
                    </Button>
                  )}
                  {canEditLayout && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      disabled={pendingBookingId !== null}
                      aria-busy={pending || undefined}
                      onClick={() => onUnseatEvent(event)}
                    >
                      {pending ? "Libero…" : multi ? "Libera tutti i tavoli" : "Libera tavolo"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}

          {bookings.map((booking) => {
            const notes = booking.notes?.trim();
            const pending = pendingBookingId === booking.id;
            return (
              <li key={booking.id} className="flex min-w-0 flex-col gap-1.5 border-t border-sand pt-3 first:border-t-0 first:pt-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="min-w-0 break-words text-lg leading-snug">{booking.name || "Senza nome"}</h3>
                  <StatusBadge status={booking.status} />
                </div>
                <p className="text-[13px] tabular-nums text-ink">
                  {paxLabel(booking.covers)} <span className="text-slate-dark">· {formatCovers(booking)}</span>
                  {booking.covers > table.seats && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[12px] text-ink">
                      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-warning" />
                      su {seatsLabel(table.seats)}
                    </span>
                  )}
                </p>
                {booking.phone && <PhoneLink phone={booking.phone} className="self-start text-[13px]" />}
                {notes && <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-snug text-slate-dark">{notes}</p>}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <ButtonLink href={`/admin/prenotazioni/${booking.id}`} variant="outline" size="sm" className="min-h-9">
                    Apri prenotazione
                  </ButtonLink>
                  {canSeat && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      disabled={pendingBookingId !== null}
                      aria-busy={pending || undefined}
                      onClick={() => onUnseat(booking)}
                    >
                      {pending ? "Libero…" : "Libera tavolo"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="!font-sans text-[12px] !font-medium uppercase tracking-[0.12em] text-bronze">Chi siedi qui?</h3>
          {candidates.length === 0 ? (
            <p className="text-[13px] text-slate-dark">Nessuna prenotazione da sistemare.</p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {candidates.map((booking) => {
                const pending = pendingBookingId === booking.id;
                const tooMany = booking.covers > table.seats;
                return (
                  <li key={booking.id} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-cream/60">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="min-w-0 truncate font-serif text-[15px] leading-snug text-ink">{booking.name || "Senza nome"}</span>
                      <span className="flex min-w-0 items-center gap-1">
                        {tooMany && <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-warning" />}
                        <BookingMeta booking={booking} roomNames={roomNames} />
                        {tooMany && <span className="sr-only">, più persone dei posti</span>}
                      </span>
                    </div>
                    {canSeat && (
                      <Button
                        size="sm"
                        className="min-h-10 shrink-0"
                        disabled={pendingBookingId !== null}
                        aria-busy={pending || undefined}
                        aria-label={`Siedi ${booking.name || "la prenotazione"} al tavolo ${table.number}`}
                        onClick={() => onSeat(booking)}
                      >
                        {pending ? "…" : "Siedi qui"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function rank(booking: FloorBooking, roomId: string): number {
  if (booking.room_id === roomId) return 0;
  if (booking.room_id === null) return 1;
  return 2;
}

/** "6 pax · Sala Grande · tavolo 12 non in mappa". */
function BookingMeta({ booking, roomNames }: { booking: FloorBooking; roomNames: Map<string, string> }) {
  const roomName = booking.room_id ? roomNames.get(booking.room_id) ?? null : null;
  return (
    <span className="min-w-0 truncate text-[12px] tabular-nums text-slate-dark">
      {paxLabel(booking.covers)}
      {roomName && ` · ${roomName}`}
      {booking.table_number !== null && ` · tav. ${booking.table_number} non in mappa`}
    </span>
  );
}
