"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button, StatusDot } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { FloorBooking, FloorEvent } from "@/lib/types";
import { paxLabel, summaryText, type AssignTarget, type FloorSummary } from "./floor-model";

export interface AssignMenuProps {
  summary: FloorSummary;
  /** Eventi senza tavolo (già filtrati: vuoti se l'utente non può assegnarli). */
  events: FloorEvent[];
  /** Prenotazioni normali senza tavolo. */
  bookings: FloorBooking[];
  roomNames: Map<string, string>;
  /** Admin e sala: può scegliere una prenotazione normale. */
  canSeat: boolean;
  /** Admin: può scegliere un evento. */
  canEditLayout: boolean;
  /** Sala aperta e admin: "Genera tavolo" per ogni evento e prenotazione. */
  canGenerate: boolean;
  /** Voce selezionata (in attesa di un tavolo libero). */
  selectedId: string | null;
  onPick: (target: AssignTarget) => void;
  onGenerate: (target: AssignTarget) => void;
}

/**
 * Lista "Da assegnare" del pasto: due sezioni, "Eventi" (solo admin) e "Prenotazioni" (normali senza tavolo).
 * Tocco su una voce = selezione; poi un tavolo libero della sala. "Genera tavolo" crea un tavolo su misura (evento o prenotazione).
 */
export function AssignMenu({ summary, events, bookings, roomNames, canSeat, canEditLayout, canGenerate, selectedId, onPick, onGenerate }: AssignMenuProps) {
  const total = events.length + bookings.length;
  const pickable = canSeat || canEditLayout;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[12px] tabular-nums text-slate-dark">{summaryText(summary)}</p>

      {canEditLayout && (
        <section aria-label="Eventi da assegnare" className="flex flex-col gap-1">
          <h3 className="!font-sans text-[12px] !font-medium uppercase tracking-[0.12em] text-bronze">Eventi</h3>
          {events.length === 0 ? (
            <p className="text-[13px] text-slate-dark">Nessun evento da assegnare.</p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {events.map((event) => {
                const selected = selectedId === event.id;
                return (
                  <li
                    key={event.id}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-md px-1 py-1",
                      selected ? "bg-mustard/20 ring-1 ring-mustard" : "hover:bg-cream/60",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPick({ bookingId: event.id, event: true, label: event.title, covers: event.covers })}
                      className="flex min-h-10 min-w-0 flex-1 flex-col items-start justify-center text-left"
                    >
                      <span className="max-w-full truncate font-serif text-[15px] leading-snug text-ink">{event.title}</span>
                      <span className="max-w-full truncate text-[12px] tabular-nums text-slate-dark">
                        {paxLabel(event.covers)} · {event.room_id ? roomNames.get(event.room_id) ?? "sala" : "senza sala"}
                      </span>
                    </button>
                    {canGenerate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-9 shrink-0"
                        aria-label={`Genera tavolo per ${event.title}`}
                        onClick={() => onGenerate({ bookingId: event.id, event: true, label: event.title, covers: event.covers })}
                      >
                        Genera tavolo
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-label="Prenotazioni da assegnare" className="flex flex-col gap-1">
        <h3 className="!font-sans text-[12px] !font-medium uppercase tracking-[0.12em] text-bronze">Prenotazioni</h3>
        {bookings.length === 0 ? (
          <p className="text-[13px] text-slate-dark">Tutte le prenotazioni hanno un tavolo.</p>
        ) : (
          <ul className="-mx-1 flex flex-col">
            {bookings.map((booking) => {
              const selected = selectedId === booking.id;
              const name = booking.name || "Senza nome";
              const content = (
                <>
                  <span className="max-w-full truncate font-serif text-[15px] leading-snug text-ink">{name}</span>
                  <span className="max-w-full truncate text-[12px] tabular-nums text-slate-dark">
                    {paxLabel(booking.covers)}
                    {booking.room_id && roomNames.get(booking.room_id) ? ` · ${roomNames.get(booking.room_id)}` : ""}
                  </span>
                </>
              );
              return (
                <li
                  key={booking.id}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md px-1 py-1",
                    selected ? "bg-petrol/10 ring-1 ring-petrol" : "hover:bg-cream/60",
                  )}
                >
                  {canSeat ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onPick({ bookingId: booking.id, event: false, label: name, covers: booking.covers })}
                      className="flex min-h-10 min-w-0 flex-1 flex-col items-start justify-center text-left"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex min-h-10 min-w-0 flex-1 flex-col items-start justify-center">{content}</div>
                  )}
                  {booking.status === "opzione" && <StatusDot status={booking.status} size="sm" />}
                  {canGenerate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-9 shrink-0"
                      aria-label={`Genera tavolo per ${name}`}
                      onClick={() => onGenerate({ bookingId: booking.id, event: false, label: name, covers: booking.covers })}
                    >
                      Genera tavolo
                    </Button>
                  )}
                  <Link
                    href={`/admin/prenotazioni/${booking.id}`}
                    aria-label={`Apri prenotazione di ${name}`}
                    className="grid size-10 shrink-0 place-items-center rounded-[2px] text-slate-dark transition-colors hover:text-petrol"
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {total > 0 && pickable && <p className="text-[12px] text-slate">Tocca una voce, poi un tavolo libero della sala.</p>}
    </div>
  );
}
